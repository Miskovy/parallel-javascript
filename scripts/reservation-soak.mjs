import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { machineReport } from '../benchmarks/environment.mjs';

process.env.PJS_DEBUG_RESERVATION_INVARIANTS ??= '1';

const { PjsRuntime, PjsTaskRegistry } =
  await import('../packages/runtime/dist/index.js');

const modeArgument = process.argv.find((value) => value.startsWith('--mode='));
const mode =
  modeArgument?.slice('--mode='.length) ?? process.env.PJS_SOAK_MODE ?? 'quick';
const durations = { smoke: 5000, quick: 30_000, standard: 180_000 };
const durationMs = Number(
  process.env.PJS_SOAK_DURATION_MS ?? durations[mode] ?? durations.quick,
);
const maximumIterations = Number(
  process.env.PJS_SOAK_ITERATIONS ?? Number.MAX_SAFE_INTEGER,
);
const workers = Number(
  process.env.PJS_SOAK_WORKERS ?? Math.min(4, availableParallelism()),
);
const resultBytes = Number(process.env.PJS_SOAK_RESULT_BYTES ?? 16 * 1024);
const countCapacity = Number(process.env.PJS_SOAK_COUNT_CAPACITY ?? 4);
const byteCapacity = Number(
  process.env.PJS_SOAK_BYTE_CAPACITY ?? resultBytes * 2,
);
const sampleIntervalMs = Number(process.env.PJS_SOAK_SAMPLE_MS ?? 1000);
const seed = Number(process.env.PJS_SOAK_SEED ?? 0x10_09_2026) >>> 0;
const forcedGc = process.env.PJS_SOAK_FORCE_GC === '1';

for (const [name, value, minimum] of [
  ['duration', durationMs, 1],
  ['iterations', maximumIterations, 1],
  ['workers', workers, 1],
  ['result bytes', resultBytes, 0],
  ['count capacity', countCapacity, 1],
  ['byte capacity', byteCapacity, resultBytes],
  ['sample interval', sampleIntervalMs, 10],
])
  assert.ok(
    Number.isSafeInteger(value) && value >= minimum,
    `${name} is valid`,
  );
if (forcedGc)
  assert.equal(
    typeof globalThis.gc,
    'function',
    'PJS_SOAK_FORCE_GC=1 requires node --expose-gc',
  );

let randomState = seed || 1;
function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 2 ** 32;
}
function choice(values) {
  return values[Math.floor(random() * values.length)];
}

const fixture = new URL(
  '../packages/runtime/test/fixtures/partition-tasks.mjs',
  import.meta.url,
);
function createRuntime(options = {}) {
  const registry = new PjsTaskRegistry();
  const task = registry.register('reservation-soak', fixture, 'binaryResult');
  return {
    task,
    runtime: new PjsRuntime({
      registry,
      workers,
      maxQueue: Math.max(16, workers * 8),
      maxRestarts: Math.max(1000, maximumIterations),
      ...options,
    }),
  };
}

function strict(expectedBytes = resultBytes, extra = {}) {
  const capacityBytes =
    typeof expectedBytes === 'number' ? expectedBytes : resultBytes;
  return {
    experimentalMaxBufferedResults: countCapacity,
    ...(random() < 0.5
      ? { experimentalMaxResultBytes: expectedBytes }
      : { experimentalResultBytes: expectedBytes }),
    experimentalMaxReservedResultBytes: Math.max(byteCapacity, capacityBytes),
    ...extra,
  };
}
function payload(partition, extra = {}) {
  return { input: { partition, bytes: resultBytes, ...extra } };
}
function releaseGate(gate) {
  const control = new Int32Array(gate);
  Atomics.store(control, 1, 1);
  Atomics.notify(control, 1);
}
async function until(predicate, label, timeout = 10_000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, `timed out waiting for ${label}`);
    await delay(1);
  }
}
async function consumeExpectedFailure(stream) {
  try {
    for await (const value of stream) void value;
  } catch {
    return;
  }
  assert.fail('expected stream failure');
}
function internalCounts(runtime) {
  const credits = runtime.resultCredits;
  assert.equal(
    typeof credits?.diagnostics,
    'function',
    'internal result-credit diagnostics are present',
  );
  const { reservations, executions } = credits.diagnostics();
  return { reservations, executions };
}
async function quiescent(runtime, healthyWorkers = true) {
  await until(() => {
    const stats = runtime.stats();
    const internal = internalCounts(runtime);
    return (
      stats.tasks.pending === 0 &&
      stats.operations.pending === 0 &&
      stats.workers.busy === 0 &&
      stats.streamResults.currentReservedResultBytes === 0 &&
      internal.reservations === 0 &&
      internal.executions === 0 &&
      (!healthyWorkers ||
        (stats.workers.total === workers && stats.workers.starting === 0))
    );
  }, 'runtime quiescence');
}

