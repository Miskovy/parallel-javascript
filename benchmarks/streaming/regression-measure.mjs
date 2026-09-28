import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = await import(
  pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href
);
const workers = 4;
const registry = new PjsTaskRegistry();
const task = registry.register(
  'v07-regression',
  new URL('../completion-only/task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers, maxQueue: 1024 });
await runtime.ready();

const cases = [
  { name: 'run-noop', kind: 'run', count: 1_024 },
  { name: 'run-medium-cpu', kind: 'run', count: 64, iterations: 250_000 },
  { name: 'run-clone-8mib', kind: 'clone', count: 16, bytes: 8 * 2 ** 20 },
  {
    name: 'run-transfer-8mib',
    kind: 'transfer',
    count: 16,
    bytes: 8 * 2 ** 20,
  },
  { name: 'run-shared-8mib', kind: 'shared', count: 256, bytes: 8 * 2 ** 20 },
  { name: 'partition-noop-b1', kind: 'partition', count: 2_048, batchSize: 1 },
  { name: 'partition-noop-b8', kind: 'partition', count: 2_048, batchSize: 8 },
  { name: 'parallel-noop-b1', kind: 'parallel', count: 2_048, batchSize: 1 },
  { name: 'parallel-noop-b8', kind: 'parallel', count: 2_048, batchSize: 8 },
];

const payload = (index, entry, data) => ({
  kind: entry.iterations ? 'cpu' : 'noop',
  partition: { index, start: index, end: index + 1 },
  iterations: entry.iterations,
  outputType: 'scalar',
  ...(data ? { data } : {}),
});

async function execute(entry) {
  if (entry.kind === 'partition' || entry.kind === 'parallel') {
    const method =
      entry.kind === 'partition'
        ? runtime.partitionRange.bind(runtime)
        : runtime.parallelFor.bind(runtime);
    return method(
      task,
      { start: 0, end: entry.count, grainSize: 1 },
      (partition) => ({
        input: {
          ...payload(partition.index, entry),
          partition,
        },
      }),
      { experimentalDispatchBatchSize: entry.batchSize },
    );
  }
  if (entry.kind === 'clone') {
    const data = new Uint8Array(entry.bytes);
    for (let index = 0; index < entry.count; index++)
      await runtime.run(task, payload(index, entry, data));
    return;
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
  process.stdout.write(JSON.stringify({ workers, results }));
} finally {
  await runtime.shutdown();
}
