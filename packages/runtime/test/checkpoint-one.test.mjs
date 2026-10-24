import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsCancelledError,
  PjsTimeoutError,
  PjsTaskError,
  PjsWorkerError,
  PjsQueueFullError,
} from '../dist/index.js';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';
import {
  until,
  controlExit,
  clock,
  assertOwners,
  bounded,
} from './helpers/containment.mjs';

const fixture = new URL('./fixtures/checkpoint-one-tasks.mjs', import.meta.url);
const range = { start: 0, end: 4, grainSize: 1 };
const one = { start: 0, end: 1, grainSize: 1 };
const shared = () => new SharedArrayBuffer(16);
const count = (state, index = 0) => Atomics.load(new Int32Array(state), index);
function finish(state) {
  Atomics.store(new Int32Array(state), 1, 1);
  Atomics.notify(new Int32Array(state), 1);
}
function workers(runtime) {
  return [...runtimeComponents(runtime).dispatcher.pool.workers.values()];
}
async function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    ['hang', 'gate', 'partitionFail', 'describe', 'failOnce', 'fallback'].map(
      (name) => [name, registry.register(name, fixture, name)],
    ),
  );
  const runtime = new PjsRuntime({
    registry,
    ...(options.idleTimeout === undefined ? { workers: 1 } : {}),
    maxQueue: 8,
    ...options,
  });
  const states = [];
  const exits = [];
  t.after(async () => {
    for (const state of states) finish(state);
    for (const exit of exits) exit.release();
    await runtime.shutdown({ drain: false });
    assertOwners(runtime, { quiescent: true });
    assert.equal(runtimeComponents(runtime).dispatcher.pool.idleTimers.size, 0);
  });
  await runtime.ready();
  return {
    runtime,
    tasks,
    state() {
      const state = shared();
      states.push(state);
      return state;
    },
    hold(worker = workers(runtime)[0]) {
      const exit = controlExit(worker);
      exits.push(exit);
      return exit;
    },
  };
}

for (const method of [
  'partitionRange',
  'parallelFor',
  'parallelMapRange',
  'streamRange',
])
  for (const cause of ['abort', 'timeout'])
    test(
      `${method}: ${cause} physically cancels batches and retains credit until exit`,
      bounded,
      async (t) => {
        const { runtime, tasks, state, hold } = await setup(t, {
          workers: 2,
          maxRestarts: 0,
        });
        const input = state();
        const exits = workers(runtime).map(hold);
        const controller = new AbortController();
        const options = {
          cancellation: 'terminate',
          dispatchBatchSize: 2,
          ...(cause === 'abort'
            ? { signal: controller.signal }
            : { timeout: 500 }),
          ...(method === 'streamRange'
            ? {
                maxBufferedResults: 4,
                resultBytes: 8,
                maxReservedResultBytes: 32,
              }
            : {}),
        };
        const result = runtime[method](
          tasks.hang,
          range,
          (partition) => ({ input: { state: input, partition } }),
          options,
        );
        const rejected = assert.rejects(
          method === 'streamRange' ? result.next() : result,
          cause === 'abort' ? PjsCancelledError : PjsTimeoutError,
        );
        await until(() => count(input) === 2);
        if (cause === 'abort') controller.abort();
        await rejected;
        assert.equal(runtime.stats().tasks.pending, 0);
        assert.equal(runtime.stats().tasks.cancelled, 4);
        assert.equal(runtime.stats().workers.busy, 2);
        assert.equal(
          exits.reduce((n, exit) => n + exit.requests, 0),
          2,
        );
        assert.equal(runtime.stats().workers.restarts, 0);
        if (method === 'streamRange')
          assert.equal(
            runtime.stats().streamResults.currentReservedResultBytes,
            32,
          );
        for (const exit of exits) exit.release();
        await until(() => runtime.stats().workers.idle === 2);
        assert.equal(runtime.stats().containment.workerReplacements, 2);
        assert.equal(
          runtime.stats().streamResults.currentReservedResultBytes,
          0,
        );
      },
    );

