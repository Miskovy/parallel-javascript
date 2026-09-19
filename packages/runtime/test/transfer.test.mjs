import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { markAsUntransferable, MessageChannel } from 'node:worker_threads';
import { runInNewContext } from 'node:vm';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsSerializationError,
  PjsQueueFullError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsWorkerError,
  PjsTaskError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
  transfer,
} from '../dist/index.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const module = new URL('./fixtures/transfer-tasks.mjs', import.meta.url);
  const tasks = Object.fromEntries(
    [
      'clone',
      'move',
      'outputOnly',
      'outputDetached',
      'gatedMove',
      'invalidOutput',
      'uncloneableOutput',
      'changedOutput',
      'snapshotOutput',
      'crashWithInput',
    ].map((name) => [name, registry.register(name, module, name)]),
  );
  for (const name of ['gate', 'crash', 'fail'])
    tasks[name] = registry.register(
      name,
      new URL('./fixtures/tasks.mjs', import.meta.url),
      name,
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
function isDetached(buffer) {
  try {
    new Uint8Array(buffer, 0, 0);
    return false;
  } catch {
    return true;
  }
}
function release(buffer) {
  const view = new Int32Array(buffer);
  Atomics.store(view, 1, 1);
  Atomics.notify(view, 1);
}
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('condition not reached');
    await delay(2);
  }
}

test('clone remains default and user objects cannot spoof a transfer envelope', async (t) => {
  const { runtime, tasks } = setup(t);
  const data = new Uint8Array([1, 2, 3]);
  assert.deepEqual(await runtime.run(tasks.clone, data), data);
  assert.equal(data.byteLength, 3);
  const object = { value: data, transferList: [data.buffer], type: 'transfer' };
  assert.deepEqual(await runtime.run(tasks.clone, object), object);
  assert.equal(data.byteLength, 3);
});

test('input and output transfers detach sender views while preserving data and offsets', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const backing = new ArrayBuffer(32);
  const alias = new Uint8Array(backing);
  const data = new Uint16Array(backing, 8, 4);
  data.set([11, 22, 33, 44]);
  const result = runtime.run(tasks.move, data, { transferList: [backing] });
  assert.equal(isDetached(backing), true);
  assert.equal(alias.byteLength, 0);
  const output = await result;
  assert.deepEqual([...output], [11, 22, 33, 44]);
  assert.equal(output.byteOffset, 8);
  assert.equal(output.buffer.byteLength, 32);
  assert.equal(await runtime.run(tasks.outputDetached, null), true);
});

test('input-only and output-only transfer choices are independent', async (t) => {
  const { runtime, tasks } = setup(t);
  const data = new Uint8Array([9, 8]);
  const output = await runtime.run(tasks.clone, data, {
    transferList: [data.buffer],
  });
  assert.deepEqual([...output], [9, 8]);
  assert.equal(isDetached(data.buffer), true);
  assert.equal(await runtime.run(tasks.outputDetached, null), false);
  const created = await runtime.run(tasks.outputOnly, { bytes: 16 });
  assert.ok(created.data.every((value) => value === 37));
  assert.equal(await runtime.run(tasks.outputDetached, null), true);
});

test('zero-length and cross-realm ArrayBuffers transfer successfully', async (t) => {
  const { runtime, tasks } = setup(t);
  const empty = new Uint8Array(0);
  const result = await runtime.run(tasks.move, empty, {
    transferList: [empty.buffer],
  });
  assert.equal(result.length, 0);
  assert.equal(isDetached(empty.buffer), true);
  const buffer = runInNewContext('new ArrayBuffer(8)');
  const output = await runtime.run(tasks.clone, buffer, {
    transferList: [buffer],
  });
  assert.equal(output.byteLength, 8);
  assert.equal(isDetached(buffer), true);
});

test('multiple buffers and duplicate references in a payload preserve aliasing', async (t) => {
  const { runtime, tasks } = setup(t);
  const a = new Uint8Array([1]),
    b = new Uint8Array([2]);
  const output = await runtime.run(
    tasks.clone,
    { a, again: a, b },
    { transferList: [a.buffer, b.buffer] },
  );
  assert.equal(output.a, output.again);
  assert.equal(output.b[0], 2);
  assert.equal(isDetached(a.buffer), true);
  assert.equal(isDetached(b.buffer), true);
});

test('invalid transfer lists reject without poisoning workers or detaching valid entries', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const buffer = new ArrayBuffer(8);
  const detached = new ArrayBuffer(8);
  structuredClone(detached, { transfer: [detached] });
  const marked = new ArrayBuffer(8);
  markAsUntransferable(marked);
  const channel = new MessageChannel();
  t.after(() => {
    channel.port1.close();
    channel.port2.close();
  });
  const invalidLists = [
    null,
    false,
    {},
    [buffer, buffer],
    [new Uint8Array(8)],
    [new SharedArrayBuffer(8)],
    [detached],
    [marked],
    [channel.port1],
    [buffer, {}],
  ];
  for (const transferList of invalidLists)
    await assert.rejects(
      runtime.run(tasks.clone, { buffer }, { transferList }),
      (error) => error instanceof PjsSerializationError && !!error.taskId,
    );
  assert.equal(isDetached(buffer), false);
  assert.equal(runtime.stats().tasks.accepted, 0);
  assert.equal(runtime.stats().workers.failures, 0);
  assert.equal(await runtime.run(tasks.clone, 42), 42);
  assert.throws(() => transfer(null, [buffer, buffer]), PjsSerializationError);
});

