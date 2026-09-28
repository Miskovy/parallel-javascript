import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { median } from '../harness.mjs';

const quick = process.env.PJS_BENCH_QUICK === '1';
const trials = quick ? 1 : 3;
const warmups = quick ? 0 : 1;
const workers = Math.min(4, availableParallelism());
const configurations = [];
const add = (suite, values) =>
  configurations.push({ suite, workers, trials, warmups, ...values });

for (const mode of ['collecting', 'completion'])
  add('large-output', {
    engine: 'pjs',
    kind: 'noop',
    mode,
    logicalPartitions: 32,
    batchSize: 1,
    outputType: 'large-transfer',
    outputBytes: 2 ** 20,
  });
for (const maxBufferedResults of [1, 4, 8])
  for (const consumerDelayMs of [0, 2])
    add(consumerDelayMs ? 'slow-stream' : 'fast-stream', {
      engine: 'pjs',
      kind: 'noop',
      mode: 'stream',
      logicalPartitions: 32,
      batchSize: 4,
      outputType: 'large-transfer',
      outputBytes: 2 ** 20,
      maxBufferedResults,
      consumerDelayMs,
    });
for (const orderedConsumer of [false, true])
  add('ordering', {
    engine: 'pjs',
    kind: 'cpu',
    mode: 'stream',
    logicalPartitions: 128,
    batchSize: 4,
    outputType: 'scalar',
    maxBufferedResults: 8,
    orderedConsumer,
    slowFirstIterations: 20_000_000,
  });
add('stream-collect', {
  engine: 'pjs',
  kind: 'noop',
  mode: 'stream',
  logicalPartitions: 512,
  batchSize: 8,
  outputType: 'scalar',
  maxBufferedResults: 8,
  collectStreamResults: true,
});
add('partition-collect', {
  engine: 'pjs',
  kind: 'noop',
  mode: 'collecting',
  logicalPartitions: 512,
  batchSize: 8,
  outputType: 'scalar',
});
add('shared-output', {
  engine: 'pjs',
  kind: 'vector',
  mode: 'completion',
  logicalPartitions: 128,
  size: 262_144,
  batchSize: 4,
  iterations: 32,
});
add('numeric-stream-collect', {
  engine: 'pjs',
  kind: 'vector-private',
  mode: 'stream',
  logicalPartitions: 128,
  size: 262_144,
  batchSize: 4,
  iterations: 32,
  maxBufferedResults: 8,
  collectStreamResults: true,
});
add('numeric-partition-collect', {
  engine: 'pjs',
  kind: 'vector-private',
  mode: 'collecting',
  logicalPartitions: 128,
  size: 262_144,
  batchSize: 4,
  iterations: 32,
});
for (const mode of ['collecting', 'stream'])
  for (const batchSize of [1, 8])
    add('piscina-manual', {
      engine: 'piscina',
      kind: 'noop',
      mode,
      logicalPartitions: 512,
      batchSize,
      outputType: 'scalar',
    });
for (const batchSize of [1, 8])
  add('piscina-manual', {
    engine: 'piscina',
    kind: 'noop',
    mode: 'completion',
    logicalPartitions: 512,
    batchSize,
    outputType: 'scalar',
  });

function measure(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL('../completion-only/measure.mjs', import.meta.url),
        ),
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
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const results = [];
for (const [index, config] of configurations.entries()) {
  process.stderr.write(
    `[${index + 1}/${configurations.length}] ${config.suite}\n`,
  );
  results.push(await measure(config));
}
const summary = results.map((result) => ({
  suite: result.suite,
  engine: result.engine,
  mode: result.mode,
  batch: result.batchSize,
  buffer: result.maxBufferedResults,
  delayMs: result.consumerDelayMs,
  ordered: result.orderedConsumer,
  medianWallMs: median(result.samples.map((sample) => sample.wallMs)),
  medianFirstResultMs: median(
    result.samples.map((sample) => sample.firstResultMs ?? sample.wallMs),
  ),
  medianPeakRssMiB:
    median(result.samples.map((sample) => sample.peakRssBytes)) / 2 ** 20,
  medianPeakBuffered: median(
    result.samples.map((sample) => sample.peakBufferedResults),
  ),
  medianEventLoopDelayMaxMs: median(
    result.samples.map((sample) => sample.eventLoopDelayMaxMs),
  ),
}));
const report = {
  version: '0.7.0',
  timestamp: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpuModel: cpus()[0]?.model,
    availableParallelism: availableParallelism(),
  },
  methodology: {
    trials,
    warmups,
    workers,
    outliers: 'all retained',
    isolation: 'fresh process per configuration',
    piscina:
      'bounded manual producer returning undefined; not equivalent AsyncIterable semantics',
  },
  results,
  summary,
};
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('result-streaming-v0.7.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
