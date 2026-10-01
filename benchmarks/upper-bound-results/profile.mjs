import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';
import { setInternalProfileSink } from '../../packages/runtime/dist/telemetry/profile.js';
import { machineReport } from '../environment.mjs';

// Stage attribution only. Instrumented times are not production throughput.
const registry = new PjsTaskRegistry();
const task = registry.register(
  'upper-bound-profile',
  new URL('./task.mjs', import.meta.url),
  'binary',
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 128 });
await runtime.ready();
const original = runtime.resultCredits.reconcile.bind(runtime.resultCredits);
let reconciliationCalls = 0;
let reconciliationMs = 0;
runtime.resultCredits.reconcile = (...args) => {
  const started = performance.now();
  original(...args);
  reconciliationMs += performance.now() - started;
  reconciliationCalls++;
};
const results = [];
async function sample(mode, bytes, maximum) {
  const stages = Object.create(null);
  reconciliationCalls = 0;
  reconciliationMs = 0;
  setInternalProfileSink((stage, durationMs) => {
    const entry = (stages[stage] ??= { calls: 0, totalMs: 0 });
    entry.calls++;
    entry.totalMs += durationMs;
  });
  const started = performance.now();
  let count = 0;
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: 2048, grainSize: 1 },
    () => ({ input: { bytes, move: true } }),
    {
      ...(mode === 'exact'
        ? { experimentalResultBytes: bytes }
        : { experimentalMaxResultBytes: maximum }),
      experimentalMaxReservedResultBytes: maximum * 16,
      experimentalMaxBufferedResults: 16,
    },
  )) {
    assert.equal(output.byteLength, bytes);
    count++;
  }
  assert.equal(count, 2048);
  setInternalProfileSink();
  return {
    mode,
    bytes,
    maximum,
    wallMs: performance.now() - started,
    reconciliationCalls,
    reconciliationMs,
    stages,
  };
}
try {
  for (const [bytes, maximum] of [
    [4096, 4096],
    [32768, 524288],
  ]) {
    for (const mode of ['exact', 'upper']) await sample(mode, bytes, maximum);
    for (let trial = 0; trial < 4; trial++)
      for (const mode of trial % 2 ? ['upper', 'exact'] : ['exact', 'upper'])
        results.push({ trial, ...(await sample(mode, bytes, maximum)) });
  }
  await writeFile(
    new URL('../results/upper-bound-profile-v0.12.json', import.meta.url),
    JSON.stringify(
      {
        version: '0.12.0',
        timestamp: new Date().toISOString(),
        environment: machineReport(),
        methodology:
          'existing internal stage sink plus benchmark-instance reconciliation timer; warmups, balanced order; overlapping stages are not additive; use separate uninstrumented matrix for performance',
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  setInternalProfileSink();
  await runtime.shutdown({ drain: false });
}
