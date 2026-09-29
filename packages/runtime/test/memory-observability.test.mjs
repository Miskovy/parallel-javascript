import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  setImmediate as immediate,
  setTimeout as delay,
} from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskError,
  PjsTaskRegistry,
  PjsTimeoutError,
} from '../dist/index.js';

function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const module = new URL('./fixtures/partition-tasks.mjs', import.meta.url);
  const direct = registry.register('direct-result', module, 'directResult');
  const mapBlock = registry.register(
    'observable-map-block',
    module,
    'mapBlock',
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxQueue: 8,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, direct, mapBlock };
}

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition reached');
    await delay(2);
  }
}

function iterator(stream) {
  return stream[Symbol.asyncIterator]();
}

async function inspectBuffered(
  runtime,
  task,
  returnValue,
  expectedBytes,
  expectedUnknown,
) {
  const stream = iterator(
    runtime.streamRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { returnValue } }),
      { experimentalMaxBufferedResults: 1 },
    ),
  );
  await until(() => runtime.stats().streamResults.buffered === 1);
  const stats = runtime.stats().streamResults;
  assert.equal(stats.knownBufferedPayloadBytes, expectedBytes);
  assert.equal(stats.unknownBufferedResults, expectedUnknown);
  await stream.return();
  assert.equal(runtime.stats().streamResults.knownBufferedPayloadBytes, 0);
  assert.equal(runtime.stats().streamResults.unknownBufferedResults, 0);
}

test('stream diagnostics distinguish known direct backings from unknown results', async (t) => {
  const { runtime, direct } = setup(t);
  await runtime.ready();
  await inspectBuffered(runtime, direct, 7, 0, 1);
  await inspectBuffered(runtime, direct, { value: 7 }, 0, 1);
  await inspectBuffered(runtime, direct, new ArrayBuffer(16), 16, 0);
  await inspectBuffered(runtime, direct, new Uint8Array(24), 24, 0);
  await inspectBuffered(
    runtime,
    direct,
    new DataView(new ArrayBuffer(12)),
    12,
    0,
  );
  await inspectBuffered(
    runtime,
    direct,
    new Uint8Array(new SharedArrayBuffer(20)),
    20,
    0,
  );
  await inspectBuffered(runtime, direct, new Uint8Array(0), 0, 0);
});

test('multiple buffered views report payload bytes and explicitly alias-count', async (t) => {
  const { runtime, direct } = setup(t, { workers: 2 });
  await runtime.ready();
  const backing = new SharedArrayBuffer(64);
  const views = [
    new Uint8Array(backing, 0, 16),
    new Uint8Array(backing, 16, 16),
  ];
  const stream = iterator(
    runtime.streamRange(
      direct,
      { start: 0, end: 2, grainSize: 1 },
      (partition) => ({ input: { returnValue: views[partition.index] } }),
      { experimentalMaxBufferedResults: 2 },
    ),
  );
  await until(() => runtime.stats().streamResults.buffered === 2);
  assert.equal(runtime.stats().streamResults.knownBufferedPayloadBytes, 32);
  assert.equal(runtime.stats().streamResults.peakKnownBufferedPayloadBytes, 32);
  await stream.return();
});

test('yield, transfer, cancellation, and failure release diagnostic retention', async (t) => {
  const { runtime, direct, mapBlock } = setup(t);
  await runtime.ready();
  const moved = new Uint8Array(32);
  const transferred = iterator(
    runtime.streamRange(
      direct,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { returnValue: moved, move: true } }),
      { experimentalMaxBufferedResults: 1 },
    ),
  );
  await until(
    () => runtime.stats().streamResults.knownBufferedPayloadBytes === 32,
  );
  assert.equal((await transferred.next()).value.output.byteLength, 32);
  assert.equal(runtime.stats().streamResults.knownBufferedPayloadBytes, 0);

  const cancelled = iterator(
    runtime.streamRange(
      direct,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { returnValue: new Uint8Array(48) } }),
      { experimentalMaxBufferedResults: 1 },
    ),
  );
  await until(
    () => runtime.stats().streamResults.knownBufferedPayloadBytes === 48,
  );
  await cancelled.return();
  assert.equal(runtime.stats().streamResults.knownBufferedPayloadBytes, 0);

  const failed = iterator(
    runtime.streamRange(
      mapBlock,
      { start: 0, end: 2, grainSize: 1 },
      (partition) => ({
        input: {
          partition,
          kind: 'float64',
          fail: partition.index === 1,
        },
      }),
      { experimentalMaxBufferedResults: 2 },
    ),
  );
  await until(() => runtime.stats().streams.failed === 1);
  assert.equal(runtime.stats().streamResults.knownBufferedPayloadBytes, 0);
  await assert.rejects(failed.next(), PjsTaskError);
});

test('stream start remains eager and its deadline starts before consumption', async (t) => {
  const { runtime, direct } = setup(t);
  await runtime.ready();
  const stream = iterator(
    runtime.streamRange(
      direct,
      { start: 0, end: 8, grainSize: 1 },
      () => ({ input: { returnValue: new Uint8Array(8) } }),
      { experimentalMaxBufferedResults: 2 },
    ),
  );
  await until(() => runtime.stats().streamResults.buffered === 2);
  assert.equal(runtime.stats().activeOperations[0].generated, 2);
  await stream.return();
  assert.equal(runtime.stats().streams.cancelled, 1);

  const timed = iterator(
    runtime.streamRange(
      direct,
      { start: 0, end: 2, grainSize: 1 },
      () => ({ input: { returnValue: new Uint8Array(8) } }),
      { timeout: 40, experimentalMaxBufferedResults: 1 },
    ),
  );
  await delay(80);
  await assert.rejects(timed.next(), PjsTimeoutError);
});

test('stream remains single-consumer and an async processing pipeline cleans up on sink failure', async (t) => {
  const { runtime, mapBlock } = setup(t);
  await runtime.ready();
  const gate = new SharedArrayBuffer(8);
  const blocked = iterator(
    runtime.streamRange(
      mapBlock,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => ({ input: { partition, gate, kind: 'float64' } }),
    ),
  );
  const first = blocked.next();
  await assert.rejects(blocked.next(), /Concurrent next/);
  Atomics.store(new Int32Array(gate), 1, 1);
  Atomics.notify(new Int32Array(gate), 1);
  await first;
  await blocked.return();

  let processed = 0;
  await assert.rejects(async () => {
    for await (const { output } of runtime.streamRange(
      mapBlock,
      { start: 0, end: 16, grainSize: 2 },
      (partition) => ({ input: { partition, kind: 'float64' } }),
      { experimentalMaxBufferedResults: 2 },
    )) {
      createHash('sha256').update(new Uint8Array(output.buffer)).digest();
      await immediate();
      if (++processed === 3) throw new Error('sink failed');
    }
  }, /sink failed/);
  await until(() => runtime.stats().streams.pending === 0);
  assert.equal(runtime.stats().streams.cancelled, 1);
});