async function cancellationScenario(runtime, task) {
  const phase = choice([
    'pre-abort',
    'credit-wait',
    'queued',
    'running',
    'buffered',
    'consumer-wait',
    'after-yield',
  ]);
  const controller = new AbortController();
  if (phase === 'pre-abort') controller.abort('pre-admission');
  let blocker;
  let gate;
  if (phase === 'queued') {
    gate = new SharedArrayBuffer(8);
    blocker = Promise.all(
      Array.from({ length: workers }, (_, index) =>
        runtime.run(task, {
          partition: { index, start: index, end: index + 1 },
          bytes: 0,
          gate,
        }),
      ),
    );
    await until(
      () => runtime.stats().workers.busy === workers,
      'queue blockers start',
    );
  }
  const delayMs = ['running', 'consumer-wait'].includes(phase) ? 15 : 0;
  const stream = runtime.streamRange(
    task,
    { start: 0, end: phase === 'credit-wait' ? 3 : 6, grainSize: 1 },
    (partition) => payload(partition, { ms: delayMs, move: random() < 0.5 }),
    strict(resultBytes, {
      signal: controller.signal,
      experimentalMaxReservedResultBytes:
        phase === 'credit-wait' ? resultBytes : byteCapacity,
    }),
  );
  const iterator = stream[Symbol.asyncIterator]();
  if (phase === 'pre-abort') await assert.rejects(iterator.next());
  else if (phase === 'queued') {
    await until(
      () => runtime.stats().streamResults.currentReservedResultBytes > 0,
      'queued reservation',
    );
    controller.abort('queued');
    releaseGate(gate);
    await blocker;
    await assert.rejects(iterator.next());
  } else if (phase === 'running' || phase === 'consumer-wait') {
    const pending = iterator.next();
    await until(
      () => runtime.stats().workers.busy > 0,
      `${phase} worker occupancy`,
    );
    controller.abort(phase);
    await assert.rejects(pending);
  } else if (phase === 'buffered' || phase === 'credit-wait') {
    await until(
      () =>
        runtime
          .stats()
          .activeOperations.some((operation) => operation.bufferedResults > 0),
      `${phase} buffered output`,
    );
    controller.abort(phase);
    await assert.rejects(iterator.next());
  } else {
    const first = await iterator.next();
    assert.equal(first.done, false);
    controller.abort('after-yield');
    await assert.rejects(iterator.next());
  }
  await quiescent(runtime);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  return `cancellation:${phase}`;
}

async function timeoutScenario(runtime, task) {
  const phase = choice(['queue', 'execution', 'buffer', 'consumer']);
  let blocker;
  let gate;
  if (phase === 'queue') {
    gate = new SharedArrayBuffer(8);
    blocker = Promise.all(
      Array.from({ length: workers }, (_, index) =>
        runtime.run(task, {
          partition: { index, start: index, end: index + 1 },
          bytes: 0,
          gate,
        }),
      ),
    );
    await until(
      () => runtime.stats().workers.busy === workers,
      'timeout queue blockers',
    );
  }
  const stream = runtime.streamRange(
    task,
    { start: 0, end: 4, grainSize: 1 },
    (partition) =>
      payload(partition, {
        ms: phase === 'execution' || phase === 'consumer' ? 15 : 0,
      }),
    strict(resultBytes, { timeout: phase === 'buffer' ? 5 : 2 }),
  );
  const iterator = stream[Symbol.asyncIterator]();
  const failed =
    phase === 'consumer'
      ? assert.rejects(iterator.next())
      : phase === 'buffer'
        ? (async () => {
            await delay(8);
            await assert.rejects(iterator.next());
          })()
        : consumeExpectedFailure(iterator);
  if (gate) {
    await delay(3);
    releaseGate(gate);
    await blocker;
  }
  await failed;
  await quiescent(runtime);
  return `timeout:${phase}`;
}

async function crashScenario(runtime, task) {
  const batchSize = choice([1, 4]);
  const crashIndex = batchSize === 1 ? 0 : choice([0, 1, 3]);
  const controller = new AbortController();
  const stream = runtime.streamRange(
    task,
    { start: 0, end: batchSize === 1 ? 2 : 4, grainSize: 1 },
    (partition) =>
      payload(partition, {
        crash: partition.index === crashIndex,
        move: batchSize > 1 && partition.index < crashIndex,
      }),
    strict(resultBytes, {
      signal: controller.signal,
      experimentalDispatchBatchSize: batchSize,
      experimentalMaxReservedResultBytes:
        resultBytes * (batchSize === 1 ? 2 : 4),
    }),
  );
  const failed = consumeExpectedFailure(stream);
  if (random() < 0.25) controller.abort('crash-parent-race');
  await failed;
  await quiescent(runtime);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  return `crash:batch-${batchSize}:item-${crashIndex}`;
}

