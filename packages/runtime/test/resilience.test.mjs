import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getEventListeners } from 'node:events';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsCancelledError,
  PjsTimeoutError,
  PjsTaskError,
  PjsWorkerError,
  PjsExecutionLeaseError,
  PjsQueueFullError,
  PjsSerializationError,
  PjsTaskRegistrationError,
} from '../dist/index.js';
import {
  firstWorker,
  controlExit,
  clock,
  until,
  bounded,
  assertOwners,
} from './helpers/containment.mjs';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';

const fixture = new URL('./fixtures/resilience-tasks.mjs', import.meta.url);
const retry = { repeatable: true, retry: { maxAttempts: 3 } };
function input(overrides = {}) {
  return { state: new SharedArrayBuffer(16), value: 42, ...overrides };
}
function attempts(value) {
  return Atomics.load(new Int32Array(value.state), 0);
}
function release(value) {
  Atomics.store(new Int32Array(value.state), 3, 1);
  Atomics.notify(new Int32Array(value.state), 3);
}
async function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    ['work', 'fallback', 'hang', 'echo'].map((name) => [
      name,
      registry.register(name, fixture, name),
    ]),
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxQueue: 8,
    ...options,
  });
  const exits = [];
  const gates = [];
  t.after(async () => {
    for (const gate of gates) release(gate);
    for (const exit of exits) exit.release();
    await runtime.shutdown({ drain: false });
    assertOwners(runtime, { quiescent: true });
    assert.equal(runtimeComponents(runtime).dispatcher.recoveries.size, 0);
    assert.equal(runtimeComponents(runtime).taskCoordinator.attempts.size, 0);
  });
  await runtime.ready();
  return {
    runtime,
    tasks,
    registry,
    gate() {
      const value = input({ mode: 'gate' });
      gates.push(value);
      return value;
    },
    holdExit() {
      const exit = controlExit(firstWorker(runtime));
      exits.push(exit);
      return exit;
    },
  };
}

test(
  'physical abort holds occupancy through exit and replaces without a crash budget',
  bounded,
  async (t) => {
    const { runtime, tasks, holdExit } = await setup(t, {
      maxQueue: 0,
      maxRestarts: 0,
    });
    const worker = firstWorker(runtime);
    const exit = holdExit();
    const controller = new AbortController();
    const value = input();
    const result = assert.rejects(
      runtime.run(tasks.hang, value, {
        signal: controller.signal,
        cancellation: 'terminate',
      }),
      PjsCancelledError,
    );
    await until(() => attempts(value) === 1);
    controller.abort();
    await result;
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().workers.restarts, 0);
    assert.equal(runtime.stats().workers.failures, 0);
    await assert.rejects(runtime.run(tasks.echo, 'early'), PjsQueueFullError);
    exit.release();
    await until(() => runtime.stats().workers.idle === 1);
    assert.notEqual(firstWorker(runtime).id, worker.id);
    assert.equal(runtime.stats().containment.workerReplacements, 1);
    assert.equal(await runtime.run(tasks.echo, 'healthy'), 'healthy');
  },
);

test(
  'physical timeout stops CPU work without retrying or invoking fallback',
  bounded,
  async (t) => {
    const { runtime, tasks, holdExit } = await setup(t, { maxRestarts: 0 });
    const exit = holdExit();
    const value = input();
    await assert.rejects(
      runtime.run(tasks.hang, value, {
        ...retry,
        timeout: 1000,
        cancellation: 'terminate',
        fallback: {
          task: tasks.fallback,
          on: ['worker-crash', 'task-error', 'execution-lease'],
        },
      }),
      PjsTimeoutError,
    );
    assert.equal(attempts(value), 1);
    assert.equal(new Int32Array(value.state)[1], 0);
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().workers.busy, 1);
  },
);

test(
  'queued physical cancellation keeps transfer attached and leaves the active worker alone',
  bounded,
  async (t) => {
    const { runtime, tasks, gate } = await setup(t, { maxQueue: 1 });
    const activeInput = gate();
    const active = runtime.run(tasks.work, activeInput);
    const controller = new AbortController();
    const bytes = new ArrayBuffer(8);
    const queued = assert.rejects(
      runtime.run(tasks.echo, bytes, {
        transferList: [bytes],
        signal: controller.signal,
        cancellation: 'terminate',
      }),
      PjsCancelledError,
    );
    controller.abort();
    await queued;
    assert.equal(bytes.byteLength, 8);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 0);
    release(activeInput);
    await active;
  },
);

