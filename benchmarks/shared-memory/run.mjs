import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  availableParallelism,
  cpus,
  platform,
  release,
  totalmem,
} from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import { median } from '../harness.mjs';

const suite = process.argv[2] ?? 'shared';
assert.ok(['shared', 'matrix', 'piscina'].includes(suite));
const trials = Number(process.env.PJS_BENCH_TRIALS ?? 5);
const warmups = Number(process.env.PJS_BENCH_WARMUPS ?? 2);
assert.ok(Number.isSafeInteger(trials) && trials > 0);
assert.ok(Number.isSafeInteger(warmups) && warmups >= 0);
const counts = [...new Set([1, 2, 4, availableParallelism()])].filter(
  (n) => n <= availableParallelism(),
);
const workloads =
  suite === 'matrix'
    ? [
        ['matrix', 128],
        ['matrix', 512],
      ]
    : suite === 'piscina'
      ? [
          ['cpu', 1_000_000],
          ['range', 2 ** 21],
        ]
      : [['range', 2 ** 21]];
const results = [];
function child(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./measure.mjs', import.meta.url)),
        JSON.stringify(config),
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0)
        return reject(new Error(`Benchmark child failed: ${code}`));
      try {
        resolve(JSON.parse(output));
      } catch (error) {
        reject(error);
      }
    });
  });
}
for (const [kind, size] of workloads)
  for (const workers of counts) {
    // Rotate mode order with worker count; alternate engine order across configs.
    const modes = kind === 'cpu' ? ['clone'] : ['clone', 'transfer', 'shared'];
    const offset = counts.indexOf(workers) % modes.length;
    const ordered = [...modes.slice(offset), ...modes.slice(0, offset)];
    for (const iterations of kind === 'cpu' ? [1] : [1, 5])
      for (const memory of ordered) {
        const engines =
          suite === 'piscina'
            ? results.length % 4 === 0
              ? ['pjs', 'piscina']
              : ['piscina', 'pjs']
            : ['pjs'];
        for (const engine of engines) {
          const config = {
            engine,
            kind,
            size,
            workers,
            memory,
            iterations,
            trials,
            warmups,
          };
          console.log(JSON.stringify(config));
          const result = await child(config);
          result.summary = {
            medianWallMs: median(result.samples.map((s) => s.wallMs)),
            medianAmortizedMs: median(
              result.samples.map((s) => s.amortizedMsPerIteration),
            ),
            medianExecutionMs: median(
              result.samples.map((s) => s.executionMsPerIteration),
            ),
            peakSampledRssBytes: Math.max(
              ...result.samples.map((s) => s.sampledPeakRssBytes),
            ),
          };
          results.push(result);
        }
      }
  }
const report = {
  timestamp: new Date().toISOString(),
  runtimeVersion: '0.5.0',
  piscinaVersion: Piscina.version,
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpuModel: cpus()[0]?.model,
    logicalCpus: cpus().length,
    availableParallelism: availableParallelism(),
    memoryBytes: totalmem(),
  },
  methodology: {
    trials,
    warmups,
    counts,
    workloads,
    isolation:
      'Fresh process and fixed pool per configuration; configurations run sequentially in recorded order.',
    timing:
      'Warm pool; original input generation and independent validation excluded equally. One-shot includes shared allocation/copy, per-task transfer copies, left-row slicing, dispatch, computation, transport and matrix assembly. Reuse sessions include one preparation plus five executions. Raw preparation and execution-only times reported separately.',
    memory:
      'Process-wide RSS every 5ms plus endpoints; synchronous preparation can hide peaks. Known allocation bytes are logical budgets, not physical memory savings. No forced GC; retained outputs and allocator history affect RSS.',
    range:
      'Each task receives the entire common array and sums a disjoint range. Transfer deliberately needs a full copy to model common reference data. Sending only compact ranges is an alternative partitioning workload, not tested here.',
    piscina:
      'Pinned dev dependency; identical kernels and payloads, minThreads=maxThreads, concurrency 1, maxQueue 1024, default sync Atomics. Both pools import via small CPU probes. No cancellation comparison: semantics differ.',
  },
  results,
};
const name = suite === 'matrix' ? 'matrix-shared-v0.5' : `${suite}-v0.5`;
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL(`${name}.json`, directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(
  results.map((r) => ({
    engine: r.engine,
    kind: r.kind,
    workers: r.workers,
    mode: r.memory,
    iterations: r.iterations,
    size: r.size,
    ms: r.summary.medianAmortizedMs.toFixed(3),
    rssMiB: (r.summary.peakSampledRssBytes / 2 ** 20).toFixed(1),
  })),
);
