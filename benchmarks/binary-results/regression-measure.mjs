import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = await import(
  pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href
);
const registry = new PjsTaskRegistry();
const completionTask = registry.register(
  'v09-regression-completion',
  new URL('../completion-only/task.mjs', import.meta.url),
);
const mapTask = registry.register(
  'v09-regression-map',
  new URL('../mapping/task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 1024 });
await runtime.ready();

const noopCases = [
  { name: 'run-noop', kind: 'run', count: 1024 },
  {
    name: 'run-transfer-8mib',
    kind: 'transfer',
    count: 32,
    bytes: 8 * 2 ** 20,
  },
  { name: 'run-shared-8mib', kind: 'shared', count: 128, bytes: 8 * 2 ** 20 },
  { name: 'partition-noop-b1', kind: 'partition', count: 2048, batchSize: 1 },
  { name: 'partition-noop-b8', kind: 'partition', count: 2048, batchSize: 8 },
  { name: 'parallel-noop-b1', kind: 'parallel', count: 2048, batchSize: 1 },
  { name: 'parallel-noop-b8', kind: 'parallel', count: 2048, batchSize: 8 },
  { name: 'stream-count-only-b1', kind: 'stream', count: 2048, batchSize: 1 },
  { name: 'stream-count-only-b8', kind: 'stream', count: 2048, batchSize: 8 },
];
const mapCases = [
  { name: 'map-generic', kind: 'map-generic', count: 65_536 },
  { name: 'map-typed', kind: 'map-typed', count: 65_536 },
];
const cases = [...noopCases, ...mapCases];

const payload = (index, data) => ({
  kind: 'noop',
  partition: { index, start: index, end: index + 1 },
  outputType: 'scalar',
  ...(data ? { data } : {}),
});

async function execute(entry) {
  if (entry.kind === 'partition' || entry.kind === 'parallel') {
    const method =
      entry.kind === 'partition' ? 'partitionRange' : 'parallelFor';
    return runtime[method](
      completionTask,
      { start: 0, end: entry.count, grainSize: 1 },
      (partition) => ({ input: payload(partition.index) }),
      { experimentalDispatchBatchSize: entry.batchSize },
    );
  }
  if (entry.kind === 'stream') {
    let received = 0;
    for await (const result of runtime.streamRange(
      completionTask,
      { start: 0, end: entry.count, grainSize: 1 },
      (partition) => ({ input: payload(partition.index) }),
      {
        experimentalDispatchBatchSize: entry.batchSize,
        experimentalMaxBufferedResults: 8,
      },
    )) {
      void result;
      received++;
    }
    assert.equal(received, entry.count);
    return;
  }
  if (entry.kind === 'transfer') {
    for (let index = 0; index < entry.count; index++) {
      const data = new Uint8Array(entry.bytes);
      await runtime.run(completionTask, payload(index, data), {
        transferList: [data.buffer],
      });
    }
    return;
  }
  if (entry.kind === 'shared') {
    const data = sharedReadonly(new Uint8Array(entry.bytes));
    await Promise.all(
      Array.from({ length: entry.count }, (_, index) =>
        runtime.run(completionTask, payload(index, data)),
      ),
    );
    return;
  }
  if (entry.kind === 'map-generic' || entry.kind === 'map-typed') {
    const source = sharedReadonly(
      Float64Array.from({ length: entry.count }, (_, index) => index % 251),
    );
    const result = await runtime.parallelMapRange(
      mapTask,
      { start: 0, end: entry.count, grainSize: 1024 },
      (partition) => ({
        input: {
          partition,
          source,
          kind: entry.kind === 'map-generic' ? 'array' : 'typed',
          iterations: 2,
        },
      }),
      {
        experimentalDispatchBatchSize: 4,
        ...(entry.kind === 'map-typed'
          ? { experimentalOutputConstructor: Float64Array }
          : {}),
      },
    );
    assert.equal(result.length, entry.count);
    return;
  }
  await Promise.all(
    Array.from({ length: entry.count }, (_, index) =>
      runtime.run(completionTask, payload(index)),
    ),
  );
}

const results = [];
try {
  for (const entry of cases) {
    await execute(entry);
    const samples = [];
    for (let trial = 0; trial < 5; trial++) {
      const started = performance.now();
      await execute(entry);
      samples.push({ wallMs: performance.now() - started });
    }
    results.push({ ...entry, samples });
  }
  process.stdout.write(JSON.stringify({ workers: 4, results }));
} finally {
  await runtime.shutdown();
}
