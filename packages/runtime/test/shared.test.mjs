import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { Buffer } from 'node:buffer';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
  transfer,
  PjsCancelledError,
  PjsTimeoutError,
  PjsWorkerError,
  PjsQueueFullError,
  PjsSerializationError,
} from '../dist/index.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const module = new URL('./fixtures/shared-tasks.mjs', import.meta.url);
  const tasks = Object.fromEntries(
    ['read', 'increment', 'describe'].map((name) => [
      name,
      registry.register(name, module, name),
    ]),
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxQueue: 100,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, tasks };
}
async function entered(control) {
  const deadline = Date.now() + 5000;
  while (!Atomics.load(new Int32Array(control), 0)) {
    assert.ok(Date.now() < deadline, 'worker entered gate');
    await delay(2);
  }
}
function release(control) {
  const gate = new Int32Array(control);
  Atomics.store(gate, 1, 1);
  Atomics.notify(gate, 1);
}

test('construction compacts views, copies exact bits, and leaves source independent', () => {
  for (const Constructor of [
    Uint8Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
  ]) {
    const source = new Constructor([7, 8, 9, 10]);
    const view = source.subarray(1, 3);
    const shared = sharedReadonly(view);
    assert.equal(shared.constructor, Constructor);
    assert.ok(shared.buffer instanceof SharedArrayBuffer);
    assert.equal(shared.byteOffset, 0);
    assert.equal(shared.buffer.byteLength, view.byteLength);
    assert.deepEqual([...shared], [8, 9]);
    source[1] = 99;
    assert.equal(shared[0], 8);
    assert.equal(source.length, 4);
    assert.equal(sharedReadonly(new Constructor(0)).byteLength, 0);
    assert.notEqual(sharedReadonly(shared).buffer, shared.buffer);
  }
  const bits = new Uint32Array([0x12345678, 0x7ff80000]);
  const value = new Float64Array(bits.buffer);
  assert.deepEqual(
    new Uint8Array(sharedReadonly(value).buffer),
    new Uint8Array(bits.buffer),
  );
  assert.equal(sharedReadonly(Buffer.from([1, 2])).constructor, Uint8Array);
  const foreign = runInNewContext('new Float64Array([2, 3])');
  assert.deepEqual([...sharedReadonly(foreign)], [2, 3]);
  class Custom extends Float64Array {
    constructor() {
      super([4]);
    }
  }
  const custom = new Custom();
  Object.defineProperty(custom, 'constructor', {
    get() {
      throw new Error('must not call');
    },
  });
  assert.equal(sharedReadonly(custom).constructor, Float64Array);
});

test('construction rejects unsupported inputs and detached views', () => {
  for (const value of [
    null,
    {},
    [],
    new ArrayBuffer(4),
    new SharedArrayBuffer(4),
    new DataView(new ArrayBuffer(4)),
    new Uint16Array(2),
    new BigInt64Array(2),
  ])
    assert.throws(() => sharedReadonly(value), TypeError);
  const detached = new Float64Array(1);
  structuredClone(detached, { transfer: [detached.buffer] });
  assert.throws(() => sharedReadonly(detached), TypeError);
});

test('four simultaneous workers reuse one input, clone metadata, and transfer independent outputs', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 4 });
  await runtime.ready();
  const data = sharedReadonly(new Float64Array([1, 2, 3]));
  const metadata = { label: 'input' };
  const control = new SharedArrayBuffer(4);
  const first = await Promise.all(
    Array.from({ length: 4 }, () =>
      runtime.run(tasks.read, { data, metadata, control, participants: 4 }),
    ),
  );
  assert.equal(new Set(first.map((r) => r.threadId)).size, 4);
  assert.equal(metadata.worker, undefined);
  assert.equal(new Set(first.map((r) => r.output.buffer)).size, 4);
  const later = await Promise.all(
    Array.from({ length: 80 }, () => runtime.run(tasks.read, { data })),
  );
  for (const result of [...first, ...later]) {
    assert.equal(result.output[0], 6);
    assert.ok(result.output.buffer instanceof ArrayBuffer);
    assert.deepEqual([...result.data], [1, 2, 3]);
  }
  await runtime.shutdown();
  assert.deepEqual([...data], [1, 2, 3]);
  assert.equal(runtime.stats().tasks.completed, 84);
  assert.equal(runtime.stats().tasks.pending, 0);
});

test('native SAB passthrough preserves offsets and aliases within cloned metadata', async (t) => {
  const { runtime, tasks } = setup(t);
  const buffer = new SharedArrayBuffer(32);
  const view = new Uint16Array(buffer, 8, 3);
  view.set([11, 22, 33]);
  const result = await runtime.run(tasks.describe, {
    buffer,
    view,
    alias: view,
  });
  assert.equal(result.shared, true);
  assert.equal(result.view, result.alias);
  assert.equal(result.view.buffer, result.buffer);
  assert.equal(result.view.byteOffset, 8);
  assert.equal(result.view.length, 3);
  assert.deepEqual([...result.view], [11, 22, 33]);
  // Controlled violation after execution proves backing sharing, not equal copies.
  view[0] = 44;
  assert.equal(result.view[0], 44);
});

