import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsQueueFullError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsWorkerError,
  PjsExecutionLeaseError,
  PjsSerializationError,
} from '../dist/index.js';
import { controlExit } from './helpers/containment.mjs';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';
import {
  encodeProgress,
  MAX_PROGRESS_BYTES,
} from '../dist/workers/progress.js';

const bounded = { timeout: 15000 };
const fixture = new URL(
  './fixtures/checkpoint-three-tasks.mjs',
  import.meta.url,
);
const shared = () => new SharedArrayBuffer(128 * 4);
const at = (state, index) => Atomics.load(new Int32Array(state), index);
const release = (state, index, attempt = 1) =>
  Atomics.store(new Int32Array(state), 32 + index, attempt);
async function until(predicate) {
  const deadline = performance.now() + 6000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, 'bounded observation');
    await delay(2);
  }
}
async function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    [
      'work',
      'alternative',
      'block',
      'typed',
      'binary',
      'cpu',
      'flood',
      'invalidProgress',
      'late',
      'echo',
      'burstWait',
    ].map((name) => [name, registry.register(name, fixture, name)]),
  );
  const runtime = new PjsRuntime({ registry, workers: 1, ...options });
  t.after(async () => {
    await runtime.shutdown({ drain: false });
    assert.equal(runtime.stats().workers.activeExecutions, 0);
    assert.equal(runtimeComponents(runtime).taskCoordinator.executions.size, 0);
    assert.equal(
      runtimeComponents(runtime).taskCoordinator.pendingProgress.size,
      0,
    );
  });
  await runtime.ready();
  return { runtime, tasks };
}

test(
  'priority dispatch is stable, bounded, and never preempts active work',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 4 });
    const state = shared(),
      order = [];
    const active = runtime.run(tasks.work, { state, index: 0 });
    const submit = (id, priority) =>
      runtime.run(tasks.echo, id, { priority }).then(() => order.push(id));
    const low = submit('low', -1),
      first = submit('first', 5),
      second = submit('second', 5),
      normal = submit('normal', 0);
    await assert.rejects(
      runtime.run(tasks.echo, 'overflow', { priority: 100 }),
      PjsQueueFullError,
    );
    await until(() => at(state, 0) === 1);
    assert.deepEqual(order, []);
    release(state, 0);
    await Promise.all([active, low, first, second, normal]);
    assert.deepEqual(order, ['first', 'second', 'normal', 'low']);
  },
);

for (const invalid of ['throw', 'promise', 'nan', 'reentrant'])
  test(
    `custom comparator ${invalid} disables safely without losing tasks`,
    bounded,
    async (t) => {
      let runtime,
        calls = 0,
        frozen = false;
      const order = [];
      const configured = await setup(t, {
        maxQueue: 5,
        scheduling(a, b) {
          calls++;
          frozen = Object.isFrozen(a) && Object.isFrozen(b);
          if (invalid === 'throw') throw new Error('observer');
          if (invalid === 'promise')
            return Promise.reject(new Error('async comparator'));
          if (invalid === 'nan') return NaN;
          void runtime
            .run(configured.tasks.echo, 'nested')
            .then(() => order.push('nested'));
          return a.priority - b.priority;
        },
      });
      runtime = configured.runtime;
      const { tasks } = configured,
        state = shared();
      const active = runtime.run(tasks.work, { state });
      const first = runtime
        .run(tasks.echo, 'first', { priority: 1 })
        .then(() => order.push('first'));
      const urgent = runtime
        .run(tasks.echo, 'urgent', { priority: 2 })
        .then(() => order.push('urgent'));
      release(state, 0);
      await Promise.all([active, first, urgent]);
      await until(() => runtime.stats().tasks.pending === 0);
      assert.equal(calls, 1);
      assert.equal(frozen, true);
      assert.equal(runtime.stats().scheduling.policyErrors, 1);
      assert.deepEqual(order.slice(0, 2), ['urgent', 'first']);
    },
  );

