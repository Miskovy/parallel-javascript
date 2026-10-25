import assert from 'node:assert/strict';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';
import { test } from 'node:test';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsError,
  PjsCancelledError,
  PjsSerializationError,
  PjsTimeoutError,
  PjsQueueFullError,
} from '../dist/index.js';
import {
  until,
  assertOwners,
  bounded,
  controlExit,
} from './helpers/containment.mjs';
const fixture = new URL('./fixtures/checkpoint-two-tasks.mjs', import.meta.url);
const shared = () => new SharedArrayBuffer(64);
async function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    [
      'attempt',
      'alternative',
      'block',
      'binary',
      'invalid',
      'badSerialization',
      'convention',
      'cpu',
      'asyncCleanup',
      'hold',
      'ignore',
      'typedBlock',
      'binaryAlternative',
      'cooperativeSibling',
      'gatedAttempt',
    ].map((name) => [name, registry.register(name, fixture, name)]),
  );
  const runtime = new PjsRuntime({ registry, workers: 1, ...options });
  t.after(async () => {
    await runtime.shutdown({ drain: false });
    assertOwners(runtime, { quiescent: true });
    assert.equal(runtimeComponents(runtime).taskCoordinator.executions.size, 0);
  });
  await runtime.ready();
  return { runtime, tasks };
}
test(
  'ordinary reconstruction moves fresh input for retry and fallback under zero-queue admission',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const state = shared(),
      built = [];
    const prepare = () => {
      const bytes = new Uint8Array([1, 2, 3]);
      built.push(bytes);
      return {
        input: { state, bytes, failAt: 0, failures: 5 },
        transferList: [bytes.buffer],
      };
    };
    const first = prepare(),
      calls = [];
    const result = await runtime.run(tasks.attempt, first.input, {
      transferList: first.transferList,
      repeatable: true,
      retry: { maxAttempts: 2, on: ['task-error'] },
      fallback: { task: tasks.alternative },
      rebuildInput: (next) => {
        calls.push(next);
        return prepare();
      },
    });
    assert.equal(result.alternative, true);
    assert.deepEqual(result.bytes, [1, 2, 3]);
    assert.deepEqual(calls, [
      { attempt: 2, implementation: 'primary' },
      { attempt: 3, implementation: 'fallback' },
    ]);
    assert.ok(built.every((bytes) => bytes.byteLength === 0));
    assert.equal(runtime.stats().tasks.accepted, 1);
  },
);
test(
  'reconstruction errors terminate, and reentrant abort prevents posting',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    for (const factory of [
      () => {
        throw new Error('factory');
      },
      async () => ({ input: 1 }),
      async () => {
        throw new Error('Rejected async reconstruction');
      },
      () => {
        const b = new ArrayBuffer(1);
        return { input: 1, transferList: [b, b] };
      },
    ]) {
      const state = shared();
      await assert.rejects(
        runtime.run(
          tasks.attempt,
          { state, failAt: 0 },
          {
            repeatable: true,
            retry: { maxAttempts: 3, on: ['task-error'] },
            rebuildInput: factory,
          },
        ),
        PjsError,
      );
      assert.equal(new Int32Array(state)[0], 1);
    }
    const state = shared(),
      controller = new AbortController();
    await assert.rejects(
      runtime.run(
        tasks.attempt,
        { state, failAt: 0 },
        {
          signal: controller.signal,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: () => {
            controller.abort();
            return { input: { state } };
          },
        },
      ),
      PjsCancelledError,
    );
    assert.equal(new Int32Array(state)[0], 1);
  },
);
test(
  'reconstruction rejects reused detached backing and reserves worker before application callback',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const state = shared();
    const bytes = new Uint8Array([4]);
    await assert.rejects(
      runtime.run(
        tasks.attempt,
        { state, bytes, failAt: 0 },
        {
          transferList: [bytes.buffer],
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: () => ({
            input: { state, bytes },
            transferList: [bytes.buffer],
          }),
        },
      ),
      PjsSerializationError,
      PjsTimeoutError,
      PjsQueueFullError,
    );
    let nested;
    const state2 = shared();
    await runtime.run(
      tasks.attempt,
      { state: state2, failAt: 0 },
      {
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        rebuildInput: () => {
          nested = runtime.run(tasks.convention, 0).catch((e) => e);
          return { input: { state: state2 } };
        },
      },
    );
    assert.equal((await nested).name, 'PjsQueueFullError');
  },
);
const range = { start: 0, end: 4, grainSize: 1 };
test(
  'range batch task failure preserves prefix, resumes known skips without rebuilding or spending attempts',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const state = shared(),
      factories = [],
      rebuilt = [];
    const result = await runtime.partitionRange(
      tasks.attempt,
      range,
      (p) => {
        factories.push(p.index);
        return { input: { state, partition: p, failAt: 1 } };
      },
      {
        dispatchBatchSize: 4,
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        rebuildInput: (p, next) => {
          rebuilt.push([p.index, next.attempt]);
          return { input: { state, partition: p } };
        },
      },
    );
    assert.deepEqual(
      result.map((x) => x.index),
      [0, 1, 2, 3],
    );
    assert.deepEqual([...new Int32Array(state)].slice(0, 4), [1, 2, 1, 1]);
    assert.deepEqual(factories, [0, 1, 2, 3]);
    assert.deepEqual(rebuilt, [[1, 2]]);
    assert.equal(runtime.stats().tasks.accepted, 4);
  },
);
test(
  'ambiguous batch crash repeats unconfirmed prefix and spends every member attempt before fallback',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const state = shared();
    const result = await runtime.partitionRange(
      tasks.attempt,
      range,
      (p) => ({ input: { state, partition: p, crashAt: 1 } }),
      {
        dispatchBatchSize: 4,
        repeatable: true,
        retry: { maxAttempts: 1 },
        fallback: { task: tasks.alternative, on: ['worker-crash'] },
      },
    );
    assert.ok(result.every((x) => x.alternative));
    assert.deepEqual([...new Int32Array(state)].slice(0, 4), [2, 2, 1, 1]);
    assert.equal(runtime.stats().workers.restarts, 1);
  },
);
for (const mode of ['count', 'exact', 'upper'])
  test(
    `stream ${mode} retains one logical count/byte reservation through batch recovery`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, { maxQueue: 0 });
      const state = shared();
      let declarations = 0;
      const stream = runtime.streamRange(
        tasks.binary,
        range,
        (p) => ({ input: { state, partition: p, failAt: 1, bytesOut: 4 } }),
        {
          dispatchBatchSize: 4,
          maxBufferedResults: 4,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'], backoffMs: 25 },
          ...(mode === 'count'
            ? {}
            : {
                [mode === 'exact' ? 'resultBytes' : 'maxResultBytes']: () => {
                  declarations++;
                  return mode === 'exact' ? 4 : 8;
                },
                maxReservedResultBytes: mode === 'exact' ? 16 : 32,
              }),
        },
      );
      const seen = [];
      for await (const item of stream) seen.push(item.partition.index);
      assert.equal(new Set(seen).size, 4);
      assert.deepEqual([...new Int32Array(state)].slice(0, 4), [1, 2, 1, 1]);
      assert.equal(declarations, mode === 'count' ? 0 : 4);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
      assert.equal(
        runtime.stats().streamResults.refundedResultBytes,
        mode === 'upper' ? 16 : 0,
      );
    },
  );
