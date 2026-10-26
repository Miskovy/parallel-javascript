import { runtimeComponents } from '../../packages/runtime/test/helpers/runtime-inspection.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { threadId } from 'node:worker_threads';
import {
  setImmediate as immediate,
  setTimeout as delay,
} from 'node:timers/promises';
import {
  PjsCancelledError,
  PjsExecutionLeaseError,
  PjsWorkerError,
  sharedReadonly,
} from '../../packages/runtime/dist/index.js';
import {
  create,
  gate,
  entered,
  open,
  range,
  until,
  firstWorker,
  clock,
  inspect,
  assertConservation,
  quiescent,
  stop,
  listeners,
  observeWorkers,
  assertStreamReleased,
} from '../../packages/runtime/test/helpers/memory-lifecycle.mjs';
import { analyze } from './analysis.mjs';

assert.ok(
  process.argv.length === 3 || process.argv.length === 4,
  'config file and optional NEW result path required',
);
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = process.argv[3] ?? config.output;
writeFileSync(output, '', { flag: 'wx' });
const start = performance.now();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const report = {
  schema: 1,
  config,
  sourceCommit: git('rev-parse', 'HEAD'),
  dirtyWorkingTree: git('status', '--short') !== '',
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  samples: [],
  workerSamples: [],
  optionalWorkerHeapStatistics: [],
  checkpoints: [],
  creditComparisons: [],
  gc: [],
  passed: false,
  logicalChecks: {
    dispatchedInputs: 0,
    settledInputs: 0,
    quiescent: 0,
    cancelledPhysical: 0,
    recoveries: 0,
    streamTerminals: 0,
    shutdowns: 0,
  },
};
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
save();
let runtime, tasks, workerCounts;
const retired = { created: 0, confirmedExits: 0, peakLive: 0 };
let sharedInput,
  recycled = [],
  retainedBytes = 0;
let randomState = config.seed;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return randomState >>> 0;
};

