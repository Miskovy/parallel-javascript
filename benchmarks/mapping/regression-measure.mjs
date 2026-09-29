import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = await import(
  pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href
);
const registry = new PjsTaskRegistry();
const task = registry.register(
  'v08-regression',
  new URL('../completion-only/task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 1024 });
await runtime.ready();
const cases = [
  { name: 'run-noop', kind: 'run', count: 1024 },
  {
    name: 'run-transfer-8mib',
    kind: 'transfer',
    count: 64,
    bytes: 8 * 2 ** 20,
  },
  { name: 'run-shared-8mib', kind: 'shared', count: 256, bytes: 8 * 2 ** 20 },
  { name: 'partition-noop-b1', kind: 'partition', count: 2048, batchSize: 1 },
  { name: 'partition-noop-b8', kind: 'partition', count: 2048, batchSize: 8 },
  { name: 'parallel-noop-b1', kind: 'parallel', count: 2048, batchSize: 1 },
  { name: 'parallel-noop-b8', kind: 'parallel', count: 2048, batchSize: 8 },
  { name: 'stream-scalar-b1', kind: 'stream', count: 4096, batchSize: 1 },
  { name: 'stream-scalar-b8', kind: 'stream', count: 4096, batchSize: 8 },
];

const payload = (index, entry, data) => ({
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
      task,
      { start: 0, end: entry.count, grainSize: 1 },
      (partition) => ({ input: payload(partition.index, entry) }),
      { experimentalDispatchBatchSize: entry.batchSize },
    );
  }
  if (entry.kind === 'stream') {
    let count = 0;
    for await (const value of runtime.streamRange(
      task,
      { start: 0, end: entry.count, grainSize: 1 },
      (partition) => ({ input: payload(partition.index, entry) }),
      {
        experimentalDispatchBatchSize: entry.batchSize,
        experimentalMaxBufferedResults: 8,
      },
    )) {
      void value;
      count++;
    }
    return count;
  }
  if (entry.kind === 'transfer') {
    for (let index = 0; index < entry.count; index++) {
      const data = new Uint8Array(entry.bytes);
      await runtime.run(task, payload(index, entry, data), {
        transferList: [data.buffer],
      });
    }
    return;
  }
  const data =
    entry.kind === 'shared'
      ? sharedReadonly(new Uint8Array(entry.bytes))
      : undefined;
  await Promise.all(
    Array.from({ length: entry.count }, (_, index) =>
      runtime.run(task, payload(index, entry, data)),
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