test(
  'map retries validate the original block contract; invalid fallback is terminal',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared();
    assert.deepEqual(
      await runtime.parallelMapRange(
        tasks.block,
        range,
        (p) => ({ input: { state, partition: p, failAt: 1 } }),
        {
          dispatchBatchSize: 4,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
        },
      ),
      [0, 1, 2, 3],
    );
    await assert.rejects(
      runtime.parallelMapRange(
        tasks.block,
        range,
        (p) => ({ input: { state: shared(), partition: p, failAt: 0 } }),
        { repeatable: true, fallback: { task: tasks.invalid } },
      ),
      (e) => e.name === 'PjsMapContractError',
    );
  },
);
test(
  'combined serialization failure never turns misleading skipped IDs into safe replay',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared();
    let rebuilt = 0;
    await assert.rejects(
      runtime.partitionRange(
        tasks.badSerialization,
        range,
        (p) => ({ input: { state, partition: p } }),
        {
          dispatchBatchSize: 4,
          repeatable: true,
          retry: { maxAttempts: 3, on: ['task-error'] },
          fallback: { task: tasks.alternative },
          rebuildInput: () => {
            rebuilt++;
            return { input: 0 };
          },
        },
      ),
      PjsSerializationError,
      PjsTimeoutError,
      PjsQueueFullError,
    );
    assert.deepEqual([...new Int32Array(state)].slice(0, 4), [1, 1, 1, 1]);
    assert.equal(rebuilt, 0);
  },
);
test(
  'calling convention stays one argument except in explicit cooperative mode, including batches',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    for (const mode of [undefined, 'settle', 'terminate', 'cooperative']) {
      const options = mode ? { cancellation: mode } : {};
      const single = await runtime.run(tasks.convention, 0, options);
      assert.equal(single.length, mode === 'cooperative' ? 2 : 1);
      const items = await runtime.partitionRange(
        tasks.convention,
        range,
        () => ({ input: 0 }),
        { ...options, dispatchBatchSize: 4 },
      );
      assert.ok(
        items.every((x) => x.length === (mode === 'cooperative' ? 2 : 1)),
      );
    }
  },
);
for (const api of [
  'run',
  'partitionRange',
  'parallelFor',
  'parallelMapRange',
  'streamRange',
])
  test(
    `${api}: cooperative CPU cancellation returns worker capacity without recreation`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, { maxRestarts: 0 });
      const state = shared(),
        controller = new AbortController();
      const before = await runtime.run(tasks.convention, 0);
      const options = {
        cancellation: 'cooperative',
        signal: controller.signal,
      };
      const result =
        api === 'run'
          ? runtime.run(tasks.cpu, { state }, options)
          : runtime[api](tasks.cpu, range, () => ({ input: { state } }), {
              ...options,
              dispatchBatchSize: 4,
              ...(api === 'streamRange'
                ? {
                    resultBytes: 4,
                    maxReservedResultBytes: 16,
                    maxBufferedResults: 4,
                  }
                : {}),
            });
      const rejected = assert.rejects(
        api === 'streamRange' ? result.next() : result,
        PjsCancelledError,
      );
      await until(() => new Int32Array(state)[0] === 1);
      controller.abort();
      await rejected;
      if (api === 'streamRange')
        assert.equal(
          runtime.stats().streamResults.currentReservedResultBytes,
          16,
        );
      await until(() => runtime.stats().workers.busy === 0);
      assert.equal(new Int32Array(state)[1], 1);
      assert.equal(runtime.stats().workers.failures, 0);
      assert.equal(
        (await runtime.run(tasks.convention, 0)).threadId,
        before.threadId,
      );
    },
  );
