import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsBinaryResultContractError,
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjs/runtime';
import { inspectBinaryResult } from '../../packages/runtime/dist/partition/binary.js';
import { isWorkerMessage } from '../../packages/runtime/dist/workers/protocol.js';
import { machineReport } from '../environment.mjs';

const KiB = 2 ** 10;
const MiB = 2 ** 20;
const quick = process.env.PJS_BENCH_QUICK === '1';
const workers = Math.min(4, availableParallelism());
const registry = new PjsTaskRegistry();
const taskUrl = new URL('./task.mjs', import.meta.url);
const tasks = Object.fromEntries(
  ['pipeline', 'rle', 'large', 'small', 'a', 'b', 'callback'].map((name) => [
    name,
    registry.register(`reservation-audit-${name}`, taskUrl),
  ]),
);
const runtime = new PjsRuntime({ registry, workers, maxQueue: 256 });
await runtime.ready();

function strict(expected, capacity, countCapacity = 16) {
  return {
    experimentalMaxBufferedResults: countCapacity,
    experimentalResultBytes: expected,
    experimentalMaxReservedResultBytes: capacity,
  };
}

async function consumeBinary(task, count, bytesFor, options, consumerMs = 0) {
  let received = 0;
  let bytes = 0;
  let checksum = 0;
  const started = performance.now();
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: count, grainSize: 1 },
    (partition) => ({
      input: {
        partition,
        bytes: bytesFor(partition.index),
        move: true,
        iterations: 1,
      },
    }),
    options,
  )) {
    bytes += output.byteLength;
    if (output.byteLength) checksum ^= output[0] ^ output[output.length - 1];
    received++;
    if (consumerMs) await delay(consumerMs);
  }
  return { received, bytes, checksum, wallMs: performance.now() - started };
}

async function longPipeline() {
  const sizes = [4 * KiB, 16 * KiB, 64 * KiB, 256 * KiB, MiB];
  const count = quick ? 40 : 320;
  const bytesFor = (index) => sizes[index % sizes.length];
  const samples = [];
  const timer = setInterval(() => {
    const stats = runtime.stats();
    samples.push({
      atMs: performance.now(),
      rss: process.memoryUsage().rss,
      arrayBuffers: process.memoryUsage().arrayBuffers,
      reserved: stats.streamResults.currentReservedResultBytes,
      buffered: stats.streamResults.knownBufferedPayloadBytes,
      activeOperations: stats.activeOperations.length,
      busyWorkers: stats.workers.busy,
    });
  }, 5);
  const before = runtime.stats();
  const result = await consumeBinary(tasks.pipeline, count, bytesFor, {
    experimentalDispatchBatchSize: 1,
    ...strict((partition) => bytesFor(partition.index), 4 * MiB),
  });
  clearInterval(timer);
  const after = runtime.stats();
  return {
    ...result,
    samples,
    reservationWaits:
      after.streamResults.resultByteReservationWaits -
      before.streamResults.resultByteReservationWaits,
    terminalReservedBytes: after.streamResults.currentReservedResultBytes,
  };
}

function rleSize(source, start, end) {
  let runs = 0;
  for (let index = start; index < end;) {
    const value = source[index];
    let length = 1;
    while (
      index + length < end &&
      source[index + length] === value &&
      length < 255
    )
      length++;
    runs++;
    index += length;
  }
  return runs * 2;
}

async function variableOutputTrace() {
  const grainSize = 4 * KiB;
  const count = quick ? 24 : 192;
  const raw = new Uint8Array(count * grainSize);
  let state = 0x1020_3040;
  for (let index = 0; index < raw.length;) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const run = 1 + (state % 160);
    raw.fill(state & 0xff, index, Math.min(raw.length, index + run));
    index += run;
  }
  const source = sharedReadonly(raw);
  const declared = [];
  let callbackCalls = 0;
  let callbackMs = 0;
  const expected = (partition) => {
    const started = performance.now();
    callbackCalls++;
    const size = rleSize(source, partition.start, partition.end);
    callbackMs += performance.now() - started;
    declared[partition.index] = size;
    return size;
  };
  let received = 0;
  let outputBytes = 0;
  const started = performance.now();
  for await (const { partition, output } of runtime.streamRange(
    tasks.rle,
    { start: 0, end: source.length, grainSize },
    (partition) => ({ input: { partition, source, kind: 'rle', move: true } }),
    {
      experimentalDispatchBatchSize: 1,
      ...strict(expected, 256 * KiB),
    },
  )) {
    assert.equal(output.byteLength, declared[partition.index]);
    outputBytes += output.byteLength;
    received++;
  }
  return {
    inputBytes: source.length,
    outputBytes,
    ratio: outputBytes / source.length,
    received,
    wallMs: performance.now() - started,
    callbackCalls,
    callbackMs,
    outputSize: {
      min: Math.min(...declared),
      max: Math.max(...declared),
      mean: declared.reduce((sum, value) => sum + value, 0) / declared.length,
    },
    declarationObservation:
      'Exact mode requires a host-side RLE sizing pass before the worker repeats the scan.',
  };
}

