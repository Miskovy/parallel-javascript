import { AsyncResource } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  availableParallelism,
  cpus,
  platform,
  release,
  totalmem,
} from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { median } from '../harness.mjs';

const quick = process.env.PJS_BENCH_QUICK === '1';
const trials = quick ? 1 : 3;
const warmups = quick ? 0 : 1;
const workers = Math.min(4, availableParallelism());
const configurations = [];
const add = (suite, values) =>
  configurations.push({ suite, workers, trials, warmups, ...values });

for (const logicalPartitions of [128, 512])
  for (const outputType of ['undefined', 'scalar'])
    for (const batchSize of [1, 4, 8])
      for (const mode of ['collecting', 'completion'])
        add('completion-vs-collecting', {
          engine: 'pjs',
          kind: 'noop',
          mode,
          logicalPartitions,
          batchSize,
          outputType,
        });

for (const mode of ['collecting', 'completion'])
  for (const batchSize of [1, 8])
    add('output-retention-32mib', {
      engine: 'pjs',
      kind: 'noop',
      mode,
      logicalPartitions: 32,
      batchSize,
      outputType: 'large',
      outputBytes: 2 ** 20,
    });

add('vector-transform', {
  engine: 'pjs',
  kind: 'vector',
  mode: 'completion',
  logicalPartitions: 128,
  batchSize: 4,
  size: 2 ** 18,
  iterations: 16,
});
add('matrix-private', {
  engine: 'pjs',
  kind: 'matrix-private',
  mode: 'collecting',
  logicalPartitions: 16,
  batchSize: 1,
  size: 128,
});
add('matrix-shared', {
  engine: 'pjs',
  kind: 'matrix-shared',
  mode: 'completion',
  logicalPartitions: 16,
  batchSize: 4,
  size: 128,
});
for (const batchSize of [1, 8])
  add('piscina-completion', {
    engine: 'piscina',
    kind: 'noop',
    mode: 'completion',
    logicalPartitions: 512,
    batchSize,
    outputType: 'scalar',
  });
for (const mode of ['collecting', 'completion'])
  add('cpu-control', {
    engine: 'pjs',
    kind: 'cpu',
    mode,
    logicalPartitions: 32,
    batchSize: 1,
    iterations: 250_000,
  });

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
    `[${index + 1}/${configurations.length}] ${config.suite} ${config.engine} ${config.mode} n${config.logicalPartitions} b${config.batchSize}\n`,
  );
  results.push(await measure(config));
}

function asyncResourceControl(mode, count = 512, rounds = quick ? 100 : 1000) {
  const samples = [];
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    if (mode === 'none') {
      for (let index = 0; index < count; index++) void index;
    } else if (mode === 'operation') {
      const resource = new AsyncResource('PjsBenchmarkOperation', {
        requireManualDestroy: true,
      });
      resource.runInAsyncScope(() => {
        for (let index = 0; index < count; index++) void index;
      });
      resource.emitDestroy();
    } else {
      for (let index = 0; index < count; index++) {
        const resource = new AsyncResource('PjsBenchmarkChild', {
          requireManualDestroy: true,
        });
        resource.runInAsyncScope(() => {});
        resource.emitDestroy();
      }
    }
    samples.push(performance.now() - started);
  }
  return { mode, count, rounds, samples, medianMs: median(samples) };
}

const asyncResource = ['none', 'operation', 'per-child'].map((mode) =>
  asyncResourceControl(mode),
);
const summary = results.map((result) => ({
  suite: result.suite,
  engine: result.engine,
  mode: result.mode,
  kind: result.kind,
  logicalPartitions: result.logicalPartitions,
  batchSize: result.batchSize,
  medianWallMs: median(result.samples.map((sample) => sample.wallMs)),
  medianCpuPercent: median(result.samples.map((sample) => sample.cpuPercent)),
  medianPeakRssMiB:
    median(result.samples.map((sample) => sample.peakRssBytes)) / 2 ** 20,
  medianExecuteMessages: median(
    result.samples.map((sample) => sample.executeMessages),
  ),
  medianEventLoopDelayMaxMs: median(
    result.samples.map((sample) => sample.eventLoopDelayMaxMs),
  ),
  medianEventLoopUtilization: median(
    result.samples.map((sample) => sample.eventLoopUtilization),
  ),
  declaredSuccessfulOutputBytes:
    result.samples[0].declaredSuccessfulOutputBytes,
}));
const report = {
  version: '0.6.0',
  timestamp: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpuModel: cpus()[0]?.model,
    availableParallelism: availableParallelism(),
    totalMemoryBytes: totalmem(),
  },
  methodology: {
    trials,
    warmups,
    quick,
    processIsolation: 'fresh process and fixed pool per configuration',
    outputBytes:
      'exact typed-array payload bytes for retained large/matrix outputs; completion messages contain no task output',
    rss: 'process-wide 2ms sampling plus endpoints; no forced GC or baseline subtraction',
    eventLoop:
      'monitorEventLoopDelay, eventLoopUtilization delta, and an independent 1ms timer drift probe',
    piscina:
      'bounded manual producer; completion tasks explicitly return undefined; this is a generic transport comparison, not an equivalent algorithm API',
    asyncResource:
      'same-process allocation/scope micro-control; none and per-child are synthetic and not alternate runtime implementations',
  },
  results,
  summary,
  asyncResource,
};
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('completion-only-v0.6.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
console.table(
  asyncResource.map((row) => ({
    mode: row.mode,
    count: row.count,
    rounds: row.rounds,
    medianMs: row.medianMs,
  })),
);