function sample(phase, iteration, detail) {
  if (runtime) assertConservation(runtime);
  report.samples.push({
    phase,
    iteration,
    detail,
    elapsedMs: performance.now() - start,
    main: { source: 'main isolate', threadId, memory: process.memoryUsage() },
    ownership: runtime ? inspect(runtime) : undefined,
    threads: { ...retired, current: workerCounts?.() },
    application: {
      longLivedRetainedBackingBytes: retainedBytes,
      recycledBuffers: recycled.length,
      sharedInputHeld: sharedInput !== undefined,
    },
    activeResourceTypes: process.getActiveResourcesInfo(),
  });
}
async function checkpoint(phase, iteration) {
  const ownership = await quiescent(runtime);
  report.logicalChecks.quiescent++;
  report.checkpoints.push({ phase, iteration, ownership });
  sample(phase, iteration, 'logical quiescence');
}
async function startRuntime() {
  ({ runtime, tasks } = create({
    workers: config.workers,
    maxQueue: config.workers * 4,
    restartPolicy: {
      maxRestarts:
        Math.ceil(config.iterations / 8) + Math.ceil(config.warmup / 8) + 1,
      windowMs: 1000,
    },
  }));
  workerCounts = observeWorkers(runtime);
  const dispatched = runtimeComponents(runtime).taskCoordinator.dispatched.bind(
    runtimeComponents(runtime).taskCoordinator,
  );
  runtimeComponents(runtime).taskCoordinator.dispatched = (task) => {
    dispatched(task);
    for (const item of task.batch ?? [task]) {
      assert.equal(item.input, undefined);
      assert.deepEqual(item.transferList, []);
      report.logicalChecks.dispatchedInputs++;
    }
  };
  const settle = runtimeComponents(runtime).taskCoordinator.settle.bind(
    runtimeComponents(runtime).taskCoordinator,
  );
  runtimeComponents(runtime).taskCoordinator.settle = (task, ...args) => {
    const owned = runtimeComponents(runtime).taskCoordinator.has(task.id);
    settle(task, ...args);
    if (owned) {
      assert.equal(task.input, undefined);
      report.logicalChecks.settledInputs++;
    }
  };
  await runtime.ready();
}
async function stopCurrent(phase, iteration, options) {
  await stop(runtime, options);
  report.logicalChecks.shutdowns++;
  sample(phase, iteration, 'confirmed shutdown');
  const counts = workerCounts();
  assert.equal(counts.live, 0);
  assert.equal(counts.created, counts.confirmedExits);
  retired.created += counts.created;
  retired.confirmedExits += counts.confirmedExits;
  retired.peakLive = Math.max(retired.peakLive, counts.peakLive);
  runtime = undefined;
  tasks = undefined;
  workerCounts = undefined;
}
function payload() {
  if (config.shape === 'scalar')
    return { value: random() & 255, small: [1, 2, 3] };
  if (config.mode === 'shared') {
    if (!sharedInput) {
      const source = new Uint8Array(config.bytes + 32);
      source.fill(13);
      sharedInput = sharedReadonly(source.subarray(16, 16 + config.bytes));
      assert.equal(sharedInput.buffer.byteLength, config.bytes);
      retainedBytes = config.bytes;
    }
    return sharedInput;
  }
  const data = new Uint8Array(
    new ArrayBuffer(config.bytes + (config.shape === 'view' ? 32 : 0)),
    config.shape === 'view' ? 16 : 0,
    config.bytes,
  );
  data.fill(random() & 255);
  return config.shape === 'buffer' ? data.buffer : data;
}
async function wave(phase, iteration) {
  if (config.mode === 'transfer') {
    // The application deliberately recycles returned backing across waves.
    const inputs = recycled.length
      ? recycled
      : Array.from({ length: config.workers * 2 }, payload);
    recycled = [];
    retainedBytes = 0;
    const pending = inputs.map((data) => {
      const backing = data.buffer ?? data;
      const promise = runtime.run(tasks.move, data, {
        transferList: [backing],
      });
      // First workers post synchronously; queued inputs detach later.
      return promise.then((value) => {
        assert.equal(backing.byteLength, 0);
        assert.equal(value.byteLength, config.bytes);
        return value;
      });
    });
    sample(phase, iteration, 'active and queued transfer');
    recycled = await Promise.all(pending);
    retainedBytes = recycled.reduce(
      (sum, v) => sum + (v.buffer ?? v).byteLength,
      0,
    );
  } else {
    const inputs = Array.from({ length: config.workers * 2 }, payload);
    const pending = inputs.map((data) =>
      runtime.run(
        config.shape === 'scalar' ? tasks.echo : tasks.inspect,
        config.shape === 'scalar' ? data : { data },
      ),
    );
    sample(phase, iteration, 'active and queued input');
    const values = await Promise.all(pending);
    if (config.shape !== 'scalar') {
      for (const value of values) {
        assert.equal(value.visible, config.bytes);
        assert.equal(value.shared, config.mode === 'shared');
      }
    } else assert.deepEqual(values, inputs);
  }
  await checkpoint(phase, iteration);
}
async function cancel(phase, iteration) {
  const control = gate(),
    abort = new AbortController();
  try {
    const pending = Array.from({ length: config.workers * 2 }, () =>
      assert.rejects(
        runtime.run(
          tasks.inspect,
          { data: payload(), gate: control },
          { signal: abort.signal },
        ),
        PjsCancelledError,
      ),
    );
    await until(() => entered(control) === config.workers);
    abort.abort();
    await Promise.all(pending);
    assert.equal(listeners(abort.signal), 0);
    assert.equal(runtime.stats().tasks.pending, 0);
    assert.equal(runtime.stats().queue.size, 0);
    assert.equal(runtime.stats().workers.busy, config.workers);
    report.logicalChecks.cancelledPhysical++;
    sample(phase, iteration, 'cancelled callers; physical readers remain');
  } finally {
    open(control);
  }
  await checkpoint(phase, iteration);
}
async function recover(phase, iteration) {
  const old = firstWorker(runtime),
    marker = gate();
  const data = payload();
  const transferList = config.mode === 'transfer' ? [data.buffer ?? data] : [];
  const containment = config.outcome === 'containment';
  const time = containment ? clock(old) : undefined;
  const pending = assert.rejects(
    runtime.run(
      containment ? tasks.hang : tasks.crash,
      { data, marker },
      {
        transferList,
        ...(containment ? { executionLease: 100 } : {}),
      },
    ),
    containment ? PjsExecutionLeaseError : PjsWorkerError,
  );
  if (containment) {
    await until(() => entered(marker) === 1);
    time.advance(100); // Real infinite task and exit; deterministic expiry delivery.
  }
  await pending;
  sample(
    phase,
    iteration,
    'failure notification is separate from physical exit',
  );
  await until(
    () =>
      runtime.stats().workers.idle === config.workers &&
      runtimeComponents(runtime).dispatcher.pool.repairs.size === 0,
  );
  assert.equal(
    runtimeComponents(runtime).dispatcher.pool.workers.has(old.id),
    false,
  );
  assert.equal(old.thread.threadId, -1);
  assert.deepEqual(old.thread.eventNames(), []);
  assert.equal(old.lease, undefined);
  assert.equal(entered(marker), 1, 'no hidden application replay');
  if (transferList.length) assert.equal(transferList[0].byteLength, 0);
  report.logicalChecks.recoveries++;
  await checkpoint(phase, iteration);
}
async function binaries(phase, iteration) {
  const streams = [false, true].map((maximum) =>
    runtime.streamRange(
      tasks.binary,
      range(config.workers * 2),
      () => ({
        input: { bytes: config.bytes, backing: config.backing, move: maximum },
      }),
      {
        experimentalMaxBufferedResults: config.workers * 2,
        experimentalDispatchBatchSize: 2,
        experimentalMaxReservedResultBytes:
          config.workers * 2 * config.bytes * (maximum ? 2 : 1),
        ...(maximum
          ? { experimentalMaxResultBytes: config.bytes * 2 }
          : { experimentalResultBytes: config.bytes }),
      },
    ),
  );
  await until(() => streams.every((s) => s.buffered === config.workers * 2));
  assertConservation(runtime);
  report.creditComparisons.push({
    phase,
    iteration,
    declaredVisibleCredit: config.workers * 2 * config.bytes * 3,
    currentCredit: runtime.stats().streamResults.currentReservedResultBytes,
    actualVisibleOutputBytes: streams.reduce(
      (sum, s) => sum + s.buffer.reduce((n, v) => n + v.output.byteLength, 0),
      0,
    ),
    knownUnderlyingBackingBytes: streams.reduce(
      (sum, s) =>
        sum + s.buffer.reduce((n, v) => n + v.output.buffer.byteLength, 0),
      0,
    ),
    observedProcessRss: process.memoryUsage().rss,
  });
  assert.equal(
    runtime.stats().streamResults.currentReservedResultBytes,
    config.workers * 4 * config.bytes,
  );
  sample(phase, iteration, 'two buffered streams with per-item batch credit');
  for await (const { output } of streams[0]) {
    assert.equal(output.byteLength, config.bytes);
    assert.equal(output.buffer.byteLength, config.backing);
  }
  if (iteration % 2 === 0) await streams[1].return();
  else
    for await (const { output } of streams[1])
      assert.equal(output.byteLength, config.bytes);
  for (const s of streams) assertStreamReleased(s);
  report.logicalChecks.streamTerminals += 2;
  await checkpoint(phase, iteration);
}
async function workerSample(phase) {
  report.workerSamples.push({
    phase,
    samples: await Promise.all(
      Array.from({ length: config.workers }, () =>
        runtime.run(tasks.memory, undefined),
      ),
    ),
  });
  for (const worker of runtimeComponents(
    runtime,
  ).dispatcher.pool.workers.values()) {
    const available = typeof worker.thread.getHeapStatistics === 'function';
    const observation = {
      phase,
      workerId: worker.id,
      threadId: worker.thread.threadId,
      available,
    };
    if (available)
      observation.heapStatistics = await worker.thread.getHeapStatistics();
    else observation.reason = 'API unavailable; optional worker diagnostic';
    report.optionalWorkerHeapStatistics.push(observation);
  }
}
async function diagnosticGc(phase) {
  if (config.gc !== 'diagnostic') return;
  assert.equal(
    typeof globalThis.gc,
    'function',
    'Diagnostic mode requires --expose-gc',
  );
  const before = process.memoryUsage();
  globalThis.gc();
  await immediate();
  const after = process.memoryUsage();
  report.gc.push({
    phase,
    source: 'main isolate only; worker GC is not forced',
    before,
    after,
  });
  sample(
    phase,
    -1,
    'optional GC observation; no reclamation deadline asserted',
  );
}

