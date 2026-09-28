import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getEventListeners } from 'node:events';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsError,
  PjsTaskError,
  PjsWorkerError,
  PjsQueueFullError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
  sharedReadonly,
} from '../dist/index.js';
import { planRange, partitionAt } from '../dist/partition/range.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const module = new URL('./fixtures/partition-tasks.mjs', import.meta.url);
  const task = registry.register('range', module, 'range');
  const nested = registry.register('nested', module, 'nested');
  const runtime = new PjsRuntime({
    registry,
    workers: 2,
    maxQueue: 4,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, task, nested, registry };
}
const input = (partition) => ({ input: { partition } });
const range = { start: 0, end: 10, grainSize: 1 };
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
function coverage(partitions, start, end) {
  const visited = new Map();
  partitions.forEach((p, index) => {
    assert.equal(p.index, index);
    assert.ok(p.start < p.end);
    if (index) assert.equal(partitions[index - 1].end, p.start);
    for (let i = p.start; i < p.end; i++)
      visited.set(i, (visited.get(i) ?? 0) + 1);
  });
  assert.equal(visited.size, end - start);
  for (let i = start; i < end; i++) assert.equal(visited.get(i), 1);
}

test('seeded range properties cover every integer once without gaps or overlaps', () => {
  let seed = 0x504a53;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let trial = 0; trial < 1000; trial++) {
    const start = random(200) - 100,
      end = start + random(200),
      grainSize = random(80) + 1;
    const plan = planRange({ start, end, grainSize });
    const partitions = Array.from({ length: plan.chunkCount }, (_, i) =>
      partitionAt(plan, i),
    );
    coverage(partitions, start, end);
    assert.ok(
      partitions.every(
        (p) => p.end - p.start <= grainSize && Object.isFrozen(p),
      ),
    );
  }
  for (const start of [Number.MAX_SAFE_INTEGER - 20, Number.MIN_SAFE_INTEGER]) {
    const plan = planRange({ start, end: start + 20, grainSize: 7 });
    assert.deepEqual(
      Array.from({ length: plan.chunkCount }, (_, i) => partitionAt(plan, i)),
      [
        { index: 0, start, end: start + 7 },
        { index: 1, start: start + 7, end: start + 14 },
        { index: 2, start: start + 14, end: start + 20 },
      ],
    );
  }
});

test('empty, singleton, awkward and randomized runtime ranges agree with independent coverage', async (t) => {
  const { runtime, task } = setup(t, { workers: 4, maxQueue: 0 });
  let called = false;
  assert.deepEqual(
    await runtime.partitionRange(
      task,
      { start: 3, end: 3, grainSize: 1 },
      () => {
        called = true;
        return input({});
      },
    ),
    [],
  );
  assert.equal(called, false);
  for (const [start, end, grainSize] of [
    [0, 1, 1],
    [-7, 2, 100],
    [0, 2, 1],
    [0, 101, 7],
    ...Array.from({ length: 20 }, (_, i) => [-i, i * 3 + 1, (i % 9) + 1]),
  ]) {
    const results = await runtime.partitionRange(
      task,
      { start, end, grainSize },
      input,
    );
    coverage(
      results.map((r) => r.partition),
      start,
      end,
    );
    assert.deepEqual(
      results.flatMap((r) => r.indices),
      Array.from({ length: end - start }, (_, i) => start + i),
    );
  }
  assert.equal(runtime.stats().queue.size, 0);
});

