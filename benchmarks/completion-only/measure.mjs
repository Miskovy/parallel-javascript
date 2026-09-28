import assert from 'node:assert/strict';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { availableParallelism } from 'node:os';
import { setTimeout as delayConsumer } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';

const config = JSON.parse(process.argv[2]);
const {
  engine = 'pjs',
  mode,
  kind,
  workers,
  logicalPartitions,
  batchSize = 1,
  trials = 3,
  warmups = 1,
  outputType = 'undefined',
  outputBytes = 0,
  size = logicalPartitions,
  iterations = 32,
  consumerDelayMs = 0,
  orderedConsumer = false,
  collectStreamResults = false,
  slowFirstIterations = 0,
} = config;

let runtime;
let pool;
let task;
if (engine === 'pjs') {
  const registry = new PjsTaskRegistry();
  task = registry.register(
    'completion-benchmark',
    new URL('./task.mjs', import.meta.url),
  );
  runtime = new PjsRuntime({ registry, workers, maxQueue: workers * 16 });
  await runtime.ready();
} else {
  pool = new Piscina({
    filename: fileURLToPath(new URL('./task.mjs', import.meta.url)),
    minThreads: workers,
    maxThreads: workers,
    maxQueue: workers * 16,
    concurrentTasksPerWorker: 1,
  });
}

const grainSize = Math.ceil(size / logicalPartitions);
const chunks = Math.ceil(size / grainSize);
assert.equal(chunks, logicalPartitions);
const partitions = Array.from({ length: chunks }, (_, index) => ({
  index,
  start: index * grainSize,
  end: Math.min(size, (index + 1) * grainSize),
}));

let source;
let output;
let matrix;
if (kind.startsWith('vector')) {
  source = sharedReadonly(
    Float64Array.from({ length: size }, (_, index) => index / 100),
  );
  if (kind === 'vector')
    output = new Float64Array(new SharedArrayBuffer(source.byteLength));
}
if (kind.startsWith('matrix')) {
  const elements = size * size;
  matrix = {
    a: sharedReadonly(
      Float64Array.from({ length: elements }, (_, index) => (index % 7) - 3),
    ),
    b: sharedReadonly(
      Float64Array.from({ length: elements }, (_, index) => (index % 5) - 2),
    ),
  };
  if (kind === 'matrix-shared')
    output = new Float64Array(
      new SharedArrayBuffer(elements * Float64Array.BYTES_PER_ELEMENT),
    );
}

const createInput = (partition, completionOnly = false) => ({
  input: {
    kind,
    partition,
    outputType,
    outputBytes,
    iterations:
      partition.index === 0 && slowFirstIterations
        ? slowFirstIterations
        : iterations,
    completionOnly,
    ...(source ? { source, output } : {}),
    ...(matrix
      ? {
          a: matrix.a,
          b: matrix.b,
          size,
          ...(kind === 'matrix-shared' ? { output } : {}),
        }
      : {}),
  },
});

async function piscinaRange(onResult) {
  let next = 0;
  let dispatches = 0;
  const results = mode === 'collecting' ? new Array(chunks) : undefined;
  await Promise.all(
    Array.from({ length: Math.min(workers, chunks) }, async () => {
      while (next < chunks) {
        const start = next;
        next += batchSize;
        const group = partitions.slice(start, start + batchSize);
        dispatches++;
        const completionOnly = mode === 'completion';
        const value =
          group.length === 1
            ? await pool.run(createInput(group[0], completionOnly).input)
            : await pool.run({
                batchItems: group.map(
                  (partition) => createInput(partition, completionOnly).input,
                ),
                completionOnly,
              });
        if (!completionOnly) {
          const values = group.length === 1 ? [value] : value;
          for (let index = 0; index < group.length; index++) {
            const item = { partition: group[index], output: values[index] };
            if (results) results[item.partition.index] = item.output;
            if (onResult) await onResult(item);
          }
        }
      }
    }),
  );
  return { results, dispatches };
}