test(
  'custom comparator replaces priority, with FIFO ties and weighted batch cancellation',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      maxQueue: 5,
      scheduling: (a, b) => a.priority - b.priority,
    });
    const state = shared(),
      order = [],
      controller = new AbortController();
    const active = runtime.run(tasks.work, { state });
    const range = runtime.parallelFor(
      tasks.work,
      { start: 0, end: 3, grainSize: 1 },
      (partition) => ({ input: { partition, state } }),
      { dispatchBatchSize: 3, signal: controller.signal, priority: 100 },
    );
    const cancelled = assert.rejects(range, PjsCancelledError);
    const high = runtime
      .run(tasks.echo, 10, { priority: 10 })
      .then(() => order.push(10));
    const low = runtime
      .run(tasks.echo, -10, { priority: -10 })
      .then(() => order.push(-10));
    assert.equal(runtime.stats().queue.size, 5);
    controller.abort();
    await cancelled;
    assert.equal(runtime.stats().queue.size, 2);
    release(state, 0);
    await Promise.all([active, high, low]);
    assert.deepEqual(order, [-10, 10]);
  },
);

test(
  'two async executions share a worker, reverse completion and preserve rejected occupancy',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared(),
      controller = new AbortController();
    const first = runtime.run(
      tasks.work,
      { state, index: 0 },
      { signal: controller.signal },
    );
    const cancelled = assert.rejects(first, PjsCancelledError);
    const second = runtime.run(tasks.work, { state, index: 1 });
    await until(() => at(state, 0) && at(state, 1));
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().workers.activeExecutions, 2);
    assert.equal(runtime.stats().workers.details[0].currentTaskId, undefined);
    await assert.rejects(runtime.run(tasks.echo, 3), PjsQueueFullError);
    controller.abort();
    await cancelled;
    release(state, 1);
    const other = await second;
    assert.equal(other.arity, 1);
    assert.equal(runtime.stats().workers.activeExecutions, 1);
    const third = await runtime.run(tasks.echo, 3);
    assert.equal(third.threadId, other.threadId);
    release(state, 0);
    await until(() => runtime.stats().workers.activeExecutions === 0);
  },
);

test(
  'cooperative cancellation targets one shared invocation and awaits its cleanup',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared(),
      controller = new AbortController();
    const first = runtime.run(
      tasks.work,
      { state },
      { signal: controller.signal, cancellation: 'cooperative' },
    );
    const cancelled = assert.rejects(first, PjsCancelledError);
    const second = runtime.run(
      tasks.work,
      { state, index: 1 },
      { cancellation: 'cooperative' },
    );
    await until(() => at(state, 0) && at(state, 1));
    controller.abort();
    await cancelled;
    await until(
      () =>
        at(state, 64) === 1 && runtime.stats().workers.activeExecutions === 1,
    );
    assert.equal(runtime.stats().workers.activeExecutions, 1);
    assert.equal(at(state, 65), 0);
    release(state, 1);
    const result = await second;
    assert.equal(result.arity, 2);
    assert.equal(runtime.stats().workers.restarts, 0);
  },
);

for (const terminal of ['abort', 'timeout', 'stream-close'])
  test(
    `exclusive drain pin cleanup on ${terminal} restores sharing`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, {
        concurrency: 2,
        maxQueue: 2,
      });
      const state = shared(),
        controller = new AbortController();
      const active = runtime.run(tasks.work, { state });
      await until(() => at(state, 0));
      const options = {
        cancellation: 'terminate',
        signal: controller.signal,
        ...(terminal === 'timeout' ? { timeout: 80 } : {}),
      };
      const exclusive =
        terminal === 'stream-close'
          ? runtime.streamRange(
              tasks.work,
              { start: 0, end: 1, grainSize: 1 },
              () => ({ input: { state, index: 2 } }),
              options,
            )
          : runtime.run(tasks.work, { state, index: 2 }, options);
      const failed =
        terminal === 'stream-close'
          ? undefined
          : assert.rejects(
              exclusive,
              terminal === 'timeout' ? PjsTimeoutError : PjsCancelledError,
            );
      await until(() => runtime.stats().workers.details[0].draining);
      const queued = runtime.run(tasks.work, { state, index: 1 });
      assert.equal(at(state, 1), 0);
      if (terminal === 'abort') controller.abort();
      if (terminal === 'stream-close') await exclusive.return();
      await failed;
      await until(() => at(state, 1) === 1);
      assert.equal(at(state, 64), 0);
      assert.equal(runtime.stats().workers.details[0].draining, false);
      assert.equal(runtime.stats().workers.activeExecutions, 2);
      assert.equal(at(state, 2), 0);
      release(state, 0);
      release(state, 1);
      await Promise.all([active, queued]);
      assert.equal(runtime.stats().workers.restarts, 0);
    },
  );