test(
  'abort during posting finishes transfer before targeted termination; failed posting does not retire',
  bounded,
  async (t) => {
    const { runtime, tasks, holdExit } = await setup(t, { maxRestarts: 0 });
    const exit = holdExit();
    const controller = new AbortController();
    const state = new SharedArrayBuffer(16);
    const bytes = new ArrayBuffer(8);
    const posted = runtime.run(
      tasks.hang,
      {
        get state() {
          controller.abort();
          return state;
        },
        bytes,
      },
      {
        signal: controller.signal,
        cancellation: 'terminate',
        transferList: [bytes],
      },
    );
    await assert.rejects(posted, PjsCancelledError);
    assert.equal(bytes.byteLength, 0);
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().workers.busy, 1);
    exit.release();
    await until(() => runtime.stats().workers.idle === 1);
    const next = new AbortController();
    const failed = runtime.run(
      tasks.echo,
      {
        get value() {
          next.abort();
          throw new Error('clone failure');
        },
      },
      { signal: next.signal, cancellation: 'terminate' },
    );
    await assert.rejects(failed, PjsCancelledError);
    assert.equal(runtime.stats().workers.busy, 0);
    assert.equal(runtime.stats().containment.workerReplacements, 1);
  },
);

test(
  'a completed caller cannot cancel a subsequent assignment on the same worker',
  bounded,
  async (t) => {
    const { runtime, tasks, gate } = await setup(t);
    const controller = new AbortController();
    await runtime.run(tasks.echo, 1, {
      signal: controller.signal,
      cancellation: 'terminate',
    });
    const value = gate();
    const active = runtime.run(tasks.work, value);
    controller.abort();
    release(value);
    await active;
    assert.equal(runtime.stats().containment.workerReplacements, 0);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  },
);

for (const mode of ['worker-crash', 'uncaught'])
  test(
    `${mode} retries an accepted call with workers:1, maxQueue:0`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, {
        maxQueue: 0,
        maxRestarts: 1,
      });
      const oldId = firstWorker(runtime).id;
      const value = input({ mode, failures: 1 });
      const output = await runtime.run(tasks.work, value, {
        ...retry,
        retry: { maxAttempts: 2, backoffMs: 20 },
      });
      assert.equal(output.value, 42);
      assert.equal(output.attempt, 2);
      assert.notEqual(firstWorker(runtime).id, oldId);
      assert.equal(runtime.stats().queue.size, 0);
      assert.equal(runtime.stats().tasks.accepted, 1);
      assert.equal(runtime.stats().tasks.completed, 1);
      assert.equal(runtime.stats().tasks.failed, 0);
      assert.equal(runtime.stats().dispatch.executeMessages, 2);
      assert.equal(runtime.stats().workers.restarts, 1);
    },
  );

test(
  'task exceptions retry only with explicit eligibility and keep the worker healthy',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const workerId = firstWorker(runtime).id;
    const excluded = input({ failures: 1 });
    await assert.rejects(
      runtime.run(tasks.work, excluded, retry),
      PjsTaskError,
    );
    assert.equal(attempts(excluded), 1);
    const value = input({ failures: 2 });
    const output = await runtime.run(tasks.work, value, {
      ...retry,
      retry: { maxAttempts: 3, on: ['task-error'] },
    });
    assert.equal(output.attempt, 3);
    assert.equal(firstWorker(runtime).id, workerId);
    assert.equal(runtime.stats().workers.restarts, 0);
  },
);