test(
  'stream consumer return/throw terminates active siblings; default cleanup remains logical only',
  bounded,
  async (t) => {
    for (const action of ['return', 'throw', 'default']) {
      const { runtime, tasks, state, hold } = await setup(t, {
        maxRestarts: 0,
      });
      const input = state();
      const exit = hold();
      const stream = runtime.streamRange(
        tasks.hang,
        one,
        () => ({ input: { state: input } }),
        {
          ...(action === 'default' ? {} : { cancellation: 'terminate' }),
          resultBytes: 8,
          maxReservedResultBytes: 8,
        },
      );
      const pending = stream.next();
      await until(() => count(input) === 1);
      if (action === 'throw') {
        const failure = new Error('consumer failure');
        const rejected = assert.rejects(pending, (error) => error === failure);
        await assert.rejects(
          stream.throw(failure),
          (error) => error === failure,
        );
        await rejected;
      } else {
        await stream.return();
        assert.equal((await pending).done, true);
      }
      assert.equal(runtime.stats().workers.busy, 1);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assert.equal(exit.requests, action === 'default' ? 0 : 1);
      if (action !== 'default') {
        exit.release();
        await until(() => runtime.stats().workers.idle === 1);
      }
    }
  },
);

test(
  'range termination is scoped to its correlations; sibling failure stops only that parent',
  bounded,
  async (t) => {
    const { runtime, tasks, state, hold } = await setup(t, {
      workers: 3,
      maxRestarts: 0,
    });
    const hung = state(),
      unrelated = state();
    const exit = hold();
    const failure = assert.rejects(
      runtime.partitionRange(
        tasks.partitionFail,
        { ...range, end: 2 },
        (partition) => ({ input: { partition, state: hung } }),
        { cancellation: 'terminate' },
      ),
      PjsTaskError,
    );
    const other = runtime.partitionRange(
      tasks.gate,
      one,
      (partition) => ({ input: { partition, state: unrelated } }),
      { cancellation: 'terminate' },
    );
    await failure;
    await until(() => count(unrelated) === 1);
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().workers.failures, 0);
    finish(unrelated);
    assert.deepEqual(await other, [[0]]);
    assert.equal(
      (await runtime.run(tasks.describe, 'unaffected')).value,
      'unaffected',
    );
  },
);

test(
  'reentrant range abort finishes transfer posting before containment; queued ownership stays attached',
  bounded,
  async (t) => {
    const { runtime, tasks, state, hold } = await setup(t, { maxRestarts: 0 });
    const input = state(),
      bytes = new ArrayBuffer(8);
    const controller = new AbortController();
    const exit = hold();
    const result = runtime.streamRange(
      tasks.hang,
      one,
      () => ({
        input: {
          get state() {
            controller.abort();
            return input;
          },
          bytes,
        },
        transferList: [bytes],
      }),
      {
        signal: controller.signal,
        cancellation: 'terminate',
        resultBytes: 8,
        maxReservedResultBytes: 8,
      },
    );
    await assert.rejects(result.next(), PjsCancelledError);
    assert.equal(bytes.byteLength, 0);
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
    exit.release();
    await until(() => runtime.stats().workers.idle === 1);

    const gated = state();
    const active = runtime.run(tasks.gate, { state: gated });
    const queuedBuffer = new ArrayBuffer(8),
      queuedAbort = new AbortController();
    const queued = runtime.partitionRange(
      tasks.describe,
      one,
      () => ({ input: queuedBuffer, transferList: [queuedBuffer] }),
      { signal: queuedAbort.signal, cancellation: 'terminate' },
    );
    const rejected = assert.rejects(queued, PjsCancelledError);
    queuedAbort.abort();
    await rejected;
    assert.equal(queuedBuffer.byteLength, 8);
    finish(gated);
    await active;
  },
);