test('admission rejection does not move or reserve buffers', async (t) => {
  const { runtime, tasks } = setup(t, { maxQueue: 0 });
  const data = new Uint8Array([1, 2]);
  const options = { transferList: [data.buffer] };
  await assert.rejects(
    runtime.run(tasks.move, data, options),
    PjsQueueFullError,
  );
  await runtime.ready();
  await assert.rejects(
    runtime.run({ id: 'foreign' }, data, options),
    PjsTaskRegistrationError,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runtime.run(tasks.move, data, { ...options, signal: controller.signal }),
    PjsCancelledError,
  );
  assert.equal(data.byteLength, 2);
  assert.deepEqual([...(await runtime.run(tasks.move, data, options))], [1, 2]);
  await runtime.shutdown();
  const fresh = new Uint8Array(8);
  await assert.rejects(
    runtime.run(tasks.move, fresh, { transferList: [fresh.buffer] }),
    PjsRuntimeStateError,
  );
  assert.equal(fresh.byteLength, 8);
});

for (const reason of ['abort', 'timeout'])
  test(`queued ${reason} retains ownership and releases the reservation`, async (t) => {
    const { runtime, tasks } = setup(t);
    await runtime.ready();
    const gate = new SharedArrayBuffer(8);
    const active = runtime.run(tasks.gate, { buffer: gate });
    const data = new Uint8Array([7]);
    const controller = new AbortController();
    const queued = runtime.run(tasks.move, data, {
      transferList: [data.buffer],
      ...(reason === 'abort' ? { signal: controller.signal } : { timeout: 10 }),
    });
    const check = assert.rejects(
      queued,
      reason === 'abort' ? PjsCancelledError : PjsTimeoutError,
    );
    assert.equal(data.byteLength, 1);
    if (reason === 'abort') controller.abort();
    await check;
    assert.equal(data.byteLength, 1);
    const again = runtime.run(tasks.move, data, {
      transferList: [data.buffer],
    });
    release(gate);
    await active;
    assert.deepEqual([...(await again)], [7]);
  });

test('queued input lists are snapshots and pending transfers reserve across runtimes', async (t) => {
  const first = setup(t),
    second = setup(t);
  await Promise.all([first.runtime.ready(), second.runtime.ready()]);
  const gate = new SharedArrayBuffer(8);
  const active = first.runtime.run(first.tasks.gate, { buffer: gate });
  const data = new Uint8Array([8, 9]);
  const controller = new AbortController();
  const transferList = [data.buffer];
  const queued = first.runtime.run(first.tasks.move, data, {
    transferList,
    signal: controller.signal,
  });
  const cancelled = assert.rejects(queued, PjsCancelledError);
  transferList.length = 0;
  await assert.rejects(
    second.runtime.run(second.tasks.move, data, {
      transferList: [data.buffer],
    }),
    /already reserved/,
  );
  controller.abort();
  await cancelled;
  const output = await second.runtime.run(second.tasks.move, data, {
    transferList: [data.buffer],
  });
  assert.deepEqual([...output], [8, 9]);
  release(gate);
  await active;
  const snapData = new Uint8Array([5]);
  const list = [snapData.buffer];
  const gate2 = new SharedArrayBuffer(8);
  const busy = first.runtime.run(first.tasks.gate, { buffer: gate2 });
  const promise = first.runtime.run(first.tasks.move, snapData, {
    transferList: list,
  });
  list.push(snapData.buffer);
  release(gate2);
  await busy;
  assert.deepEqual([...(await promise)], [5]);
  assert.equal(isDetached(snapData.buffer), true);
});

test('external detachment while queued fails dispatch, releases reservations, and preserves progress', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const active = runtime.run(tasks.gate, { buffer: gate });
  const a = new Uint8Array(8),
    b = new Uint8Array([6]);
  const check = assert.rejects(
    runtime.run(tasks.clone, { a, b }, { transferList: [a.buffer, b.buffer] }),
    PjsSerializationError,
  );
  structuredClone(a, { transfer: [a.buffer] });
  release(gate);
  await active;
  await check;
  assert.equal(b.byteLength, 1);
  assert.equal(
    (await runtime.run(tasks.move, b, { transferList: [b.buffer] }))[0],
    6,
  );
  assert.equal(runtime.stats().workers.failures, 0);
});