test(
  'lease expiry requires explicit eligibility and waits for old physical exit before retry',
  bounded,
  async (t) => {
    const { runtime, tasks, holdExit } = await setup(t, { maxQueue: 0 });
    const exit = holdExit();
    const value = input({ mode: 'execution-lease', failures: 1 });
    const leaseClock = clock(firstWorker(runtime));
    let settled = false;
    const result = runtime
      .run(tasks.work, value, {
        repeatable: true,
        executionLease: 100,
        retry: { maxAttempts: 2, on: ['execution-lease'] },
      })
      .then((output) => {
        settled = true;
        return output;
      });
    await until(() => attempts(value) === 1);
    leaseClock.advance(100);
    await until(() => exit.requests === 1);
    assert.equal(settled, false);
    assert.equal(attempts(value), 1);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().dispatch.executeMessages, 1);
    exit.release();
    assert.equal((await result).attempt, 2);
    assert.equal(runtime.stats().containment.leaseExpirations, 1);
    const excluded = input({ mode: 'execution-lease', failures: 1 });
    const excludedClock = clock(firstWorker(runtime));
    const excludedResult = assert.rejects(
      runtime.run(tasks.work, excluded, { ...retry, executionLease: 100 }),
      PjsExecutionLeaseError,
    );
    await until(() => attempts(excluded) === 1);
    excludedClock.advance(100);
    await excludedResult;
    assert.equal(attempts(excluded), 1);
  },
);

test(
  'retry exhaustion keeps logical identity across unique physical attempts',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const value = input({ failures: 10 });
    const components = runtimeComponents(runtime);
    const ids = [];
    const original = components.taskCoordinator.scheduled.bind(
      components.taskCoordinator,
    );
    components.taskCoordinator.scheduled = (...args) => {
      ids.push(args[1].executionId);
      return original(...args);
    };
    await assert.rejects(
      runtime.run(tasks.work, value, {
        ...retry,
        retry: { maxAttempts: 3, on: ['task-error'] },
      }),
      (error) => {
        assert.ok(error instanceof PjsTaskError);
        assert.equal(error.taskId, ids[0]);
        return true;
      },
    );
    assert.equal(new Set(ids).size, 3);
    assert.equal(attempts(value), 3);
    assert.equal(runtime.stats().tasks.failed, 1);
  },
);

test(
  'queued work keeps FIFO priority when retry recovers from a full queue',
  bounded,
  async (t) => {
    const { runtime, tasks, gate } = await setup(t, { maxQueue: 1 });
    const value = gate();
    value.failures = 1;
    const order = [];
    const recovery = runtime
      .run(tasks.work, value, {
        ...retry,
        retry: { maxAttempts: 2, on: ['task-error'] },
      })
      .then(() => order.push('retry'));
    const queued = runtime
      .run(tasks.echo, 'queued')
      .then(() => order.push('queued'));
    release(value);
    await Promise.all([queued, recovery]);
    assert.deepEqual(order, ['queued', 'retry']);
    assert.equal(runtime.stats().queue.size, 0);
  },
);

test(
  'backoff reservation and staged range admission cannot spend the same queue credit',
  bounded,
  async (t) => {
    const { runtime, tasks, gate } = await setup(t, { maxQueue: 2 });
    const controller = new AbortController();
    const recovering = assert.rejects(
      runtime.run(tasks.work, input({ failures: 1 }), {
        ...retry,
        signal: controller.signal,
        retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 5000 },
      }),
      PjsCancelledError,
    );
    await until(() =>
      runtime.stats().activeTasks.some((task) => task.status === 'recovering'),
    );
    const value = gate();
    const active = runtime.run(tasks.work, value);
    const range = runtime.partitionRange(
      tasks.echo,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: 'partition' }),
    );
    assert.equal(runtime.stats().queue.size, 1);
    await assert.rejects(
      runtime.run(tasks.echo, 'overflow'),
      PjsQueueFullError,
    );
    controller.abort();
    await recovering;
    release(value);
    await active;
    assert.deepEqual(await range, ['partition']);
  },
);