async function abandonmentScenario(runtime, task) {
  const kind = choice(['break', 'throw', 'return', 'iterator-throw']);
  const stream = runtime.streamRange(
    task,
    { start: 0, end: 8, grainSize: 1 },
    (partition) => payload(partition, { move: true }),
    strict(),
  );
  if (kind === 'break') {
    for await (const value of stream) {
      void value;
      break;
    }
  } else if (kind === 'throw') {
    await assert.rejects(async () => {
      for await (const value of stream) {
        void value;
        throw new Error('soak consumer failure');
      }
    });
  } else {
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.done, false);
    if (kind === 'return') await iterator.return();
    else
      await assert.rejects(iterator.throw(new Error('soak iterator failure')));
  }
  await quiescent(runtime);
  return `abandonment:${kind}`;
}

async function successScenario(runtime, task) {
  const move = random() < 0.5;
  const callback = random() < 0.5;
  let count = 0;
  for await (const { output } of runtime.streamRange(
    task,
    { start: 0, end: 8, grainSize: 1 },
    (partition) => payload(partition, { move }),
    strict(callback ? () => resultBytes : resultBytes),
  )) {
    assert.equal(output.byteLength, resultBytes);
    count++;
  }
  assert.equal(count, 8);
  await quiescent(runtime);
  return `success:${move ? 'transfer' : 'clone'}:${callback ? 'callback' : 'fixed'}`;
}

async function upperBoundScenario(runtime, task) {
  const maximum = choice([1, 16, 256, 4096, resultBytes]);
  const actuals = Array.from({ length: 8 }, () =>
    Math.floor(random() * (maximum + 1)),
  );
  const batch = choice([1, 2, 4]);
  const failure = choice(['none', 'none', 'abort', 'timeout', 'crash']);
  const controller = new AbortController();
  const refundBefore = runtime.stats().streamResults.refundedResultBytes;
  const stream = runtime.streamRange(
    task,
    { start: 0, end: actuals.length, grainSize: 1 },
    (partition) =>
      payload(partition, {
        bytes: actuals[partition.index],
        move: random() < 0.5,
        ms: failure === 'timeout' ? 15 : choice([0, 0, 1]),
        crash: failure === 'crash' && partition.index === 1,
      }),
    {
      experimentalMaxResultBytes: random() < 0.5 ? maximum : () => maximum,
      experimentalMaxReservedResultBytes: maximum * choice([1, 2, 4]),
      experimentalMaxBufferedResults: choice([2, 4, 8]),
      experimentalDispatchBatchSize: batch,
      signal: controller.signal,
      ...(failure === 'timeout' ? { timeout: 2 } : {}),
    },
  );
  let count = 0;
  const cancelAfter = choice([0, 1, 3]);
  if (failure === 'abort' && cancelAfter === 0)
    controller.abort('before result');
  try {
    for await (const { partition, output } of stream) {
      assert.equal(output.byteLength, actuals[partition.index]);
      count++;
      if (failure === 'abort' && count === cancelAfter)
        controller.abort('after yield');
      if (random() < 0.3) await delay(choice([1, 2]));
    }
    assert.equal(failure, 'none');
    assert.equal(count, actuals.length);
    assert.equal(
      runtime.stats().streamResults.refundedResultBytes - refundBefore,
      actuals.reduce((sum, actual) => sum + maximum - actual, 0),
    );
  } catch (error) {
    if (failure === 'none') throw error;
  }
  await quiescent(runtime);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  return `upper-bound:${failure}:batch-${batch}`;
}

async function shutdownScenario(kind) {
  const { runtime, task } = createRuntime({ maxRestarts: 8 });
  await runtime.ready();
  const stream = runtime.streamRange(
    task,
    { start: 0, end: 6, grainSize: 1 },
    (partition) =>
      payload(partition, {
        ms: kind === 'non-drain-running' ? 30 : 0,
        crash: kind === 'crash' && partition.index === 0,
      }),
    strict(),
  );
  const consume = async () => {
    try {
      let count = 0;
      for await (const value of stream) {
        void value;
        count++;
        if (kind === 'graceful' && count % 2 === 0) await delay(1);
      }
      return count;
    } catch {
      return -1;
    }
  };
  if (kind === 'graceful') {
    const consuming = consume();
    const shutdown = runtime.shutdown();
    assert.equal(await consuming, 6);
    await shutdown;
  } else if (kind === 'non-drain-running') {
    const consuming = consume();
    await until(
      () =>
        runtime.stats().workers.busy > 0 ||
        runtime.stats().streamResults.currentReservedResultBytes > 0,
      'shutdown active workload',
    );
    await runtime.shutdown({ drain: false });
    await consuming;
  } else if (kind === 'buffered') {
    await until(
      () =>
        runtime
          .stats()
          .activeOperations.some((operation) => operation.bufferedResults > 0),
      'shutdown buffered result',
    );
    await runtime.shutdown({ drain: false });
    await assert.rejects(stream[Symbol.asyncIterator]().next());
  } else {
    await consume();
    await runtime.shutdown();
  }
  const stats = runtime.stats();
  assert.equal(stats.streamResults.currentReservedResultBytes, 0);
  assert.deepEqual(internalCounts(runtime), { reservations: 0, executions: 0 });
  return `shutdown:${kind}`;
}

