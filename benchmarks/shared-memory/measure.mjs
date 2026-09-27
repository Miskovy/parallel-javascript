import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';
import { matrices, referenceMultiply } from '../matrix-multiplication/task.mjs';
import { referencePrimeCount } from '../prime-search/task.mjs';
import { prefixSum } from './kernel.mjs';

const config = JSON.parse(process.argv[2]);
const { engine, kind, size, workers, memory, iterations, trials, warmups } =
  config;
let runtime, pool, task;
const startupStart = performance.now();
if (engine === 'pjs') {
  const registry = new PjsTaskRegistry();
  task = registry.register(
    'compute',
    new URL('./pjs-task.mjs', import.meta.url),
  );
  runtime = new PjsRuntime({ registry, workers, maxQueue: 1024 });
  await runtime.ready();
} else {
  pool = new Piscina({
    filename: fileURLToPath(new URL('./piscina-task.mjs', import.meta.url)),
    minThreads: workers,
    maxThreads: workers,
    maxQueue: 1024,
    concurrentTasksPerWorker: 1,
  });
}
// Equal small CPU dispatch barrier warms task import in both pools. Piscina has
// no ready() equivalent; startup includes these probes and is not a ranking.
const submit = (input, transferList = []) =>
  runtime
    ? runtime.run(task, input, { transferList })
    : pool.run(input, { transferList });
await Promise.all(
  Array.from({ length: workers }, () =>
    submit({ kind: 'cpu', from: 0, to: 10 }),
  ),
);
const startupMs = performance.now() - startupStart;
const input =
  kind === 'matrix'
    ? matrices(size)
    : kind === 'range'
      ? Float64Array.from({ length: size }, (_, i) => i % 251)
      : null;
const expected =
  kind === 'matrix'
    ? referenceMultiply(input)
    : kind === 'cpu'
      ? referencePrimeCount(size)
      : prefixSum(size);
const chunks = kind === 'cpu' ? 32 : Math.min(workers, size);
const source = kind === 'matrix' ? input.b : input;
const bytes = source?.byteLength ?? 0;
const validate = (runs) => {
  for (const { results, assembled } of runs) {
    if (kind === 'matrix') {
      assert.deepEqual(assembled, expected);
    } else if (kind === 'cpu')
      assert.equal(
        results.reduce((sum, result) => sum + result.count, 0),
        expected,
      );
    else {
      results.forEach((result, i) => {
        assert.equal(
          result.sum,
          prefixSum(Math.floor((size * (i + 1)) / chunks)) -
            prefixSum(Math.floor((size * i) / chunks)),
        );
        assert.equal(result.shared, memory === 'shared');
      });
      assert.equal(
        results.reduce((sum, result) => sum + result.sum, 0),
        expected,
      );
    }
  }
};

async function sample() {
  const before = process.memoryUsage().rss;
  let peak = before;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);
  const cpuStart = process.cpuUsage(),
    start = performance.now();
  const shared = memory === 'shared' ? sharedReadonly(source) : null;
  const preparationMs = performance.now() - start;
  const executionStart = performance.now();
  const runs = [],
    threadIds = new Set();
  try {
    for (let iteration = 0; iteration < iterations; iteration++) {
      const results = await Promise.all(
        Array.from({ length: chunks }, (_, i) => {
          const from = Math.floor((size * i) / chunks),
            to = Math.floor((size * (i + 1)) / chunks);
          if (kind === 'cpu') return submit({ kind, from, to });
          const common =
            shared ?? (memory === 'transfer' ? source.slice() : source);
          const transferList = memory === 'transfer' ? [common.buffer] : [];
          if (kind === 'range')
            return submit(
              { kind, memory, data: common, from, to },
              transferList,
            );
          const a = input.a.slice(from * size, to * size);
          if (memory !== 'clone') transferList.push(a.buffer);
          return submit(
            { kind, memory, a, b: common, size, rows: to - from },
            transferList,
          );
        }),
      );
      // Include result assembly in timing, in all matrix modes.
      let assembled;
      if (kind === 'matrix') {
        assembled = new Float64Array(size * size);
        results.forEach((result, i) =>
          assembled.set(result.output, Math.floor((size * i) / chunks) * size),
        );
      }
      runs.push({ results, assembled });
    }
    const end = performance.now(),
      usage = process.cpuUsage(cpuStart);
    const after = process.memoryUsage().rss;
    peak = Math.max(peak, after);
    validate(runs);
    for (const { results } of runs)
      for (const result of results) threadIds.add(result.threadId);
    const wallMs = end - start,
      cpuMs = (usage.user + usage.system) / 1000;
    return {
      wallMs,
      preparationMs,
      executionMsPerIteration: (end - executionStart) / iterations,
      amortizedMsPerIteration: wallMs / iterations,
      cpuMs,
      cpuPercent: (cpuMs / wallMs) * 100,
      machineCpuPercent: (cpuMs / wallMs / availableParallelism()) * 100,
      rssBeforeBytes: before,
      rssAfterBytes: after,
      sampledPeakRssBytes: peak,
      threadIds: [...threadIds],
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
  const leftBytes = kind === 'matrix' ? bytes : 0;
  process.stdout.write(
    JSON.stringify({
      ...config,
      startupMs,
      firstRun,
      samples,
      correctness: { independentOracle: true, allResultsChecked: true },
      allocation: {
        sourceBytes: kind === 'matrix' ? bytes * 2 : bytes,
        commonInputBytes: bytes,
        sharedBufferBytes: memory === 'shared' ? bytes : 0,
        sharedPreparationCopyBytesPerSession: memory === 'shared' ? bytes : 0,
        temporaryPreparationBytesPerIteration:
          leftBytes + (memory === 'transfer' ? bytes * chunks : 0),
        clonedInputBytesPerIteration:
          memory === 'clone' ? leftBytes + bytes * chunks : 0,
        transferredInputBytesPerIteration:
          memory === 'transfer'
            ? leftBytes + bytes * chunks
            : memory === 'shared'
              ? leftBytes
              : 0,
        outputBackingBytesPerIteration: kind === 'matrix' ? bytes : 0,
        scalarResultsPerIteration: kind === 'matrix' ? 0 : chunks,
        assemblyAllocationBytesPerIteration: leftBytes,
        retainedOutputBytesPerSession:
          kind === 'matrix' ? 2 * bytes * iterations : 0,
        note: 'Known numeric payload backing bytes, not serialized metadata, V8 overhead or exact physical residency; original input retained in every mode.',
      },
      piscinaVersion: Piscina.version,
    }),
  );
} finally {
  await runtime?.shutdown({ drain: false });
  await pool?.destroy();
}