test(
  'zero queue rejects a new exclusive job but accepted exclusive ranges drain without hidden input',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared();
    let built = 0;
    const active = runtime.run(tasks.work, { state });
    await until(() => at(state, 0));
    await assert.rejects(
      runtime.run(tasks.echo, 0, { cancellation: 'terminate' }),
      PjsQueueFullError,
    );
    const range = runtime.partitionRange(
      tasks.work,
      { start: 0, end: 1, grainSize: 1 },
      () => {
        built++;
        return { input: { state, index: 1 } };
      },
      { cancellation: 'terminate' },
    );
    await until(() => runtime.stats().workers.details[0].draining);
    assert.equal(built, 0);
    release(state, 0);
    await active;
    await until(() => at(state, 1));
    assert.equal(built, 1);
    assert.equal(runtime.stats().workers.details[0].exclusive, true);
    release(state, 1);
    await range;
  },
);

test(
  'physical cancellation and leases use exclusive threads and preserve unrelated shared work',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      workers: 2,
      concurrency: 2,
      maxQueue: 2,
    });
    const state = shared(),
      controller = new AbortController();
    const first = runtime.run(tasks.work, { state });
    const second = runtime.run(tasks.work, { state, index: 1 });
    await until(() => at(state, 0) && at(state, 1));
    const kill = runtime.run(
      tasks.cpu,
      { state, index: 2 },
      { cancellation: 'terminate', signal: controller.signal },
    );
    const cancelled = assert.rejects(kill, PjsCancelledError);
    await until(() => at(state, 2));
    controller.abort();
    await cancelled;
    await until(
      () =>
        runtime.stats().workers.total === 2 &&
        runtime.stats().workers.idle === 1,
    );
    assert.equal(runtime.stats().workers.restarts, 0);
    const leased = runtime.run(
      tasks.cpu,
      { state, index: 3 },
      { executionLease: 50 },
    );
    await assert.rejects(leased, PjsExecutionLeaseError);
    assert.equal(at(state, 64), 0);
    assert.equal(at(state, 65), 0);
    release(state, 0);
    release(state, 1);
    const results = await Promise.all([first, second]);
    assert.equal(results[0].threadId, results[1].threadId);
    assert.equal(runtime.stats().workers.restarts, 1);
  },
);

test(
  'one shared worker crash fans out independent recovery policies and spends one restart',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared();
    const retry = runtime.run(
      tasks.work,
      { state, crash: true },
      { repeatable: true, retry: { maxAttempts: 2 } },
    );
    const terminal = runtime.run(tasks.work, { state, index: 1 });
    const rejected = assert.rejects(terminal, PjsWorkerError);
    await until(() => at(state, 0) && at(state, 1));
    release(state, 0);
    await rejected;
    const result = await retry;
    assert.equal(result.attempt, 2);
    assert.equal(at(state, 1), 1);
    assert.equal(runtime.stats().workers.failures, 1);
    assert.equal(runtime.stats().workers.restarts, 1);
    assert.equal(runtime.stats().tasks.accepted, 2);
    assert.equal(runtime.stats().tasks.completed, 1);
  },
);