test(
  'async cooperation awaits cleanup; stream close cancels active batch suffix without invoking it',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared();
    const stream = runtime.streamRange(
      tasks.asyncCleanup,
      range,
      () => ({ input: { state } }),
      {
        cancellation: 'cooperative',
        dispatchBatchSize: 4,
        maxBufferedResults: 4,
        resultBytes: 4,
        maxReservedResultBytes: 16,
      },
    );
    const pending = stream.next();
    await until(() => new Int32Array(state)[0] === 1);
    await stream.return();
    await pending;
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 16);
    await until(
      () =>
        new Int32Array(state)[1] === 1 && runtime.stats().workers.busy === 0,
    );
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    assert.equal(runtime.stats().workers.failures, 0);
  },
);
test(
  'cooperative timeout and ignored cancellation retain occupancy until cleanup or lease containment',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0, maxRestarts: 2 });
    const state = shared();
    await assert.rejects(
      runtime.run(
        tasks.cpu,
        { state },
        { timeout: 100, cancellation: 'cooperative' },
      ),
      PjsTimeoutError,
    );
    await until(() => runtime.stats().workers.busy === 0);
    assert.equal(new Int32Array(state)[1], 1);
    const ignored = shared(),
      controller = new AbortController();
    const failure = assert.rejects(
      runtime.run(
        tasks.ignore,
        { state: ignored },
        {
          signal: controller.signal,
          cancellation: 'cooperative',
          executionLease: 250,
        },
      ),
      PjsCancelledError,
    );
    await until(() => new Int32Array(ignored)[0] === 1);
    controller.abort();
    await failure;
    assert.equal(runtime.stats().workers.busy, 1);
    await assert.rejects(runtime.run(tasks.convention, 0), PjsQueueFullError);
    await until(() => runtime.stats().workers.idle === 1);
    assert.equal(runtime.stats().containment.leaseExpirations, 1);
    assert.equal(runtime.stats().workers.restarts, 1);
  },
);
test(
  'cooperative cancellation during transfer posting does not invoke the task and preserves worker reuse',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const controller = new AbortController(),
      state = shared(),
      bytes = new Uint8Array([1]);
    const original = await runtime.run(tasks.convention, 0);
    await assert.rejects(
      runtime.run(
        tasks.cpu,
        {
          get state() {
            controller.abort();
            return state;
          },
          bytes,
        },
        {
          signal: controller.signal,
          cancellation: 'cooperative',
          transferList: [bytes.buffer],
        },
      ),
      PjsCancelledError,
    );
    assert.equal(bytes.byteLength, 0);
    await until(() => runtime.stats().workers.busy === 0);
    assert.equal(new Int32Array(state)[0], 0);
    assert.equal(
      (await runtime.run(tasks.convention, 0)).threadId,
      original.threadId,
    );
  },
);
test(
  'cooperative fail-fast cleanup is scoped to its parent, and stale completed cancellation cannot reach reuse',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { workers: 3, maxRestarts: 0 });
    const state = shared(),
      other = shared();
    const unrelated = runtime.run(tasks.hold, { state: other });
    await assert.rejects(
      runtime.partitionRange(
        tasks.cooperativeSibling,
        { start: 0, end: 2, grainSize: 1 },
        (partition) => ({ input: { partition, state } }),
        { cancellation: 'cooperative' },
      ),
      (e) => e.name === 'PjsTaskError',
    );
    await until(() => runtime.stats().workers.busy === 1);
    assert.equal(new Int32Array(other)[1], 0);
    Atomics.store(new Int32Array(other), 1, 1);
    Atomics.notify(new Int32Array(other), 1);
    await unrelated;
    const controller = new AbortController();
    await runtime.run(tasks.convention, 0, {
      signal: controller.signal,
      cancellation: 'cooperative',
    });
    controller.abort();
    assert.equal(
      (await runtime.run(tasks.convention, 0, { cancellation: 'cooperative' }))
        .length,
      2,
    );
    assert.equal(runtime.stats().workers.restarts, 0);
  },
);
for (const bytes of [0, 8])
  test(
    `cancellation during a later physical post holds ${bytes}-byte result ownership until confirmed exit`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t);
      const state = shared(),
        controller = new AbortController();
      const worker = [
        ...runtimeComponents(runtime).dispatcher.pool.workers.values(),
      ][0];
      const exit = controlExit(worker);
      t.after(() => exit.release());
      try {
        const stream = runtime.streamRange(
          tasks.binary,
          { start: 0, end: 1, grainSize: 1 },
          (partition) => ({
            input: { partition, state, failAt: 0, bytesOut: bytes },
          }),
          {
            maxResultBytes: bytes,
            maxReservedResultBytes: bytes,
            cancellation: 'terminate',
            signal: controller.signal,
            repeatable: true,
            retry: { maxAttempts: 2, on: ['task-error'] },
            rebuildInput: () => ({
              input: {
                get state() {
                  controller.abort();
                  return state;
                },
                bytesOut: bytes,
              },
            }),
          },
        );
        await assert.rejects(stream.next(), PjsCancelledError);
        assert.equal(exit.requests, 1);
        assert.equal(runtime.stats().workers.busy, 1);
        assert.equal(
          runtime.stats().streamResults.currentReservedResultBytes,
          bytes,
        );
        assert.equal(
          runtimeComponents(runtime).resultCredits.diagnostics().reservations,
          1,
        );
        exit.release();
        await until(() => runtime.stats().workers.busy === 0);
        assert.equal(
          runtimeComponents(runtime).resultCredits.diagnostics().reservations,
          0,
        );
      } finally {
        exit.release();
      }
    },
  );
