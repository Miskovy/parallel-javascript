import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsCancelledError,
  PjsRuntime,
  PjsTaskError,
  PjsTaskRegistry,
  PjsTimeoutError,
  PjsWorkerError,
} from '../dist/index.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const module = new URL('./fixtures/partition-tasks.mjs', import.meta.url);
  const task = registry.register('range', module, 'range');
  const valueTask = registry.register('completion', module, 'completion');
  const runtime = new PjsRuntime({
    registry,
    workers: 4,
    maxQueue: 8,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, task, valueTask };
}

const range = { start: 0, end: 12, grainSize: 1 };
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

function iterate(stream) {
  return stream[Symbol.asyncIterator]();
}

test('empty, one, many, and batched streams deliver partition results', async (t) => {
  const { runtime, task } = setup(t);
  for (const [end, batch] of [
    [0, 1],
    [1, 1],
    [12, 4],
  ]) {
    const values = [];
    for await (const value of runtime.streamRange(
      task,
      { start: 0, end, grainSize: 1 },
      input,
      {
        experimentalDispatchBatchSize: batch,
        experimentalMaxBufferedResults: 5,
      },
    ))
      values.push(value);
    assert.equal(values.length, end);
    assert.deepEqual(
      values.map((value) => value.partition.index).sort((a, b) => a - b),
      Array.from({ length: end }, (_, index) => index),
    );
  }
  assert.equal(runtime.stats().streams.completed, 3);
});

test('stream delivery uses completion order', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  const gates = Array.from({ length: 4 }, () => new SharedArrayBuffer(8));
  const iterator = iterate(
    runtime.streamRange(task, { start: 0, end: 4, grainSize: 1 }, (partition) =>
      input(partition, { gate: gates[partition.index] }),
    ),
  );
  await until(() =>
    gates.every((gate) => Atomics.load(new Int32Array(gate), 0) === 1),
  );
  const order = [];
  for (let index = 3; index >= 0; index--) {
    release(gates[index]);
    order.push((await iterator.next()).value.partition.index);
  }
  assert.deepEqual(order, [3, 2, 1, 0]);
  assert.equal((await iterator.next()).done, true);
});

test('slow consumer keeps produced plus in-flight results within capacity', async (t) => {
  const { runtime, task } = setup(t);
  const values = [];
  for await (const value of runtime.streamRange(task, range, input, {
    experimentalDispatchBatchSize: 8,
    experimentalMaxBufferedResults: 2,
  })) {
    values.push(value);
    const active = runtime.stats().activeOperations[0];
    if (active)
      assert.ok(active.bufferedResults + active.running + active.queued <= 2);
    await delay(3);
  }
  assert.equal(values.length, 12);
  assert.ok(runtime.stats().streamResults.peakBuffered <= 2);
  assert.equal(runtime.stats().streamResults.produced, 12);
  assert.equal(runtime.stats().streamResults.yielded, 12);
});

test('the operation deadline includes slow consumer waiting', async (t) => {
  const { runtime, task } = setup(t);
  await runtime.ready();
  const iterator = iterate(
    runtime.streamRange(task, range, input, {
      timeout: 100,
      experimentalMaxBufferedResults: 2,
    }),
  );
  assert.equal((await iterator.next()).done, false);
  await delay(150);
  await assert.rejects(iterator.next(), PjsTimeoutError);
  assert.equal(runtime.stats().streams.timedOut, 1);
});

test('consumer break and throw cancel remaining work exactly once', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  for await (const value of runtime.streamRange(task, range, input, {
    experimentalDispatchBatchSize: 4,
    experimentalMaxBufferedResults: 1,
  })) {
    void value;
    break;
  }
  await until(() => runtime.stats().streams.pending === 0);
  await assert.rejects(async () => {
    for await (const value of runtime.streamRange(task, range, input)) {
      void value;
      throw new Error('consumer');
    }
  }, /consumer/);
  await until(() => runtime.stats().streams.pending === 0);
  assert.equal(runtime.stats().streams.cancelled, 2);
});

test('producer failure preserves yielded values and rejects the stream', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  const yielded = [];
  await assert.rejects(async () => {
    for await (const value of runtime.streamRange(
      task,
      { start: 0, end: 8, grainSize: 1 },
      (partition) => input(partition, { fail: partition.index === 2 }),
      { experimentalDispatchBatchSize: 4, experimentalMaxBufferedResults: 1 },
    ))
      yielded.push(value.partition.index);
  }, PjsTaskError);
  assert.deepEqual(yielded, [0, 1]);
});