test(
  'weighted FIFO batches precede retry and concurrent backoffs retain at most the worker slots',
  bounded,
  async (t) => {
    const { runtime, tasks, gate } = await setup(t, { maxQueue: 2 });
    const value = gate();
    value.failures = 1;
    const order = [];
    const recovering = runtime
      .run(tasks.work, value, {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
      })
      .then(() => order.push('retry'));
    const range = runtime
      .partitionRange(
        tasks.echo,
        { start: 0, end: 2, grainSize: 1 },
        ({ index }) => ({ input: index }),
        { dispatchBatchSize: 2 },
      )
      .then((output) => {
        assert.deepEqual(output, [0, 1]);
        order.push('batch');
      });
    assert.equal(runtime.stats().queue.size, 2);
    release(value);
    await Promise.all([recovering, range]);
    assert.deepEqual(order, ['batch', 'retry']);

    const other = await setup(t, { workers: 2, maxQueue: 0 });
    const values = [input({ failures: 1 }), input({ failures: 1 })];
    const pending = values.map((item) =>
      other.runtime.run(other.tasks.work, item, {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 300 },
      }),
    );
    await until(() =>
      other.runtime
        .stats()
        .activeTasks.every((task) => task.status === 'recovering'),
    );
    assert.equal(other.runtime.stats().tasks.pending, 2);
    assert.equal(other.runtime.stats().queue.size, 0);
    await assert.rejects(
      other.runtime.run(other.tasks.echo, 'overflow'),
      PjsQueueFullError,
    );
    assert.deepEqual(
      (await Promise.all(pending)).map((output) => output.attempt),
      [2, 2],
    );
    assert.equal(other.runtime.stats().tasks.accepted, 2);
  },
);

test(
  'termination rejection fails recovery closed and preserves the physical owner',
  bounded,
  async (t) => {
    const registry = new PjsTaskRegistry();
    const work = registry.register('work', fixture, 'work');
    const alternative = registry.register('fallback', fixture, 'fallback');
    const runtime = new PjsRuntime({ registry, workers: 1, maxQueue: 0 });
    await runtime.ready();
    const worker = firstWorker(runtime);
    t.after(async () => {
      await worker.thread.terminate();
      worker.thread.removeAllListeners();
      assertOwners(runtime, { quiescent: true });
    });
    const leaseClock = clock(worker);
    const failure = new Error('Controlled resilience termination rejection');
    worker.terminateThread = () => Promise.reject(failure);
    const value = input({ mode: 'execution-lease', failures: 1 });
    const pending = assert.rejects(
      runtime.run(work, value, {
        repeatable: true,
        executionLease: 100,
        retry: { maxAttempts: 2, on: ['execution-lease'] },
        fallback: { task: alternative, on: ['execution-lease'] },
      }),
      PjsWorkerError,
    );
    await until(() => attempts(value) === 1);
    leaseClock.advance(100);
    await pending;
    assert.equal(runtime.stats().state, 'failed');
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 0);
    assert.equal(attempts(value), 1);
    assert.equal(new Int32Array(value.state)[1], 0);
    await assert.rejects(runtime.shutdown(), (error) => error === failure);
  },
);

for (const action of ['abort', 'timeout', 'shutdown'])
  test(
    `${action} during backoff prevents another attempt and releases admission`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, { maxQueue: 0 });
      const controller = new AbortController();
      const value = input({ failures: 1 });
      const pending = assert.rejects(
        runtime.run(tasks.work, value, {
          repeatable: true,
          signal: controller.signal,
          ...(action === 'timeout' ? { timeout: 500 } : {}),
          retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 5000 },
        }),
        action === 'timeout' ? PjsTimeoutError : PjsCancelledError,
      );
      await until(() =>
        runtime
          .stats()
          .activeTasks.some((task) => task.status === 'recovering'),
      );
      await assert.rejects(
        runtime.run(tasks.echo, 'reserved'),
        PjsQueueFullError,
      );
      if (action === 'abort') controller.abort();
      if (action === 'shutdown') await runtime.shutdown({ drain: false });
      await pending;
      assert.equal(attempts(value), 1);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      if (action !== 'shutdown')
        assert.equal(await runtime.run(tasks.echo, 'freed'), 'freed');
    },
  );

test(
  'graceful drain finishes accepted recovery; exhausted restart budget remains fatal',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const value = input({ mode: 'worker-crash', failures: 1 });
    const pending = runtime.run(tasks.work, value, retry);
    const shutdown = runtime.shutdown();
    assert.equal((await pending).attempt, 2);
    await shutdown;
    const other = await setup(t, { maxQueue: 0, maxRestarts: 0 });
    const failed = input({ mode: 'worker-crash', failures: 1 });
    await assert.rejects(
      other.runtime.run(other.tasks.work, failed, {
        ...retry,
        fallback: { task: other.tasks.fallback, on: ['worker-crash'] },
      }),
      PjsWorkerError,
    );
    assert.equal(other.runtime.stats().state, 'failed');
    assert.equal(attempts(failed), 1);
    assert.equal(new Int32Array(failed.state)[1], 0);
    assert.equal(other.runtime.stats().dispatch.executeMessages, 1);
  },
);

