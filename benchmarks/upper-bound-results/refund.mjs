import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { machineReport } from '../environment.mjs';

const maximum = 1024 * 1024;
const actual = 64 * 1024;
const capacity = 2 * maximum;
const countCapacity = 64;
const count = 64;
const trials = 6;
const order = [];
const results = [];
async function measure(mode, trial) {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'refund-prefill',
    new URL('./task.mjs', import.meta.url),
    'binary',
  );
  const runtime = new PjsRuntime({ registry, workers: 4 });
  await runtime.ready();
  if (mode === 'held-maximum') runtime.resultCredits.reconcile = () => {};
  const started = performance.now();
  const stream = runtime.streamRange(
    task,
    { start: 0, end: count, grainSize: 1 },
    () => ({ input: { bytes: actual, move: true } }),
    {
      experimentalMaxResultBytes: maximum,
      experimentalMaxReservedResultBytes: capacity,
      experimentalMaxBufferedResults: countCapacity,
    },
  );
  try {
    // No consumer delivery during prefill. Wait on terminal physical occupancy,
    // not arbitrary timer sleeps, so producer eligibility is the causal variable.
    const deadline = performance.now() + 5000;
    while (
      runtime.stats().workers.busy > 0 ||
      runtime.stats().tasks.pending > 0
    ) {
      assert.ok(
        performance.now() < deadline,
        'prefill reached byte-credit blocking',
      );
      await delay(1);
    }
    const prefillMs = performance.now() - started;
    const before = runtime.stats();
    const credits = runtime.resultCredits.creditDiagnostics();
    const produced = before.streamResults.produced;
    assert.equal(before.streamResults.yielded, 0);
    assert.equal(
      before.streamResults.currentReservedResultBytes,
      produced * (mode === 'upper' ? actual : maximum),
    );
    assert.equal(
      before.streamResults.refundedResultBytes,
      produced * (mode === 'upper' ? maximum - actual : 0),
    );
    assert.equal(produced, mode === 'upper' ? 17 : 2);
    let received = 0;
    for await (const { output } of stream) {
      assert.equal(output.byteLength, actual);
      received++;
    }
    assert.equal(received, count);
    assert.deepEqual(runtime.resultCredits.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
    return {
      trial,
      mode,
      prefillMs,
      wallMs: performance.now() - started,
      producedBeforeYield: produced,
      reservedBeforeYield: before.streamResults.currentReservedResultBytes,
      bufferedActualBytes: before.streamResults.knownBufferedPayloadBytes,
      refundsBeforeYield: before.streamResults.refundedResultBytes,
      reservationWaits: before.streamResults.resultByteReservationWaits,
      credits,
      terminal: runtime.resultCredits.diagnostics(),
    };
  } finally {
    await runtime.shutdown({ drain: false });
  }
}
for (let trial = 0; trial < trials; trial++) {
  for (const mode of trial % 2
    ? ['held-maximum', 'upper']
    : ['upper', 'held-maximum']) {
    order.push({ trial, mode });
    results.push(await measure(mode, trial));
  }
}
const report = {
  version: '0.12.0',
  timestamp: new Date().toISOString(),
  environment: machineReport(),
  settings: {
    maximum,
    actual,
    capacity,
    countCapacity,
    count,
    trials,
    workers: 4,
  },
  methodology:
    'consumer withheld until physical work quiesces; identical binary task and capacity; benchmark-only reconciliation suppression; alternating order; every observation retained',
  order,
  results,
};
await writeFile(
  new URL('../results/refund-benefit-v0.12.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(results);