test('stream transfers output buffers and yields shared views natively', async (t) => {
  const { runtime, task, valueTask } = setup(t);
  const transferred = [];
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: 4, grainSize: 1 },
    (partition) => input(partition, { move: true }),
  ))
    transferred.push(output.values);
  assert.ok(transferred.every((value) => value.buffer instanceof ArrayBuffer));

  const shared = new Uint8Array(new SharedArrayBuffer(4));
  const iterator = iterate(
    runtime.streamRange(
      valueTask,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => input(partition, { returnValue: shared }),
    ),
  );
  const result = (await iterator.next()).value.output;
  assert.ok(result.buffer instanceof SharedArrayBuffer);
  result[0] = 9;
  assert.equal(shared[0], 9);
});

test('abort, timeout, crash, and non-draining shutdown reject iteration', async (t) => {
  const { runtime, task } = setup(t, { workers: 1 });
  const aborted = new AbortController();
  const abortIterator = iterate(
    runtime.streamRange(task, range, input, {
      signal: aborted.signal,
    }),
  );
  await until(() => runtime.stats().streamResults.buffered > 0);
  aborted.abort();
  await assert.rejects(abortIterator.next(), PjsCancelledError);

  const timeoutIterator = iterate(
    runtime.streamRange(
      task,
      range,
      (partition) => input(partition, { ms: 20 }),
      {
        timeout: 5,
      },
    ),
  );
  await assert.rejects(timeoutIterator.next(), PjsTimeoutError);

  const crashIterator = iterate(
    runtime.streamRange(task, range, (partition) =>
      input(partition, { crash: partition.index === 0 }),
    ),
  );
  await assert.rejects(crashIterator.next(), PjsWorkerError);
  await until(() => runtime.stats().workers.restarts > 0);

  const gate = new SharedArrayBuffer(8);
  const stopped = iterate(
    runtime.streamRange(task, range, (partition) => input(partition, { gate })),
  );
  await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
  await runtime.shutdown({ drain: false });
  await assert.rejects(stopped.next(), PjsCancelledError);
});

test('graceful shutdown includes buffered result delivery', async (t) => {
  const { runtime, task } = setup(t);
  const stream = runtime.streamRange(task, range, input, {
    experimentalMaxBufferedResults: 2,
  });
  const shutdown = runtime.shutdown();
  const values = [];
  for await (const value of stream) {
    values.push(value);
    await delay(1);
  }
  await shutdown;
  assert.equal(values.length, 12);
});

test('concurrent stream AsyncLocalStorage contexts remain isolated', async (t) => {
  const { runtime, task } = setup(t);
  const storage = new AsyncLocalStorage();
  await Promise.all(
    ['a', 'b'].map((id) =>
      storage.run({ id }, async () => {
        for await (const value of runtime.streamRange(
          task,
          range,
          (partition) => {
            assert.equal(storage.getStore()?.id, id);
            return input(partition);
          },
        )) {
          void value;
          assert.equal(storage.getStore()?.id, id);
        }
      }),
    ),
  );
});

test('stream coexists with ordinary and completion-only work', async (t) => {
  const { runtime, task, valueTask } = setup(t);
  const stream = (async () => {
    let count = 0;
    for await (const value of runtime.streamRange(task, range, input, {
      experimentalMaxBufferedResults: 1,
    })) {
      void value;
      count++;
      await delay(1);
    }
    return count;
  })();
  const ordinary = runtime.run(valueTask, {
    partition: { index: 0, start: 0, end: 1 },
    returnValue: 42,
  });
  const completion = runtime.parallelFor(task, range, input, {
    experimentalDispatchBatchSize: 4,
  });
  assert.deepEqual(await Promise.all([stream, ordinary, completion]), [
    12,
    42,
    undefined,
  ]);
});

test('stream terminal paths remove abort listeners', async (t) => {
  const { runtime, task } = setup(t);
  const controller = new AbortController();
  for await (const value of runtime.streamRange(task, range, input, {
    signal: controller.signal,
  })) {
    void value;
    break;
  }
  await until(() => runtime.stats().streams.pending === 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('invalid result capacity rejects through the iterator', async (t) => {
  const { runtime, task } = setup(t);
  const iterator = iterate(
    runtime.streamRange(task, range, input, {
      experimentalMaxBufferedResults: 0,
    }),
  );
  await assert.rejects(iterator.next(), RangeError);
  assert.equal(runtime.stats().streams.rejected, 1);
});