test(
  'fallback is one registered implementation after primary retries, with transferred output allowed',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const value = input({ failures: 10, transferredOutput: true });
    const output = await runtime.run(tasks.work, value, {
      ...retry,
      retry: { maxAttempts: 3, on: ['task-error'] },
      fallback: { task: tasks.fallback },
    });
    assert.deepEqual(output, new Uint8Array([4, 2]));
    assert.equal(attempts(value), 3);
    assert.equal(new Int32Array(value.state)[1], 1);
    assert.equal(runtime.stats().dispatch.executeMessages, 4);
    assert.equal(runtime.stats().tasks.completed, 1);
  },
);

test(
  'worker-failure fallback uses the restored pool, and input serialization never triggers recovery',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const value = input({ mode: 'worker-crash', failures: 1 });
    const output = await runtime.run(tasks.work, value, {
      repeatable: true,
      fallback: { task: tasks.fallback, on: ['worker-crash'] },
    });
    assert.equal(output.implementation, 'fallback');
    assert.equal(attempts(value), 1);
    assert.equal(new Int32Array(value.state)[1], 1);
    const malformed = input({ uncloneable: () => 1 });
    const posts = runtime.stats().dispatch.executeMessages;
    await assert.rejects(
      runtime.run(tasks.work, malformed, {
        ...retry,
        fallback: { task: tasks.fallback },
      }),
      PjsSerializationError,
    );
    assert.equal(attempts(malformed), 0);
    assert.equal(new Int32Array(malformed.state)[1], 0);
    assert.equal(runtime.stats().dispatch.executeMessages, posts);
  },
);

test(
  'cancellation terminates a running fallback by its physical attempt correlation',
  bounded,
  async (t) => {
    const { runtime, tasks, holdExit } = await setup(t);
    const exit = holdExit();
    const controller = new AbortController();
    const value = input({ failures: 1, hangFallback: true });
    const result = assert.rejects(
      runtime.run(tasks.work, value, {
        repeatable: true,
        cancellation: 'terminate',
        signal: controller.signal,
        fallback: { task: tasks.fallback },
      }),
      PjsCancelledError,
    );
    await until(() => new Int32Array(value.state)[1] === 1);
    const active = runtime.stats().activeTasks[0];
    assert.equal(active.attempt, 2);
    assert.notEqual(active.id, active.executionId);
    controller.abort();
    await result;
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(attempts(value), 1);
    assert.equal(new Int32Array(value.state)[1], 1);
  },
);

test(
  'fallback can skip ineligible retries and aggregates its own failure without repeating',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const value = input({ failures: 10, fallbackFails: true });
    await assert.rejects(
      runtime.run(tasks.work, value, {
        ...retry,
        fallback: { task: tasks.fallback },
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 2);
        assert.ok(error.errors.every((item) => item instanceof PjsTaskError));
        assert.equal(error.errors[0].taskId, error.errors[1].taskId);
        return true;
      },
    );
    assert.equal(attempts(value), 1);
    assert.equal(new Int32Array(value.state)[1], 1);
    assert.equal(runtime.stats().dispatch.executeMessages, 2);
  },
);

test(
  'fallback eligibility uses the last primary failure, not an earlier crash',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const value = input({
      failures: 2,
      sequence: ['worker-crash', 'task-error'],
    });
    await assert.rejects(
      runtime.run(tasks.work, value, {
        ...retry,
        fallback: { task: tasks.fallback, on: ['worker-crash'] },
      }),
      PjsTaskError,
    );
    assert.equal(attempts(value), 2);
    assert.equal(new Int32Array(value.state)[1], 0);
  },
);

for (const mode of ['serialization', 'protocol'])
  test(
    `${mode} failures are terminal even with all recovery causes selected`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t);
      const value = input({ mode });
      const on = ['worker-crash', 'execution-lease', 'task-error'];
      await assert.rejects(
        runtime.run(tasks.work, value, {
          repeatable: true,
          retry: { maxAttempts: 3, on },
          fallback: { task: tasks.fallback, on },
        }),
        mode === 'serialization' ? PjsSerializationError : PjsWorkerError,
      );
      assert.equal(attempts(value), 1);
      assert.equal(new Int32Array(value.state)[1], 0);
    },
  );

