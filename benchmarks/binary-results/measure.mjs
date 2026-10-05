import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setImmediate as immediate } from 'node:timers/promises';
import Piscina from 'piscina';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';
import { transformByte } from './task.mjs';

const config = JSON.parse(process.argv[2]);
const {
  engine,
  mode,
  workers,
  count,
  countCapacity,
  byteCapacity,
  blockBytes,
  sizes,
  consumerCostMs,
  iterations,
  trials,
  warmups,
  transfer: transferBlocks,
} = config;
const sourceValues = Uint8Array.from(
  { length: 256 * 1024 },
  (_, index) => (index * 29 + 17) & 0xff,
);
const source =
  engine === 'pjs'
    ? sharedReadonly(sourceValues)
    : new Uint8Array(new SharedArrayBuffer(sourceValues.byteLength));
if (engine === 'piscina') source.set(sourceValues);
const bytesFor = (index) => sizes?.[index % sizes.length] ?? blockBytes;

const registry = new PjsTaskRegistry();
const task = registry.register(
  'binary-result-benchmark',
  new URL('./task.mjs', import.meta.url),
);
let runtime;
let pool;
let piscinaComputeOutstanding = 0;
if (engine === 'pjs') {
  runtime = new PjsRuntime({ registry, workers, maxQueue: workers * 32 });
  await runtime.ready();
} else {
  pool = new Piscina({
    filename: fileURLToPath(new URL('./task.mjs', import.meta.url)),
    minThreads: workers,
    maxThreads: workers,
    concurrentTasksPerWorker: 1,
    maxQueue: workers * 32,
  });
}

function consumeCpu(milliseconds) {
  const deadline = performance.now() + milliseconds;
  let value = 0;
  while (performance.now() < deadline) value = Math.imul(value + 1, 2654435761);
  return value;
}

async function consumeBinary(output) {
  const bytes = new Uint8Array(
    output.buffer,
    output.byteOffset,
    output.byteLength,
  );
  const digest = createHash('sha256').update(bytes).digest();
  consumeCpu(consumerCostMs);
  await immediate();
  return digest[0];
}

function referenceChecksum() {
  if (mode === 'typed-map') {
    const output = new Uint8Array(count * blockBytes);
    for (let index = 0; index < output.length; index++)
      output[index] = transformByte(
        sourceValues[index % sourceValues.length],
        index,
        iterations,
      );
    return createHash('sha256').update(output).digest()[0];
  }
  if (mode === 'object') {
    let checksum = 0;
    for (let index = 0; index < count; index++)
      checksum ^=
        transformByte(
          sourceValues[index % sourceValues.length],
          index,
          iterations,
        ) ^
        (index % 7) ^
        `record-${index}`.length;
    return checksum;
  }
  let checksum = 0;
  for (let partitionIndex = 0; partitionIndex < count; partitionIndex++) {
    const bytes = bytesFor(partitionIndex);
    const block = new Uint8Array(bytes);
    const sourceOffset = (partitionIndex * 131) % sourceValues.length;
    for (let index = 0; index < bytes; index++)
      block[index] = transformByte(
        sourceValues[(sourceOffset + index) % sourceValues.length],
        partitionIndex + index,
        iterations,
      );
    checksum ^= createHash('sha256').update(block).digest()[0];
  }
  return checksum;
}

const expectedChecksum = referenceChecksum();

async function pjsStream(strict, objectMode = false) {
  let firstResultMs = null;
  let checksum = 0;
  let resultCount = 0;
  const started = performance.now();
  const stream = runtime.streamRange(
    task,
    { start: 0, end: count, grainSize: 1 },
    (partition) => ({
      input: {
        partition,
        source,
        bytes: bytesFor(partition.index),
        iterations,
        kind: objectMode ? 'object' : 'binary',
        pjsTransfer: transferBlocks,
      },
    }),
    {
      experimentalDispatchBatchSize: transferBlocks ? 1 : 4,
      experimentalMaxBufferedResults: countCapacity,
      ...(strict
        ? {
            experimentalResultBytes: (partition) => bytesFor(partition.index),
            experimentalMaxReservedResultBytes: byteCapacity,
          }
        : {}),
    },
  );
  for await (const { output } of stream) {
    firstResultMs ??= performance.now() - started;
    checksum ^= objectMode
      ? output.score ^ output.category ^ output.tag.length
      : await consumeBinary(output);
    if (objectMode) await immediate();
    resultCount++;
  }
  return { resultCount, firstResultMs, checksum };
}

async function pjsMap() {
  const size = count * blockBytes;
  const result = await runtime.parallelMapRange(
    task,
    { start: 0, end: size, grainSize: blockBytes },
    (partition) => ({
      input: { partition, source, iterations, kind: 'map' },
    }),
    {
      experimentalOutputConstructor: Uint8Array,
      experimentalDispatchBatchSize: 4,
    },
  );
  return {
    resultCount: count,
    firstResultMs: null,
    checksum: createHash('sha256').update(result).digest()[0],
  };
}