for (const api of [
  'partitionRange',
  'parallelFor',
  'genericMap',
  'typedMap',
  'countStream',
  'exactStream',
  'upperStream',
])
  test(
    `${api} shares execution slots while batches stay sequential`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, {
        concurrency: 2,
        maxQueue: 0,
      });
      const state = shared(),
        range = { start: 0, end: 4, grainSize: 1 };
      const factory = (partition) => ({ input: { state, partition } });
      const options = {
        dispatchBatchSize: 2,
        ...(api.includes('Stream') ? { maxBufferedResults: 4 } : {}),
      };
      let pending;
      if (api === 'partitionRange' || api === 'parallelFor')
        pending = runtime[api](tasks.work, range, factory, options);
      else if (api === 'genericMap' || api === 'typedMap')
        pending = runtime.parallelMapRange(
          api === 'typedMap' ? tasks.typed : tasks.block,
          range,
          factory,
          {
            ...options,
            ...(api === 'typedMap' ? { outputConstructor: Float64Array } : {}),
          },
        );
      else {
        const stream = runtime.streamRange(tasks.binary, range, factory, {
          ...options,
          ...(api === 'exactStream'
            ? { resultBytes: 4, maxReservedResultBytes: 16 }
            : api === 'upperStream'
              ? { maxResultBytes: 8, maxReservedResultBytes: 32 }
              : {}),
        });
        pending = (async () => {
          const items = [];
          for await (const item of stream) items.push(item);
          return items;
        })();
      }
      await until(() => at(state, 0) && at(state, 2));
      assert.equal(at(state, 1), 0);
      assert.equal(at(state, 3), 0);
      assert.equal(runtime.stats().workers.activeExecutions, 2);
      for (let index = 0; index < 4; index++) release(state, index);
      const result = await pending;
      if (api === 'genericMap' || api === 'typedMap')
        assert.deepEqual([...result], [0, 1, 2, 3]);
      assert.equal(runtime.stats().dispatch.executeMessages, 2);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    },
  );

test(
  'elastic growth packs shared slots and retires only empty threads',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      workers: 1,
      minWorkers: 1,
      maxWorkers: 3,
      concurrency: 2,
      idleTimeout: 40,
    });
    const state = shared();
    const pending = Array.from({ length: 4 }, (_, index) =>
      runtime.run(tasks.work, { state, index }),
    );
    await until(() => [0, 1, 2, 3].every((index) => at(state, index)));
    assert.equal(runtime.stats().workers.total, 2);
    assert.equal(runtime.stats().workers.activeExecutions, 4);
    await delay(60);
    assert.equal(runtime.stats().workers.total, 2);
    for (let index = 0; index < 4; index++) release(state, index);
    await Promise.all(pending);
    await until(() => runtime.stats().workers.total === 1);
    assert.equal(runtime.stats().workers.restarts, 0);
  },
);

test(
  'progress routes concurrent invocations and retry/fallback attempts without cross-talk',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared(),
      events = [],
      siblingEvents = [];
    const first = runtime.run(
      tasks.work,
      { state, fail: true, failures: 2, perAttempt: true },
      {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        fallback: { task: tasks.alternative },
        onProgress(event) {
          events.push(event);
          release(state, 0, event.attempt);
        },
      },
    );
    const second = runtime.run(
      tasks.work,
      { state, index: 1 },
      {
        onProgress(event) {
          siblingEvents.push(event);
        },
      },
    );
    await until(() => siblingEvents.length === 1);
    const result = await first;
    assert.equal(result.fallback, true);
    assert.deepEqual(
      events.map((event) => event.attempt),
      [1, 2, 3],
    );
    assert.deepEqual(
      events.map((event) => event.sequence),
      [1, 1, 1],
    );
    assert.equal(new Set(events.map((event) => event.taskId)).size, 1);
    assert.equal(new Set(events.map((event) => event.executionId)).size, 3);
    assert.equal(events[2].implementation, 'alternative');
    assert.equal(siblingEvents[0].value.index, 1);
    assert.notEqual(events[0].taskId, siblingEvents[0].taskId);
    release(state, 1);
    await second;
  },
);

