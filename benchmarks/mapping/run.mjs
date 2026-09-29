import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { median } from '../harness.mjs';

const quick = process.env.PJS_BENCH_QUICK === '1';
const workers = Math.min(4, availableParallelism());
const common = { workers, trials: quick ? 1 : 3, warmups: quick ? 0 : 1 };
const numeric = {
  size: 262_144,
  grainSize: 4096,
  iterations: 16,
  batchSize: 4,
};
const objects = { size: 32_768, grainSize: 512, iterations: 8, batchSize: 4 };
const bufferControl = {
  size: 4096,
  grainSize: 1,
  iterations: 0,
  batchSize: 16,
};
const configurations = [
  { suite: 'numeric', engine: 'serial', mode: 'serial', ...numeric },
  {
    suite: 'numeric',
    engine: 'pjs',
    mode: 'map-array',
    kind: 'array',
    ...numeric,
  },
  { suite: 'numeric', engine: 'pjs', mode: 'map-typed-clone', ...numeric },
  { suite: 'numeric', engine: 'pjs', mode: 'map-typed-transfer', ...numeric },
  { suite: 'numeric', engine: 'pjs', mode: 'partition-blocks', ...numeric },
  {
    suite: 'numeric',
    engine: 'pjs',
    mode: 'stream-discard-transfer',
    maxBufferedResults: 4,
    ...numeric,
  },
  {
    suite: 'numeric',
    engine: 'pjs',
    mode: 'stream-collect-transfer',
    maxBufferedResults: 4,
    ...numeric,
  },
  { suite: 'numeric', engine: 'pjs', mode: 'shared', ...numeric },
  {
    suite: 'objects',
    engine: 'serial',
    mode: 'serial',
    kind: 'objects',
    ...objects,
  },
  {
    suite: 'objects',
    engine: 'pjs',
    mode: 'map-objects',
    kind: 'objects',
    ...objects,
  },
  {
    suite: 'objects',
    engine: 'piscina',
    mode: 'collect-clone',
    kind: 'objects',
    ...objects,
  },
  { suite: 'numeric', engine: 'piscina', mode: 'collect-clone', ...numeric },
  { suite: 'numeric', engine: 'piscina', mode: 'collect-transfer', ...numeric },
  ...[8, 64, 256].map((maxBufferedResults) => ({
    suite: 'buffer-control',
    engine: 'pjs',
    mode: 'stream-discard-transfer',
    maxBufferedResults,
    ...bufferControl,
  })),
].map((config) => ({ ...common, ...config }));

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
    `[${index + 1}/${configurations.length}] ${config.engine} ${config.mode}\n`,
  );
  results.push(await measure(config));
}
const summary = results.map((result) => ({
  suite: result.suite,
  engine: result.engine,
  mode: result.mode,
  maxBufferedResults: result.maxBufferedResults ?? null,
  wallMs: median(result.samples.map((sample) => sample.wallMs)),
  firstMs: median(
    result.samples.map((sample) => sample.firstResultMs ?? sample.wallMs),
  ),
  assemblyMs: median(result.samples.map((sample) => sample.assemblyMs)),
  rssMiB: median(result.samples.map((sample) => sample.peakRssBytes)) / 2 ** 20,
  messages: median(result.samples.map((sample) => sample.messages)),
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
    trials: common.trials,
    warmups: common.warmups,
    isolation: 'fresh process per configuration',
    outliers: 'all retained',
  },
  results,
  summary,
};
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('element-map-v0.8.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
