import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PjsCancelledError,
  PjsTaskError,
  PjsTimeoutError,
} from '../dist/index.js';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';
import {
  assertConservation,
  assertOperationReleased,
  assertStreamReleased,
  create,
  entered,
  gate,
  inspect,
  open,
  quiescent,
  range,
  until,
} from './helpers/memory-lifecycle.mjs';

async function setup(t) {
  const { runtime, tasks } = create();
  const gates = [];
  t.after(async () => {
    for (const value of gates) open(value);
    await runtime.shutdown({ drain: false });
  });
  await runtime.ready();
  return {
    runtime,
    tasks,
    hold() {
      const value = gate();
      gates.push(value);
      return value;
    },
  };
}
const done = { value: undefined, done: true };
const bytes = {
  experimentalMaxBufferedResults: 2,
  experimentalResultBytes: 8,
  experimentalMaxReservedResultBytes: 16,
};

test('direct return before first read is eager, idempotent and not a physical barrier', async (t) => {
  const { runtime, tasks, hold } = await setup(t);
  const held = hold();
  const stream = runtime.streamRange(
    tasks.binary,
    range(1),
    () => ({ input: { gate: held } }),
    bytes,
  );
  assert.equal(stream[Symbol.asyncIterator](), stream);
  await until(() => entered(held) === 1); // Execution starts without next().
  const operation = [
    ...runtimeComponents(runtime).rangeCoordinator.operations.values(),
  ][0];
  const closed = stream.return();
  assert.equal(
    runtime.stats().streams.cancelled,
    1,
    'parent cancelled before return promise is awaited',
  );
  assertOperationReleased(operation);
  assertStreamReleased(stream);
  assert.equal(inspect(runtime).physical, 1);
  assert.equal(inspect(runtime).reservedBytes, 8);
  assertConservation(runtime);
  assert.deepEqual(await closed, done);
  assert.deepEqual(await stream.return(), done);
  assert.deepEqual(await stream.next(), done);
  assert.equal(runtime.stats().streams.cancelled, 1);
  open(held);
  await quiescent(runtime);
});

test('direct return resolves a pending read as done and releases delivery references', async (t) => {
  const { runtime, tasks, hold } = await setup(t);
  const held = hold();
  const stream = runtime.streamRange(tasks.binary, range(1), () => ({
    input: { gate: held },
  }));
  await until(() => entered(held) === 1);
  const read = stream.next();
  const closed = stream.return();
  assertStreamReleased(stream);
  assert.equal(runtime.stats().streams.cancelled, 1);
  assert.deepEqual(await read, done);
  assert.deepEqual(await closed, done);
  open(held);
  await quiescent(runtime);
});

test('for-await break clears buffered delivery while another result remains physically owned', async (t) => {
  const { runtime, tasks, hold } = await setup(t);
  const held = hold();
  const stream = runtime.streamRange(
    tasks.binary,
    range(2),
    (partition) => ({ input: partition.index === 1 ? { gate: held } : {} }),
    bytes,
  );
  await until(() => entered(held) === 1);
  assert.equal(inspect(runtime).buffered, 1);
  for await (const value of stream) {
    assert.equal(value.partition.index, 0);
    break;
  }
  assertStreamReleased(stream);
  assert.equal(runtime.stats().streams.cancelled, 1);
  assert.equal(inspect(runtime).physical, 1);
  assert.equal(inspect(runtime).reservedBytes, 8);
  open(held);
  await quiescent(runtime);
});

for (const reason of [new Error('consumer close'), 17])
  test(`throw normalizes ${typeof reason} once for itself and the pending read`, async (t) => {
    const { runtime, tasks, hold } = await setup(t);
    const held = hold();
    const stream = runtime.streamRange(tasks.binary, range(1), () => ({
      input: { gate: held },
    }));
    await until(() => entered(held) === 1);
    const read = stream.next().catch((error) => error);
    const thrown = stream.throw(reason).catch((error) => error);
    assert.equal(runtime.stats().streams.cancelled, 1);
    assertStreamReleased(stream);
    const [readError, throwError] = await Promise.all([read, thrown]);
    assert.ok(throwError instanceof Error);
    assert.equal(readError, throwError);
    if (reason instanceof Error) assert.equal(throwError, reason);
    else assert.equal(throwError.message, String(reason));
    assert.deepEqual(
      await stream.next(),
      done,
      'consumer throw is not stored as producer failure',
    );
    const later = new Error('later close');
    await assert.rejects(stream.throw(later), (error) => error === later);
    assert.deepEqual(await stream.return(), done);
    assert.equal(runtime.stats().streams.cancelled, 1);
    open(held);
    await quiescent(runtime);
  });

