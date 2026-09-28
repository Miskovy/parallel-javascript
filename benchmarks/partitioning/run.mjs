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

const suite = process.argv[2] ?? 'all';
assert.ok(['all', 'range', 'matrix', 'skew', 'dispatch'].includes(suite));
assert.ok(
  process.env.PJS_V03_RUNTIME,
  'Set PJS_V03_RUNTIME; see benchmarks/partitioning/README.md',
);
const trials = Number(process.env.PJS_BENCH_TRIALS ?? 5),
  warmups = Number(process.env.PJS_BENCH_WARMUPS ?? 2);
assert.ok(Number.isSafeInteger(trials) && trials > 0);
assert.ok(Number.isSafeInteger(warmups) && warmups >= 0);
const counts = [...new Set([1, 2, 4, availableParallelism()])].filter(
  (n) => n <= availableParallelism(),
);
const factors = [1, 2, 4, 8, 32];
async function measure(config) {
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
      if (code !== 0) return reject(new Error(`Measurement exited ${code}`));
      try {
        resolve(JSON.parse(output));
      } catch (error) {
        reject(error);
      }
    });
  });
}
for (const kind of suite === 'all'
  ? ['range', 'matrix', 'skew', 'dispatch']
  : [suite]) {
  const results = [];
  for (const workers of counts)
    for (const factor of factors) {
      const modes =
        kind === 'range'
          ? ['clone', 'shared', 'transfer']
          : [kind === 'matrix' ? 'shared-transfer' : 'metadata'];
      const offset = counts.indexOf(workers) % modes.length;
      for (const memory of [
        ...modes.slice(offset),
        ...modes.slice(0, offset),
      ]) {
        const engines = ['pjs-manual', 'pjs-owned', 'piscina-manual'];
        const rotation =
          (factors.indexOf(factor) +
            counts.indexOf(workers) +
            modes.indexOf(memory)) %
          engines.length;
        for (const engine of [
          ...engines.slice(rotation),
          ...engines.slice(0, rotation),
        ]) {
          const config = {
            engine,
            kind,
            size: kind === 'range' ? 2 ** 21 : kind === 'matrix' ? 512 : 4096,
            workers,
            memory,
            factor,
            trials,
            warmups,
          };
          const result = await measure(config);
          result.summary = Object.fromEntries(
            [
              'wallMs',
              'cpuPercent',
              'machineCpuPercent',
              'averageQueueMs',
              'averageExecutionMs',
              'averageKernelMs',
              'averageDispatchToKernelMs',
              'factoryMs',
              'kernelWallOccupancy',
              'amortizedWallMsPerChunk',
            ].map((key) => [
              key,
              result.samples[0][key] === null
                ? null
                : median(result.samples.map((s) => s[key])),
            ]),
          );
          result.summary.peakSampledRssBytes = Math.max(
            ...result.samples.map((s) => s.sampledPeakRssBytes),
          );
          results.push(result);
          console.log(
            `${kind} ${memory} w=${workers} factor=${factor} ${engine}: ${result.summary.wallMs.toFixed(3)} ms`,
          );
        }
      }
    }
  const report = {
    timestamp: new Date().toISOString(),
    runtimeVersion: '0.4.0',
    manualRuntimeVersion: '0.3.0',
    baselineCommit: 'f6cd689',
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
      factors,
      isolation:
        'Fresh process/fixed pool per configuration; sequential recorded order, rotated engines/modes. All workers participate in startup barrier.',
      timing:
        'Warm reused input. Original generation and independent validation excluded equally. Shared copy once per config recorded separately. First run separate, then warmups, then all trials. Wall includes lazy payload preparation, dispatch, compute, transport, ordered collection and matrix assembly.',
      producer:
        'PJS v0.3 and Piscina use a bounded workers-sized manual producer. PJS v0.4 owns descriptors and parent lifecycle. All use same grain, kernels and payloads; maxQueue=workers, no pending window above workers.',
      queue:
        'PJS exact admission-to-scheduling and worker execution means use cumulative-counter deltas. Piscina queue/execution null: different histogram boundaries. All engines report worker kernel and host-payload-ready to worker-kernel-start latency (includes serialization/transport, not pure queue time).',
      dispatch:
        'No-op control amortized wall per chunk includes partition bookkeeping, factory, round trip, ordered collection; not isolated dispatch CPU.',
      occupancy:
        'Sum of worker kernel wall intervals / (workers * operation wall); OS preemption included. Per-thread sums include zero-work threads. Proxy, not CPU utilization or exact idle time.',
      memory:
        'RSS every 5ms plus endpoints, no forced GC, synchronous copies can hide peaks. Known numeric backing allocations exclude metadata and allocator overhead. Ordered output storage scales with chunk count/output bytes.',
      piscina:
        'Pinned 5.3.2, minThreads=maxThreads, concurrency one, default sync Atomics. Harness owns partitioning. Successful-work comparison only.',
    },
    results,
  };
  const directory = new URL('../results/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL(`${kind}-partition-v0.4.json`, directory),
    JSON.stringify(report, null, 2) + '\n',
  );
}
