import assert from 'node:assert/strict';
import { setImmediate as immediate } from 'node:timers/promises';
import * as api from '@pjavascript/runtime';

assert.deepEqual(
  Object.keys(api).sort(),
  [
    'PjsBinaryResultContractError',
    'PjsCancelledError',
    'PjsError',
    'PjsExecutionLeaseError',
    'PjsMapContractError',
    'PjsQueueFullError',
    'PjsResultCapacityError',
    'PjsRuntime',
    'PjsRuntimeStateError',
    'PjsSerializationError',
    'PjsTaskError',
    'PjsTaskRegistrationError',
    'PjsTaskRegistry',
    'PjsTimeoutError',
    'PjsWorkerError',
    'sharedReadonly',
    'transfer',
  ].sort(),
);
const registry = new api.PjsTaskRegistry();
const task = registry.register(
  'bytes',
  new URL('./tasks.mjs', import.meta.url),
  'streamBinary',
);
const runtime = new api.PjsRuntime({ registry, workers: 1 });
const gates = [];
const hold = () => {
  const gate = new SharedArrayBuffer(8);
  gates.push(gate);
  return gate;
};
function open(gate) {
  const control = new Int32Array(gate);
  Atomics.store(control, 1, 1);
  Atomics.notify(control, 1);
}
async function entered(gate) {
  const deadline = Date.now() + 5000;
  while (Atomics.load(new Int32Array(gate), 0) === 0) {
    assert.ok(Date.now() < deadline, 'worker entered');
    await immediate();
  }
}
const range = { start: 0, end: 3, grainSize: 1 };
const done = { value: undefined, done: true };
try {
  await runtime.ready();
  const gate = hold();
  const stream = runtime.streamRange(task, range, () => ({ input: { gate } }), {
    experimentalResultBytes: 8,
    experimentalMaxReservedResultBytes: 8,
  });
  assert.equal(stream[Symbol.asyncIterator](), stream);
  await entered(gate); // Eager execution, no next() yet.
  const pending = stream.next();
  await assert.rejects(stream.next(), /Concurrent next/);
  const close = stream.return();
  assert.equal(runtime.stats().streams.pending, 0);
  assert.equal(runtime.stats().workers.busy, 1);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
  assert.deepEqual(await pending, done);
  assert.deepEqual(await close, done);
  assert.deepEqual(await stream.return(), done);
  open(gate);

  const thrownGate = hold();
  const thrown = runtime.streamRange(
    task,
    range,
    () => ({ input: { gate: thrownGate } }),
    { experimentalMaxResultBytes: 16, experimentalMaxReservedResultBytes: 16 },
  );
  await entered(thrownGate);
  const readFailure = thrown.next().catch((error) => error);
  const reason = new Error('installed JavaScript close');
  await assert.rejects(thrown.throw(reason), (error) => error === reason);
  assert.equal(await readFailure, reason);
  assert.deepEqual(await thrown.next(), done);
  open(thrownGate);

  const broken = runtime.streamRange(task, range, () => ({ input: {} }), {
    experimentalMaxBufferedResults: 1,
  });
  for await (const item of broken) {
    assert.equal(item.output.byteLength, 8);
    break;
  }
  assert.deepEqual(await broken.next(), done);
  const all = runtime.streamRange(task, range, () => ({ input: {} }));
  let count = 0;
  for await (const item of all) {
    assert.equal(item.output.byteLength, 8);
    count++;
  }
  assert.equal(count, 3);
  assert.deepEqual(await all.next(), done);
} finally {
  for (const gate of gates) open(gate);
  await runtime.shutdown({ drain: false });
}
assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
assert.equal(runtime.stats().workers.busy, 0);
