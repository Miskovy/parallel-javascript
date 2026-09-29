import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsCancelledError,
  PjsMapContractError,
  PjsQueueFullError,
  PjsRuntime,
  PjsSerializationError,
  PjsTaskError,
  PjsTaskRegistry,
  PjsTimeoutError,
  PjsWorkerError,
} from '../dist/index.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'map-block',
    new URL('./fixtures/partition-tasks.mjs', import.meta.url),
    'mapBlock',
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 4,
    maxQueue: 8,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, task };
}

const input = (partition, extra = {}) => ({ input: { partition, ...extra } });

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition reached');
    await delay(2);
  }
}

function release(gate) {
  const control = new Int32Array(gate);
  Atomics.store(control, 1, 1);
  Atomics.notify(control, 1);
}

test('generic map covers empty, single, uneven, and negative ranges', async (t) => {
  const { runtime, task } = setup(t);
  assert.deepEqual(
    await runtime.parallelMapRange(
      task,
      { start: 0, end: 0, grainSize: 3 },
      input,
    ),
    [],
  );
  assert.deepEqual(
    await runtime.parallelMapRange(
      task,
      { start: 3, end: 4, grainSize: 5 },
      input,
    ),
    [6],
  );
  assert.deepEqual(
    await runtime.parallelMapRange(
      task,
      { start: -3, end: 8, grainSize: 4 },
      input,
      { experimentalDispatchBatchSize: 2 },
    ),
    Array.from({ length: 11 }, (_, index) => (index - 3) * 2),
  );
});

test('map assembles logical element order across reversed block completion', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  const gates = Array.from({ length: 4 }, () => new SharedArrayBuffer(8));
  const result = runtime.parallelMapRange(
    task,
    { start: 0, end: 8, grainSize: 2 },
    (partition) => input(partition, { gate: gates[partition.index] }),
  );
  await until(() =>
    gates.every((gate) => Atomics.load(new Int32Array(gate), 0)),
  );
  for (let index = gates.length - 1; index >= 0; index--) release(gates[index]);
  assert.deepEqual(await result, [0, 2, 4, 6, 8, 10, 12, 14]);
});

test('map validates array and typed block cardinality and kind', async (t) => {
  const { runtime, task } = setup(t);
  for (const lengthDelta of [-1, 1])
    await assert.rejects(
      runtime.parallelMapRange(
        task,
        { start: 0, end: 4, grainSize: 2 },
        (partition) => input(partition, { lengthDelta }),
      ),
      PjsMapContractError,
    );
  await assert.rejects(
    runtime.parallelMapRange(
      task,
      { start: 0, end: 2, grainSize: 2 },
      (partition) => input(partition, { kind: 'wrong' }),
    ),
    /must return an Array/,
  );
  await assert.rejects(
    runtime.parallelMapRange(
      task,
      { start: 0, end: 2, grainSize: 2 },
      (partition) => input(partition, { kind: 'uint32' }),
      { experimentalOutputConstructor: Float64Array },
    ),
    /must return Float64Array/,
  );
  await assert.rejects(
    runtime.parallelMapRange(task, { start: 0, end: 1, grainSize: 1 }, input, {
      experimentalOutputConstructor: Array,
    }),
    /built-in typed-array constructor/,
  );
  await assert.rejects(
    runtime.parallelMapRange(
      task,
      { start: 0, end: 2 ** 32, grainSize: 2 ** 32 },
      input,
    ),
    /more elements than a JavaScript array/,
  );
});

test('typed map clones and transfers blocks without boxing the final output', async (t) => {
  const { runtime, task } = setup(t);
  for (const move of [false, true]) {
    const result = await runtime.parallelMapRange(
      task,
      { start: 0, end: 17, grainSize: 4 },
      (partition) => input(partition, { kind: 'float64', move }),
      {
        experimentalOutputConstructor: Float64Array,
        experimentalDispatchBatchSize: move ? 1 : 4,
      },
    );
    assert.ok(result instanceof Float64Array);
    assert.deepEqual(
      [...result],
      Array.from({ length: 17 }, (_, index) => index * 2),
    );
  }
  const empty = await runtime.parallelMapRange(
    task,
    { start: 0, end: 0, grainSize: 1 },
    input,
    { experimentalOutputConstructor: Uint32Array },
  );
  assert.ok(empty instanceof Uint32Array);
  assert.equal(empty.length, 0);
});

