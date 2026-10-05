import assert from 'node:assert/strict';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { setInternalProfileSink } from '../../packages/runtime/dist/telemetry/profile.js';

const config = JSON.parse(process.argv[2]);
const { workers, bytes, count, mode, move, trials, warmups } = config;
const registry = new PjsTaskRegistry();
const task = registry.register(
  'reservation-audit-measure',
  new URL('./task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({
  registry,
  workers,
  maxQueue: Math.max(64, workers * 16),
});
await runtime.ready();

async function sample() {
  const stages = Object.create(null);
  setInternalProfileSink((stage, durationMs) => {
    const entry = (stages[stage] ??= { calls: 0, totalMs: 0 });
    entry.calls++;
    entry.totalMs += durationMs;
  });
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  let timerExpected = performance.now() + 1;
  let maxTimerDriftMs = 0;
  let peakRssBytes = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const now = performance.now();
    maxTimerDriftMs = Math.max(maxTimerDriftMs, now - timerExpected);
    timerExpected = now + 1;
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, 1);
  const before = runtime.stats();
  const cpuBefore = process.cpuUsage();
  const eluBefore = performance.eventLoopUtilization();
  let declarationCalls = 0;
  let declarationMs = 0;
  let checksum = 0;
  let received = 0;
  const declaration = (partition) => {
    const started = performance.now();
    declarationCalls++;
    const value = bytes + partition.index - partition.index;
    declarationMs += performance.now() - started;
    return value;
  };
  const options = {
    experimentalDispatchBatchSize: move ? 1 : 4,
    experimentalMaxBufferedResults: Math.min(16, Math.max(1, count)),
    ...(mode === 'count'
      ? {}
      : {
          experimentalResultBytes: mode === 'fixed' ? bytes : declaration,
          experimentalMaxReservedResultBytes: Math.max(
            bytes,
            bytes * Math.min(16, Math.max(1, count)),
          ),
        }),
  };
  const started = performance.now();
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: count, grainSize: 1 },
    (partition) => ({
      input: { partition, bytes, move, iterations: 0 },
    }),
    options,
  )) {
    assert.equal(output.byteLength, bytes);
    if (output.byteLength) checksum ^= output[0] ^ output[output.length - 1];
    received++;
  }
  const wallMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuBefore);
  const elu = performance.eventLoopUtilization(eluBefore);
  const after = runtime.stats();
  clearInterval(timer);
  delay.disable();
  setInternalProfileSink();
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  assert.equal(received, count);
  assert.equal(after.streamResults.currentReservedResultBytes, 0);
  return {
    wallMs,
    bytesPerSecond: (bytes * count) / (wallMs / 1000),
    resultsPerSecond: count / (wallMs / 1000),
    cpuMs: (cpu.user + cpu.system) / 1000,
    eventLoopUtilization: elu.utilization,
    eventLoopDelayMaxMs: delay.max / 1e6,
    maxTimerDriftMs,
    peakRssBytes,
    checksum,
    declarationCalls,
    declarationMs,
    messages: after.dispatch.executeMessages - before.dispatch.executeMessages,
    reservationWaits:
      after.streamResults.resultByteReservationWaits -
      before.streamResults.resultByteReservationWaits,
    peakReservedResultBytes: after.streamResults.peakReservedResultBytes,
    stages,
  };
}

try {
  for (let index = 0; index < warmups; index++) await sample();
  const samples = [];
  for (let index = 0; index < trials; index++) samples.push(await sample());
  process.stdout.write(JSON.stringify({ ...config, samples }));
} finally {
  setInternalProfileSink();
  await runtime.shutdown({ drain: false });
}
