import assert from 'node:assert/strict';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const config = JSON.parse(process.argv[3]);
const { workers, bytes, count, mode, move, repetitions, trials } = config;
const { PjsRuntime, PjsTaskRegistry } = await import(
  pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href
);
const registry = new PjsTaskRegistry();
const task = registry.register(
  'cross-platform-binary',
  pathToFileURL(join(root, 'benchmarks/reservation-audit/task.mjs')),
);
const runtime = new PjsRuntime({ registry, workers, maxQueue: 256 });
await runtime.ready();

async function execute() {
  let received = 0;
  const declaration = () => bytes;
  for await (const { partition, output } of runtime.streamRange(
    task,
    { start: 0, end: count, grainSize: 1 },
    (partition) => ({ input: { partition, bytes, move, iterations: 0 } }),
    {
      experimentalDispatchBatchSize: 1,
      experimentalMaxBufferedResults: 16,
      ...(mode === 'count'
        ? {}
        : {
            experimentalResultBytes: mode === 'fixed' ? bytes : declaration,
            experimentalMaxReservedResultBytes: bytes * 16,
          }),
    },
  )) {
    assert.equal(output.byteLength, bytes);
    const state = partition.index + 0x9e3779b9;
    assert.equal(output[0], state & 255);
    assert.equal(output[bytes - 1], (state >>> 8) & 255);
    received++;
  }
  assert.equal(received, count);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
}

try {
  await execute();
  await execute();
  const samples = [];
  for (let index = 0; index < trials; index++) {
    globalThis.gc?.();
    const delay = monitorEventLoopDelay({ resolution: 1 });
    delay.enable();
    const cpuBefore = process.cpuUsage();
    const eluBefore = performance.eventLoopUtilization();
    const memoryBefore = process.memoryUsage();
    const started = performance.now();
    for (let repetition = 0; repetition < repetitions; repetition++)
      await execute();
    const totalWallMs = performance.now() - started;
    const cpu = process.cpuUsage(cpuBefore);
    const elu = performance.eventLoopUtilization(eluBefore);
    delay.disable();
    samples.push({
      wallMs: totalWallMs / repetitions,
      totalWallMs,
      cpuMs: (cpu.user + cpu.system) / 1000,
      eventLoopUtilization: elu.utilization,
      eventLoopDelayMaxMs: delay.max / 1e6,
      eventLoopDelayMeanMs: Number.isFinite(delay.mean)
        ? delay.mean / 1e6
        : null,
      memoryBefore,
      memoryAfter: process.memoryUsage(),
    });
  }
  await runtime.shutdown();
  const stats = runtime.stats();
  const final = {
    tasks: stats.tasks.pending,
    operations: stats.operations.pending,
    ...runtime.resultCredits.diagnostics(),
    reservedResultBytes: stats.streamResults.currentReservedResultBytes,
  };
  assert.deepEqual(final, {
    tasks: 0,
    operations: 0,
    reservations: 0,
    executions: 0,
    reservedResultBytes: 0,
  });
  process.stdout.write(JSON.stringify({ ...config, samples, final }));
} finally {
  await runtime.shutdown({ drain: false });
}