test('invalid ranges/options/handles reject without parent or child admission', async (t) => {
  const { runtime, task } = setup(t);
  for (const value of [
    { start: 1, end: 0, grainSize: 1 },
    { start: 0.1, end: 1, grainSize: 1 },
    { start: 0, end: Infinity, grainSize: 1 },
    { start: 0, end: 1, grainSize: 0 },
    { start: 0, end: 1, grainSize: -1 },
    { start: 0, end: 1, grainSize: 1.5 },
    {
      start: Number.MIN_SAFE_INTEGER,
      end: Number.MAX_SAFE_INTEGER,
      grainSize: 1,
    },
    { start: 0, end: 2 ** 32, grainSize: 1 },
  ])
    await assert.rejects(
      runtime.partitionRange(task, value, input),
      RangeError,
    );
  await assert.rejects(
    runtime.partitionRange(task, range, input, { timeout: 0 }),
    RangeError,
  );
  for (const experimentalDispatchBatchSize of [0, 1.5, 17])
    await assert.rejects(
      runtime.partitionRange(task, range, input, {
        experimentalDispatchBatchSize,
      }),
      RangeError,
    );
  await assert.rejects(runtime.partitionRange(task, range, null), TypeError);
  await assert.rejects(
    runtime.partitionRange({ id: 'foreign' }, range, input),
    PjsTaskRegistrationError,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    runtime.partitionRange(task, range, input, { signal: abort.signal }),
    PjsCancelledError,
  );
  assert.equal(runtime.stats().operations.accepted, 0);
  assert.equal(runtime.stats().tasks.accepted, 0);
  await runtime.shutdown();
  await assert.rejects(
    runtime.partitionRange(task, range, input),
    PjsRuntimeStateError,
  );
});

test('logical result order survives reversed completion order', async (t) => {
  const { runtime, task } = setup(t, { workers: 4 });
  await runtime.ready();
  const gates = Array.from({ length: 4 }, () => new SharedArrayBuffer(8));
  const promise = runtime.partitionRange(
    task,
    { start: 0, end: 4, grainSize: 1 },
    (partition) => ({ input: { partition, gate: gates[partition.index] } }),
  );
  await until(() =>
    gates.every((g) => Atomics.load(new Int32Array(g), 0) === 1),
  );
  for (let i = 3; i >= 0; i--) {
    release(gates[i]);
    await until(() => runtime.stats().partitions.completed === 4 - i);
  }
  assert.deepEqual(
    (await promise).map((r) => r.partition.index),
    [0, 1, 2, 3],
  );
});

test('ten million logical chunks generate only a worker-sized window and cancel lazily', async (t) => {
  const { runtime, task } = setup(t, { workers: 2 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8),
    controller = new AbortController();
  let generated = 0;
  const promise = runtime.partitionRange(
    task,
    { start: 0, end: 1_000_000_000, grainSize: 100 },
    (partition) => {
      generated++;
      return { input: { partition, gate } };
    },
    { signal: controller.signal },
  );
  const check = assert.rejects(promise, PjsCancelledError);
  await until(() => Atomics.load(new Int32Array(gate), 0) === 2);
  assert.equal(generated, 2);
  const snapshot = runtime.stats().activeOperations[0];
  assert.equal(snapshot.chunkCount, 10_000_000);
  assert.equal(snapshot.admitted, 2);
  controller.abort();
  await check;
  assert.equal(runtime.stats().workers.busy, 2);
  assert.equal(runtime.stats().operations.pending, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  release(gate);
  await runtime.shutdown();
  assert.equal(generated, 2);
});

test('saturated FIFO delays production, and active parent records have a finite bound', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 1 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const ordinary = runtime.run(task, {
    partition: { index: 0, start: 0, end: 1 },
    gate,
  });
  const queued = runtime.run(task, {
    partition: { index: 1, start: 1, end: 2 },
  });
  let generated = 0;
  const make = (partition) => {
    generated++;
    return input(partition);
  };
  const a = runtime.partitionRange(task, range, make),
    b = runtime.partitionRange(task, range, make);
  await assert.rejects(
    runtime.partitionRange(task, range, make),
    (error) => error instanceof PjsQueueFullError && !!error.operationId,
  );
  assert.equal(generated, 0);
  assert.equal(runtime.stats().queue.size, 1);
  assert.equal(runtime.stats().tasks.accepted, 2);
  release(gate);
  await Promise.all([ordinary, queued, a, b]);
  assert.equal(runtime.stats().partitions.completed, 20);
  assert.equal(runtime.stats().operations.completed, 2);
});

test('input factory reserves admission against reentrant ordinary work', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
  await runtime.ready();
  const checks = [];
  const results = await runtime.partitionRange(
    task,
    { start: 0, end: 3, grainSize: 1 },
    (partition) => {
      checks.push(
        assert.rejects(runtime.run(task, { partition }), PjsQueueFullError),
      );
      return input(partition);
    },
  );
  await Promise.all(checks);
  assert.equal(results.length, 3);
  assert.equal(runtime.stats().tasks.accepted, 3);
});