test(
  'completed range cancellation cannot retire the worker of its next operation',
  bounded,
  async (t) => {
    const { runtime, tasks, state } = await setup(t);
    const controller = new AbortController();
    await runtime.partitionRange(tasks.describe, one, () => ({ input: 1 }), {
      signal: controller.signal,
      cancellation: 'terminate',
    });
    const input = state();
    const next = runtime.partitionRange(
      tasks.gate,
      one,
      () => ({ input: { state: input } }),
      { cancellation: 'terminate' },
    );
    await until(() => count(input) === 1);
    controller.abort();
    finish(input);
    await next;
    assert.equal(runtime.stats().containment.workerReplacements, 0);
  },
);

test(
  'elastic range cancellation preserves the rolling crash budget, which remains fatal when exhausted',
  bounded,
  async (t) => {
    const { runtime, tasks, state } = await setup(t, {
      workers: 2,
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 10000,
      restartPolicy: { maxRestarts: 0, windowMs: 10000 },
    });
    const controller = new AbortController();
    const input = state(),
      unrelated = state();
    const cancelled = assert.rejects(
      runtime.partitionRange(
        tasks.hang,
        one,
        () => ({ input: { state: input } }),
        {
          signal: controller.signal,
          cancellation: 'terminate',
        },
      ),
      PjsCancelledError,
    );
    const active = runtime.run(tasks.gate, { state: unrelated });
    await until(() => count(input) === 1 && count(unrelated) === 1);
    controller.abort();
    await cancelled;
    await until(() => runtime.stats().workers.total === 1);
    assert.equal(runtime.stats().containment.restartWindowUtilization, 0);
    assert.equal(runtime.stats().workers.failures, 0);
    finish(unrelated);
    await active;
    await assert.rejects(
      runtime.run(
        tasks.failOnce,
        { state: state(), mode: 'crash' },
        {
          repeatable: true,
          retry: { maxAttempts: 2 },
        },
      ),
      PjsWorkerError,
    );
    assert.equal(runtime.stats().state, 'failed');
    assert.equal(runtime.stats().containment.restartBudgetExhaustions, 1);
  },
);

test(
  'elastic pool starts at minimum, grows for accepted demand and retires idle excess within bounds',
  bounded,
  async (t) => {
    const { runtime, tasks, state } = await setup(t, {
      minWorkers: 1,
      maxWorkers: 3,
      idleTimeout: 100,
    });
    const pool = runtimeComponents(runtime).dispatcher.pool;
    const time = clock(pool, 'Idle');
    assert.equal(runtime.stats().workers.total, 1);
    for (let burst = 0; burst < 2; burst++) {
      const inputs = [state(), state(), state()];
      const pending = inputs.map((input) =>
        runtime.run(tasks.gate, { state: input }),
      );
      await until(() => inputs.every((input) => count(input) === 1));
      assert.equal(runtime.stats().workers.total, 3);
      assert.equal(runtime.stats().workers.busy, 3);
      inputs.forEach(finish);
      await Promise.all(pending);
      time.advance(100);
      await until(() => runtime.stats().workers.total === 1);
      assert.equal(runtime.stats().workers.restarts, 0);
      assert.equal(runtime.stats().workers.failures, 0);
    }
  },
);

test(
  'fixed pools retain their original population, and range demand can grow an elastic zero-queue pool',
  bounded,
  async (t) => {
    const fixed = await setup(t, { workers: 2, minWorkers: 1, maxWorkers: 4 });
    const time = clock(
      runtimeComponents(fixed.runtime).dispatcher.pool,
      'Idle',
    );
    await fixed.runtime.run(fixed.tasks.describe, null);
    time.advance(100000);
    assert.equal(fixed.runtime.stats().workers.total, 2);
    assert.equal(time.timers.length, 0);

    const { runtime, tasks, state } = await setup(t, {
      minWorkers: 1,
      maxWorkers: 3,
      idleTimeout: 10000,
      maxQueue: 0,
    });
    const input = state();
    const pending = runtime.partitionRange(
      tasks.gate,
      { start: 0, end: 3, grainSize: 1 },
      (partition) => ({ input: { state: input, partition } }),
    );
    await until(() => count(input) === 3);
    assert.equal(runtime.stats().workers.total, 3);
    assert.equal(runtime.stats().queue.size, 0);
    finish(input);
    assert.deepEqual(await pending, [[0], [1], [2]]);
  },
);

