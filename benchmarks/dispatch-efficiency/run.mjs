import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  availableParallelism,
  cpus,
  loadavg,
  platform,
  release,
  totalmem,
} from 'node:os';
import { median } from '../harness.mjs';

const quick = process.env.PJS_BENCH_QUICK === '1';
const trials = quick ? 1 : 3;
const warmups = quick ? 0 : 1;
const configurations = [];
const add = (suite, values) =>
  configurations.push({ suite, trials, warmups, ...values });
const workerCounts = [1, 2, Math.min(4, availableParallelism())].filter(
  (value, index, all) => all.indexOf(value) === index,
);
const counts = [1, 2, 4, 8, 16, 32, 128, 512];

for (const workers of workerCounts)
  for (const logicalPartitions of counts) {
    add('noop', {
      engine: 'pjs-manual',
      kind: 'noop',
      workers,
      logicalPartitions,
      outputType: 'scalar',
    });
    add('noop', {
      engine: 'piscina-manual',
      kind: 'noop',
      workers,
      logicalPartitions,
      outputType: 'scalar',
    });
    for (const batchSize of [1, 2, 4, 8, 16])
      if (batchSize <= logicalPartitions)
        add('noop', {
          engine: 'pjs-owned',
          kind: 'noop',
          workers,
          logicalPartitions,
          batchSize,
          outputType: 'scalar',
        });
    for (const batchSize of [4, 16])
      if (batchSize <= logicalPartitions)
        add('noop', {
          engine: 'piscina-batched',
          kind: 'noop',
          workers,
          logicalPartitions,
          batchSize,
          outputType: 'scalar',
        });
  }

const factors = [1, 2, 4, 8, 32];
for (const factor of factors) {
  const logicalPartitions = Math.min(128, 4 * factor);
  for (const batchSize of [1, 2, 4, 8])
    add('shared-grain-batch', {
      engine: 'pjs-owned',
      kind: 'shared',
      workers: 4,
      logicalPartitions,
      batchSize,
      size: 262_144,
    });
  for (const engine of ['pjs-manual', 'piscina-manual'])
    add('shared-grain-batch', {
      engine,
      kind: 'shared',
      workers: 4,
      logicalPartitions,
      size: 262_144,
    });
  add('shared-grain-batch', {
    engine: 'piscina-batched',
    kind: 'shared',
    workers: 4,
    logicalPartitions,
    batchSize: 4,
    size: 262_144,
  });
}

for (const kind of ['skew', 'stable-skew'])
  for (const factor of factors) {
    const logicalPartitions = 4 * factor;
    for (const batchSize of [1, 2, 4, 8])
      add(kind, {
        engine: 'pjs-owned',
        kind,
        workers: 4,
        logicalPartitions,
        batchSize,
        size: 512,
      });
    add(kind, {
      engine: 'pjs-manual',
      kind,
      workers: 4,
      logicalPartitions,
      size: 512,
    });
  }

for (const factor of factors) {
  const logicalPartitions = 4 * factor;
  for (const batchSize of [1, 2, 4, 8])
    add('matrix', {
      engine: 'pjs-owned',
      kind: 'matrix',
      workers: 4,
      logicalPartitions,
      batchSize,
      size: 128,
    });
  for (const engine of ['pjs-manual', 'piscina-manual'])
    add('matrix', {
      engine,
      kind: 'matrix',
      workers: 4,
      logicalPartitions,
      size: 128,
    });
}

for (const outputType of ['undefined', 'scalar', 'object', 'typed', 'large']) {
  for (const collect of [true, false])
    add('output-retention', {
      engine: 'pjs-manual',
      kind: 'noop',
      workers: 4,
      logicalPartitions: 512,
      outputType,
      collect,
      outputBytes: outputType === 'large' ? 65_536 : 0,
    });
  add('output-retention', {
    engine: 'pjs-owned',
    kind: 'noop',
    workers: 4,
    logicalPartitions: 512,
    batchSize: 8,
    outputType,
    collect: true,
    outputBytes: outputType === 'large' ? 65_536 : 0,
  });
}

// Important endpoint is repeated in balanced independent process order.
for (const [session, engine, batchSize] of [
  ['A1', 'pjs-manual', 1],
  ['B1', 'pjs-owned', 8],
  ['B2', 'pjs-owned', 8],
  ['A2', 'pjs-manual', 1],
  ['C1', 'piscina-manual', 1],
  ['D1', 'piscina-batched', 8],
  ['D2', 'piscina-batched', 8],
  ['C2', 'piscina-manual', 1],
])
  add('balanced-session', {
    session,
    engine,
    kind: 'noop',
    workers: 4,
    logicalPartitions: 512,
    batchSize,
    outputType: 'scalar',
  });

async function measure(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        new URL('./measure.mjs', import.meta.url).pathname,
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
    `[${index + 1}/${configurations.length}] ${config.suite} ${config.engine} w${config.workers} n${config.logicalPartitions} b${config.batchSize ?? 1}\n`,
  );
  const hostBefore = {
    loadavg: loadavg(),
    cpuMHz: cpus().map((cpu) => cpu.speed),
  };
  const result = await measure(config);
  results.push({ hostBefore, ...result });
}

const summary = results.map((result) => ({
  suite: result.suite,
  engine: result.engine,
  kind: result.kind,
  workers: result.workers,
  logicalPartitions: result.logicalPartitions,
  batchSize: result.batchSize ?? 1,
  outputType: result.outputType,
  collect: result.collect,
  medianWallMs: median(result.samples.map((sample) => sample.wallMs)),
  medianExecuteMessages: median(
    result.samples.map((sample) => sample.executeMessages),
  ),
  medianCpuPercent: median(result.samples.map((sample) => sample.cpuPercent)),
  medianPeakRssBytes: median(
    result.samples.map((sample) => sample.peakRssBytes),
  ),
  medianEventLoopDelayMaxMs: median(
    result.samples.map((sample) => sample.eventLoopDelayMaxMs),
  ),
  medianTimerDriftMs: median(
    result.samples.map((sample) => sample.maxTimerDriftMs),
  ),
}));

const report = {
  version: '0.5.0',
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
    outliers: 'all retained',
    order: 'recorded array order; key 4-worker/512 endpoint repeated A/B/B/A',
    limits:
      'No affinity, governor control, exclusive host, hardware counters, or forced GC.',
  },
  results,
  summary,
};
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('dispatch-efficiency-v0.5.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(
  summary.filter(
    (row) =>
      row.suite === 'balanced-session' ||
      (row.suite === 'noop' &&
        row.workers === 4 &&
        row.logicalPartitions === 512),
  ),
);