test('a throwing reason conversion remains synchronous and leaves the stream open', async (t) => {
  const { runtime, tasks, hold } = await setup(t);
  const held = hold();
  const stream = runtime.streamRange(tasks.binary, range(1), () => ({
    input: { gate: held },
  }));
  await until(() => entered(held) === 1);
  const reason = new Error('conversion failed');
  assert.throws(
    () =>
      stream.throw({
        toString() {
          throw reason;
        },
      }),
    (error) => error === reason,
  );
  assert.equal(runtime.stats().streams.pending, 1);
  assert.equal(runtime.stats().streams.cancelled, 0);
  const read = stream.next();
  await stream.return();
  assert.deepEqual(await read, done);
});

test('producer failure stays sticky across return and terminal throw', async (t) => {
  const { runtime, tasks } = await setup(t);
  const stream = runtime.streamRange(tasks.binary, range(1), () => ({
    input: { fail: true },
  }));
  const failure = await stream.next().catch((error) => error);
  assert.ok(failure instanceof PjsTaskError);
  assert.deepEqual(await stream.return(), done);
  await assert.rejects(stream.next(), (error) => error === failure);
  const supplied = new Error('consumer after failure');
  await assert.rejects(stream.throw(supplied), (error) => error === supplied);
  await assert.rejects(stream.next(), (error) => error === failure);
  assert.equal(runtime.stats().streams.failed, 1);
  assert.equal(runtime.stats().streams.cancelled, 0);
  assertStreamReleased(stream);
});

for (const mode of ['abort', 'deadline'])
  test(`${mode} failure stays sticky after explicit return`, async (t) => {
    const { runtime, tasks, hold } = await setup(t);
    const held = hold();
    const controller = new AbortController();
    const stream = runtime.streamRange(
      tasks.binary,
      range(1),
      () => ({ input: { gate: held } }),
      { signal: controller.signal, timeout: 10000 },
    );
    await until(() => entered(held) === 1);
    const read = stream.next().catch((error) => error);
    if (mode === 'abort') controller.abort();
    else {
      // Exercise the actual expiry path without using elapsed time to order a race.
      const coordinator = runtimeComponents(runtime).rangeCoordinator;
      const operation = [...coordinator.operations.values()][0];
      operation.deadline = 0;
      assert.equal(coordinator.expireOperation(operation), true);
    }
    const failure = await read;
    assert.ok(
      failure instanceof
        (mode === 'abort' ? PjsCancelledError : PjsTimeoutError),
    );
    assert.deepEqual(await stream.return(), done);
    await assert.rejects(stream.next(), (error) => error === failure);
    assertStreamReleased(stream);
    open(held);
    await quiescent(runtime);
  });

test('concurrent pending next rejects only the second read', async (t) => {
  const { runtime, tasks, hold } = await setup(t);
  const held = hold();
  const stream = runtime.streamRange(tasks.binary, range(1), () => ({
    input: { gate: held },
  }));
  await until(() => entered(held) === 1);
  const first = stream.next();
  await assert.rejects(stream.next(), /Concurrent next/);
  assert.equal(runtime.stats().streams.cancelled, 0);
  open(held);
  assert.equal((await first).value.output.byteLength, 8);
  assert.deepEqual(await stream.next(), done);
});

test('buffered reads, full consumption and empty streams expose undefined completion', async (t) => {
  const { runtime, tasks } = await setup(t);
  const stream = runtime.streamRange(
    tasks.binary,
    range(2),
    () => ({ input: {} }),
    { experimentalMaxBufferedResults: 2 },
  );
  await until(() => stream.buffered === 2);
  const results = await Promise.all([stream.next(), stream.next()]);
  assert.deepEqual(
    results.map((result) => result.value.partition.index),
    [0, 1],
  );
  assert.deepEqual(await stream.next(), done);
  const empty = runtime.streamRange(tasks.binary, range(0), () => {
    throw new Error('empty factory invoked');
  });
  assert.equal(empty[Symbol.asyncIterator](), empty);
  assert.deepEqual(await empty.next(), done);
  for (const completed of [stream, empty]) {
    const reason = new Error('after completion');
    await assert.rejects(completed.throw(reason), (error) => error === reason);
    await assert.rejects(
      completed.throw('after completion'),
      (error) => error.message === 'after completion',
    );
    assert.deepEqual(await completed.next(), done);
    assert.deepEqual(await completed.return(), done);
    assertStreamReleased(completed);
  }
  assert.equal(runtime.stats().streams.cancelled, 0);
});