test(
  'retiring workers retain live-thread slots until exit; arriving work survives retirement',
  bounded,
  async (t) => {
    const { runtime, tasks, state, hold } = await setup(t, {
      workers: 3,
      minWorkers: 1,
      maxWorkers: 3,
      idleTimeout: 100,
    });
    const pool = runtimeComponents(runtime).dispatcher.pool;
    const time = clock(pool, 'Idle');
    // Initial idle timers were real; force one demand transition to install controlled timers.
    const inputs = [state(), state(), state()];
    const first = inputs.map((input) =>
      runtime.run(tasks.gate, { state: input }),
    );
    await until(() => inputs.every((input) => count(input) === 1));
    inputs.forEach(finish);
    await Promise.all(first);
    const exits = workers(runtime).map(hold);
    time.advance(100);
    assert.equal(
      exits.reduce((n, exit) => n + exit.requests, 0),
      2,
    );
    const next = [state(), state(), state()];
    const pending = next.map((input) =>
      runtime.run(tasks.gate, { state: input }),
    );
    assert.equal(runtime.stats().workers.total, 3);
    for (const exit of exits) exit.release();
    await until(() => next.every((input) => count(input) === 1));
    assert.equal(runtime.stats().workers.total, 3);
    next.forEach(finish);
    await Promise.all(pending);
  },
);

test(
  'elastic backoff reserves execution capacity, and retries/fallbacks survive crash and graceful drain',
  bounded,
  async (t) => {
    const { runtime, tasks, state } = await setup(t, {
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 1,
      maxQueue: 0,
    });
    const value = { state: state(), mode: 'crash' };
    const pending = runtime.run(tasks.failOnce, value, {
      repeatable: true,
      retry: { maxAttempts: 2, backoffMs: 200 },
    });
    await until(
      () =>
        runtime
          .stats()
          .activeTasks.some((task) => task.status === 'recovering') &&
        runtime.stats().workers.busy === 0,
    );
    await assert.rejects(
      runtime.run(tasks.describe, 'reserved'),
      PjsQueueFullError,
    );
    const result = await pending;
    assert.equal(result.value, 2);
    assert.equal(runtime.stats().workers.restarts, 1);
    const next = { state: state(), failures: 5 };
    const fallback = runtime.run(tasks.failOnce, next, {
      repeatable: true,
      retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 20 },
      fallback: { task: tasks.fallback },
    });
    const shutdown = runtime.shutdown();
    assert.equal((await fallback).value, 'fallback');
    await shutdown;
    assert.equal(runtime.stats().workers.total, 1);
    assert.equal(count(next.state), 2);
    assert.equal(count(next.state, 2), 1);
  },
);

test(
  'growth bootstrap failure is fatal without a respawn loop; forced shutdown cancels idle timers',
  bounded,
  async (t) => {
    const { runtime, tasks, state } = await setup(t, {
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 100,
    });
    const active = assert.rejects(
      runtime.run(tasks.gate, { state: state() }),
      PjsWorkerError,
    );
    const previous = process.env.PJS_CK1_FAIL_BOOTSTRAP;
    let queued;
    try {
      process.env.PJS_CK1_FAIL_BOOTSTRAP = '1';
      queued = assert.rejects(
        runtime.run(tasks.describe, 'queued'),
        PjsWorkerError,
      );
    } finally {
      if (previous === undefined) delete process.env.PJS_CK1_FAIL_BOOTSTRAP;
      else process.env.PJS_CK1_FAIL_BOOTSTRAP = previous;
    }
    await Promise.all([active, queued]);
    assert.equal(runtime.stats().state, 'failed');
    assert.equal(runtime.stats().workers.restarts, 0);
    await runtime.shutdown({ drain: false });
    assert.equal(runtimeComponents(runtime).dispatcher.pool.idleTimers.size, 0);
  },
);

