import assert from 'node:assert/strict';
import { AsyncLocalStorage, createHook } from 'node:async_hooks';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsCancelledError,
  PjsQueueFullError,
  PjsRuntime,
  PjsRuntimeStateError,
  PjsTaskError,
  PjsTaskRegistry,
  PjsTimeoutError,
  PjsWorkerError,
  sharedReadonly,
} from '../dist/index.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const module = new URL('./fixtures/partition-tasks.mjs', import.meta.url);
  const task = registry.register('completion', module, 'completion');
  const collecting = registry.register('range', module, 'range');
  const runtime = new PjsRuntime({
    registry,
    workers: 2,
    maxQueue: 4,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, task, collecting };
}

const range = { start: 0, end: 12, grainSize: 1 };
const input = (partition, extra = {}) => ({
  input: { partition, ...extra },
});

function release(gate) {
  const control = new Int32Array(gate);
  Atomics.store(control, 1, 1);
  Atomics.notify(control, 1);
}

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition reached');
    await delay(2);
  }
}

test('parallelFor handles empty, single, multiple, and batched ranges as Promise<void>', async (t) => {
  const { runtime, task } = setup(t, { workers: 4, maxQueue: 2 });
  const counter = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 12);
  let factories = 0;
  assert.equal(
    await runtime.parallelFor(task, { start: 4, end: 4, grainSize: 1 }, () => {
      factories++;
      return input({ index: 0, start: 0, end: 0 });
    }),
    undefined,
  );
  for (const batch of [1, 4, 8]) {
    new Int32Array(counter).fill(0);
    const result = runtime.parallelFor(
      task,
      range,
      (partition) => {
        factories++;
        return input(partition, { counter, returnValue: 'uncloneable' });
      },
      { experimentalDispatchBatchSize: batch },
    );
    assert.ok(result instanceof Promise);
    assert.equal(await result, undefined);
    assert.deepEqual([...new Int32Array(counter)], Array(12).fill(1));
  }
  assert.equal(factories, 36);
  const stats = runtime.stats();
  assert.equal(stats.operations.completion.completed, 4);
  assert.equal(stats.operations.collecting.accepted, 0);
  assert.equal(stats.partitions.completed, 36);
  assert.ok(stats.dispatch.batchedExecuteMessages > 0);
});

test('completion protocol ignores large and uncloneable worker values without output serialization', async (t) => {
  const { runtime, task } = setup(t);
  for (const returnValue of ['uncloneable', 'large'])
    await runtime.parallelFor(
      task,
      { start: 0, end: 16, grainSize: 1 },
      (partition) => input(partition, { returnValue }),
      { experimentalDispatchBatchSize: 4 },
    );
  assert.equal(runtime.stats().tasks.failed, 0);
  assert.equal(runtime.stats().partitions.completed, 32);
});

test('completion preserves exclusive input transfer rules', async (t) => {
  const { runtime, task } = setup(t);
  const moved = new Uint8Array([1, 2, 3]);
  await runtime.parallelFor(
    task,
    { start: 0, end: 1, grainSize: 1 },
    (partition) => ({
      input: { partition, returnValue: moved.byteLength },
      transferList: [moved.buffer],
    }),
  );
  assert.equal(moved.byteLength, 0);
  const retained = new Uint8Array([4, 5, 6]);
  await assert.rejects(
    runtime.parallelFor(
      task,
      { start: 0, end: 2, grainSize: 1 },
      (partition) => ({
        input: { partition },
        transferList: [retained.buffer],
      }),
      { experimentalDispatchBatchSize: 2 },
    ),
  );
  assert.equal(retained.byteLength, 3);
});

test('shared vector and matrix outputs use disjoint completion-only writes', async (t) => {
  const { runtime, task } = setup(t, { workers: 4 });
  const source = sharedReadonly(
    Float64Array.from({ length: 1000 }, (_, index) => index / 10),
  );
  const transformed = new Float64Array(
    new SharedArrayBuffer(source.byteLength),
  );
  await runtime.parallelFor(
    task,
    { start: 0, end: source.length, grainSize: 37 },
    (partition) => input(partition, { input: source, output: transformed }),
    { experimentalDispatchBatchSize: 4 },
  );
  for (const value of transformed) assert.ok(Math.abs(value - 1) < 1e-12);

  const size = 12;
  const a = sharedReadonly(
    Float64Array.from({ length: size * size }, (_, i) => (i % 7) - 3),
  );
  const b = sharedReadonly(
    Float64Array.from({ length: size * size }, (_, i) => (i % 5) - 2),
  );
  const c = new Float64Array(
    new SharedArrayBuffer(size * size * Float64Array.BYTES_PER_ELEMENT),
  );
  await runtime.parallelFor(
    task,
    { start: 0, end: size, grainSize: 2 },
    (partition) =>
      input(partition, {
        matrixA: a,
        matrixB: b,
        matrixSize: size,
        output: c,
      }),
    { experimentalDispatchBatchSize: 4 },
  );
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      let expected = 0;
      for (let k = 0; k < size; k++)
        expected += a[row * size + k] * b[k * size + column];
      assert.equal(c[row * size + column], expected);
    }
});

test('first failure in a completion batch skips later items and leaves earlier effects', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 8 });
  const counter = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 8);
  await assert.rejects(
    runtime.parallelFor(
      task,
      { start: 0, end: 8, grainSize: 1 },
      (partition) =>
        input(partition, {
          counter,
          fail: partition.index === 1,
        }),
      { experimentalDispatchBatchSize: 4 },
    ),
    (error) =>
      error instanceof PjsTaskError &&
      error.partitionIndex === 1 &&
      !!error.operationId,
  );
  assert.deepEqual([...new Int32Array(counter)], [1, 1, 0, 0, 0, 0, 0, 0]);
  const stats = runtime.stats();
  assert.equal(stats.operations.completion.failed, 1);
  assert.equal(stats.partitions.completed, 1);
  assert.equal(stats.partitions.failed, 1);
  assert.equal(stats.partitions.cancelled, 2);
});