test(
  'transferred range input rebuilds for retry/fallback without repeating initial factory; batching restriction stays',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared(),
      built = [],
      reconstructed = [];
    let initial = 0;
    const prepare = (partition) => {
      const bytes = new Uint8Array([partition.index]);
      built.push(bytes);
      return {
        input: { state, partition, bytes, failAt: 0, failures: 10 },
        transferList: [bytes.buffer],
      };
    };
    const stream = runtime.streamRange(
      tasks.binary,
      range,
      (p) => {
        initial++;
        return prepare(p);
      },
      {
        resultBytes: 4,
        maxReservedResultBytes: 16,
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
        fallback: { task: tasks.binaryAlternative },
        rebuildInput: (p, next) => {
          reconstructed.push([p.index, next.implementation]);
          return prepare(p);
        },
      },
    );
    let outputs = 0;
    for await (const value of stream) {
      assert.equal(value.output.byteLength, 4);
      outputs++;
    }
    assert.equal(outputs, 4);
    assert.equal(initial, 4);
    assert.deepEqual(reconstructed, [
      [0, 'primary'],
      [0, 'fallback'],
    ]);
    assert.ok(built.every((bytes) => bytes.byteLength === 0));
    const bytes = new Uint8Array([1]);
    await assert.rejects(
      runtime.partitionRange(
        tasks.attempt,
        { start: 0, end: 1, grainSize: 1 },
        (p) => ({ input: { state: shared(), partition: p, failAt: 0 } }),
        {
          dispatchBatchSize: 4,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: () => ({
            input: { bytes },
            transferList: [bytes.buffer],
          }),
        },
      ),
      PjsSerializationError,
    );
    assert.equal(bytes.byteLength, 1);
  },
);
for (const action of ['abort', 'timeout', 'force', 'drain'])
  test(
    `range recovery backoff releases capacity and respects ${action}`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t, {
        maxQueue: 0,
        minWorkers: 1,
        maxWorkers: 2,
        idleTimeout: 1,
      });
      const state = shared(),
        controller = new AbortController();
      const result = runtime.parallelFor(
        tasks.attempt,
        { start: 0, end: 1, grainSize: 1 },
        (partition) => ({ input: { state, partition, failAt: 0 } }),
        {
          signal: controller.signal,
          ...(action === 'timeout' ? { timeout: 100 } : {}),
          repeatable: true,
          retry: {
            maxAttempts: 2,
            on: ['task-error'],
            backoffMs: action === 'drain' ? 40 : 500,
          },
        },
      );
      const observed =
        action === 'drain'
          ? result
          : assert.rejects(
              result,
              action === 'timeout' ? PjsTimeoutError : PjsCancelledError,
            );
      await until(() =>
        runtime.stats().activeTasks.some((x) => x.status === 'recovering'),
      );
      await runtime.run(tasks.convention, 0); // Backoff does not retain a range worker slot.
      if (action === 'abort') controller.abort();
      if (action === 'force') await runtime.shutdown({ drain: false });
      if (action === 'drain') await runtime.shutdown();
      await observed;
      assert.equal(new Int32Array(state)[0], action === 'drain' ? 2 : 1);
      assert.equal(runtime.stats().tasks.pending, 0);
    },
  );