function resourceSample(runtime, started, iteration, scenario) {
  const memory = process.memoryUsage();
  const stats = runtime.stats();
  const resources = Object.create(null);
  for (const name of process.getActiveResourcesInfo?.() ?? [])
    resources[name] = (resources[name] ?? 0) + 1;
  return {
    elapsedMs: performance.now() - started,
    iteration,
    scenario,
    memory,
    workers: {
      total: stats.workers.total,
      busy: stats.workers.busy,
      starting: stats.workers.starting,
      failures: stats.workers.failures,
      restarts: stats.workers.restarts,
      threadIds: stats.workers.details.map((worker) => worker.threadId),
    },
    tasksPending: stats.tasks.pending,
    operationsPending: stats.operations.pending,
    reservedResultBytes: stats.streamResults.currentReservedResultBytes,
    ...internalCounts(runtime),
    resources,
  };
}

const { runtime, task } = createRuntime();
await runtime.ready();
const started = performance.now();
const deadline = started + durationMs;
const samples = [];
const scenarioCounts = Object.create(null);
let nextSampleAt = started;
let iteration = 0;
let lastScenario;
try {
  while (iteration < maximumIterations && performance.now() < deadline) {
    const family = iteration % 7;
    lastScenario =
      family === 0
        ? await successScenario(runtime, task)
        : family === 1
          ? await cancellationScenario(runtime, task)
          : family === 2
            ? await timeoutScenario(runtime, task)
            : family === 3
              ? await crashScenario(runtime, task)
              : family === 4
                ? await abandonmentScenario(runtime, task)
                : family === 5
                  ? await upperBoundScenario(runtime, task)
                  : await shutdownScenario(
                      choice([
                        'graceful',
                        'non-drain-running',
                        'buffered',
                        'crash',
                      ]),
                    );
    scenarioCounts[lastScenario] = (scenarioCounts[lastScenario] ?? 0) + 1;
    iteration++;
    if (performance.now() >= nextSampleAt) {
      samples.push(resourceSample(runtime, started, iteration, lastScenario));
      nextSampleAt = performance.now() + sampleIntervalMs;
    }
  }
  await quiescent(runtime);
  samples.push(resourceSample(runtime, started, iteration, 'final-quiescent'));
  let forcedGcSample;
  if (forcedGc) {
    globalThis.gc();
    await delay(20);
    globalThis.gc();
    forcedGcSample = resourceSample(runtime, started, iteration, 'forced-gc');
  }
  await runtime.shutdown();
  const finalStats = runtime.stats();
  assert.equal(finalStats.streamResults.currentReservedResultBytes, 0);
  assert.deepEqual(internalCounts(runtime), { reservations: 0, executions: 0 });
  const report = {
    version: '0.12.0',
    timestamp: new Date().toISOString(),
    environment: machineReport({
      mode,
      durationMs,
      maximumIterations,
      workers,
      resultBytes,
      countCapacity,
      byteCapacity,
      sampleIntervalMs,
      seed,
      forcedGc,
    }),
    elapsedMs: performance.now() - started,
    iterations: iteration,
    scenarioCounts,
    samples,
    ...(forcedGcSample ? { forcedGcSample } : {}),
    final: {
      state: finalStats.state,
      currentReservedResultBytes:
        finalStats.streamResults.currentReservedResultBytes,
      reservations: 0,
      executions: 0,
      creditOperations: runtime.resultCredits.diagnostics().operations,
      ...runtime.resultCredits.creditDiagnostics(),
      refundMetrics: finalStats.streamResults,
      tasksPending: finalStats.tasks.pending,
      operationsPending: finalStats.operations.pending,
      workerFailures: finalStats.workers.failures,
      workerRestarts: finalStats.workers.restarts,
    },
  };
  await mkdir(new URL('../benchmarks/results/', import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL(
      forcedGc
        ? '../benchmarks/results/reservation-soak-forced-gc-v0.12.json'
        : '../benchmarks/results/reservation-soak-v0.12.json',
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    `Reservation soak passed ${iteration} iterations in ${report.elapsedMs.toFixed(0)} ms`,
  );
  console.table(scenarioCounts);
} catch (error) {
  await runtime.shutdown({ drain: false }).catch(() => {});
  throw error;
}
