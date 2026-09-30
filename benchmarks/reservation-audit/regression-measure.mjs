import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const quick = process.env.PJS_BENCH_QUICK === '1';
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = await import(
  pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href
);
const registry = new PjsTaskRegistry();
const completionTask = registry.register(
  'v010-regression-completion',
  new URL('../completion-only/task.mjs', import.meta.url),
);
const binaryTask = registry.register(
  'v010-regression-binary',
  pathToFileURL(join(root, 'benchmarks/binary-results/task.mjs')),
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 4096 });
await runtime.ready();

const cases = [
  { name: 'run-noop', kind: 'run', count: quick ? 128 : 1024 },
  { name: 'parallel-noop-b8', kind: 'parallel', count: quick ? 256 : 2048 },
  { name: 'stream-count-b4', kind: 'count', count: quick ? 256 : 2048 },
  {
    name: 'strict-clone-fixed-256k',
    kind: 'strict-fixed',
    count: quick ? 16 : 64,
  },
  {
    name: 'strict-transfer-fixed-256k',
    kind: 'strict-transfer-fixed',
    count: quick ? 16 : 64,
  },
  {
    name: 'strict-transfer-callback-256k',
    kind: 'strict-transfer-callback',
    count: quick ? 16 : 64,
  },
];
const payload = (partition) => ({
  input: {
    kind: 'noop',
    outputType: 'scalar',
    partition,
  },
});

async function execute(entry) {
  if (entry.kind === 'run') {
    await Promise.all(
      Array.from({ length: entry.count }, (_, index) =>
        runtime.run(
          completionTask,
          payload({ index, start: index, end: index + 1 }).input,
        ),
      ),
    );
    return;
  }
  if (entry.kind === 'parallel') {
    await runtime.parallelFor(
      completionTask,
      { start: 0, end: entry.count, grainSize: 1 },
      payload,
      { experimentalDispatchBatchSize: 8 },
    );
    return;
  }
  const strict = entry.kind.startsWith('strict');
  const move = entry.kind.includes('transfer');
  const callback = entry.kind.includes('callback');
  const bytes = strict ? 256 * 2 ** 10 : 0;
  const source = strict
    ? sharedReadonly(Uint8Array.from({ length: 1024 }, (_, index) => index))
    : undefined;
  let received = 0;
  for await (const { output } of runtime.streamRange(
    strict ? binaryTask : completionTask,
    { start: 0, end: entry.count, grainSize: 1 },
    (partition) =>
      strict
        ? {
            input: {
              partition,
              source,
              bytes,
              iterations: 0,
              pjsTransfer: move,
            },
          }
        : payload(partition),
    {
      experimentalDispatchBatchSize: move ? 1 : 4,
      experimentalMaxBufferedResults: 8,
      ...(strict
        ? {
            experimentalResultBytes: callback ? () => bytes : bytes,
            experimentalMaxReservedResultBytes: 2 * 2 ** 20,
          }
        : {}),
    },
  )) {
    if (strict) assert.equal(output.byteLength, bytes);
    received++;
  }
  assert.equal(received, entry.count);
}

const results = [];
try {
  for (const entry of cases) {
    await execute(entry);
    const samples = [];
    for (let trial = 0; trial < (quick ? 1 : 5); trial++) {
      const started = performance.now();
      await execute(entry);
      samples.push({ wallMs: performance.now() - started });
    }
    results.push({ ...entry, samples });
  }
  process.stdout.write(JSON.stringify({ results }));
} finally {
  await runtime.shutdown();
}