for (const handler of ['throw', 'promise', 'abort'])
  test(
    `progress observer ${handler} is isolated from computation and closes its channel`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, { concurrency: 2 });
      const state = shared(),
        controller = new AbortController();
      let calls = 0;
      const pending = runtime.run(
        tasks.work,
        { state },
        {
          signal: controller.signal,
          onProgress() {
            calls++;
            if (handler === 'abort') controller.abort();
            else if (handler === 'promise')
              return Promise.reject(new Error('async observer'));
            else throw new Error('observer');
          },
        },
      );
      const cancelled =
        handler === 'abort'
          ? assert.rejects(pending, PjsCancelledError)
          : undefined;
      await until(() => calls === 1);
      if (cancelled) await cancelled;
      assert.equal(runtime.stats().workers.activeExecutions, 1);
      release(state, 0);
      if (!cancelled) await pending;
      await until(() => runtime.stats().workers.activeExecutions === 0);
      assert.equal(
        runtime.stats().progress.callbackErrors,
        handler === 'abort' ? 0 : 1,
      );
      assert.equal(runtime.stats().workers.failures, 0);
    },
  );

test(
  'progress opt-in preserves argument conventions and rejects unsupported payloads without task failure',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    assert.equal((await runtime.run(tasks.echo, 1)).arity, 1);
    assert.equal(
      (await runtime.run(tasks.echo, 1, { onProgress() {} })).arity,
      2,
    );
    const invalid = await runtime.run(tasks.invalidProgress, 0, {
      onProgress() {
        assert.fail('invalid value delivered');
      },
    });
    assert.ok(invalid.results.every((result) => result === false));
    assert.equal(invalid.accessed, 0);
    const state = shared();
    await runtime.run(tasks.late, { state }, { onProgress() {} });
    await until(() => at(state, 80) === 2);
    assert.equal(runtime.stats().progress.callbackErrors, 0);
  },
);

test('incremental progress encoding enforces escaped UTF-8 limits before traversing oversized inputs', () => {
  assert.equal(
    encodeProgress('x'.repeat(MAX_PROGRESS_BYTES - 2))?.length,
    MAX_PROGRESS_BYTES,
  );
  assert.equal(encodeProgress('x'.repeat(MAX_PROGRESS_BYTES - 1)), undefined);
  assert.equal(encodeProgress('€'.repeat(MAX_PROGRESS_BYTES)), undefined);
  assert.equal(
    encodeProgress('\u0000'.repeat(MAX_PROGRESS_BYTES / 2)),
    undefined,
  );
  assert.deepEqual(JSON.parse(encodeProgress({ text: '€😀\ud800\n"\\' })), {
    text: '€😀\ud800\n"\\',
  });
  let inspected = 0;
  const tooLarge = new Proxy(
    { huge: 'x'.repeat(1_000_000), later: 1 },
    {
      getOwnPropertyDescriptor(target, key) {
        inspected++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  assert.equal(encodeProgress(tooLarge), undefined);
  assert.ok(inspected < 4);
});

test(
  'CPU progress flood has bounded source frames, host callbacks and acknowledgement wakeups',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const worker = runtimeComponents(runtime).dispatcher.pool.worker(
      runtime.stats().workers.details[0].id,
    );
    const post = worker.thread.postMessage.bind(worker.thread);
    let wakeups = 0,
      delivered = 0,
      frames = 0;
    worker.thread.postMessage = (message, ...args) => {
      if (message.type === 'progressAck') wakeups++;
      return post(message, ...args);
    };
    worker.thread.on('message', (message) => {
      if (message.type === 'progress') frames++;
    });
    const accepted = await runtime.run(
      tasks.flood,
      { count: 50000 },
      {
        onProgress() {
          delivered++;
          assert.ok(
            runtimeComponents(runtime).taskCoordinator.pendingProgress.size <=
              1,
          );
        },
      },
    );
    assert.equal(accepted, 50000);
    // Completion can beat observer delivery; frame/wakeup bounds still hold.
    assert.ok(delivered <= frames);
    assert.ok(frames >= 1 && frames < 50000);
    assert.ok(wakeups <= 1, `CPU loop queued ${wakeups} wakeups`);
    assert.equal(runtime.stats().dispatch.resultMessages, 1);
  },
);

test(
  'an exclusive range cannot pin a shared slot retained for ordinary retry',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared();
    release(state, 0);
    const active = runtime.run(tasks.work, { state, index: 1 });
    const retry = runtime.run(
      tasks.work,
      { state, fail: true },
      {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 150 },
      },
    );
    await until(() =>
      runtime.stats().activeTasks.some((task) => task.status === 'recovering'),
    );
    let built = 0;
    const range = runtime.partitionRange(
      tasks.work,
      { start: 0, end: 1, grainSize: 1 },
      () => {
        built++;
        return { input: { state, index: 2 } };
      },
      { cancellation: 'terminate' },
    );
    assert.equal(runtime.stats().workers.details[0].draining, false);
    assert.equal(built, 0);
    assert.equal((await retry).attempt, 2);
    await until(() => runtime.stats().workers.details[0].draining);
    assert.equal(built, 0);
    release(state, 1);
    await active;
    await until(() => built === 1);
    release(state, 2);
    await range;
  },
);

