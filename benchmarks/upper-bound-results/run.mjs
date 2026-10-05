import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';
import { rleSize } from './task.mjs';
import { machineReport } from '../environment.mjs';

const quick = process.env.PJS_BENCH_QUICK === '1';
const trials = quick ? 2 : 6;
const workers = 4;
const KiB = 1024;
const maximum = 512 * KiB;
const grainSize = maximum / 2;
const count = quick ? 16 : 128;
function sourceFor(lengths) {
  const bytes = new Uint8Array(grainSize * count);
  let run = 0;
  for (let index = 0; index < bytes.length;) {
    const length = lengths[run % lengths.length];
    bytes.fill(run & 255, index, Math.min(index + length, bytes.length));
    index += length;
    run++;
  }
  return sharedReadonly(bytes);
}
const sources = new Map([
  [1, sourceFor([1])],
  [0.75, sourceFor([1, 1, 2])],
  [0.5, sourceFor([2])],
  [0.25, sourceFor([4])],
  [0.1, sourceFor([10])],
  [0.01, sourceFor([100])],
  [
    'variable',
    sourceFor(Array.from({ length: 97 }, (_, i) => 1 + ((i * 73 + 31) % 160))),
  ],
]);
const cases = [];
for (const utilization of [1, 0.75, 0.5, 0.25, 0.1, 0.01])
  for (const capacityBlocks of [1, workers, workers * 4])
    cases.push({
      name: `slack-${utilization}-capacity-${capacityBlocks}`,
      kind: 'rle',
      mode: 'upper',
      utilization,
      capacityBlocks,
      consumerMs: 0,
    });
for (const consumerMs of [0, 1])
  for (const mode of ['count', 'exact', 'upper', 'held-maximum'])
    cases.push({
      name: `variable-${mode}-consumer-${consumerMs}`,
      kind: 'rle',
      mode,
      utilization: 'variable',
      capacityBlocks: workers * 4,
      consumerMs,
    });
for (const mode of ['count', 'upper', 'held-maximum'])
  cases.push({
    name: `refund-${mode}-slow`,
    kind: 'binary',
    mode,
    utilization: 0.0625,
    capacityBlocks: 2,
    consumerMs: 1,
  });
for (const move of [false, true])
  for (const mode of ['exact', 'upper'])
    cases.push({
      name: `equal-${mode}-${move ? 'transfer' : 'clone'}`,
      kind: 'binary',
      mode,
      utilization: 1,
      capacityBlocks: workers * 4,
      consumerMs: 0,
      move,
    });