test(
  'ready partition continuations yield to an older weighted FIFO batch',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 2 });
    const state = shared(),
      gate = shared(),
      order = [];
    const recovered = runtime
      .partitionRange(
        tasks.gatedAttempt,
        range,
        (partition) => ({ input: { state, gate, partition, failAt: 1 } }),
        {
          dispatchBatchSize: 4,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
        },
      )
      .then(() => order.push('recovered'));
    await until(() => new Int32Array(gate)[0] === 1);
    const older = runtime
      .partitionRange(
        tasks.convention,
        { start: 0, end: 2, grainSize: 1 },
        () => ({ input: 0 }),
        { dispatchBatchSize: 2 },
      )
      .then(() => order.push('older'));
    assert.equal(runtime.stats().queue.size, 2);
    Atomics.store(new Int32Array(gate), 1, 1);
    Atomics.notify(new Int32Array(gate), 1);
    await Promise.all([recovered, older]);
    assert.deepEqual(order, ['older', 'recovered']);
  },
);
test(
  'typed mapping recovery keeps constructor/cardinality, and invalid binary fallback cannot recover again',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const state = shared();
    const output = await runtime.parallelMapRange(
      tasks.typedBlock,
      range,
      (partition) => ({ input: { state, partition, failAt: 1 } }),
      {
        outputConstructor: Float64Array,
        dispatchBatchSize: 4,
        repeatable: true,
        retry: { maxAttempts: 2, on: ['task-error'] },
      },
    );
    assert.ok(output instanceof Float64Array);
    assert.deepEqual([...output], [0, 1, 2, 3]);
    const stream = runtime.streamRange(
      tasks.binary,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => ({ input: { state: shared(), partition, failAt: 0 } }),
      {
        resultBytes: 4,
        maxReservedResultBytes: 4,
        repeatable: true,
        fallback: { task: tasks.invalid },
      },
    );
    await assert.rejects(
      stream.next(),
      (e) =>
        e instanceof AggregateError &&
        e.errors[1].name === 'PjsBinaryResultContractError',
    );
  },
);

test(
  'abort from a rebuilt input getter prevents reading further transfer intent',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 0 });
    const state = shared(),
      controller = new AbortController();
    let transferReads = 0;
    await assert.rejects(
      runtime.run(
        tasks.attempt,
        { state, failAt: 0 },
        {
          signal: controller.signal,
          repeatable: true,
          retry: { maxAttempts: 2, on: ['task-error'] },
          rebuildInput: () => ({
            get input() {
              controller.abort();
              return { state };
            },
            get transferList() {
              transferReads++;
              return [];
            },
          }),
        },
      ),
      PjsCancelledError,
    );
    assert.equal(transferReads, 0);
    assert.equal(new Int32Array(state)[0], 1);
    assert.equal(runtime.stats().workers.busy, 0);
  },
);