test('generic object map preserves one object per element', async (t) => {
  const { runtime, task } = setup(t);
  const result = await runtime.parallelMapRange(
    task,
    { start: 5, end: 14, grainSize: 4 },
    (partition) => input(partition, { kind: 'objects' }),
    { experimentalDispatchBatchSize: 3 },
  );
  assert.deepEqual(
    result,
    Array.from({ length: 9 }, (_, offset) => {
      const index = offset + 5;
      return { index, score: index * index, category: index % 3 };
    }),
  );
});

test('map propagates worker, serialization, cancellation, timeout, and crash failures', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  const range = { start: 0, end: 8, grainSize: 1 };
  await assert.rejects(
    runtime.parallelMapRange(task, range, (partition) =>
      input(partition, { fail: partition.index === 2 }),
    ),
    PjsTaskError,
  );
  await assert.rejects(
    runtime.parallelMapRange(task, range, (partition) =>
      input(partition, { kind: 'uncloneable' }),
    ),
    PjsSerializationError,
  );
  const controller = new AbortController();
  const gate = new SharedArrayBuffer(8);
  const cancelled = runtime.parallelMapRange(
    task,
    range,
    (partition) => input(partition, { gate }),
    { signal: controller.signal },
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  controller.abort();
  await assert.rejects(cancelled, PjsCancelledError);
  release(gate);
  await assert.rejects(
    runtime.parallelMapRange(
      task,
      range,
      (partition) => input(partition, { ms: 20 }),
      { timeout: 5 },
    ),
    PjsTimeoutError,
  );
  await assert.rejects(
    runtime.parallelMapRange(task, range, (partition) =>
      input(partition, { crash: partition.index === 0 }),
    ),
    PjsWorkerError,
  );
});

test('map drains graceful shutdown and rejects non-draining shutdown', async (t) => {
  const first = setup(t);
  const range = { start: 0, end: 16, grainSize: 2 };
  const result = first.runtime.parallelMapRange(first.task, range, input, {
    experimentalDispatchBatchSize: 4,
  });
  const drained = first.runtime.shutdown();
  assert.equal((await result).length, 16);
  await drained;

  const second = setup(t, { workers: 1 });
  const gate = new SharedArrayBuffer(8);
  const stopped = second.runtime.parallelMapRange(
    second.task,
    range,
    (partition) => input(partition, { gate }),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  const rejected = assert.rejects(stopped, PjsCancelledError);
  await second.runtime.shutdown({ drain: false });
  await rejected;
});

test('map saturation, metrics, and AsyncLocalStorage reuse range invariants', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const first = runtime.parallelMapRange(
    task,
    { start: 0, end: 4, grainSize: 1 },
    (partition) => input(partition, { gate }),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  await assert.rejects(
    runtime.parallelMapRange(task, { start: 0, end: 1, grainSize: 1 }, input),
    PjsQueueFullError,
  );
  release(gate);
  assert.equal((await first).length, 4);

  const storage = new AsyncLocalStorage();
  await storage.run({ id: 'map' }, async () => {
    await runtime.parallelMapRange(
      task,
      { start: 0, end: 4, grainSize: 1 },
      (partition) => {
        assert.equal(storage.getStore()?.id, 'map');
        return input(partition);
      },
    );
    assert.equal(storage.getStore()?.id, 'map');
  });
  const stats = runtime.stats();
  assert.equal(stats.maps.accepted, 2);
  assert.equal(stats.maps.completed, 2);
  assert.equal(stats.maps.rejected, 1);
  assert.equal(stats.mapResults.blocks, 8);
  assert.equal(stats.mapResults.elements, 8);
  assert.ok(stats.mapResults.assemblyMs >= 0);
});
