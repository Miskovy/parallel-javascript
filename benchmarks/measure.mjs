import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';
import { countPrimes, referencePrimeCount } from './prime-search/task.mjs';
import {
  matrices,
  multiplyRows,
  referenceMultiply,
} from './matrix-multiplication/task.mjs';

const {
  suite,
  workers,
  sizes,
  trials,
  warmups,
  memory = 'clone',
} = JSON.parse(process.argv[2]);
const registry = new PjsTaskRegistry();
const primeTask = registry.register(
  'primes',
  new URL('./prime-search/task.mjs', import.meta.url),
  'countPrimes',
);
const matrixTask = registry.register(
  'matrix',
  new URL(
    memory === 'transfer'
      ? './transfer/tasks.mjs'
      : './matrix-multiplication/task.mjs',
    import.meta.url,
  ),
  memory === 'transfer' ? 'multiplyRowsTransferred' : 'multiplyRows',
);
const probeTask = registry.register(
  'probe',
  new URL('./cpu-baseline/probe.mjs', import.meta.url),
  'echo',
);
let runtime;
const startupStart = performance.now();
if (workers) {
  runtime = new PjsRuntime({
    registry,
    workers,
    maxQueue: Math.max(1024, workers * 8),
  });
  await runtime.ready();
}
const startupMs = workers ? performance.now() - startupStart : 0;

async function measure(execute) {
  const before = process.memoryUsage().rss;
  let peak = before;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  try {
    const output = await execute();
    const wallMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart);
    const after = process.memoryUsage().rss;
    peak = Math.max(peak, after);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    return {
      output,
      sample: {
        wallMs,
        cpuMs,
        cpuPercent: (cpuMs / wallMs) * 100,
        machineCpuPercent: (cpuMs / wallMs / availableParallelism()) * 100,
        rssBeforeBytes: before,
        rssAfterBytes: after,
        sampledPeakRssBytes: peak,
      },
    };
  } finally {
    clearInterval(timer);
  }
}

const workloads = [];
try {
  assert.deepEqual(
    multiplyRows(matrices(7)).output,
    referenceMultiply(matrices(7)),
  );
  assert.equal(countPrimes({ from: 0, to: 100_000 }).count, 9592);
  for (const size of sizes) {
    const input = suite === 'matrix' ? matrices(size) : { from: 0, to: size };
    const expected =
      suite === 'matrix' ? referenceMultiply(input) : referencePrimeCount(size);
    const chunks = suite === 'matrix' ? Math.min(size, workers || 1) : 32;
    const execute = async () => {
      if (!runtime)
        return suite === 'matrix' ? multiplyRows(input) : countPrimes(input);
      if (suite === 'cpu') {
        const results = await Promise.all(
          Array.from({ length: chunks }, (_, i) =>
            runtime.run(primeTask, {
              from: Math.floor((size * i) / chunks),
              to: Math.floor((size * (i + 1)) / chunks),
            }),
          ),
        );
        return {
          count: results.reduce((sum, result) => sum + result.count, 0),
          threadIds: [...new Set(results.map((result) => result.threadId))],
        };
      }
      const results = await Promise.all(
        Array.from({ length: chunks }, (_, i) => {
          const from = Math.floor((size * i) / chunks);
          const to = Math.floor((size * (i + 1)) / chunks);
          // Compact left row blocks: a subarray would clone the entire backing store.
          const a = input.a.slice(from * size, to * size);
          // The original B is reused across workers/trials; transferring requires dedicated copies.
          const b = memory === 'transfer' ? input.b.slice() : input.b;
          return runtime.run(
            matrixTask,
            { a, b, size, rows: to - from },
            memory === 'transfer' ? { transferList: [a.buffer, b.buffer] } : {},
          );
        }),
      );
      const output = new Float64Array(size * size);
      for (let i = 0; i < results.length; i++)
        output.set(results[i].output, Math.floor((size * i) / chunks) * size);
      return {
        output,
        threadIds: [...new Set(results.map((result) => result.threadId))],
      };
    };
    const validate = (result) =>
      assert.deepEqual(
        suite === 'matrix' ? result.output : result.count,
        expected,
      );
    const first = await measure(execute);
    validate(first.output);
    for (let i = 0; i < warmups; i++) validate(await execute());
    const samples = [];
    const threadIds = new Set();
    for (let i = 0; i < trials; i++) {
      const result = await measure(execute);
      validate(result.output);
      for (const id of result.output.threadIds ?? [result.output.threadId])
        threadIds.add(id);
      samples.push(result.sample);
    }
    let serialChunkedSamples = null;
    if (!runtime && suite === 'cpu') {
      const executeChunked = () => {
        let count = 0;
        for (let i = 0; i < 32; i++)
          count += countPrimes({
            from: Math.floor((size * i) / 32),
            to: Math.floor((size * (i + 1)) / 32),
          }).count;
        return { count };
      };
      for (let i = 0; i < warmups; i++) validate(executeChunked());
      serialChunkedSamples = [];
      for (let i = 0; i < trials; i++) {
        const result = await measure(executeChunked);
        validate(result.output);
        serialChunkedSamples.push(result.sample);
      }
    }
    const correctness =
      suite === 'cpu'
        ? { count: expected }
        : {
            elements: expected.length,
            sum: expected.reduce((sum, value) => sum + value, 0),
            sumSquares: expected.reduce((sum, value) => sum + value * value, 0),
            fullEqualityChecked: true,
          };
    workloads.push({
      size,
      chunks: runtime ? chunks : 1,
      correctness,
      firstRun: first.sample,
      samples,
      serialChunkedSamples,
      threadIds: [...threadIds],
      clonedInputBytesPerRun:
        suite === 'matrix' && runtime && memory === 'clone'
          ? input.a.byteLength + input.b.byteLength * chunks
          : 0,
      preparationCopyBytesPerRun:
        suite === 'matrix' && runtime
          ? input.a.byteLength +
            (memory === 'transfer' ? input.b.byteLength * chunks : 0)
          : 0,
      transferredInputBytesPerRun:
        suite === 'matrix' && runtime && memory === 'transfer'
          ? input.a.byteLength + input.b.byteLength * chunks
          : 0,
      transferredOutputBytesPerRun:
        suite === 'matrix' && runtime && memory === 'transfer'
          ? size * size * 8
          : 0,
    });
  }
  // Diagnostic probes occur after workload measurements, so they do not warm the cold workload.
  let probes = null;
  if (runtime) {
    const roundTrip = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      await runtime.run(probeTask, i);
      if (i >= 20) roundTrip.push(performance.now() - start);
    }
    const cloneRoundTrip = [];
    const buffer = new Uint8Array(8 * 2 ** 20);
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      await runtime.run(probeTask, buffer);
      if (i >= 2) cloneRoundTrip.push(performance.now() - start);
    }
    probes = {
      scalarRoundTripMs: roundTrip,
      eightMiBRoundTripMs: cloneRoundTrip,
    };
  }
  const stats = runtime?.stats() ?? null;
  const shutdownStart = performance.now();
  await runtime?.shutdown();
  process.stdout.write(
    JSON.stringify({
      workers,
      memory,
      startupMs,
      shutdownMs: performance.now() - shutdownStart,
      workloads,
      probes,
      stats,
    }),
  );
} finally {
  await runtime?.shutdown({ drain: false });
}