test('shared common input and compact transferred inputs/outputs preserve ownership', async (t) => {
  const { runtime, task } = setup(t, { workers: 4 });
  const shared = sharedReadonly(new Float64Array([1, 2, 3]));
  const buffers = [];
  const results = await runtime.partitionRange(
    task,
    { start: 0, end: 41, grainSize: 3 },
    (partition) => {
      const data = Float64Array.from(
        { length: partition.end - partition.start },
        (_, i) => partition.start + i,
      );
      buffers.push(data.buffer);
      return {
        input: { partition, shared, data, move: true },
        transferList: [data.buffer],
      };
    },
  );
  assert.ok(buffers.every((b) => b.byteLength === 0));
  assert.ok(results.every((r) => r.shared && r.sum === 6));
  assert.deepEqual(
    results.flatMap((r) => [...r.values]),
    Array.from({ length: 41 }, (_, i) => i),
  );
  assert.deepEqual([...shared], [1, 2, 3]);
  assert.equal(
    new Set(results.map((r) => r.values.buffer)).size,
    results.length,
  );
});

test('worker exception identifies the failed partition and cancels queued siblings', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 4 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const blocked = runtime.run(task, {
    partition: { index: 0, start: 0, end: 1 },
    gate,
  });
  await assert.rejects(
    runtime.partitionRange(task, range, (partition) => ({
      input: { partition, fail: partition.index === 0 },
    })),
    (error) => {
      assert.ok(error instanceof PjsTaskError);
      assert.equal(error.partitionIndex, 0);
      assert.equal(error.rangeStart, 0);
      assert.equal(error.rangeEnd, 1);
      assert.ok(error.operationId && error.taskId && error.workerId);
      return true;
    },
  );
  assert.equal(runtime.stats().partitions.admitted, 2);
  assert.equal(runtime.stats().partitions.failed, 1);
  assert.equal(runtime.stats().partitions.cancelled, 1);
  assert.equal(runtime.stats().queue.size, 0);
  assert.equal(runtime.stats().workers.busy, 1);
  release(gate);
  await blocked;
  assert.equal((await runtime.partitionRange(task, range, input)).length, 10);
});

test('failed parent discards late running sibling output without releasing its slot', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 0 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  await assert.rejects(
    runtime.partitionRange(task, range, (partition) => ({
      input: {
        partition,
        fail: partition.index === 0,
        ...(partition.index === 1 ? { gate, move: true } : {}),
      },
    })),
    PjsTaskError,
  );
  assert.equal(runtime.stats().workers.busy, 1);
  release(gate);
  await runtime.shutdown();
  assert.equal(runtime.stats().operations.failed, 1);
  assert.equal(runtime.stats().partitions.completed, 0);
});

test('factory and serialization failures stop production and leave the runtime usable', async (t) => {
  const { runtime, task } = setup(t);
  for (const make of [
    () => {
      throw Object.freeze(new Error('factory'));
    },
    () => Promise.resolve({ input: {} }),
    () => ({ input: { fn() {} } }),
    (p) => ({
      input: { partition: p },
      transferList: [new SharedArrayBuffer(4)],
    }),
  ]) {
    await assert.rejects(runtime.partitionRange(task, range, make), (error) => {
      assert.ok(error instanceof PjsError);
      assert.ok(error.operationId);
      assert.equal(error.partitionIndex, 0);
      return true;
    });
  }
  assert.equal((await runtime.partitionRange(task, range, input)).length, 10);
  assert.equal(runtime.stats().workers.failures, 0);
});