async function sample() {
  if (output) output.fill(0);
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
  let executeMessages;
  let firstResultMs = null;
  let peakBufferedResults = 0;
  let delivered = 0;
  if (engine === 'piscina') {
    ({ results, dispatches: executeMessages } = await piscinaRange(
      mode === 'stream'
        ? async () => {
            firstResultMs ??= performance.now() - started;
            delivered++;
            if (consumerDelayMs) await delayConsumer(consumerDelayMs);
          }
        : undefined,
    ));
  } else if (mode === 'completion') {
    await runtime.parallelFor(
      task,
      { start: 0, end: size, grainSize },
      createInput,
      { experimentalDispatchBatchSize: batchSize },
    );
  } else if (mode === 'stream') {
    results = collectStreamResults ? [] : undefined;
    const pending = orderedConsumer ? new Map() : undefined;
    let nextIndex = 0;
    for await (const result of runtime.streamRange(
      task,
      { start: 0, end: size, grainSize },
      createInput,
      {
        experimentalDispatchBatchSize: batchSize,
        experimentalMaxBufferedResults: config.maxBufferedResults ?? workers,
      },
    )) {
      if (pending) {
        pending.set(result.partition.index, result.output);
        while (pending.has(nextIndex)) {
          firstResultMs ??= performance.now() - started;
          results?.push(pending.get(nextIndex));
          pending.delete(nextIndex++);
          delivered++;
        }
        peakBufferedResults = Math.max(peakBufferedResults, pending.size);
      } else {
        firstResultMs ??= performance.now() - started;
        results?.push(result.output);
        delivered++;
      }
      if (consumerDelayMs) await delayConsumer(consumerDelayMs);
    }
  } else {
    results = await runtime.partitionRange(
      task,
      { start: 0, end: size, grainSize },
      createInput,
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
    if (mode === 'stream')
      peakBufferedResults = Math.max(
        peakBufferedResults,
        after.streamResults.peakBuffered,
      );
    executeMessages =
      after.dispatch.executeMessages - before.dispatch.executeMessages;
    assert.equal(
      after.dispatch.logicalPartitions - before.dispatch.logicalPartitions,
      chunks,
    );
  }
  if (mode === 'collecting') assert.equal(results.length, chunks);
  if (mode === 'stream') assert.equal(delivered, chunks);
  if (kind === 'vector')
    for (const value of output) assert.ok(Math.abs(value - 1) < 1e-12);
  if (kind === 'vector-private')
    for (const block of results)
      for (const value of block) assert.ok(Math.abs(value - 1) < 1e-12);
  if (kind === 'matrix-private') {
    const assembled = new Float64Array(size * size);
    results.forEach((value, index) =>
      assembled.set(value, partitions[index].start * size),
    );
    output = assembled;
  }
  if (kind.startsWith('matrix')) {
    for (let row = 0; row < size; row += Math.max(1, size - 1))
      for (let column = 0; column < size; column += Math.max(1, size - 1)) {
        let expected = 0;
        for (let k = 0; k < size; k++)
          expected += matrix.a[row * size + k] * matrix.b[k * size + column];
        assert.equal(output[row * size + column], expected);
      }
  }
  return {
    wallMs,
    cpuMs: (usage.user + usage.system) / 1000,
    cpuPercent: ((usage.user + usage.system) / 1000 / wallMs) * 100,
    machineCpuPercent:
      ((usage.user + usage.system) / 1000 / wallMs / availableParallelism()) *
      100,
    rssBeforeBytes,
    rssAfterBytes: process.memoryUsage().rss,
    peakRssBytes,
    executeMessages,
    resultMessages: executeMessages,
    firstResultMs,
    lastResultMs: wallMs,
    peakBufferedResults,
    declaredSuccessfulOutputBytes:
      mode === 'completion' || engine === 'piscina'
        ? 0
        : outputType === 'large' || outputType === 'large-transfer'
          ? outputBytes * chunks
          : kind === 'matrix-private'
            ? size * size * Float64Array.BYTES_PER_ELEMENT
            : kind === 'vector-private'
              ? size * Float64Array.BYTES_PER_ELEMENT
              : 0,
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
    JSON.stringify({ ...config, chunks, firstRun, samples }),
  );
} finally {
  if (runtime) await runtime.shutdown();
  else await pool.destroy();
}