for (const mode of ['abort', 'timeout'])
  test(`completion ${mode} settles once while posted work retains occupancy`, async (t) => {
    const { runtime, task } = setup(t, { workers: 1, maxQueue: 1 });
    await runtime.ready();
    const gate = new SharedArrayBuffer(8);
    const controller = new AbortController();
    const promise = runtime.parallelFor(
      task,
      range,
      (partition) => input(partition, { gate }),
      mode === 'abort' ? { signal: controller.signal } : { timeout: 100 },
    );
    const rejected = assert.rejects(
      promise,
      mode === 'abort' ? PjsCancelledError : PjsTimeoutError,
    );
    await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    if (mode === 'abort') controller.abort();
    await rejected;
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().operations.pending, 0);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    release(gate);
    await runtime.shutdown();
  });

test('completion operation capacity and ordinary queue admission remain bounded', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 1 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const active = runtime.parallelFor(task, range, (partition) =>
    input(partition, { gate }),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  const queued = runtime.parallelFor(task, range, input);
  await assert.rejects(
    runtime.parallelFor(task, range, input),
    PjsQueueFullError,
  );
  await assert.rejects(
    runtime.run(task, { partition: { index: 0, start: 0, end: 1 } }),
    PjsQueueFullError,
  );
  release(gate);
  await Promise.all([active, queued]);
});

test('completion worker crash fails once and replacement remains usable', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  const workerId = runtime.stats().workers.details[0].id;
  await assert.rejects(
    runtime.parallelFor(task, range, (partition) =>
      input(partition, { crash: partition.index === 0 }),
    ),
    (error) =>
      error instanceof PjsWorkerError &&
      error.partitionIndex === 0 &&
      !!error.operationId,
  );
  await runtime.parallelFor(task, range, input);
  assert.notEqual(runtime.stats().workers.details[0].id, workerId);
});

test('graceful shutdown drains completion work and non-draining shutdown cancels it', async (t) => {
  const drained = setup(t, { workers: 2, maxQueue: 0 });
  let generated = 0;
  const complete = drained.runtime.parallelFor(
    drained.task,
    { start: 0, end: 40, grainSize: 1 },
    (partition) => {
      generated++;
      return input(partition);
    },
  );
  const shutdown = drained.runtime.shutdown();
  await complete;
  await shutdown;
  assert.equal(generated, 40);

  const stopped = setup(t, { workers: 1, maxQueue: 1 });
  await stopped.runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const cancelled = assert.rejects(
    stopped.runtime.parallelFor(stopped.task, range, (partition) =>
      input(partition, { gate }),
    ),
    PjsCancelledError,
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  await stopped.runtime.shutdown({ drain: false });
  await cancelled;
  await assert.rejects(
    stopped.runtime.parallelFor(stopped.task, range, input),
    PjsRuntimeStateError,
  );
});

test('operation AsyncResource preserves isolated AsyncLocalStorage stores for factories and continuations', async (t) => {
  const { runtime, task } = setup(t, { workers: 2 });
  const storage = new AsyncLocalStorage();
  const seen = new Map();
  await Promise.all(
    ['a', 'b', 'c'].map((id) =>
      storage.run({ id }, async () => {
        await runtime.parallelFor(
          task,
          { start: 0, end: 9, grainSize: 1 },
          (partition) => {
            seen.set(`${id}:${partition.index}`, storage.getStore()?.id);
            return input(partition);
          },
          { experimentalDispatchBatchSize: 4 },
        );
        assert.equal(storage.getStore()?.id, id);
      }),
    ),
  );
  assert.equal(seen.size, 27);
  for (const [key, value] of seen) assert.equal(value, key[0]);

  await storage.run({ id: 'error' }, async () => {
    await assert.rejects(
      runtime.parallelFor(task, range, (partition) =>
        input(partition, { fail: partition.index === 0 }),
      ),
      PjsTaskError,
    );
    assert.equal(storage.getStore()?.id, 'error');
  });

  await storage.run({ id: 'cancel' }, async () => {
    const gate = new SharedArrayBuffer(8);
    const controller = new AbortController();
    const cancelled = assert.rejects(
      runtime.parallelFor(
        task,
        range,
        (partition) => input(partition, { gate }),
        { signal: controller.signal },
      ),
      PjsCancelledError,
    );
    await until(() => Atomics.load(new Int32Array(gate), 0) > 0);
    controller.abort();
    await cancelled;
    assert.equal(storage.getStore()?.id, 'cancel');
    release(gate);
    await until(() => runtime.stats().workers.busy === 0);
  });
});

test('operation async resources emit destroy and do not leak abort listeners', async (t) => {
  const initialized = new Set();
  const destroyed = new Set();
  const hook = createHook({
    init(asyncId, type) {
      if (type === 'PjsRangeOperation') initialized.add(asyncId);
    },
    destroy(asyncId) {
      if (initialized.has(asyncId)) destroyed.add(asyncId);
    },
  });
  hook.enable();
  t.after(() => hook.disable());
  const { runtime, task } = setup(t);
  const controller = new AbortController();
  await runtime.parallelFor(task, range, input, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await until(() => destroyed.size === initialized.size);
  assert.equal(initialized.size, 1);
});