test(
  'recovery validates opt-in, policy, registry and transfer ownership before admission',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const foreign = new PjsTaskRegistry().register('foreign', fixture, 'echo');
    for (const options of [
      { retry: { maxAttempts: 2 } },
      { fallback: { task: tasks.fallback } },
      { cancellation: 'cooperate' },
      { repeatable: false },
      { ...retry, retry: { maxAttempts: 0 } },
      { ...retry, retry: { maxAttempts: 2, backoffMs: -1 } },
      { ...retry, retry: { maxAttempts: 2, on: [] } },
      { ...retry, retry: { maxAttempts: 2, on: ['serialization'] } },
      { cancellation: 'terminate', dispatchBatchSize: undefined },
      { ...retry, dispatchBatchSize: 1 },
    ])
      await assert.rejects(
        runtime.run(tasks.echo, 1, options),
        (error) => error instanceof TypeError || error instanceof RangeError,
      );
    for (const task of [tasks.echo, foreign])
      await assert.rejects(
        runtime.run(tasks.echo, 1, { repeatable: true, fallback: { task } }),
        PjsTaskRegistrationError,
      );
    const bytes = new ArrayBuffer(8);
    await assert.rejects(
      runtime.run(tasks.echo, bytes, { ...retry, transferList: [bytes] }),
      PjsSerializationError,
    );
    await assert.rejects(
      runtime.run(tasks.echo, bytes, {
        repeatable: true,
        fallback: { task: tasks.fallback },
        transferList: [bytes],
      }),
      PjsSerializationError,
    );
    assert.equal(bytes.byteLength, 8);
    assert.equal(runtime.stats().tasks.accepted, 0);
    const copied = await runtime.run(tasks.echo, bytes, {
      transferList: [bytes],
    });
    assert.equal(copied.byteLength, 8);
    assert.equal(bytes.byteLength, 0);
  },
);

test(
  'range APIs validate recovery permission before factories, including inherited policies',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    for (const method of [
      'partitionRange',
      'parallelFor',
      'parallelMapRange',
      'streamRange',
    ])
      for (const [key, value] of [
        ['repeatable', false],
        ['retry', { maxAttempts: 2 }],
        ['fallback', { task: tasks.fallback }],
      ]) {
        const result = runtime[method](
          tasks.echo,
          { start: 0, end: 1, grainSize: 1 },
          () => assert.fail('unsupported range factory ran'),
          Object.create({ [key]: value }),
        );
        await assert.rejects(
          method === 'streamRange' ? result.next() : result,
          TypeError,
        );
      }
  },
);

test(
  'retry policy is snapshotted; cancellation and lease retirement happen once',
  bounded,
  async (t) => {
    const { runtime, tasks, holdExit } = await setup(t);
    const value = input({ failures: 1 });
    const on = ['task-error'];
    const policy = { maxAttempts: 2, on };
    const result = runtime.run(tasks.work, value, {
      repeatable: true,
      retry: policy,
    });
    policy.maxAttempts = 1;
    on.length = 0;
    assert.equal((await result).attempt, 2);
    const exit = holdExit();
    const controller = new AbortController();
    const hung = input();
    const leaseClock = clock(firstWorker(runtime));
    const pending = assert.rejects(
      runtime.run(tasks.hang, hung, {
        ...retry,
        signal: controller.signal,
        cancellation: 'terminate',
        executionLease: 100,
        retry: { maxAttempts: 2, on: ['execution-lease'] },
      }),
      PjsCancelledError,
    );
    await until(() => attempts(hung) === 1);
    leaseClock.advance(100);
    await until(() => exit.requests === 1);
    controller.abort();
    await pending;
    assert.equal(exit.requests, 1);
    assert.equal(attempts(hung), 1);
    assert.equal(runtime.stats().workers.restarts, 1);
    assert.equal(runtime.stats().containment.leaseExpirations, 1);
    await delay(10);
    assert.equal(runtime.stats().dispatch.executeMessages, 3);
  },
);
