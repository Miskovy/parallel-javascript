import assert from 'node:assert/strict';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';
import { transformValue } from './task.mjs';

const config = JSON.parse(process.argv[2]);
const {
  engine,
  mode,
  size,
  grainSize,
  workers,
  batchSize,
  iterations,
  trials,
  warmups,
  kind = 'typed',
} = config;
const partitions = Array.from(
  { length: Math.ceil(size / grainSize) },
  (_, index) => ({
    index,
    start: index * grainSize,
    end: Math.min(size, (index + 1) * grainSize),
  }),
);
const sourceValues = Float64Array.from(
  { length: size },
  (_, index) => (index % 1009) / 17,
);
const source =
  engine === 'pjs'
    ? sharedReadonly(sourceValues)
    : engine === 'piscina'
      ? new Float64Array(new SharedArrayBuffer(sourceValues.byteLength))
      : sourceValues;
if (engine === 'piscina') source.set(sourceValues);
let runtime;
let pool;
let task;
if (engine === 'pjs') {
  const registry = new PjsTaskRegistry();
  task = registry.register(
    'mapping-benchmark',
    new URL('./task.mjs', import.meta.url),
  );
  runtime = new PjsRuntime({ registry, workers, maxQueue: workers * 16 });
  await runtime.ready();
} else if (engine === 'piscina') {
  pool = new Piscina({
    filename: fileURLToPath(new URL('./task.mjs', import.meta.url)),
    minThreads: workers,
    maxThreads: workers,
    maxQueue: workers * 16,
    concurrentTasksPerWorker: 1,
  });
}

const input = (partition) => ({
  input: {
    partition,
    source,
    kind,
    iterations,
    pjsTransfer: mode.includes('transfer'),
  },
});

async function piscinaBlocks(transferBlocks) {
  const result = kind === 'objects' ? new Array(size) : new Float64Array(size);
  let next = 0;
  let assemblyMs = 0;
  let messages = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < partitions.length) {
        const partition = partitions[next++];
        messages++;
        const block = await pool.run({
          ...input(partition).input,
          pjsTransfer: false,
          piscinaTransfer: transferBlocks,
        });
        const started = performance.now();
        if (Array.isArray(result))
          for (let index = 0; index < block.length; index++)
            result[partition.start + index] = block[index];
        else result.set(block, partition.start);
        assemblyMs += performance.now() - started;
      }
    }),
  );
  return { result, assemblyMs, messages };
}

async function sample() {
  const rssBeforeBytes = process.memoryUsage().rss;
  let peakRssBytes = rssBeforeBytes;
  const rssTimer = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, 2);
  let expectedAt = performance.now() + 1;
  let maxTimerDriftMs = 0;
  const driftTimer = setInterval(() => {
    const now = performance.now();
    maxTimerDriftMs = Math.max(maxTimerDriftMs, now - expectedAt);
    expectedAt = now + 1;
  }, 1);
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const cpuBefore = process.cpuUsage();
  const eluBefore = performance.eventLoopUtilization();
  const before = runtime?.stats();
  const started = performance.now();
  let result;
  let firstResultMs = null;
  let assemblyMs = 0;
  let messages = 0;
  if (engine === 'serial') {
    result = kind === 'objects' ? new Array(size) : new Float64Array(size);
    for (let index = 0; index < size; index++) {
      const score = transformValue(sourceValues[index], index, iterations);
      result[index] =
        kind === 'objects'
          ? { index, score, category: Math.abs(Math.trunc(score)) % 7 }
          : score;
    }
  } else if (engine === 'piscina') {
    ({ result, assemblyMs, messages } = await piscinaBlocks(
      mode.includes('transfer'),
    ));
  } else if (mode === 'map-array' || mode === 'map-objects') {
    result = await runtime.parallelMapRange(
      task,
      { start: 0, end: size, grainSize },
      input,
      { experimentalDispatchBatchSize: batchSize },
    );
  } else if (mode.startsWith('map-typed')) {
    result = await runtime.parallelMapRange(
      task,
      { start: 0, end: size, grainSize },
      input,
      {
        experimentalDispatchBatchSize: batchSize,
        experimentalOutputConstructor: Float64Array,
      },
    );
  } else if (mode === 'partition-blocks') {
    const blocks = await runtime.partitionRange(
      task,
      { start: 0, end: size, grainSize },
      input,
      { experimentalDispatchBatchSize: batchSize },
    );
    const assemblyStarted = performance.now();
    result = new Float64Array(size);
    blocks.forEach((block, index) =>
      result.set(block, partitions[index].start),
    );
    assemblyMs = performance.now() - assemblyStarted;
  } else if (mode.startsWith('stream')) {
    result = mode.startsWith('stream-collect')
      ? new Float64Array(size)
      : undefined;
    for await (const item of runtime.streamRange(
      task,
      { start: 0, end: size, grainSize },
      input,
      {
        experimentalDispatchBatchSize: batchSize,
        experimentalMaxBufferedResults: config.maxBufferedResults,
      },
    )) {
      firstResultMs ??= performance.now() - started;
      if (result) {
        const assemblyStarted = performance.now();
        result.set(item.output, item.partition.start);
        assemblyMs += performance.now() - assemblyStarted;
      }
    }
  } else if (mode === 'shared') {
    result = new Float64Array(new SharedArrayBuffer(size * 8));
    await runtime.parallelFor(
      task,
      { start: 0, end: size, grainSize },
      (partition) => ({
        input: {
          partition,
          source,
          output: result,
          kind: 'shared',
          iterations,
        },
      }),
      { experimentalDispatchBatchSize: batchSize },
    );
  }
  const wallMs = performance.now() - started;
  const usage = process.cpuUsage(cpuBefore);
  const elu = performance.eventLoopUtilization(eluBefore);
  delay.disable();
  clearInterval(rssTimer);
  clearInterval(driftTimer);
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  if (runtime) {
    const after = runtime.stats();
    messages = after.dispatch.executeMessages - before.dispatch.executeMessages;
    if (mode.startsWith('map-'))
      assemblyMs = after.mapResults.assemblyMs - before.mapResults.assemblyMs;
  }
  if (result) {
    assert.equal(result.length, size);
    for (const index of [0, Math.floor(size / 2), size - 1]) {
      const expected = transformValue(sourceValues[index], index, iterations);
      const actual = kind === 'objects' ? result[index].score : result[index];
      assert.ok(Math.abs(actual - expected) < 1e-12);
    }
  }
  return {
    wallMs,
    firstResultMs,
    assemblyMs,
    cpuMs: (usage.user + usage.system) / 1000,
    peakRssBytes,
    messages,
    resultCount: size,
    knownOutputBytes: kind === 'objects' ? null : size * 8,
    eventLoopUtilization: elu.utilization,
    eventLoopDelayMaxMs: delay.max / 1e6,
    maxTimerDriftMs,
  };
}

try {
  const firstRun = await sample();
  for (let index = 0; index < warmups; index++) await sample();
  const samples = [];
  for (let index = 0; index < trials; index++) samples.push(await sample());
  process.stdout.write(JSON.stringify({ ...config, firstRun, samples }));
} finally {
  if (runtime) await runtime.shutdown();
  if (pool) await pool.destroy();
}
