import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Piscina from 'piscina';
import { matrices, referenceMultiply } from '../matrix-multiplication/task.mjs';
import { prefixSum } from '../shared-memory/kernel.mjs';
import { skewOracle } from './kernel.mjs';

const config = JSON.parse(process.argv[2]);
const { engine, kind, size, workers, memory, factor, trials, warmups } = config;
const grainSize = Math.ceil(size / (workers * factor));
const chunks = Math.ceil(size / grainSize);
if (engine === 'pjs-manual') {
  assert.ok(
    process.env.PJS_V03_RUNTIME,
    'Set PJS_V03_RUNTIME to archived v0.3 dist/index.js',
  );
  process.env.PJS_BENCH_RUNTIME = pathToFileURL(
    process.env.PJS_V03_RUNTIME,
  ).href;
} else delete process.env.PJS_BENCH_RUNTIME;
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = await import(
  process.env.PJS_BENCH_RUNTIME ?? '@pjavascript/runtime'
);
let runtime, pool, task;
const startupStart = performance.now();
if (engine !== 'piscina-manual') {
  const registry = new PjsTaskRegistry();
  task = registry.register(
    'partition-compute',
    new URL('./pjs-task.mjs', import.meta.url),
  );
  runtime = new PjsRuntime({ registry, workers, maxQueue: workers });
  await runtime.ready();
} else
  pool = new Piscina({
    filename: fileURLToPath(new URL('./piscina-task.mjs', import.meta.url)),
    minThreads: workers,
    maxThreads: workers,
    maxQueue: workers,
    concurrentTasksPerWorker: 1,
  });
const submit = ({ input, transferList = [] }) =>
  runtime
    ? runtime.run(task, input, { transferList })
    : pool.run(input, { transferList });
const barrier = new SharedArrayBuffer(4);
const probes = await Promise.all(
  Array.from({ length: workers }, () =>
    submit({ input: { kind: 'probe', barrier, workers } }),
  ),
);
const threadIds = probes.map((p) => p.threadId);
assert.equal(new Set(threadIds).size, workers);
const startupMs = performance.now() - startupStart;
const source =
  kind === 'matrix'
    ? matrices(size)
    : kind === 'range'
      ? Float64Array.from({ length: size }, (_, i) => i % 251)
      : null;
const expected =
  kind === 'matrix'
    ? referenceMultiply(source)
    : kind === 'range'
      ? prefixSum(size)
      : kind === 'skew'
        ? skewOracle(0, size)
        : 0;
const preparationStart = performance.now();
const shared =
  kind === 'matrix'
    ? sharedReadonly(source.b)
    : memory === 'shared'
      ? sharedReadonly(source)
      : null;
const preparationMs = performance.now() - preparationStart;
const timingDelta = (before, after, key, count) =>
  (after[key] * after[count] - before[key] * before[count]) /
  (after[count] - before[count]);

