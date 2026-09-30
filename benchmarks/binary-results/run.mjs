import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { median } from '../harness.mjs';

const MiB = 2 ** 20;
const KiB = 2 ** 10;
const quick = process.env.PJS_BENCH_QUICK === '1';
const workers = Math.min(4, availableParallelism());
const common = {
  workers,
  count: 64,
  blockBytes: 256 * KiB,
  iterations: 1,
  consumerCostMs: 0,
  trials: quick ? 1 : 3,
  warmups: quick ? 0 : 1,
};
const configurations = [];
for (const countCapacity of [1, 4, 8, 16])
  for (const byteCapacity of [1, 4, 16, 64].map((value) => value * MiB))
    configurations.push({
      suite: 'fixed-matrix',
      engine: 'pjs',
      mode: 'strict',
      transfer: true,
      countCapacity,
      byteCapacity,
      ...common,
    });
configurations.push(
  {
    suite: 'transport',
    engine: 'pjs',
    mode: 'strict',
    transfer: false,
    countCapacity: 8,
    byteCapacity: 4 * MiB,
    ...common,
  },
  {
    suite: 'transport',
    engine: 'pjs',
    mode: 'strict',
    transfer: true,
    countCapacity: 8,
    byteCapacity: 4 * MiB,
    ...common,
  },
  {
    suite: 'opt-in-control',
    engine: 'pjs',
    mode: 'count',
    transfer: true,
    countCapacity: 8,
    byteCapacity: 64 * MiB,
    ...common,
  },
);
const variable = {
  ...common,
  count: 64,
  blockBytes: undefined,
  sizes: [4 * KiB, 16 * KiB, 64 * KiB, 256 * KiB],
  countCapacity: 16,
  transfer: true,
};
for (const consumerCostMs of [0, 1])
  for (const byteCapacity of [512 * KiB, 4 * MiB])
    configurations.push({
      ...variable,
      suite: 'variable-pipeline',
      engine: 'pjs',
      mode: 'strict',
      byteCapacity,
      consumerCostMs,
    });
configurations.push(
  {
    suite: 'object-control',
    engine: 'pjs',
    mode: 'object',
    transfer: false,
    count: 4096,
    blockBytes: 0,
    countCapacity: 8,
    byteCapacity: 0,
    iterations: 4,
    consumerCostMs: 0,
    workers,
    trials: common.trials,
    warmups: common.warmups,
  },
  {
    suite: 'typed-map-control',
    engine: 'pjs',
    mode: 'typed-map',
    transfer: false,
    count: 64,
    blockBytes: 256 * KiB,
    countCapacity: 0,
    byteCapacity: 0,
    iterations: 1,
    consumerCostMs: 0,
    workers,
    trials: common.trials,
    warmups: common.warmups,
  },
  {
    suite: 'piscina-fixed',
    engine: 'piscina',
    mode: 'manual-semaphore',
    transfer: true,
    countCapacity: 8,
    byteCapacity: 4 * MiB,
    ...common,
  },
  {
    ...variable,
    suite: 'piscina-variable',
    engine: 'piscina',
    mode: 'manual-semaphore',
    byteCapacity: 512 * KiB,
    consumerCostMs: 1,
  },
);

function measure(config) {
  return new Promise((resolveResult, reject) => {
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
    child.stdout.on('data', (value) => {
      stdout += value;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`measurement exited ${code}`));
      try {
        resolveResult(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const results = [];
for (const [index, config] of configurations.entries()) {
  process.stderr.write(
    `[${index + 1}/${configurations.length}] ${config.suite} ${config.engine} ${config.mode}\n`,
  );
  results.push(await measure(config));
}
const summary = results.map((result) => ({
  suite: result.suite,
  engine: result.engine,
  mode: result.mode,
  countCapacity: result.countCapacity,
  byteCapacityMiB: result.byteCapacity / MiB,
  consumerCostMs: result.consumerCostMs,
  transfer: result.transfer,
  wallMs: median(result.samples.map((sample) => sample.wallMs)),
  firstMs: median(result.samples.map((sample) => sample.firstResultMs)),
  MiBPerSecond:
    median(result.samples.map((sample) => sample.bytesPerSecond)) / MiB,
  resultsPerSecond: median(
    result.samples.map((sample) => sample.resultsPerSecond),
  ),
  rssMiB: median(result.samples.map((sample) => sample.peakRssBytes)) / MiB,
  averageBusyWorkers: median(
    result.samples.map((sample) => sample.averageBusyWorkers ?? 0),
  ),
  peakReservedMiB:
    median(result.samples.map((sample) => sample.peakReservedResultBytes)) /
    MiB,
  peakBufferedMiB:
    median(result.samples.map((sample) => sample.peakBufferedPayloadBytes)) /
    MiB,
  waits: median(result.samples.map((sample) => sample.reservationWaits ?? 0)),
  messages: median(result.samples.map((sample) => sample.messages)),
  loopDelayMs: median(
    result.samples.map((sample) => sample.eventLoopDelayMaxMs),
  ),
}));
const report = {
  version: '0.9.0',
  timestamp: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpuModel: cpus()[0]?.model,
    availableParallelism: availableParallelism(),
  },
  methodology: {
    workers,
    trials: common.trials,
    warmups: common.warmups,
    isolation: 'fresh process per configuration',
    outliers: 'all retained',
    piscina:
      'application-managed count and declared-byte semaphore held through one serialized consumer',
  },
  results,
  summary,
};
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('binary-results-v0.9.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