for (const phase of ['queued', 'running'])
  for (const reason of ['abort', 'timeout'])
    test(`partition ${phase} ${reason} settles once and preserves worker occupancy`, async (t) => {
      const { runtime, task } = setup(t, { workers: 1, maxQueue: 1 });
      await runtime.ready();
      const gate = new SharedArrayBuffer(8),
        controller = new AbortController();
      let blocker;
      if (phase === 'queued')
        blocker = runtime.run(task, {
          partition: { index: 0, start: 0, end: 1 },
          gate,
        });
      const promise = runtime.partitionRange(
        task,
        range,
        (partition) => ({
          input: { partition, ...(phase === 'running' ? { gate } : {}) },
        }),
        reason === 'abort' ? { signal: controller.signal } : { timeout: 150 },
      );
      const check = assert.rejects(
        promise,
        reason === 'abort' ? PjsCancelledError : PjsTimeoutError,
      );
      await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
      if (reason === 'abort') controller.abort();
      await check;
      assert.equal(runtime.stats().workers.busy, 1);
      assert.equal(runtime.stats().queue.size, 0);
      assert.equal(runtime.stats().partitions.generated, 1);
      release(gate);
      await blocker;
      await runtime.shutdown();
      const stats = runtime.stats();
      assert.equal(stats.operations.cancelled + stats.operations.timedOut, 1);
      assert.equal(stats.operations.pending, 0);
      assert.equal(
        stats.tasks.accepted,
        stats.tasks.completed + stats.tasks.cancelled,
      );
    });

test('one parent deadline includes synchronous preparation and is not restarted per chunk', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  await assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (partition) => {
        const control = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(control, 0, 0, 30); // Deliberately blocking factory exercises elapsed-time checks.
        return input(partition);
      },
      { timeout: 5 },
    ),
    PjsTimeoutError,
  );
  assert.equal(runtime.stats().partitions.admitted, 0);
  await assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (partition) => ({ input: { partition, ms: 20 } }),
      { timeout: 55 },
    ),
    PjsTimeoutError,
  );
  assert.ok(runtime.stats().partitions.generated < 10);
});

test('crashed partition fails once; unrelated operation and replacement retain shared input', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  await runtime.ready();
  const shared = sharedReadonly(new Float64Array([8, 9]));
  const before = runtime.stats().workers.details[0].id;
  const failed = assert.rejects(
    runtime.partitionRange(task, range, (partition) => ({
      input: { partition, shared, crash: true },
    })),
    (error) =>
      error instanceof PjsWorkerError &&
      error.partitionIndex === 0 &&
      !!error.operationId,
  );
  const next = runtime.partitionRange(task, range, (partition) => ({
    input: { partition, shared },
  }));
  await failed;
  assert.ok((await next).every((r) => r.sum === 17));
  assert.notEqual(runtime.stats().workers.details[0].id, before);
  assert.equal(runtime.stats().workers.restarts, 1);
});

test('restart exhaustion rejects all parent operations including those without children', async (t) => {
  const { runtime, task } = setup(t, {
    workers: 1,
    maxQueue: 2,
    maxRestarts: 0,
  });
  await runtime.ready();
  const results = await Promise.allSettled([
    runtime.partitionRange(task, range, (partition) => ({
      input: { partition, crash: true },
    })),
    runtime.partitionRange(task, range, input),
    runtime.partitionRange(task, range, input),
  ]);
  assert.ok(
    results.every(
      (r) => r.status === 'rejected' && r.reason instanceof PjsWorkerError,
    ),
  );
  assert.equal(runtime.stats().operations.failed, 3);
  assert.equal(runtime.stats().operations.pending, 0);
});

test('graceful shutdown drains the entire accepted range including ungenerated chunks and startup', async (t) => {
  const { runtime, task } = setup(t, { workers: 2, maxQueue: 0 });
  let made = 0;
  const result = runtime.partitionRange(
    task,
    { start: -3, end: 97, grainSize: 3 },
    (p) => {
      made++;
      return input(p);
    },
  );
  const shutdown = runtime.shutdown();
  assert.equal(runtime.shutdown(), shutdown);
  await assert.rejects(
    runtime.partitionRange(task, range, input),
    PjsRuntimeStateError,
  );
  const outputs = await result;
  await shutdown;
  coverage(
    outputs.map((r) => r.partition),
    -3,
    97,
  );
  assert.equal(made, 34);
  assert.equal(runtime.stats().state, 'stopped');
});