async function piscinaStream() {
  let next = 0;
  let active = 0;
  let reserved = 0;
  let peakReserved = 0;
  let firstResultMs = null;
  let checksum = 0;
  let resultCount = 0;
  let consumer = Promise.resolve();
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const started = performance.now();
  const pump = () => {
    while (next < count && active < countCapacity) {
      const index = next;
      const bytes = bytesFor(index);
      if (bytes > byteCapacity)
        return rejectDone(new Error('Piscina semaphore item exceeds capacity'));
      if (bytes > byteCapacity - reserved) break;
      next++;
      active++;
      piscinaComputeOutstanding++;
      reserved += bytes;
      peakReserved = Math.max(peakReserved, reserved);
      const partition = { index, start: index, end: index + 1 };
      void pool
        .run({
          partition,
          source,
          bytes,
          iterations,
          kind: 'binary',
          piscinaTransfer: transferBlocks,
        })
        .then((output) => {
          piscinaComputeOutstanding--;
          consumer = consumer.then(async () => {
            firstResultMs ??= performance.now() - started;
            checksum ^= await consumeBinary(output);
            resultCount++;
            active--;
            reserved -= bytes;
            if (resultCount === count) resolveDone();
            else pump();
          });
          void consumer.catch(rejectDone);
        }, rejectDone);
    }
  };
  pump();
  await done;
  return { resultCount, firstResultMs, checksum, peakReserved };
}

async function sample() {
  let peakRssBytes = process.memoryUsage().rss;
  let busyTotal = 0;
  let busySamples = 0;
  const rssTimer = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    busyTotal += runtime
      ? runtime.stats().workers.busy
      : Math.min(
          workers,
          Math.max(0, piscinaComputeOutstanding - pool.queueSize),
        );
    busySamples++;
  }, 2);
  let expectedAt = performance.now() + 1;
  let maxTimerDriftMs = 0;
  const driftTimer = setInterval(() => {
    const now = performance.now();
    maxTimerDriftMs = Math.max(maxTimerDriftMs, now - expectedAt);
    expectedAt = now + 1;
  }, 1);
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const cpuBefore = process.cpuUsage();
  const eluBefore = performance.eventLoopUtilization();
  const before = runtime?.stats();
  const started = performance.now();
  const measured =
    engine === 'piscina'
      ? await piscinaStream()
      : mode === 'typed-map'
        ? await pjsMap()
        : await pjsStream(mode === 'strict', mode === 'object');
  const wallMs = performance.now() - started;
  const usage = process.cpuUsage(cpuBefore);
  const elu = performance.eventLoopUtilization(eluBefore);
  const after = runtime?.stats();
  delay.disable();
  clearInterval(rssTimer);
  clearInterval(driftTimer);
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  assert.equal(measured.resultCount, count);
  assert.equal(measured.checksum, expectedChecksum);
  const expectedBytes = Array.from({ length: count }, (_, index) =>
    bytesFor(index),
  ).reduce((sum, bytes) => sum + bytes, 0);
  return {
    wallMs,
    firstResultMs: measured.firstResultMs ?? wallMs,
    resultCount: measured.resultCount,
    checksum: measured.checksum,
    expectedBytes,
    bytesPerSecond: expectedBytes / (wallMs / 1000),
    resultsPerSecond: count / (wallMs / 1000),
    cpuMs: (usage.user + usage.system) / 1000,
    peakRssBytes,
    averageBusyWorkers: busySamples === 0 ? null : busyTotal / busySamples,
    workerUtilization:
      busySamples === 0 ? null : busyTotal / (busySamples * workers),
    peakReservedResultBytes:
      measured.peakReserved ??
      after?.streamResults.peakReservedResultBytes ??
      0,
    peakBufferedPayloadBytes:
      after?.streamResults.peakKnownBufferedPayloadBytes ?? 0,
    reservationWaits:
      before && after
        ? after.streamResults.resultByteReservationWaits -
          before.streamResults.resultByteReservationWaits
        : null,
    messages:
      before && after
        ? after.dispatch.executeMessages - before.dispatch.executeMessages
        : count,
    eventLoopUtilization: elu.utilization,
    eventLoopDelayMaxMs: delay.max / 1e6,
    maxTimerDriftMs,
  };
}

try {
  const firstRun = await sample();
  for (let index = 0; index < warmups; index++) await sample();
  const samples = [];
  for (let index = 0; index < trials; index++) samples.push(await sample());
  process.stdout.write(JSON.stringify({ ...config, firstRun, samples }));
} finally {
  if (runtime) await runtime.shutdown();
  if (pool) await pool.destroy();
}