test(
  'exclusive recovery retains a whole worker during zero-queue backoff',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared();
    release(state, 0);
    const pending = runtime.run(
      tasks.work,
      { state, fail: true },
      {
        cancellation: 'terminate',
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 120 },
      },
    );
    await until(() =>
      runtime.stats().activeTasks.some((task) => task.status === 'recovering'),
    );
    await assert.rejects(runtime.run(tasks.echo, 1), PjsQueueFullError);
    assert.equal((await pending).attempt, 2);
    assert.equal(runtime.stats().workers.restarts, 0);
  },
);

test(
  'multiple shared recoveries retain only their own slots under zero-queue admission',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared();
    release(state, 0);
    release(state, 1);
    const options = {
      repeatable: true,
      retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 100 },
    };
    const pending = [0, 1].map((index) =>
      runtime.run(tasks.work, { state, index, fail: true }, options),
    );
    await until(
      () =>
        runtime
          .stats()
          .activeTasks.filter((task) => task.status === 'recovering').length ===
        2,
    );
    await assert.rejects(runtime.run(tasks.echo, 2), PjsQueueFullError);
    assert.deepEqual(
      (await Promise.all(pending)).map((result) => result.attempt),
      [2, 2],
    );
    assert.equal(runtime.stats().workers.total, 1);
  },
);

test(
  'retry retains priority but joins behind equal-priority queued work',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 2 });
    const state = shared(),
      order = [];
    const retry = runtime
      .run(
        tasks.work,
        { state, fail: true },
        {
          priority: 10,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
        },
      )
      .then(() => order.push('retry'));
    const older = runtime
      .run(tasks.echo, 1, { priority: 10 })
      .then(() => order.push('older'));
    const lower = runtime
      .run(tasks.echo, 2, { priority: -1 })
      .then(() => order.push('lower'));
    release(state, 0);
    await Promise.all([retry, older, lower]);
    assert.deepEqual(order, ['older', 'retry', 'lower']);
  },
);

test(
  'concurrent batches route partition progress across failure, safe skips and singleton retries',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 0 });
    const state = shared(),
      events = [];
    const result = await runtime.partitionRange(
      tasks.work,
      { start: 0, end: 4, grainSize: 1 },
      (partition) => ({
        input: {
          state,
          partition,
          fail: partition.index === 0,
          perAttempt: true,
        },
      }),
      {
        dispatchBatchSize: 2,
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        onProgress(event) {
          events.push(event);
          assert.equal(event.partitionIndex, event.value.index);
          release(state, event.value.index, event.value.attempt);
        },
      },
    );
    assert.deepEqual(
      result.map((item) => item.attempt),
      [2, 1, 1, 1],
    );
    assert.equal(new Set(events.map((event) => event.operationId)).size, 1);
    assert.deepEqual(
      [0, 1, 2, 3].map((index) => at(state, index)),
      [2, 1, 1, 1],
    );
    assert.equal(runtime.stats().dispatch.executeMessages, 4);
  },
);

