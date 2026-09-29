import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setImmediate as immediate } from 'node:timers/promises';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';

const config = JSON.parse(process.argv[2]);
const { workers, size, grainSize, capacity, consumerCostMs, trials, warmups } =
  config;
const registry = new PjsTaskRegistry();
const task = registry.register(
  'pipeline-map',
  new URL('./task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers, maxQueue: workers * 16 });
await runtime.ready();
const source = sharedReadonly(
  Float64Array.from({ length: size }, (_, index) => (index % 1009) / 17),
);

function consumeCpu(milliseconds) {
  const deadline = performance.now() + milliseconds;
  let value = 0;
  while (performance.now() < deadline) value = Math.imul(value + 1, 2654435761);
  return value;
}

async function sample() {
  let peakRssBytes = process.memoryUsage().rss;
  let busyWorkerSamples = 0;
  let busyWorkerTotal = 0;
  const rssTimer = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    busyWorkerTotal += runtime.stats().workers.busy;
    busyWorkerSamples++;
  }, 2);
  let expectedAt = performance.now() + 1;
  let maxTimerDriftMs = 0;
  const driftTimer = setInterval(() => {
    const now = performance.now();
    maxTimerDriftMs = Math.max(maxTimerDriftMs, now - expectedAt);
    expectedAt = now + 1;
  }, 1);
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const eluBefore = performance.eventLoopUtilization();
  const cpuBefore = process.cpuUsage();
  const before = runtime.stats();
  const started = performance.now();
  let firstResultMs = null;
  let count = 0;
  let checksum = 0;
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: size, grainSize },
    (partition) => ({
      input: {
        partition,
        source,
        kind: 'typed',
        iterations: 16,
        pjsTransfer: true,
      },
    }),
    {
      experimentalDispatchBatchSize: 4,
      experimentalMaxBufferedResults: capacity,
    },
  )) {
    firstResultMs ??= performance.now() - started;
    const digest = createHash('sha256')
      .update(
        new Uint8Array(output.buffer, output.byteOffset, output.byteLength),
      )
      .digest();
    checksum ^= digest[0];
    checksum ^= consumeCpu(consumerCostMs);
    count++;
    await immediate();
  }
  const wallMs = performance.now() - started;
  const usage = process.cpuUsage(cpuBefore);
  const elu = performance.eventLoopUtilization(eluBefore);
  const after = runtime.stats();
  delay.disable();
  clearInterval(rssTimer);
  clearInterval(driftTimer);
  assert.equal(count, Math.ceil(size / grainSize));
  return {
    wallMs,
    firstResultMs,
    count,
    checksum,
    cpuMs: (usage.user + usage.system) / 1000,
    peakRssBytes,
    averageBusyWorkers:
      busyWorkerSamples === 0 ? null : busyWorkerTotal / busyWorkerSamples,
    workerUtilization:
      busyWorkerSamples === 0
        ? null
        : busyWorkerTotal / (busyWorkerSamples * workers),
    peakBufferedResults: after.streamResults.peakBuffered,
    peakKnownBufferedPayloadBytes:
      after.streamResults.peakKnownBufferedPayloadBytes,
    messages: after.dispatch.executeMessages - before.dispatch.executeMessages,
    eventLoopUtilization: elu.utilization,
    eventLoopDelayMaxMs: delay.max / 1e6,
    maxTimerDriftMs,
  };
}

try {
  const firstRun = await sample();
  for (let index = 0; index < warmups; index++) await sample();
  const samples = [];
  for (let index = 0; index < trials; index++) samples.push(await sample());
  process.stdout.write(JSON.stringify({ ...config, firstRun, samples }));
} finally {
  await runtime.shutdown();
}