async function multiStreamPressure() {
  const definitions = [
    ['large', quick ? 8 : 32, 512 * KiB, 2 * MiB],
    ['small', quick ? 32 : 128, 4 * KiB, 64 * KiB],
    ['a', quick ? 16 : 64, 64 * KiB, 512 * KiB],
    ['b', quick ? 12 : 48, 256 * KiB, MiB],
  ];
  const peaks = Object.fromEntries(definitions.map(([name]) => [name, 0]));
  const ids = new Map();
  const samples = [];
  const timer = setInterval(() => {
    const stats = runtime.stats();
    for (const operation of stats.activeOperations) {
      const name = operation.taskName.replace('reservation-audit-', '');
      if (!(name in peaks) || operation.reservedResultBytes === undefined)
        continue;
      ids.set(operation.id, name);
      peaks[name] = Math.max(peaks[name], operation.reservedResultBytes);
    }
    samples.push({
      reserved: stats.streamResults.currentReservedResultBytes,
      operations: stats.activeOperations.length,
    });
  }, 1);
  const started = performance.now();
  const completions = {};
  await Promise.all(
    definitions.map(async ([name, count, bytes, capacity]) => {
      await consumeBinary(
        tasks[name],
        count,
        () => bytes,
        strict(bytes, capacity),
        1,
      );
      completions[name] = performance.now() - started;
    }),
  );
  clearInterval(timer);
  return {
    wallMs: performance.now() - started,
    completions,
    operationIdsObserved: ids.size,
    perOperationPeakReservedBytes: peaks,
    globalPeakObservedBytes: Math.max(
      ...samples.map((sample) => sample.reserved),
      0,
    ),
    starvation: Object.keys(completions).length !== definitions.length,
  };
}

async function weightedFairness() {
  const started = performance.now();
  const completion = {};
  const large = consumeBinary(
    tasks.large,
    quick ? 16 : 32,
    () => 4 * MiB,
    strict(4 * MiB, 8 * MiB, 2),
    4,
  ).then(() => (completion.large = performance.now() - started));
  const small = consumeBinary(
    tasks.small,
    quick ? 64 : 256,
    () => 4 * KiB,
    strict(4 * KiB, 64 * KiB, 16),
  ).then(() => (completion.small = performance.now() - started));
  await Promise.all([large, small]);
  return {
    completion,
    smallCompletedBeforeLarge: completion.small < completion.large,
    starvation: Object.keys(completion).length !== 2,
  };
}

async function headOfLineCredit() {
  const started = performance.now();
  const completion = {};
  const blockedA = consumeBinary(
    tasks.a,
    quick ? 6 : 24,
    () => MiB,
    strict(MiB, MiB, 8),
    3,
  ).then(() => (completion.a = performance.now() - started));
  await delay(1);
  const independentB = consumeBinary(
    tasks.b,
    quick ? 24 : 96,
    () => 4 * KiB,
    strict(4 * KiB, 64 * KiB, 16),
  ).then(() => (completion.b = performance.now() - started));
  await Promise.all([blockedA, independentB]);
  return {
    completion,
    independentStreamProgressed: completion.b < completion.a,
  };
}

