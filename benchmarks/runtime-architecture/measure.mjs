import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.argv[2]
  ? process.argv[2]
  : fileURLToPath(new URL('../../', import.meta.url));
const runtimeUrl = pathToFileURL(
  join(root, 'packages/runtime/dist/index.js'),
).href;
process.env.PJS_BENCH_RUNTIME = runtimeUrl;
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = await import(
  runtimeUrl
);

const quick = process.env.PJS_BENCH_QUICK === '1';
const trials = quick ? 2 : 6;
const registry = new PjsTaskRegistry();
const task = registry.register(
  'runtime-architecture',
  new URL('./task.mjs', import.meta.url),
  'execute',
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 4096 });
await runtime.ready();

const logicalCount = quick ? 128 : 1024;
const binaryCount = quick ? 16 : 64;
const cases = [
  {
    name: 'run-noop',
    execute: () =>
      Promise.all(
        Array.from({ length: logicalCount }, (_, value) =>
          runtime.run(task, { kind: 'noop', value }),
        ),
      ),
  },
  {
    name: 'run-medium-cpu',
    execute: () =>
      Promise.all(
        Array.from({ length: quick ? 32 : 128 }, (_, value) =>
          runtime.run(task, {
            kind: 'cpu',
            value,
            iterations: quick ? 20_000 : 100_000,
          }),
        ),
      ),
  },
  {
    name: 'run-clone-input',
    execute: () =>
      Promise.all(
        Array.from({ length: quick ? 16 : 64 }, () => {
          const value = new Uint8Array(256 * 2 ** 10);
          return runtime.run(task, { kind: 'transfer-input', value });
        }),
      ),
  },
  {
    name: 'run-transfer-input',
    execute: () =>
      Promise.all(
        Array.from({ length: quick ? 16 : 64 }, () => {
          const value = new Uint8Array(256 * 2 ** 10);
          return runtime.run(
            task,
            { kind: 'transfer-input', value },
            { transferList: [value.buffer] },
          );
        }),
      ),
  },
  {
    name: 'run-shared-input',
    execute: () => {
      const value = sharedReadonly(new Uint8Array(256 * 2 ** 10).fill(1));
      return Promise.all(
        Array.from({ length: quick ? 32 : 128 }, () =>
          runtime.run(task, { kind: 'shared-input', value }),
        ),
      );
    },
  },
  {
    name: 'partition-range',
    execute: () =>
      runtime.partitionRange(
        task,
        { start: 0, end: logicalCount, grainSize: 1 },
        (partition) => ({ input: { kind: 'range', partition } }),
        { experimentalDispatchBatchSize: 4 },
      ),
  },
  {
    name: 'parallel-for',
    execute: () =>
      runtime.parallelFor(
        task,
        { start: 0, end: logicalCount, grainSize: 1 },
        (partition) => ({ input: { kind: 'range', partition } }),
        { experimentalDispatchBatchSize: 4 },
      ),
  },
  {
    name: 'stream-count-only',
    execute: () =>
      consume(
        runtime.streamRange(
          task,
          { start: 0, end: logicalCount, grainSize: 1 },
          (partition) => ({ input: { kind: 'range', partition } }),
          {
            experimentalDispatchBatchSize: 4,
            experimentalMaxBufferedResults: 8,
          },
        ),
        logicalCount,
      ),
  },
  ...['clone', 'transfer'].map((transport) => ({
    name: `stream-strict-${transport}`,
    execute: () =>
      consume(
        runtime.streamRange(
          task,
          { start: 0, end: binaryCount, grainSize: 1 },
          (partition) => ({
            input: {
              kind: 'binary',
              partition,
              bytes: 256 * 2 ** 10,
              move: transport === 'transfer',
            },
          }),
          {
            experimentalMaxBufferedResults: 8,
            experimentalResultBytes: 256 * 2 ** 10,
            experimentalMaxReservedResultBytes: 2 * 2 ** 20,
          },
        ),
        binaryCount,
      ),
  })),
  {
    name: 'map-generic',
    execute: () =>
      runtime.parallelMapRange(
        task,
        { start: 0, end: logicalCount, grainSize: 4 },
        (partition) => ({ input: { kind: 'map-array', partition } }),
        { experimentalDispatchBatchSize: 4 },
      ),
  },
  {
    name: 'map-typed',
    execute: () =>
      runtime.parallelMapRange(
        task,
        { start: 0, end: logicalCount, grainSize: 4 },
        (partition) => ({ input: { kind: 'map-typed', partition } }),
        {
          experimentalDispatchBatchSize: 4,
          experimentalOutputConstructor: Uint32Array,
        },
      ),
  },
];

async function consume(stream, expected) {
  let count = 0;
  for await (const value of stream) {
    void value;
    count++;
  }
  assert.equal(count, expected);
}

const results = [];
try {
  const selectedCases = process.env.PJS_BENCH_CASE
    ? cases.filter(({ name }) => name === process.env.PJS_BENCH_CASE)
    : cases;
  assert.ok(selectedCases.length > 0, 'Unknown PJS_BENCH_CASE');
  for (const benchmark of selectedCases) {
    const repetitions = quick
      ? 1
      : ({
          'run-noop': 8,
          'run-medium-cpu': 15,
          'run-clone-input': 15,
          'run-transfer-input': 24,
          'run-shared-input': 50,
          'partition-range': 12,
          'parallel-for': 12,
          'stream-count-only': 6,
          'stream-strict-clone': 22,
          'stream-strict-transfer': 55,
          'map-generic': 50,
          'map-typed': 50,
        }[benchmark.name] ?? 10);
    await benchmark.execute();
    await benchmark.execute();
    const samples = [];
    for (let trial = 0; trial < trials; trial++) {
      globalThis.gc?.();
      const started = performance.now();
      for (let repetition = 0; repetition < repetitions; repetition++)
        await benchmark.execute();
      samples.push((performance.now() - started) / repetitions);
    }
    results.push({ name: benchmark.name, repetitions, samples });
  }
  process.stdout.write(JSON.stringify({ trials, results }));
} finally {
  await runtime.shutdown();
}