async function measure(config) {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'upper-bound-benchmark',
    new URL('./task.mjs', import.meta.url),
    config.kind === 'rle' ? 'encode' : 'binary',
  );
  const runtime = new PjsRuntime({ registry, workers, maxQueue: 128 });
  await runtime.ready();
  let hostSizingMs = 0;
  let hostSizingCalls = 0;
  if (config.mode === 'held-maximum') {
    // Benchmark-only causality control: preserve worker upper-bound validation,
    // but suppress reconciliation in this runtime instance. No shipping toggle.
    runtime.resultCredits.reconcile = () => {};
  }
  const source = sources.get(config.utilization);
  const bytes = Math.floor(maximum * config.utilization);
  const capacity = maximum * config.capacityBlocks;
  const streamOptions = {
    experimentalMaxBufferedResults: 64,
    experimentalDispatchBatchSize: 1,
    ...(config.mode === 'count'
      ? {}
      : {
          experimentalMaxReservedResultBytes: capacity,
          ...(config.mode === 'exact'
            ? {
                experimentalResultBytes:
                  config.kind === 'rle'
                    ? (partition) => {
                        const started = performance.now();
                        const result = rleSize(
                          source,
                          partition.start,
                          partition.end,
                        );
                        hostSizingMs += performance.now() - started;
                        hostSizingCalls++;
                        return result;
                      }
                    : bytes,
              }
            : { experimentalMaxResultBytes: maximum }),
        }),
  };
  async function consume(record = false) {
    let received = 0;
    let outputBytes = 0;
    let firstResultMs;
    let checksum = 0;
    const started = performance.now();
    for await (const { partition, output } of runtime.streamRange(
      task,
      { start: 0, end: count * grainSize, grainSize },
      (partition) => ({
        input: { partition, source, bytes, move: config.move ?? true },
      }),
      streamOptions,
    )) {
      firstResultMs ??= performance.now() - started;
      outputBytes += output.byteLength;
      if (config.kind === 'rle') {
        let decoded = 0;
        for (let index = 1; index < output.length; index += 2)
          decoded += output[index];
        assert.equal(decoded, partition.end - partition.start);
      } else assert.equal(output.byteLength, bytes);
      checksum ^= output[0] ?? 0;
      received++;
      if (record && config.consumerMs) await delay(config.consumerMs);
    }
    assert.equal(received, count);
    return { received, outputBytes, checksum, firstResultMs };
  }
  try {
    await consume();
    await consume();
    hostSizingMs = 0;
    hostSizingCalls = 0;
    const before = runtime.stats();
    const eventLoop = monitorEventLoopDelay({ resolution: 5 });
    eventLoop.enable();
    const eluBefore = performance.eventLoopUtilization();
    const cpuBefore = process.cpuUsage();
    const memoryBefore = process.memoryUsage();
    const samples = [];
    let peakCredit = 0;
    let peakBuffered = 0;
    const sample = () => {
      const stats = runtime.stats();
      const credit = stats.streamResults.currentReservedResultBytes;
      peakCredit = Math.max(peakCredit, credit);
      peakBuffered = Math.max(
        peakBuffered,
        stats.streamResults.knownBufferedPayloadBytes,
      );
      samples.push({
        elapsedMs: performance.now() - started,
        busy: stats.workers.busy,
        credit,
        buffered: stats.streamResults.knownBufferedPayloadBytes,
        ...runtime.resultCredits.creditDiagnostics(),
      });
    };
    const started = performance.now();
    const timer = setInterval(sample, 2);
    let repetitions = 0;
    let outputBytes = 0;
    let firstResultMs;
    try {
      do {
        const result = await consume(true);
        firstResultMs ??= result.firstResultMs;
        outputBytes += result.outputBytes;
        repetitions++;
      } while (!quick && performance.now() - started < 180);
    } finally {
      clearInterval(timer);
      sample();
      eventLoop.disable();
    }
    const wallMs = performance.now() - started;
    const after = runtime.stats();
    assert.equal(after.streamResults.currentReservedResultBytes, 0);
    assert.deepEqual(runtime.resultCredits.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
    return {
      wallMs,
      repetitions,
      inputBytes: count * grainSize * repetitions,
      outputBytes,
      utilization: outputBytes / (count * maximum * repetitions),
      slackRatio: 1 - outputBytes / (count * maximum * repetitions),
      resultsPerSecond: (count * repetitions * 1000) / wallMs,
      firstResultMs,
      hostSizingMs,
      hostSizingCalls,
      peakCredit,
      peakBuffered,
      reservationWaits:
        after.streamResults.resultByteReservationWaits -
        before.streamResults.resultByteReservationWaits,
      refundBytes:
        after.streamResults.refundedResultBytes -
        before.streamResults.refundedResultBytes,
      refunds:
        after.streamResults.resultByteRefunds -
        before.streamResults.resultByteRefunds,
      workerOccupancy:
        samples.reduce((sum, value) => sum + value.busy / workers, 0) /
        samples.length,
      cpu: process.cpuUsage(cpuBefore),
      memoryBefore,
      memoryAfter: process.memoryUsage(),
      eventLoop: {
        meanMs: Number.isFinite(eventLoop.mean) ? eventLoop.mean / 1e6 : null,
        maxMs: eventLoop.max / 1e6,
        utilization: performance.eventLoopUtilization(eluBefore).utilization,
      },
      samples,
      terminal: runtime.resultCredits.diagnostics(),
    };
  } finally {
    await runtime.shutdown({ drain: false });
  }
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const cv =
    Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    ) / mean;
  return { median, mean, cv, min: sorted[0], max: sorted.at(-1) };
}
const results = cases.map((config) => ({ config, measurements: [] }));
const order = [];
for (let trial = 0; trial < trials; trial++) {
  // Rotate and reverse cases to avoid grouping modes or giving one mode a fixed
  // warm-machine position. Preserve every observation, including outliers.
  const indices = cases.map((_, index) => (index + trial * 7) % cases.length);
  if (trial % 2) indices.reverse();
  for (const index of indices) {
    process.stderr.write(
      `upper-bound trial ${trial + 1}/${trials}: ${cases[index].name}\n`,
    );
    order.push({ trial, name: cases[index].name });
    results[index].measurements.push(await measure(cases[index]));
  }
}
for (const result of results)
  result.summary = Object.fromEntries(
    [
      'resultsPerSecond',
      'firstResultMs',
      'hostSizingMs',
      'workerOccupancy',
      'peakCredit',
      'peakBuffered',
      'refundBytes',
      'reservationWaits',
    ].map((key) => [
      key,
      summarize(result.measurements.map((value) => value[key])),
    ]),
  );
const report = {
  version: '0.12.0',
  timestamp: new Date().toISOString(),
  environment: machineReport({ workers, count, maximum, trials, quick }),
  methodology: {
    warmups: 2,
    targetSampleMs: 180,
    source: 'immutable shared input',
    bound: '2 * input block bytes, value/count RLE with count <= 255',
    output: 'one encoding pass into worst-case scratch, then compact slice',
    heldMaximum:
      'benchmark instance override only; normal upper-bound worker validation retained',
    occupancy: '2ms sampling; short bursts may be missed',
    outliers: 'all retained',
  },
  order,
  results,
};
await writeFile(
  new URL('../results/upper-bound-results-v0.12.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(
  results.map(({ config, summary }) => ({
    name: config.name,
    resultsPerSecond: summary.resultsPerSecond.median.toFixed(1),
    cv: summary.resultsPerSecond.cv.toFixed(3),
    sizingMs: summary.hostSizingMs.median.toFixed(1),
    refundMiB: (summary.refundBytes.median / 2 ** 20).toFixed(1),
  })),
);
