import assert from 'node:assert/strict';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';
import { originalSkew, stableSkew } from './kernel.mjs';

const config = JSON.parse(process.argv[2]);
const {
  engine,
  kind,
  workers,
  logicalPartitions,
  batchSize = 1,
  trials = 3,
  warmups = 1,
  outputType = 'scalar',
  outputBytes = 65_536,
  collect = true,
  size = logicalPartitions,
  scale = kind === 'stable-skew' ? 64 : 16,
} = config;
const grainSize = Math.ceil(size / logicalPartitions);
const chunks = Math.ceil(size / grainSize);
assert.equal(chunks, logicalPartitions);

let runtime;
let pool;
let task;
if (engine.startsWith('pjs')) {
  const registry = new PjsTaskRegistry();
  task = registry.register(
    'dispatch-efficiency',
    new URL('./pjs-task.mjs', import.meta.url),
  );
  runtime = new PjsRuntime({ registry, workers, maxQueue: workers * 16 });
  await runtime.ready();
} else {
  pool = new Piscina({
    filename: fileURLToPath(new URL('./piscina-task.mjs', import.meta.url)),
    minThreads: workers,
    maxThreads: workers,
    maxQueue: workers * 16,
    concurrentTasksPerWorker: 1,
  });
}

const submit = (input) =>
  runtime ? runtime.run(task, input) : pool.run(input);
const barrier = new SharedArrayBuffer(4);
const probes = await Promise.all(
  Array.from({ length: workers }, () =>
    submit({ kind: 'probe', barrier, workers }),
  ),
);
assert.equal(new Set(probes.map((probe) => probe.threadId)).size, workers);

const source =
  kind === 'shared'
    ? sharedReadonly(
        Float64Array.from({ length: size }, (_, index) => index % 251),
      )
    : undefined;
const matrix =
  kind === 'matrix'
    ? {
        a: Float64Array.from(
          { length: size * size },
          (_, index) => (index % 7) - 3,
        ),
        b: sharedReadonly(
          Float64Array.from(
            { length: size * size },
            (_, index) => (index % 5) - 2,
          ),
        ),
      }
    : undefined;
const partitions = Array.from({ length: chunks }, (_, index) => ({
  index,
  start: index * grainSize,
  end: Math.min(size, (index + 1) * grainSize),
}));
const createInput = (partition) => ({
  input: {
    kind,
    partition,
    outputType,
    outputBytes,
    scale,
    ...(source ? { data: source } : {}),
    ...(matrix
      ? {
          a: matrix.a.slice(partition.start * size, partition.end * size),
          b: matrix.b,
          dimension: size,
        }
      : {}),
  },
});

function validate(results) {
  if (!collect) return;
  assert.equal(results.length, chunks);
  if (kind === 'noop') {
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (outputType === 'undefined') assert.equal(result, undefined);
      else if (outputType === 'scalar') assert.equal(result, index);
      else if (outputType === 'object') assert.equal(result.index, index);
      else if (outputType === 'typed') assert.equal(result[0], index);
      else assert.equal(result.byteLength, outputBytes);
    }
    return;
  }
  for (const [index, result] of results.entries())
    assert.equal(result.index, index);
  if (kind === 'matrix') {
    const assembled = new Float64Array(size * size);
    for (const [index, result] of results.entries())
      assembled.set(result.output, partitions[index].start * size);
    for (let row = 0; row < size; row++)
      for (let column = 0; column < size; column++) {
        let expected = 0;
        for (let k = 0; k < size; k++)
          expected += matrix.a[row * size + k] * matrix.b[k * size + column];
        assert.equal(assembled[row * size + column], expected);
      }
    return;
  }
  const value = results.reduce(
    (sum, result) =>
      kind === 'stable-skew' ? (sum + result.value) | 0 : sum + result.value,
    0,
  );
  if (kind === 'shared') {
    let expected = 0;
    for (let index = 0; index < source.length; index++)
      expected += source[index];
    assert.equal(value, expected);
  } else if (kind === 'skew') assert.equal(value, originalSkew(0, size, scale));
  else if (kind === 'stable-skew')
    assert.equal(value, stableSkew(0, size, scale));
}

async function boundedManual(physicalBatchSize) {
  const groups = [];
  for (let index = 0; index < partitions.length; index += physicalBatchSize)
    groups.push(partitions.slice(index, index + physicalBatchSize));
  const results = collect ? new Array(chunks) : [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, groups.length) }, async () => {
      while (next < groups.length) {
        const group = groups[next++];
        if (engine === 'piscina-batched') {
          const output = await submit({
            batchItems: group.map((partition) => createInput(partition).input),
          });
          if (collect)
            for (let offset = 0; offset < output.length; offset++)
              results[group[offset].index] = output[offset];
        } else {
          for (const partition of group) {
            const output = await submit(createInput(partition).input);
            if (collect) results[partition.index] = output;
          }
        }
      }
    }),
  );
  return { results, physicalDispatches: groups.length };
}

async function sample() {
  const before = runtime?.stats();
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
  const eluBefore = performance.eventLoopUtilization();
  const cpuBefore = process.cpuUsage();
  const started = performance.now();
  let results;
  let physicalDispatches;
  if (engine === 'pjs-owned') {
    results = await runtime.partitionRange(
      task,
      { start: 0, end: size, grainSize },
      createInput,
      { experimentalDispatchBatchSize: batchSize },
    );
  } else {
    const measured = await boundedManual(
      engine === 'piscina-batched' ? batchSize : 1,
    );
    results = measured.results;
    physicalDispatches = measured.physicalDispatches;
  }
  const wallMs = performance.now() - started;
  const usage = process.cpuUsage(cpuBefore);
  const elu = performance.eventLoopUtilization(eluBefore);
  delay.disable();
  clearInterval(rssTimer);
  clearInterval(driftTimer);
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  validate(results);
  const after = runtime?.stats();
  if (runtime) {
    physicalDispatches =
      after.dispatch.executeMessages - before.dispatch.executeMessages;
    assert.equal(
      after.dispatch.logicalTasks - before.dispatch.logicalTasks,
      chunks,
    );
  }
  return {
    wallMs,
    cpuMs: (usage.user + usage.system) / 1000,
    cpuPercent: ((usage.user + usage.system) / 1000 / wallMs) * 100,
    machineCpuPercent:
      ((usage.user + usage.system) / 1000 / wallMs / availableParallelism()) *
      100,
    logicalPartitions: chunks,
    executeMessages: physicalDispatches,
    resultMessages: physicalDispatches,
    microsecondsPerLogicalPartition: (wallMs * 1000) / chunks,
    microsecondsPerPhysicalDispatch: (wallMs * 1000) / physicalDispatches,
    rssBeforeBytes,
    rssAfterBytes: process.memoryUsage().rss,
    peakRssBytes,
    eventLoopUtilization: elu.utilization,
    eventLoopDelayMeanMs: Number.isFinite(delay.mean) ? delay.mean / 1e6 : null,
    eventLoopDelayMaxMs: delay.max / 1e6,
    maxTimerDriftMs,
  };
}

try {
  const firstRun = await sample();
  for (let index = 0; index < warmups; index++) await sample();
  const samples = [];
  for (let index = 0; index < trials; index++) samples.push(await sample());
  process.stdout.write(
    JSON.stringify({
      ...config,
      grainSize,
      chunks,
      firstRun,
      samples,
    }),
  );
} finally {
  if (runtime) await runtime.shutdown();
  else await pool.destroy();
}