async function sample() {
  const beforeStats = runtime?.stats();
  const rssBeforeBytes = process.memoryUsage().rss;
  let sampledPeakRssBytes = rssBeforeBytes,
    factoryMs = 0,
    generated = 0;
  const timer = setInterval(() => {
    sampledPeakRssBytes = Math.max(
      sampledPeakRssBytes,
      process.memoryUsage().rss,
    );
  }, 5);
  const cpuStart = process.cpuUsage(),
    start = performance.now();
  function prepare(partition) {
    const begin = performance.now();
    generated++;
    const input = { kind, partition, size },
      transferList = [];
    if (kind === 'range') {
      input.data =
        shared ??
        (memory === 'transfer'
          ? source.slice(partition.start, partition.end)
          : source);
      input.offset = memory === 'transfer' ? partition.start : 0;
      if (memory === 'transfer') transferList.push(input.data.buffer);
    } else if (kind === 'matrix') {
      input.a = source.a.slice(partition.start * size, partition.end * size);
      input.b = shared;
      transferList.push(input.a.buffer);
    }
    factoryMs += performance.now() - begin;
    input.submittedNs = process.hrtime.bigint();
    return { input, transferList };
  }
  try {
    let results;
    if (engine === 'pjs-owned')
      results = await runtime.partitionRange(
        task,
        { start: 0, end: size, grainSize },
        prepare,
      );
    else {
      // Fixed-size producer Promise array; descriptors and data are generated lazily.
      results = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(workers, chunks) }, async () => {
          while (next < chunks) {
            const index = next++,
              from = index * grainSize;
            results[index] = await submit(
              prepare({
                index,
                start: from,
                end: Math.min(size, from + grainSize),
              }),
            );
          }
        }),
      );
    }
    let assembled,
      sum = 0;
    if (kind === 'matrix') {
      assembled = new Float64Array(size * size);
      for (const r of results)
        assembled.set(r.output, r.partition.start * size);
    } else for (const r of results) sum += r.sum;
    const wallMs = performance.now() - start,
      usage = process.cpuUsage(cpuStart);
    const rssAfterBytes = process.memoryUsage().rss;
    sampledPeakRssBytes = Math.max(sampledPeakRssBytes, rssAfterBytes);
    clearInterval(timer);
    const afterStats = runtime?.stats();
    assert.equal(generated, chunks);
    assert.equal(results.length, chunks);
    let boundary = 0;
    for (const [index, result] of results.entries()) {
      assert.equal(result.partition.index, index);
      assert.equal(result.partition.start, boundary);
      assert.ok(result.partition.end > boundary);
      boundary = result.partition.end;
      if (kind === 'range') {
        assert.equal(
          result.sum,
          prefixSum(boundary) - prefixSum(result.partition.start),
        );
        assert.equal(result.shared, memory === 'shared');
      } else if (kind === 'skew')
        assert.equal(result.sum, skewOracle(result.partition.start, boundary));
      else if (kind === 'matrix') assert.equal(result.shared, true);
    }
    assert.equal(boundary, size);
    if (kind === 'matrix') assert.deepEqual(assembled, expected);
    else assert.equal(sum, expected);
    if (runtime) {
      assert.equal(
        afterStats.tasks.accepted - beforeStats.tasks.accepted,
        chunks,
      );
      assert.equal(
        afterStats.tasks.completed - beforeStats.tasks.completed,
        chunks,
      );
      if (engine === 'pjs-owned') {
        assert.equal(
          afterStats.operations.completed - beforeStats.operations.completed,
          1,
        );
        assert.equal(afterStats.operations.pending, 0);
      }
    }
    const workerKernelMs = Object.fromEntries(threadIds.map((id) => [id, 0]));
    for (const r of results) workerKernelMs[r.threadId] += r.kernelMs;
    const kernelMs = results.reduce((n, r) => n + r.kernelMs, 0);
    const cpuMs = (usage.user + usage.system) / 1000;
    return {
      wallMs,
      cpuMs,
      cpuPercent: (cpuMs / wallMs) * 100,
      machineCpuPercent: (cpuMs / wallMs / availableParallelism()) * 100,
      factoryMs,
      chunks,
      rssBeforeBytes,
      rssAfterBytes,
      sampledPeakRssBytes,
      averageQueueMs: runtime
        ? timingDelta(
            beforeStats.timing,
            afterStats.timing,
            'averageQueueMs',
            'queueSamples',
          )
        : null,
      averageExecutionMs: runtime
        ? timingDelta(
            beforeStats.timing,
            afterStats.timing,
            'averageExecutionMs',
            'executionSamples',
          )
        : null,
      averageKernelMs: kernelMs / chunks,
      averageDispatchToKernelMs:
        results.reduce((n, r) => n + r.dispatchToKernelMs, 0) / chunks,
      workerKernelMs,
      kernelWallOccupancy: kernelMs / (workers * wallMs),
      amortizedWallMsPerChunk: wallMs / chunks,
    };
  } finally {
    clearInterval(timer);
  }
}
try {
  const firstRun = await sample();
  for (let i = 0; i < warmups; i++) await sample();
  const samples = [];
  for (let i = 0; i < trials; i++) samples.push(await sample());
  const bytes =
    kind === 'matrix' ? size * size * 8 : kind === 'range' ? size * 8 : 0;
  process.stdout.write(
    JSON.stringify({
      ...config,
      grainSize,
      chunks,
      startupMs,
      preparationMs,
      firstRun,
      samples,
      runtimeVersion:
        engine === 'pjs-manual'
          ? '0.3.0'
          : engine === 'pjs-owned'
            ? '0.5.0'
            : null,
      allocation: {
        sourceBytes: kind === 'matrix' ? bytes * 2 : bytes,
        sharedBytes: shared?.byteLength ?? 0,
        preparationCopyBytesPerOperation:
          kind === 'matrix' || memory === 'transfer' ? bytes : 0,
        clonedInputBytesPerOperation: memory === 'clone' ? bytes * chunks : 0,
        transferredInputBytesPerOperation:
          kind === 'matrix' || memory === 'transfer' ? bytes : 0,
        outputBytesPerOperation: kind === 'matrix' ? bytes : 0,
        assemblyBytesPerOperation: kind === 'matrix' ? bytes : 0,
      },
      correctness: { independentOracle: true, allOutputsChecked: true },
    }),
  );
} finally {
  await runtime?.shutdown({ drain: false });
  await pool?.destroy();
}