test('non-draining shutdown cancels running, queued and ungenerated partition work', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 2 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const promises = Array.from({ length: 3 }, () =>
    assert.rejects(
      runtime.partitionRange(task, range, (p) => ({
        input: { partition: p, gate },
      })),
      PjsCancelledError,
    ),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  await runtime.shutdown({ drain: false });
  await Promise.all(promises);
  assert.equal(runtime.stats().operations.cancelled, 3);
  assert.equal(runtime.stats().partitions.generated, 3);
});

test('reentrant cancellation and shutdown during factory/serialization preserve transfer rules', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
  await runtime.ready();
  const before = new Uint8Array([1]),
    controller = new AbortController();
  await assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (p) => {
        controller.abort();
        return {
          input: { partition: p, data: before },
          transferList: [before.buffer],
        };
      },
      { signal: controller.signal },
    ),
    PjsCancelledError,
  );
  assert.equal(before.byteLength, 1);
  const active = new Uint8Array([2]),
    second = new AbortController();
  await assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (p) => ({
        input: {
          partition: p,
          data: active,
          get trigger() {
            second.abort();
            return true;
          },
        },
        transferList: [active.buffer],
      }),
      { signal: second.signal },
    ),
    PjsCancelledError,
  );
  assert.equal(active.byteLength, 0);
  await until(() => runtime.stats().workers.busy === 0);
  const data = new Uint8Array([3]);
  const stopped = runtime.partitionRange(task, range, (p) => {
    void runtime.shutdown({ drain: false });
    return { input: { partition: p, data }, transferList: [data.buffer] };
  });
  await assert.rejects(stopped, PjsCancelledError);
  assert.equal(data.byteLength, 1);
});

test('queued transfer reservation releases when a parent is cancelled', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 1 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8),
    data = new Float64Array([7]);
  const blocker = runtime.run(task, {
    partition: { index: 0, start: 0, end: 1 },
    gate,
  });
  const controller = new AbortController();
  const cancelled = assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (p) => ({ input: { partition: p, data }, transferList: [data.buffer] }),
      { signal: controller.signal },
    ),
    PjsCancelledError,
  );
  controller.abort();
  await cancelled;
  assert.equal(data.byteLength, 8);
  release(gate);
  await blocker;
  const output = await runtime.run(
    task,
    { partition: { index: 0, start: 0, end: 1 }, data, move: true },
    { transferList: [data.buffer] },
  );
  assert.equal(output.values[0], 7);
});

test('nested worker-created partitioning is explicitly rejected', async (t) => {
  const { runtime, nested } = setup(t, { workers: 1 });
  await assert.rejects(
    runtime.run(nested, null),
    (error) =>
      error instanceof PjsTaskError && /main thread/.test(error.message),
  );
});

test('many sequential and simultaneous operations preserve accounting and listener cleanup', async (t) => {
  const { runtime, task } = setup(t, { workers: 4, maxQueue: 8 });
  await runtime.ready();
  for (let batch = 0; batch < 12; batch++) {
    const controllers = Array.from({ length: 8 }, () => new AbortController());
    const results = await Promise.allSettled(
      controllers.map((controller, i) => {
        const result = runtime.partitionRange(
          task,
          { start: 0, end: 17, grainSize: 2 },
          (p) => ({ input: { partition: p, fail: i === 1 && p.index === 2 } }),
          { signal: controller.signal, timeout: 2000 },
        );
        if (i % 3 === 0) controller.abort();
        return result;
      }),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 4);
    for (const controller of controllers)
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.ok(runtime.stats().queue.size <= 8);
    assert.equal(runtime.stats().operations.pending, 0);
  }
  await runtime.shutdown();
  const { tasks, operations, partitions } = runtime.stats();
  assert.equal(operations.accepted, 96);
  assert.equal(
    operations.accepted,
    operations.completed +
      operations.failed +
      operations.cancelled +
      operations.timedOut,
  );
  assert.equal(
    tasks.accepted,
    tasks.completed + tasks.failed + tasks.cancelled + tasks.timedOut,
  );
  assert.equal(partitions.admitted, tasks.accepted);
  assert.equal(
    partitions.admitted,
    partitions.completed + partitions.failed + partitions.cancelled,
  );
});