for (const reason of ['abort', 'timeout'])
  test(`running ${reason} discards transferred output without reusing a busy slot`, async (t) => {
    const { runtime, tasks } = setup(t);
    await runtime.ready();
    const gate = new SharedArrayBuffer(8),
      data = new Uint8Array([4]);
    const controller = new AbortController();
    const result = runtime.run(
      tasks.gatedMove,
      { gate, data },
      {
        transferList: [data.buffer],
        ...(reason === 'abort'
          ? { signal: controller.signal }
          : { timeout: 100 }),
      },
    );
    const check = assert.rejects(
      result,
      reason === 'abort' ? PjsCancelledError : PjsTimeoutError,
    );
    await until(() => Atomics.load(new Int32Array(gate), 0) === 1);
    if (reason === 'abort') controller.abort();
    await check;
    assert.equal(isDetached(data.buffer), true);
    assert.equal(runtime.stats().workers.busy, 1);
    const next = runtime.run(tasks.outputDetached, null);
    release(gate);
    assert.equal(await next, true);
    assert.equal(runtime.stats().tasks.pending, 0);
  });

test('shutdown distinguishes queued ownership from dispatched ownership', async (t) => {
  const first = setup(t);
  await first.runtime.ready();
  const running = new Uint8Array([1]),
    queued = new Uint8Array([2]);
  const gate = new SharedArrayBuffer(8);
  const activeCheck = assert.rejects(
    first.runtime.run(
      first.tasks.gatedMove,
      { gate, data: running },
      { transferList: [running.buffer] },
    ),
    PjsCancelledError,
  );
  const queuedCheck = assert.rejects(
    first.runtime.run(first.tasks.move, queued, {
      transferList: [queued.buffer],
    }),
    PjsCancelledError,
  );
  await first.runtime.shutdown({ drain: false });
  await Promise.all([activeCheck, queuedCheck]);
  assert.equal(isDetached(running.buffer), true);
  assert.equal(queued.byteLength, 1);
  const second = setup(t);
  assert.equal(
    (
      await second.runtime.run(second.tasks.move, queued, {
        transferList: [queued.buffer],
      })
    )[0],
    2,
  );
});

test('crashes and task failures cannot restore transferred input ownership', async (t) => {
  const { runtime, tasks } = setup(t);
  for (const [name, ErrorType] of [
    ['fail', PjsTaskError],
    ['crashWithInput', PjsWorkerError],
  ]) {
    const data = new Uint8Array(8);
    await assert.rejects(
      runtime.run(tasks[name], data, { transferList: [data.buffer] }),
      ErrorType,
    );
    assert.equal(isDetached(data.buffer), true);
    assert.equal(await runtime.run(tasks.clone, 123), 123);
  }
});

test('input and output serialization failures leave workers reusable', async (t) => {
  const { runtime, tasks } = setup(t);
  const data = new Uint8Array([1]);
  await assert.rejects(
    runtime.run(
      tasks.clone,
      { data, fn() {} },
      { transferList: [data.buffer] },
    ),
    PjsSerializationError,
  );
  assert.equal(data.byteLength, 1);
  for (const name of ['invalidOutput', 'uncloneableOutput', 'changedOutput'])
    await assert.rejects(
      runtime.run(tasks[name], null),
      (error) =>
        error instanceof PjsSerializationError &&
        !!error.taskId &&
        !!error.workerId,
    );
  assert.deepEqual(
    [...(await runtime.run(tasks.snapshotOutput, null))],
    [3, 4],
  );
  assert.equal(await runtime.run(tasks.outputDetached, null), true);
  assert.equal(
    (await runtime.run(tasks.move, data, { transferList: [data.buffer] }))[0],
    1,
  );
});

test('abort inside a serialization getter cannot release an in-progress transfer reservation', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 2 });
  await runtime.ready();
  const data = new Uint8Array([7]);
  const controller = new AbortController();
  let duplicateCheck;
  const input = {
    data,
    get trigger() {
      controller.abort();
      duplicateCheck = assert.rejects(
        runtime.run(tasks.move, data, { transferList: [data.buffer] }),
        /already reserved/,
      );
      return true;
    },
  };
  await assert.rejects(
    runtime.run(tasks.clone, input, {
      transferList: [data.buffer],
      signal: controller.signal,
    }),
    PjsCancelledError,
  );
  await duplicateCheck;
  await until(() => runtime.stats().workers.busy === 0);
  assert.equal(isDetached(data.buffer), true);
  assert.equal(runtime.stats().workers.failures, 0);
});

test('stress transfers across four workers preserve bytes and terminal accounting', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 4, maxQueue: 300 });
  await runtime.ready();
  const inputs = Array.from(
    { length: 200 },
    (_, i) => new Uint32Array([i, i * 17]),
  );
  const results = await Promise.all(
    inputs.map((data) =>
      runtime.run(tasks.move, data, { transferList: [data.buffer] }),
    ),
  );
  results.forEach((data, i) => assert.deepEqual([...data], [i, i * 17]));
  assert.ok(inputs.every((data) => isDetached(data.buffer)));
  await runtime.shutdown();
  assert.equal(runtime.stats().tasks.completed, 200);
  assert.equal(runtime.stats().tasks.pending, 0);
  assert.equal(runtime.stats().workers.failures, 0);
});
