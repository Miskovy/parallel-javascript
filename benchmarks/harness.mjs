import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  availableParallelism,
  cpus,
  totalmem,
  platform,
  release,
} from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function child(suite, workers, sizes, trials, warmups, memory) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      globalThis.process.execPath,
      [
        fileURLToPath(new URL('./measure.mjs', import.meta.url)),
        JSON.stringify({ suite, workers, sizes, trials, warmups, memory }),
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let output = '';
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', (data) => {
      output += data;
    });
    process.on('error', reject);
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Benchmark child failed (${code})`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function runSuite(
  suite,
  defaults,
  {
    memory = 'clone',
    outputName = process.env.PJS_BENCH_OUTPUT ?? `${suite}-v0.5`,
  } = {},
) {
  assert.ok(memory === 'clone' || memory === 'transfer');
  assert.match(outputName, /^[a-z0-9][a-z0-9.-]*$/);
  const sizes = process.env.PJS_BENCH_SIZES
    ? process.env.PJS_BENCH_SIZES.split(',').map(Number)
    : defaults;
  const trials = Number(process.env.PJS_BENCH_TRIALS ?? 5);
  const warmups = Number(process.env.PJS_BENCH_WARMUPS ?? 2);
  assert.ok(
    sizes.length &&
      sizes.every((size) => Number.isSafeInteger(size) && size >= 2),
  );
  assert.ok(Number.isSafeInteger(trials) && trials >= 1);
  assert.ok(Number.isSafeInteger(warmups) && warmups >= 0);
  const counts = [...new Set([0, 1, 2, 4, availableParallelism()])].filter(
    (count) => count <= availableParallelism(),
  );
  const results = [];
  // Serial first supplies the reference. Reverse parallel counts to avoid always testing the largest pool last.
  for (const workers of [0, ...counts.slice(1).reverse()]) {
    console.log(
      `Measuring ${suite}: ${workers === 0 ? 'serial' : `${workers} workers`}...`,
    );
    results.push(await child(suite, workers, sizes, trials, warmups, memory));
  }
  results.sort((a, b) => a.workers - b.workers);
  const serial = results.find((result) => result.workers === 0);
  const table = [];
  for (const size of sizes) {
    const baseline = serial.workloads.find(
      (workload) => workload.size === size,
    );
    const serialMs = median(baseline.samples.map((sample) => sample.wallMs));
    for (const result of results) {
      const workload = result.workloads.find(
        (workload) => workload.size === size,
      );
      assert.deepEqual(workload.correctness, baseline.correctness);
      const wallMs = median(workload.samples.map((sample) => sample.wallMs));
      workload.summary = {
        medianWallMs: wallMs,
        speedup: serialMs / wallMs,
        parallelEfficiency: result.workers
          ? serialMs / wallMs / result.workers
          : null,
      };
      table.push({
        size,
        workers: result.workers || 'serial',
        rawWallMs: workload.samples
          .map((sample) => sample.wallMs.toFixed(3))
          .join(', '),
        medianMs: wallMs.toFixed(3),
        speedup: workload.summary.speedup.toFixed(3),
        efficiency: workload.summary.parallelEfficiency?.toFixed(3) ?? '-',
        startupMs: result.startupMs.toFixed(3),
        sampledPeakRssMiB: (
          Math.max(
            ...workload.samples.map((sample) => sample.sampledPeakRssBytes),
          ) /
          2 ** 20
        ).toFixed(1),
      });
    }
  }
  const report = {
    timestamp: new Date().toISOString(),
    suite,
    memory,
    runtimeVersion: JSON.parse(
      await readFile(
        new URL('../packages/runtime/package.json', import.meta.url),
        'utf8',
      ),
    ).version,
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
      sizes,
      order: [0, ...counts.slice(1).reverse()],
      isolation:
        'fresh process per worker count; fixed pool reused across sizes',
      timing:
        'input partitioning and required dedicated-buffer copies, dispatch, execution, result transport and assembly included; input generation and validation excluded',
      memory:
        'process-wide RSS sampled every 5ms plus endpoints; may miss brief peaks',
      cpu: 'process.cpuUsage delta divided by wall time; 100% is one logical CPU, normalized percentage divides by availableParallelism',
      cold: 'startup measured once per configuration; first execution recorded separately for every size; only the first size follows a fresh startup',
      repetitions:
        'every raw sample retained; medians used for speedup; no GC forcing or outlier removal',
    },
    results,
  };
  const directory = new URL('./results/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const file = new URL(`${outputName}.json`, directory);
  await writeFile(file, JSON.stringify(report, null, 2) + '\n');
  console.table(table);
  console.log(`Raw report: ${fileURLToPath(file)}`);
  return report;
}