for (const byteMode of ['exact', 'upper'])
  test(
    `shared ${byteMode} result credits wait for every physical correlation at confirmed exit`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, {
        concurrency: 2,
        maxQueue: 0,
      });
      const state = shared();
      const stream = runtime.streamRange(
        tasks.binary,
        { start: 0, end: 2, grainSize: 1 },
        (partition) => ({ input: { state, partition } }),
        {
          maxBufferedResults: 2,
          maxReservedResultBytes: 8,
          ...(byteMode === 'exact'
            ? { resultBytes: 4 }
            : { maxResultBytes: 4 }),
        },
      );
      const rejected = assert.rejects(stream.next(), PjsWorkerError);
      await until(() => at(state, 0) && at(state, 1));
      const worker = runtimeComponents(runtime).dispatcher.pool.worker(
        runtime.stats().workers.details[0].id,
      );
      const exit = controlExit(worker);
      t.after(() => exit.release());
      worker.receive({ type: 'invalid' });
      await rejected;
      assert.equal(runtime.stats().workers.activeExecutions, 2);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assert.equal(runtime.stats().workers.restarts, 1);
      exit.release();
      await until(() => runtime.stats().workers.activeExecutions === 0);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    },
  );

test(
  'graceful shutdown drains concurrent recovery and progress; forced shutdown drops both owners',
  bounded,
  async (t) => {
    for (const drain of [true, false]) {
      const { runtime, tasks } = await setup(t, {
        concurrency: 2,
        maxQueue: 0,
      });
      const state = shared(),
        events = [];
      const options = {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        onProgress(event) {
          events.push(event);
          if (event.attempt > 1)
            release(state, event.value.index, event.attempt);
        },
      };
      const pending = [0, 1].map((index) =>
        runtime.run(
          tasks.work,
          { state, index, fail: true, perAttempt: true },
          options,
        ),
      );
      const observed = pending.map((promise) =>
        drain ? promise : assert.rejects(promise, PjsCancelledError),
      );
      await until(() => events.length === 2);
      const shutdown = runtime.shutdown({ drain });
      if (drain) {
        release(state, 0);
        release(state, 1);
      }
      await Promise.all([...observed, shutdown]);
      assert.equal(runtime.stats().state, 'stopped');
      assert.equal(
        runtimeComponents(runtime).taskCoordinator.pendingProgress.size,
        0,
      );
    }
  },
);

test(
  'disabled progress still supplies a context to subsequent recovery attempts',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared();
    let calls = 0;
    const result = await runtime.run(
      tasks.work,
      { state, fail: true },
      {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        onProgress() {
          calls++;
          release(state, 0);
          throw new Error('disable');
        },
      },
    );
    assert.equal(result.arity, 2);
    assert.equal(result.attempt, 2);
    assert.equal(calls, 1);
    assert.equal(runtime.stats().progress.callbackErrors, 1);
  },
);

test(
  'acknowledgement flushes the latest pending progress even without another report',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared(),
      seen = [];
    await runtime.run(
      tasks.burstWait,
      { state },
      {
        onProgress(event) {
          seen.push(event.value.done);
          if (seen.length === 2) release(state, 0);
        },
      },
    );
    assert.deepEqual(seen, [1, 2]);
  },
);