test(
  'resource limits are snapshotted and reach initial, grown, cancelled and crashed replacements',
  bounded,
  async (t) => {
    const limits = {
      maxOldGenerationSizeMb: 48,
      maxYoungGenerationSizeMb: 4,
      codeRangeSizeMb: 16,
      stackSizeMb: 2,
    };
    const { runtime, tasks, state } = await setup(t, {
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 10000,
      resourceLimits: limits,
    });
    limits.maxOldGenerationSizeMb = 128;
    const initial = await runtime.run(tasks.describe, null);
    assert.equal(initial.limits.maxOldGenerationSizeMb, 48);
    assert.equal(initial.limits.stackSizeMb, 2);
    const input = state();
    const busy = runtime.run(tasks.gate, { state: input });
    const grown = await runtime.run(tasks.describe, null);
    assert.notEqual(grown.threadId, initial.threadId);
    assert.deepEqual(grown.limits, initial.limits);
    finish(input);
    await busy;
    const crashed = await runtime.run(
      tasks.failOnce,
      { state: state(), mode: 'crash' },
      {
        repeatable: true,
        retry: { maxAttempts: 2 },
      },
    );
    assert.deepEqual(crashed.limits, initial.limits);
    const aborted = new AbortController();
    const cpu = state();
    const cancelled = assert.rejects(
      runtime.run(
        tasks.hang,
        { state: cpu },
        { signal: aborted.signal, cancellation: 'terminate' },
      ),
      PjsCancelledError,
    );
    await until(() => count(cpu) === 1);
    aborted.abort();
    await cancelled;
    await until(
      () =>
        runtime.stats().workers.idle > 0 && runtime.stats().workers.busy === 0,
    );
    assert.deepEqual(
      (await runtime.run(tasks.describe, null)).limits,
      initial.limits,
    );
  },
);

test(
  'actual worker heap-limit exit reports a worker error and permits bounded retry/fallback',
  { timeout: 15000 },
  async (t) => {
    const { runtime, tasks, state } = await setup(t, {
      resourceLimits: {
        maxOldGenerationSizeMb: 32,
        maxYoungGenerationSizeMb: 4,
      },
    });
    const retried = { state: state(), mode: 'oom' };
    const output = await runtime.run(tasks.failOnce, retried, {
      repeatable: true,
      retry: { maxAttempts: 2 },
    });
    assert.equal(output.value, 2);
    assert.equal(output.limits.maxOldGenerationSizeMb, 32);
    assert.equal(runtime.stats().workers.failures, 1);
    const fallbackInput = { state: state(), mode: 'oom' };
    const alternative = await runtime.run(tasks.failOnce, fallbackInput, {
      repeatable: true,
      fallback: { task: tasks.fallback, on: ['worker-crash'] },
    });
    assert.equal(alternative.value, 'fallback');
    assert.equal(alternative.limits.maxOldGenerationSizeMb, 32);
    assert.equal(runtime.stats().workers.restarts, 2);
  },
);

test(
  'elasticity/resource limits and range cancellation reject invalid values before execution',
  bounded,
  async (t) => {
    const registry = new PjsTaskRegistry();
    for (const options of [
      { idleTimeout: 0 },
      { idleTimeout: NaN },
      { idleTimeout: 2 ** 31 },
      { resourceLimits: null },
      { resourceLimits: [] },
      { resourceLimits: { rss: 32 } },
      ...[0, -1, NaN, Infinity, '32'].map((value) => ({
        resourceLimits: { maxOldGenerationSizeMb: value },
      })),
    ])
      assert.throws(
        () => new PjsRuntime({ registry, workers: 1, ...options }),
        (error) => error instanceof TypeError || error instanceof RangeError,
      );
    const { runtime, tasks } = await setup(t);
    for (const method of [
      'partitionRange',
      'parallelFor',
      'parallelMapRange',
      'streamRange',
    ]) {
      const result = runtime[method](
        tasks.describe,
        one,
        () => assert.fail('factory ran'),
        { cancellation: 'cooperate' },
      );
      await assert.rejects(
        method === 'streamRange' ? result.next() : result,
        TypeError,
      );
    }
    await delay(5);
  },
);
