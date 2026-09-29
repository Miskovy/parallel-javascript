import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { median } from '../harness.mjs';

const quick = process.env.PJS_BENCH_QUICK === '1';
const workers = Math.min(4, availableParallelism());
const configurations = [];
for (const capacity of [1, 4, 8])
  for (const consumerCostMs of [0, 0.25, 1, 5])
    configurations.push({
      workers,
      size: 65_536,
      grainSize: 1024,
      capacity,
      consumerCostMs,
      trials: quick ? 1 : 3,
      warmups: quick ? 0 : 1,
    });

function measure(config) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./pipeline-measure.mjs', import.meta.url)),
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
      if (code !== 0) return reject(new Error(`pipeline child exited ${code}`));
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
    `[${index + 1}/${configurations.length}] capacity ${config.capacity}, consumer ${config.consumerCostMs} ms\n`,
  );
  results.push(await measure(config));
}
const summary = results.map((result) => ({
  capacity: result.capacity,
  consumerCostMs: result.consumerCostMs,
  wallMs: median(result.samples.map((sample) => sample.wallMs)),
  firstMs: median(result.samples.map((sample) => sample.firstResultMs)),
  rssMiB: median(result.samples.map((sample) => sample.peakRssBytes)) / 2 ** 20,
  averageBusyWorkers: median(
    result.samples.map((sample) => sample.averageBusyWorkers),
  ),
  workerUtilization: median(
    result.samples.map((sample) => sample.workerUtilization),
  ),
  peakBuffered: median(
    result.samples.map((sample) => sample.peakBufferedResults),
  ),
  peakKnownKiB:
    median(
      result.samples.map((sample) => sample.peakKnownBufferedPayloadBytes),
    ) / 1024,
  loopDelayMs: median(
    result.samples.map((sample) => sample.eventLoopDelayMaxMs),
  ),
}));
const report = {
  version: '0.8.0',
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
    trials: quick ? 1 : 3,
    warmups: quick ? 0 : 1,
    consumer:
      'SHA-256 block processing, target-duration host CPU stage, then setImmediate async handoff',
    outliers: 'all retained',
    isolation: 'fresh process per configuration',
  },
  results,
  summary,
};
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('map-pipeline-v0.8.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