test(
  'reentrant cloning uses the other shared slot without double-counting capacity or elastic growth',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      concurrency: 2,
      maxQueue: 0,
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 100,
    });
    let nested;
    const input = {
      get value() {
        nested = runtime.run(tasks.echo, 2);
        assert.equal(runtime.stats().workers.activeExecutions, 2);
        return 1;
      },
    };
    const outer = runtime.run(tasks.echo, input, { onProgress() {} });
    const values = await Promise.all([outer, nested]);
    assert.equal(values[0].threadId, values[1].threadId);
    assert.equal(runtime.stats().workers.total, 1);
    assert.equal(values[0].arity, 2);
    assert.equal(values[1].arity, 1);
  },
);

test(
  'exclusive preparation failure and factory failure release placement without disturbing shared work',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 1 });
    const state = shared();
    const active = runtime.run(tasks.work, { state });
    const bad = runtime.run(tasks.echo, () => 1, { cancellation: 'terminate' });
    const rejected = assert.rejects(bad, PjsSerializationError);
    await until(() => runtime.stats().workers.details[0].draining);
    release(state, 0);
    await active;
    await rejected;
    assert.equal(runtime.stats().workers.details[0].draining, false);
    await assert.rejects(
      runtime.partitionRange(
        tasks.echo,
        { start: 0, end: 1, grainSize: 1 },
        () => {
          throw new Error('factory');
        },
        { cancellation: 'terminate' },
      ),
    );
    assert.equal(runtime.stats().workers.details[0].draining, false);
    await runtime.run(tasks.echo, 1);
    assert.equal(runtime.stats().workers.failures, 0);
  },
);

test(
  'new options validate before factories or input transfer',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    for (const priority of [NaN, Infinity, 0.5, -(2 ** 31) - 1, 2 ** 31]) {
      const bytes = new Uint8Array(4);
      await assert.rejects(
        runtime.run(tasks.echo, bytes, {
          priority,
          transferList: [bytes.buffer],
        }),
        RangeError,
      );
      assert.equal(bytes.byteLength, 4);
      await assert.rejects(
        runtime.parallelFor(
          tasks.echo,
          { start: 0, end: 1, grainSize: 1 },
          () => assert.fail('factory'),
          { priority },
        ),
        RangeError,
      );
    }
    await assert.rejects(
      runtime.run(tasks.echo, 1, { onProgress: 1 }),
      TypeError,
    );
    const registry = new PjsTaskRegistry();
    for (const concurrency of [
      0,
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
    ])
      assert.throws(
        () => new PjsRuntime({ registry, concurrency }),
        RangeError,
      );
    assert.throws(() => new PjsRuntime({ registry, scheduling: 1 }), TypeError);
  },
);

test(
  'a second failure during exclusive drain cannot spend retained retry slots without queue credits',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { concurrency: 2, maxQueue: 1 });
    const state = shared();
    const options = {
      repeatable: true,
      retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 100 },
    };
    const first = runtime.run(tasks.work, { state, fail: true }, options);
    const second = runtime.run(
      tasks.work,
      { state, index: 1, fail: true },
      options,
    );
    await until(() => at(state, 0) && at(state, 1));
    const dispatcher = runtimeComponents(runtime).dispatcher;
    const exclusive = runtime.run(tasks.echo, 0, {
      cancellation: 'terminate',
      priority: 10,
    });
    // At first there are no spare slots to exchange; completing/failing a sibling
    // can change how much recovery capacity this one queued job would consume.
    release(state, 0);
    await until(() => runtime.stats().workers.details[0].draining);
    const worker = dispatcher.pool.worker(
      runtime.stats().workers.details[0].id,
    );
    const execute = worker.execute.bind(worker);
    worker.execute = (...args) => {
      if (args[9])
        assert.equal(
          [...dispatcher.recoveries.values()].filter(
            (entry) => entry.kind === 'slot',
          ).length,
          0,
          'exclusive post must exchange every protected slot',
        );
      return execute(...args);
    };
    release(state, 1);
    const values = await Promise.all([first, second, exclusive]);
    assert.deepEqual(
      values.slice(0, 2).map((value) => value.attempt),
      [2, 2],
    );
    assert.equal(runtime.stats().queue.size, 0);
  },
);