async function callbackCosts() {
  const count = quick ? 64 : 512;
  const cases = [];
  for (const kind of ['cheap', 'moderate', 'reentrant']) {
    let calls = 0;
    let callbackMs = 0;
    let callbackChecksum = 0;
    const reentrantRuns = [];
    const declaration = (partition) => {
      const started = performance.now();
      calls++;
      if (kind === 'moderate') {
        let state = partition.index + 1;
        for (let index = 0; index < 256; index++)
          state = Math.imul(state ^ index, 2654435761);
        callbackChecksum ^= state;
      }
      if (kind === 'reentrant' && partition.index % 64 === 0)
        reentrantRuns.push(
          runtime.run(tasks.callback, {
            partition: { index: partition.index, start: 0, end: 1 },
            bytes: 0,
          }),
        );
      callbackMs += performance.now() - started;
      return 64;
    };
    const result = await consumeBinary(
      tasks.callback,
      count,
      () => 64,
      strict(declaration, 4096),
    );
    await Promise.all(reentrantRuns);
    cases.push({
      kind,
      calls,
      callbackMs,
      callbackChecksum,
      reentrantRuns: reentrantRuns.length,
      wallMs: result.wallMs,
    });
  }
  const started = performance.now();
  await assert.rejects(async () => {
    for await (const value of runtime.streamRange(
      tasks.callback,
      { start: 0, end: 4, grainSize: 1 },
      (partition) => ({ input: { partition, bytes: 64 } }),
      strict(() => {
        throw new Error('intentional declaration failure');
      }, 4096),
    ))
      void value;
  });
  cases.push({
    kind: 'throw',
    throws: true,
    wallMs: performance.now() - started,
  });
  return cases;
}

function microControls() {
  const measure = (name, iterations, execute) => {
    let checksum = 0;
    const started = performance.now();
    for (let index = 0; index < iterations; index++) checksum ^= execute(index);
    const wallMs = performance.now() - started;
    return {
      name,
      iterations,
      wallMs,
      nanosecondsPerOperation: (wallMs * 1e6) / iterations,
      checksum,
    };
  };
  const buffer = new ArrayBuffer(64);
  const values = [
    buffer,
    new Uint8Array(buffer),
    Buffer.from(buffer),
    new DataView(buffer),
    new ArrayBuffer(0),
  ];
  const reservations = new Map();
  const validMessage = {
    type: 'success',
    id: 'control',
    output: new Uint8Array(0),
    durationMs: 0,
  };
  return [
    measure('safe-integer-check', 1_000_000, (index) =>
      Number.isSafeInteger(index) ? 1 : 0,
    ),
    measure(
      'binary-inspection-mixed-kind',
      500_000,
      (index) => inspectBinaryResult(values[index % values.length]).bytes ?? 0,
    ),
    measure('reservation-map-insert-delete', 200_000, (index) => {
      reservations.set(index, index);
      const value = reservations.get(index);
      reservations.delete(index);
      return value;
    }),
    measure('worker-protocol-validation', 500_000, () =>
      isWorkerMessage(validMessage) ? 1 : 0,
    ),
    measure(
      'contract-error-construction',
      20_000,
      (index) =>
        new PjsBinaryResultContractError('control', {
          declaredBytes: index,
        }).declaredBytes,
    ),
  ];
}

const loopDelay = monitorEventLoopDelay({ resolution: 1 });
loopDelay.enable();
const eluBefore = performance.eventLoopUtilization();
try {
  const report = {
    version: '0.10.0',
    timestamp: new Date().toISOString(),
    environment: machineReport({ workers, quick }),
    longPipeline: await longPipeline(),
    variableOutputTrace: await variableOutputTrace(),
    multiStreamPressure: await multiStreamPressure(),
    weightedFairness: await weightedFairness(),
    headOfLineCredit: await headOfLineCredit(),
    callbackCosts: await callbackCosts(),
    microControls: microControls(),
  };
  const elu = performance.eventLoopUtilization(eluBefore);
  loopDelay.disable();
  report.eventLoop = {
    utilization: elu.utilization,
    delayMaxMs: loopDelay.max / 1e6,
    delayMeanMs: loopDelay.mean / 1e6,
  };
  const final = runtime.stats();
  assert.equal(final.streamResults.currentReservedResultBytes, 0);
  report.final = {
    currentReservedResultBytes: final.streamResults.currentReservedResultBytes,
    operationsPending: final.operations.pending,
    tasksPending: final.tasks.pending,
  };
  await mkdir(new URL('../results/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../results/reservation-pipeline-v0.10.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.table({
    longPipelineMs: report.longPipeline.wallMs,
    rleMs: report.variableOutputTrace.wallMs,
    multiStreamMs: report.multiStreamPressure.wallMs,
    smallBeforeLarge: report.weightedFairness.smallCompletedBeforeLarge,
    independentProgress: report.headOfLineCredit.independentStreamProgressed,
  });
} finally {
  loopDelay.disable();
  await runtime.shutdown({ drain: false });
}