test('crash leaves shared bytes and queued task valid through worker replacement', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const original = runtime.stats().workers.details[0].id;
  const data = sharedReadonly(new Int32Array([10, 20]));
  const failed = assert.rejects(
    runtime.run(tasks.read, { data, crash: true }),
    PjsWorkerError,
  );
  const queued = runtime.run(tasks.read, { data });
  await failed;
  assert.equal((await queued).output[0], 30);
  assert.equal((await runtime.run(tasks.read, { data })).output[0], 30);
  assert.notEqual(runtime.stats().workers.details[0].id, original);
  assert.equal(runtime.stats().tasks.failed, 1);
  assert.equal(runtime.stats().workers.restarts, 1);
  assert.deepEqual([...data], [10, 20]);
});

for (const phase of ['queued', 'running'])
  for (const reason of ['abort', 'timeout'])
    test(`shared input during ${phase} ${reason} preserves capacity and settles once`, async (t) => {
      const { runtime, tasks } = setup(t, { maxQueue: 1 });
      await runtime.ready();
      const data = sharedReadonly(new Float64Array([3, 4]));
      const control = new SharedArrayBuffer(8);
      const controller = new AbortController();
      let blocker;
      if (phase === 'queued')
        blocker = runtime.run(tasks.read, { data, control });
      const result = runtime.run(
        tasks.read,
        { data, ...(phase === 'running' ? { control } : {}) },
        reason === 'abort' ? { signal: controller.signal } : { timeout: 300 },
      );
      const check = assert.rejects(
        result,
        reason === 'abort' ? PjsCancelledError : PjsTimeoutError,
      );
      await entered(control);
      if (reason === 'abort') controller.abort();
      await check;
      assert.equal(runtime.stats().workers.busy, 1);
      const queued = runtime.run(tasks.read, { data });
      await assert.rejects(
        runtime.run(tasks.read, { data }),
        PjsQueueFullError,
      );
      const shutdown = runtime.shutdown();
      release(control);
      await blocker;
      assert.equal((await queued).output[0], 7);
      await shutdown;
      const stats = runtime.stats();
      assert.equal(stats.tasks.pending, 0);
      assert.equal(stats.tasks.cancelled + stats.tasks.timedOut, 1);
      assert.equal(
        stats.tasks.accepted,
        stats.tasks.completed + stats.tasks.cancelled + stats.tasks.timedOut,
      );
      assert.deepEqual([...data], [3, 4]);
    });

test('shared startup queue drains gracefully and terminating shutdown preserves input', async (t) => {
  const { runtime, tasks } = setup(t);
  const data = sharedReadonly(new Uint32Array([5]));
  const results = Array.from({ length: 10 }, () =>
    runtime.run(tasks.read, { data }),
  );
  await runtime.shutdown();
  for (const result of await Promise.all(results))
    assert.equal(result.output[0], 5);
  const other = setup(t);
  await other.runtime.ready();
  const control = new SharedArrayBuffer(8);
  const active = assert.rejects(
    other.runtime.run(other.tasks.read, { data, control }),
    PjsCancelledError,
  );
  const queued = assert.rejects(
    other.runtime.run(other.tasks.read, { data }),
    PjsCancelledError,
  );
  await entered(control);
  await other.runtime.shutdown({ drain: false });
  await Promise.all([active, queued]);
  assert.equal(data[0], 5);
});

test('shared bytes never enter transfer lists; independent ordinary input can transfer', async (t) => {
  const { runtime, tasks } = setup(t);
  const data = sharedReadonly(new Uint8Array([5]));
  await assert.rejects(
    runtime.run(tasks.read, { data }, { transferList: [data.buffer] }),
    PjsSerializationError,
  );
  assert.throws(() => transfer(data, [data.buffer]), PjsSerializationError);
  const privateData = new Uint8Array([12]);
  const result = await runtime.run(
    tasks.read,
    { data, metadata: { privateData } },
    { transferList: [privateData.buffer] },
  );
  assert.equal(privateData.byteLength, 0);
  assert.equal(result.metadata.privateData[0], 12);
  assert.equal(data[0], 5);
});

test('educational mutation violation loses an update; Atomics.add preserves both', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 2 });
  await runtime.ready();
  for (const atomic of [false, true]) {
    const data = new Int32Array(new SharedArrayBuffer(4));
    const control = new SharedArrayBuffer(4);
    const threads = await Promise.all(
      [0, 1].map(() => runtime.run(tasks.increment, { data, control, atomic })),
    );
    assert.equal(new Set(threads).size, 2);
    assert.equal(data[0], atomic ? 2 : 1);
  }
});