try {
  assert.equal(
    report.sourceCommit,
    config.sourceCommit,
    'Replay requires the original source revision',
  );
  assert.ok([1, 2, 4].includes(config.workers));
  for (const [key, maximum] of [
    ['iterations', 256],
    ['warmup', 8],
    ['recreations', 12],
    ['bytes', 2 * 1024 * 1024],
  ]) {
    assert.ok(
      Number.isSafeInteger(config[key]) &&
        config[key] > 0 &&
        config[key] <= maximum,
      'bounded ' + key,
    );
  }
  sample('initial', -1);
  await startRuntime();
  for (const phase of ['warmup', 'measurement']) {
    const count = phase === 'warmup' ? config.warmup : config.iterations;
    for (let iteration = 0; iteration < count; iteration++) {
      if (config.outcome === 'streams') await binaries(phase, iteration);
      else if (config.outcome === 'cancel') await cancel(phase, iteration);
      else {
        await wave(phase, iteration);
        if (
          ['containment', 'restart'].includes(config.outcome) &&
          iteration % 8 === 0
        )
          await recover(phase, iteration);
      }
      if (iteration % 8 === 0) save();
      if (phase === 'measurement') await delay(config.sampleIntervalMs);
    }
    await workerSample(phase);
    await checkpoint(phase, count);
  }
  sample('application-retained', -1);
  await diagnosticGc('gc-application-retained');
  sharedInput = undefined;
  recycled = [];
  retainedBytes = 0;
  sample('application-released', -1);
  await diagnosticGc('gc-application-released');
  await stopCurrent('stopped', -1, { drain: true });
  if (config.outcome === 'recreate') {
    for (let cycle = 0; cycle < config.recreations; cycle++) {
      await startRuntime();
      await wave('recreation', cycle);
      if (cycle % 2 === 0) {
        const pending = runtime.run(tasks.echo, cycle);
        await stopCurrent('recreation', cycle, { drain: true });
        assert.equal(await pending, cycle);
      } else {
        const control = gate();
        try {
          const pending = assert.rejects(
            runtime.run(tasks.inspect, { data: payload(), gate: control }),
            PjsCancelledError,
          );
          await until(() => entered(control) === 1);
          const ending = runtime.shutdown({ forceAfter: 10 });
          await pending;
          await ending;
          await stopCurrent('recreation', cycle);
        } finally {
          open(control);
        }
      }
    }
  }
  await diagnosticGc('gc-after-shutdown');
  sample('final', -1);
  assert.equal(retired.created, retired.confirmedExits);
  report.threadTotals = retired;
  assert.ok(
    report.logicalChecks.quiescent > 0 && report.logicalChecks.shutdowns > 0,
  );
  report.passed = true;
} catch (error) {
  report.failure = {
    classification: 'unclassified; qualification stopped pending reproduction',
    message: error.message,
    stack: error.stack,
  };
  process.exitCode = 1;
} finally {
  save(); // Preserve suspect measurements before cleanup changes the state.
  if (runtime) {
    try {
      await stopCurrent('failure-cleanup', -1);
    } catch (error) {
      report.cleanupFailure = error.stack;
      report.passed = false;
      process.exitCode = 1;
    }
  }
  report.analysis = analyze(report.samples);
  report.elapsedMs = performance.now() - start;
  save();
}