test('deadline expires while saturation prevents any chunk generation', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 1 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const active = runtime.run(task, {
    partition: { index: 0, start: 0, end: 1 },
    gate,
  });
  const queued = runtime.run(task, {
    partition: { index: 1, start: 1, end: 2 },
  });
  let generated = 0;
  await assert.rejects(
    runtime.partitionRange(
      task,
      range,
      (p) => {
        generated++;
        return input(p);
      },
      { timeout: 10 },
    ),
    PjsTimeoutError,
  );
  assert.equal(generated, 0);
  assert.equal(runtime.stats().queue.size, 1);
  release(gate);
  await Promise.all([active, queued]);
});

test('graceful shutdown initiated inside a factory finishes the remaining range', async (t) => {
  const { runtime, task } = setup(t, { workers: 1, maxQueue: 0 });
  await runtime.ready();
  const signal = new AbortController();
  let shutdown;
  const result = await runtime.partitionRange(
    task,
    range,
    (p) => {
      if (p.index === 0) shutdown = runtime.shutdown();
      return input(p);
    },
    { signal: signal.signal, timeout: 2000 },
  );
  await shutdown;
  assert.equal(result.length, 10);
  assert.equal(getEventListeners(signal.signal, 'abort').length, 0);
  assert.equal(runtime.stats().operations.completed, 1);
});

test('shutdown during startup cancels an accepted parent before generation', async (t) => {
  const { runtime, task } = setup(t, { maxQueue: 0 });
  let made = 0;
  const check = assert.rejects(
    runtime.partitionRange(task, range, (p) => {
      made++;
      return input(p);
    }),
    PjsCancelledError,
  );
  await runtime.shutdown({ drain: false });
  await check;
  assert.equal(made, 0);
  assert.equal(runtime.stats().workers.restarts, 0);
});

test('simultaneous sibling failures retain only the first parent outcome', async (t) => {
  const { runtime, task } = setup(t, { workers: 2 });
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const check = assert.rejects(
    runtime.partitionRange(task, range, (p) => ({
      input: { partition: p, gate, fail: true },
    })),
    (error) =>
      error instanceof PjsTaskError && [0, 1].includes(error.partitionIndex),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 2);
  release(gate);
  await check;
  await runtime.shutdown();
  assert.equal(runtime.stats().operations.failed, 1);
  assert.equal(runtime.stats().partitions.failed, 1);
  assert.equal(runtime.stats().partitions.cancelled, 1);
  assert.equal(runtime.stats().workers.restarts, 0);
});

test('abort/deadline/crash races with concurrent producers retain bounded admission and settlement', async (t) => {
  const { runtime, task } = setup(t, {
    workers: 2,
    maxQueue: 4,
    maxRestarts: 20,
  });
  await runtime.ready();
  for (let batch = 0; batch < 6; batch++) {
    const controllers = Array.from({ length: 6 }, () => new AbortController());
    const promises = controllers.map((controller, i) => {
      const result = runtime.partitionRange(
        task,
        { start: 0, end: 100, grainSize: 1 },
        (p) => {
          const stats = runtime.stats();
          assert.ok(stats.queue.size <= 4 && stats.workers.busy <= 2);
          return {
            input: {
              partition: p,
              ms: 2,
              crash: i === 0 && p.index === 0,
              fail: i === 1 && p.index === 1,
            },
          };
        },
        { signal: controller.signal, timeout: i < 2 ? 2000 : 5 + i },
      );
      if (i >= 3) setTimeout(() => controller.abort(), (batch + i) % 8);
      return result;
    });
    const outcomes = await Promise.allSettled(promises);
    assert.ok(
      outcomes.every(
        (r) => r.status === 'rejected' && r.reason instanceof PjsError,
      ),
    );
    for (const controller of controllers)
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
  await runtime.shutdown();
  const { operations, tasks, workers } = runtime.stats();
  assert.equal(operations.accepted, 36);
  assert.equal(
    operations.failed + operations.cancelled + operations.timedOut,
    36,
  );
  assert.equal(
    tasks.accepted,
    tasks.completed + tasks.failed + tasks.cancelled,
  );
  assert.equal(workers.restarts, 6);
});
