import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { machineReport } from '../environment.mjs';

const KiB = 2 ** 10;
const MiB = 2 ** 20;
const quick = process.env.PJS_BENCH_QUICK === '1';
const sizes = [
  0,
  64,
  KiB,
  4 * KiB,
  16 * KiB,
  64 * KiB,
  256 * KiB,
  MiB,
  8 * MiB,
];
const workers = Math.min(4, availableParallelism());
const rounds = quick ? 1 : Number(process.env.PJS_BENCH_ROUNDS ?? 2);
const trials = quick ? 1 : Number(process.env.PJS_BENCH_TRIALS ?? 4);
const warmups = quick ? 0 : Number(process.env.PJS_BENCH_WARMUPS ?? 1);

function countFor(bytes) {
  if (bytes === 0) return quick ? 256 : 4096;
  const targetBytes = quick
    ? 4 * MiB
    : bytes >= 64 * KiB
      ? 256 * MiB
      : 32 * MiB;
  return Math.min(
    quick ? 2048 : 8192,
    Math.max(quick ? 4 : 8, Math.ceil(targetBytes / bytes)),
  );
}

function measure(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./measure.mjs', import.meta.url)),
        JSON.stringify(config),
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`measurement exited ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}
function statistics(values) {
  assert.ok(values.length > 0);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    samples: values.length,
    median: percentile(values, 0.5),
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    p95: percentile(values, 0.95),
    coefficientOfVariation: mean === 0 ? 0 : Math.sqrt(variance) / mean,
  };
}

const results = [];
let completed = 0;
const total = sizes.length * 2 * rounds * 3;
for (const bytes of sizes) {
  for (const move of [false, true]) {
    for (let round = 0; round < rounds; round++) {
      const order =
        round % 2
          ? ['callback', 'fixed', 'count']
          : ['count', 'fixed', 'callback'];
      for (const mode of order) {
        const config = {
          bytes,
          move,
          mode,
          round,
          workers,
          count: countFor(bytes),
          trials,
          warmups,
        };
        process.stderr.write(
          `[${++completed}/${total}] ${bytes} ${move ? 'transfer' : 'clone'} ${mode}\n`,
        );
        results.push(await measure(config));
      }
    }
  }
}

const summary = [];
for (const bytes of sizes)
  for (const move of [false, true])
    for (const mode of ['count', 'fixed', 'callback']) {
      const matching = results.filter(
        (result) =>
          result.bytes === bytes &&
          result.move === move &&
          result.mode === mode,
      );
      const samples = matching.flatMap((result) => result.samples);
      summary.push({
        bytes,
        transport: move ? 'transfer' : 'clone',
        mode,
        wallMs: statistics(samples.map((sample) => sample.wallMs)),
        resultsPerSecond: statistics(
          samples.map((sample) => sample.resultsPerSecond),
        ),
        MiBPerSecond: statistics(
          samples.map((sample) => sample.bytesPerSecond / MiB),
        ),
        cpuMs: statistics(samples.map((sample) => sample.cpuMs)),
        eventLoopDelayMaxMs: statistics(
          samples.map((sample) => sample.eventLoopDelayMaxMs),
        ),
        declarationMs: statistics(
          samples.map((sample) => sample.declarationMs),
        ),
      });
    }

const relative = [];
for (const bytes of sizes)
  for (const transport of ['clone', 'transfer']) {
    const entries = summary.filter(
      (entry) => entry.bytes === bytes && entry.transport === transport,
    );
    const control = entries.find((entry) => entry.mode === 'count').wallMs
      .median;
    for (const entry of entries)
      relative.push({
        bytes,
        transport,
        mode: entry.mode,
        medianWallMs: entry.wallMs.median,
        relativeToCount: entry.wallMs.median / control,
        coefficientOfVariation: entry.wallMs.coefficientOfVariation,
      });
  }

const report = {
  version: '0.10.0',
  timestamp: new Date().toISOString(),
  environment: machineReport({ workers, quick }),
  methodology: {
    sizes,
    rounds,
    trials,
    warmups,
    order: 'A/B/C then C/B/A by round; fresh process per configuration',
    samples: 'all retained; no outlier removal; no forced GC',
    workload:
      'direct binary outputs; input construction excluded; output allocation and transport included',
  },
  results,
  summary,
  relative,
};
await mkdir(new URL('../results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../results/reservation-performance-v0.10.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(relative);
