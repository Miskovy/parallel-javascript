import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const runtimeModule = await import(
  pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href
);
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = runtimeModule;
const workers = 4;
const registry = new PjsTaskRegistry();
const task = registry.register(
  'v06-regression',
  new URL('./task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers, maxQueue: 1024 });
await runtime.ready();

const cases = [
  { name: 'run-noop', kind: 'run', count: 128, input: 'noop' },
  { name: 'run-small-cpu', kind: 'run', count: 64, iterations: 10_000 },
  { name: 'run-medium-cpu', kind: 'run', count: 32, iterations: 250_000 },
  { name: 'run-large-cpu', kind: 'run', count: 8, iterations: 2_000_000 },
  { name: 'run-clone-8mib', kind: 'clone', count: 8, bytes: 8 * 2 ** 20 },
  { name: 'run-transfer-8mib', kind: 'transfer', count: 8, bytes: 8 * 2 ** 20 },
  { name: 'run-shared', kind: 'shared', count: 64, bytes: 8 * 2 ** 20 },
  { name: 'partition-noop-b1', kind: 'partition', count: 512, batchSize: 1 },
  { name: 'partition-noop-b8', kind: 'partition', count: 512, batchSize: 8 },
  {
    name: 'partition-medium-cpu',
    kind: 'partition',
    count: 32,
    batchSize: 1,
    iterations: 250_000,
  },
];

async function execute(entry) {
  if (entry.kind === 'partition')
    return runtime.partitionRange(
      task,
      { start: 0, end: entry.count, grainSize: 1 },
      (partition) => ({
        input: {
          kind: entry.iterations ? 'cpu' : 'noop',
          partition,
          iterations: entry.iterations,
          outputType: 'scalar',
        },
      }),
      { experimentalDispatchBatchSize: entry.batchSize },
    );
  if (entry.kind === 'clone') {
    const data = new Uint8Array(entry.bytes);
    for (let index = 0; index < entry.count; index++)
      await runtime.run(task, {
        kind: 'noop',
        partition: { index, start: index, end: index + 1 },
        outputType: 'scalar',
        data,
      });
    return;
  }
  if (entry.kind === 'transfer') {
    for (let index = 0; index < entry.count; index++) {
      const data = new Uint8Array(entry.bytes);
      await runtime.run(
        task,
        {
          kind: 'noop',
          partition: { index, start: index, end: index + 1 },
          outputType: 'scalar',
          data,
        },
        { transferList: [data.buffer] },
      );
    }
    return;
  }
  const shared =
    entry.kind === 'shared'
      ? sharedReadonly(new Uint8Array(entry.bytes))
      : undefined;
  await Promise.all(
    Array.from({ length: entry.count }, (_, index) =>
      runtime.run(task, {
        kind: entry.iterations ? 'cpu' : 'noop',
        partition: { index, start: index, end: index + 1 },
        iterations: entry.iterations,
        outputType: 'scalar',
        ...(shared ? { data: shared } : {}),
      }),
    ),
  );
}

const results = [];
try {
  for (const entry of cases) {
    await execute(entry);
    const samples = [];
    for (let trial = 0; trial < 3; trial++) {
      const cpuBefore = process.cpuUsage();
      const started = performance.now();
      await execute(entry);
      const wallMs = performance.now() - started;
      const usage = process.cpuUsage(cpuBefore);
      samples.push({
        wallMs,
        cpuMs: (usage.user + usage.system) / 1000,
        rssBytes: process.memoryUsage().rss,
      });
    }
    results.push({ ...entry, samples });
  }
  process.stdout.write(JSON.stringify({ workers, results }));
} finally {
  await runtime.shutdown();
}
