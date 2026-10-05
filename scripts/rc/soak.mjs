import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

process.env.PJS_DEBUG_RESERVATION_INVARIANTS = '1';
const api = await import('@pjavascript/runtime');
const {
  PjsRuntime,
  PjsTaskRegistry,
  PjsError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsWorkerError,
  PjsTaskError,
  PjsQueueFullError,
  PjsSerializationError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
  PjsMapContractError,
  PjsBinaryResultContractError,
  PjsResultCapacityError,
  sharedReadonly,
  transfer,
} = api;
const argument = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const profile = argument('profile', 'smoke');
const profiles = {
  smoke: { cycles: 2, batch: 16, churn: 3, crashes: 2 },
  standard: { cycles: 80, batch: 32, churn: 30, crashes: 6 },
  extended: { cycles: 400, batch: 32, churn: 120, crashes: 12 },
};
assert.ok(Object.hasOwn(profiles, profile), 'Unknown RC profile');
const config = profiles[profile];
const seed = Number(argument('seed', '20261003'));
assert.ok(Number.isSafeInteger(seed) && seed > 0 && seed <= 0xffffffff);
const output = argument('output');
assert.ok(output, 'Specify a NEW --output=file.json; overwrite is refused');
writeFileSync(output, '', { flag: 'wx' });
const started = performance.now();
const report = {
  schema: 1,
  kind: 'RC contract soak, not performance research',
  profile,
  config,
  seed,
  node: process.version,
  versions: process.versions,
  platform: process.platform,
  arch: process.arch,
  scenarios: [],
  samples: [],
  terminals: [],
  publicErrors: {},
  warnings: [],
  physicalSplits: [],
  memoryPolicy:
    'rss/heapUsed/external/arrayBuffers reported separately; arrayBuffers overlaps external; RSS need not return to baseline',
  privateDiagnostics:
    'RC-only inspection of existing bookkeeping; no supported public API added',
  passed: false,
};
const save = () =>
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
const runtimes = new Set();
let randomState = seed;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return randomState >>> 0;
};
const iteratorOf = (stream) => stream[Symbol.asyncIterator]();
const fixture = new URL('./tasks.mjs', import.meta.url);
const gate = () => new SharedArrayBuffer(8);
const open = (buffer) => {
  Atomics.store(new Int32Array(buffer), 1, 1);
  Atomics.notify(new Int32Array(buffer), 1);
};
const entered = (buffer) => Atomics.load(new Int32Array(buffer), 0);
const capture = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
const expectError = async (captured, Class) => {
  const { error } = await captured;
  assert.ok(
    error instanceof Class,
    `Expected ${Class.name}, got ${error?.stack ?? 'success'}`,
  );
  assert.ok(error instanceof PjsError);
  assert.equal(error.name, Class.name);
  assert.ok(error.message.length > 0);
  report.publicErrors[Class.name] = (report.publicErrors[Class.name] ?? 0) + 1;
  return error;
};
const recordSyncError = (fn, Class) => {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof Class && error instanceof PjsError);
    assert.equal(error.name, Class.name);
    assert.ok(error.message.length > 0);
    report.publicErrors[Class.name] =
      (report.publicErrors[Class.name] ?? 0) + 1;
    return true;
  });
};
async function until(predicate, label) {
  const deadline = performance.now() + 15000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, `Watchdog: ${label}`);
    await delay(1);
  }
}
function create(options = {}) {
  const registry = new PjsTaskRegistry();
  const task = registry.register('rc-work', fixture, 'work');
  const runtime = new PjsRuntime({
    registry,
    workers: 2,
    maxQueue: 64,
    maxRestarts: 24,
    ...options,
  });
  runtimes.add(runtime);
  return { runtime, task, registry };
}
function inspect(runtime) {
  const stats = runtime.stats();
  const credit = runtime.resultCredits;
  return {
    state: stats.state,
    tasks: stats.tasks.pending,
    operations: stats.operations.pending,
    queue: stats.queue.size,
    busy: stats.workers.busy,
    liveWorkers: stats.workers.details.filter(
      (w) => w.status !== 'stopped' && w.status !== 'failed',
    ).length,
    workerIds: stats.workers.details.map((w) => w.id),
    workerThreadIds: stats.workers.details.map((w) => w.threadId),
    starting: stats.workers.starting,
    restarts: stats.workers.restarts,
    failures: stats.workers.failures,
    reservations: credit.diagnostics().reservations,
    executions: credit.diagnostics().executions,
    creditOperations: credit.diagnostics().operations,
    ...credit.creditDiagnostics(),
    reservedBytes: stats.streamResults.currentReservedResultBytes,
    buffers: stats.streamResults.buffered,
    productionClaims: runtime.dispatcher.admissionReservations,
    reservedWorkers: runtime.dispatcher.reservedWorkers.size,
  };
}
function invariant(runtime) {
  const stats = runtime.stats();
  const credit = runtime.resultCredits;
  const composition = credit.creditDiagnostics();
  assert.equal(
    composition.unreconciledResultBytes + composition.reconciledResultBytes,
    stats.streamResults.currentReservedResultBytes,
  );
  assert.ok(stats.queue.size <= stats.queue.capacity);
  assert.ok(stats.workers.total <= runtime.dispatcher.pool.options.workers);
  assert.equal(
    new Set(stats.workers.details.map((w) => w.id)).size,
    stats.workers.total,
  );
  for (const operation of runtime.rangeCoordinator.operations.values()) {
    if (!operation.stream) continue;
    assert.ok(
      operation.stream.buffered + operation.children.size <=
        operation.stream.capacity,
      'Count credit cap',
    );
    if (operation.resultByteCapacity !== undefined)
      assert.ok(
        credit.reserved(operation) <= operation.resultByteCapacity,
        'Byte credit cap',
      );
  }
}
async function quiescent(runtime, label) {
  await until(() => {
    invariant(runtime);
    const d = inspect(runtime);
    return (
      d.tasks === 0 &&
      d.operations === 0 &&
      d.busy === 0 &&
      d.starting === 0 &&
      d.reservations === 0 &&
      d.executions === 0 &&
      d.reservedBytes === 0
    );
  }, label);
  const d = inspect(runtime);
  for (const key of [
    'tasks',
    'operations',
    'queue',
    'busy',
    'reservations',
    'executions',
    'reservedBytes',
    'buffers',
    'productionClaims',
    'reservedWorkers',
    'unreconciledResultBytes',
    'reconciledResultBytes',
  ])
    assert.equal(d[key], 0, `${label}: ${key}`);
  assert.equal(runtime.resultCredits.diagnostics().operations, 0);
}
async function stop(runtime, label, options) {
  await runtime.shutdown(options);
  await quiescent(runtime, label);
  const d = inspect(runtime);
  assert.equal(d.state, 'stopped');
  assert.equal(d.liveWorkers, 0);
  report.terminals.push({
    label,
    ...d,
    creditOperations: runtime.resultCredits.diagnostics().operations,
    tasksMetrics: runtime.stats().tasks,
    partitions: runtime.stats().partitions,
  });
  runtimes.delete(runtime);
}
function sample(label) {
  for (const runtime of runtimes) invariant(runtime);
  if (report.samples.length < 1000)
    report.samples.push({
      label,
      elapsedMs: performance.now() - started,
      memory: process.memoryUsage(),
      resources: process.getActiveResourcesInfo(),
      runtimes: [...runtimes].map(inspect),
    });
}
async function scenario(id, fn) {
  const start = performance.now();
  const entry = { id, passed: false };
  report.scenarios.push(entry);
  try {
    await fn();
    entry.passed = true;
  } catch (error) {
    entry.failure = error.stack;
    throw error;
  } finally {
    entry.durationMs = performance.now() - start;
    save();
  }
}
const strict = (maximum = 16, extra = {}) => ({
  experimentalMaxBufferedResults: 2,
  experimentalMaxResultBytes: maximum,
  experimentalMaxReservedResultBytes: maximum * 2,
  ...extra,
});
const range = (end = 11, grainSize = 3) => ({ start: 0, end, grainSize });
const warning = (value) =>
  report.warnings.push({ name: value.name, message: value.message });
process.on('warning', warning);
let timer;
try {
  sample('before');
  timer = setInterval(() => sample('periodic'), 250);
  const main = create();
  await main.runtime.ready();
  const { runtime, task } = main;
  for (let cycle = 0; cycle < config.cycles; cycle++) {
    await scenario(`lifecycle-mixed/${cycle}`, async () => {
      const controller = new AbortController();
      const success = [];
      for (let offset = 0; offset < config.batch; offset += 8) {
        const batch = Array.from({ length: 8 }, (_, i) => {
          const value = random() % 10000;
          const result = runtime.run(
            task,
            { value, fail: i === 6, reject: i === 7 },
            { signal: controller.signal, timeout: 5000 },
          );
          if (i >= 6) return expectError(capture(result), PjsTaskError);
          success.push(value);
          return result.then((actual) => assert.equal(actual, value));
        });
        await Promise.all(batch);
      }
      assert.equal(success.length, (config.batch * 3) / 4);
      const aborted = new AbortController();
      aborted.abort();
      await expectError(
        capture(runtime.run(task, { value: 1 }, { signal: aborted.signal })),
        PjsCancelledError,
      );
      await quiescent(runtime, 'mixed lifecycle');
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      assert.equal(getEventListeners(aborted.signal, 'abort').length, 0);
    });
    await scenario(`caller-physical-split/${cycle}`, async () => {
      for (const timeout of [false, true]) {
        const otherControl = gate();
        const other = runtime.run(task, { gate: otherControl, value: 42 });
        await until(() => entered(otherControl) === 1, 'other worker occupied');
        const control = gate();
        const controller = new AbortController();
        const iterator = iteratorOf(
          runtime.streamRange(
            task,
            range(1, 1),
            (p) => ({
              input: { partition: p, gate: control, mode: 'binary', bytes: 1 },
            }),
            strict(1024, {
              signal: controller.signal,
              ...(timeout ? { timeout: 100 } : {}),
            }),
          ),
        );
        const pending = capture(iterator.next());
        await until(() => entered(control) === 1, 'physical worker started');
        if (!timeout) controller.abort();
        await expectError(
          pending,
          timeout ? PjsTimeoutError : PjsCancelledError,
        );
        const settled = inspect(runtime);
        assert.equal(settled.tasks, 1); // Only the unrelated blocked caller remains.
        assert.equal(settled.busy, 2);
        assert.equal(settled.reservedBytes, 1024);
        assert.equal(settled.unreconciledResultBytes, 1024);
        assert.equal(settled.reservations, 1);
        assert.equal(settled.executions, 1);
        assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
        if (cycle < 3)
          report.physicalSplits.push({
            cycle,
            timeout,
            callerSettled: settled,
          });
        const counter = new SharedArrayBuffer(4);
        const queued = runtime.run(task, { counter, value: 9 });
        assert.equal(runtime.stats().queue.size, 1);
        assert.equal(Atomics.load(new Int32Array(counter), 0), 0);
        open(control);
        assert.equal(await queued, 9);
        assert.equal(Atomics.load(new Int32Array(counter), 0), 1);
        open(otherControl);
        assert.equal(await other, 42);
        await quiescent(runtime, 'physical completion releases maximum once');
      }
    });
    await scenario(`queued-cancel-timeout/${cycle}`, async () => {
      const control = gate();
      const blocked = Array.from({ length: 2 }, () =>
        runtime.run(task, { gate: control, value: 7 }),
      );
      await until(() => entered(control) === 2, 'both workers occupied');
      const counter = new SharedArrayBuffer(4);
      const data = new Uint8Array([1, 2, 3]);
      const controller = new AbortController();
      const queued = capture(
        runtime.run(
          task,
          { counter, value: 4, data },
          { signal: controller.signal, transferList: [data.buffer] },
        ),
      );
      controller.abort();
      await expectError(queued, PjsCancelledError);
      assert.equal(data.byteLength, 3);
      await expectError(
        capture(runtime.run(task, { counter, value: 4 }, { timeout: 10 })),
        PjsTimeoutError,
      );
      assert.equal(
        Atomics.load(new Int32Array(counter), 0),
        0,
        'Queued body never started',
      );
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      open(control);
      await Promise.all(blocked);
      const echoed = await runtime.run(
        task,
        { mode: 'echo', data },
        { transferList: [data.buffer] },
      );
      assert.equal(data.byteLength, 0);
      assert.deepEqual([...echoed], [1, 2, 3]);
      await quiescent(runtime, 'queued ownership claim released');
    });
    await scenario(`streams-refunds-ownership/${cycle}`, async () => {
      for (const exact of [true, false]) {
        const countCap = cycle % 2 ? 4 : 1;
        const sizes = [0, 1, 16, 64, 0, 8, 2, 64];
        const before = runtime.stats().streamResults;
        const outputs = [];
        const stream = runtime.streamRange(
          task,
          range(sizes.length, 1),
          (p) => ({
            input: {
              partition: p,
              mode: 'binary',
              bytes: sizes[p.index],
              move: p.index % 2 === 0,
            },
          }),
          {
            experimentalMaxBufferedResults: countCap,
            ...(exact
              ? { experimentalResultBytes: (p) => sizes[p.index] }
              : { experimentalMaxResultBytes: 64 }),
            experimentalMaxReservedResultBytes: 128,
          },
        );
        for await (const result of stream) {
          invariant(runtime);
          assert.equal(result.output.byteLength, sizes[result.partition.index]);
          assert.ok(result.output.every((v) => v === result.partition.index));
          outputs.push(result.partition.index);
          await delay(1); // Controlled slow consumer, no latency claim.
        }
        assert.deepEqual(
          outputs.sort((a, b) => a - b),
          sizes.map((_, i) => i),
        );
        const after = runtime.stats().streamResults;
        if (!exact) {
          assert.equal(
            after.upperBoundResultsReconciled -
              before.upperBoundResultsReconciled,
            sizes.length,
          );
          assert.equal(
            after.refundedResultBytes - before.refundedResultBytes,
            sizes.reduce((n, a) => n + 64 - a, 0),
          );
          assert.equal(
            after.resultByteRefunds - before.resultByteRefunds,
            sizes.filter((a) => a < 64).length,
          );
        }
        await quiescent(runtime, 'all stream credits released');
      }
      const source = new Float64Array([1, 2, 3, 4, 5]);
      const shared = sharedReadonly(source);
      const clone = runtime.run(task, { mode: 'sum', data: source });
      const sharedResults = Array.from({ length: 4 }, () =>
        runtime.run(task, { mode: 'sum', data: shared }),
      );
      const moved = new Uint8Array([9, 8, 7]);
      const movedResult = runtime.run(
        task,
        { mode: 'echo', data: moved },
        { transferList: [moved.buffer] },
      );
      assert.equal(await clone, 15);
      assert.deepEqual(await Promise.all(sharedResults), [15, 15, 15, 15]);
      assert.deepEqual([...(await movedResult)], [9, 8, 7]);
      assert.equal(moved.byteLength, 0);
      assert.deepEqual([...source], [1, 2, 3, 4, 5]);
      assert.deepEqual([...shared], [...source]);
    });
    await scenario(`range-boundaries-map-discard/${cycle}`, async () => {
      for (const [end, grain] of [
        [0, 4],
        [1, 4],
        [11, 3],
        [12, 3],
        [3, 99],
      ]) {
        const expected = Array.from({ length: end }, (_, i) => i);
        const plan = range(end, grain);
        const blocks = await runtime.partitionRange(task, plan, (p) => ({
          input: { partition: p, mode: 'range' },
        }));
        assert.deepEqual(blocks.flat(), expected);
        const mapped = await runtime.parallelMapRange(
          task,
          plan,
          (p) => ({ input: { partition: p, mode: 'map' } }),
          { experimentalOutputConstructor: Float64Array },
        );
        assert.ok(mapped instanceof Float64Array);
        assert.deepEqual(
          [...mapped],
          expected.map((i) => i * 2),
        );
        assert.equal(
          await runtime.parallelFor(task, plan, (p) => ({
            input: { partition: p, mode: 'discard' },
          })),
          undefined,
        );
      }
      if (cycle === 0) {
        const mapped = await runtime.parallelMapRange(
          task,
          range(10001, 128),
          (p) => ({ input: { partition: p, mode: 'map' } }),
          { experimentalOutputConstructor: Float64Array },
        );
        assert.equal(mapped.length, 10001);
        assert.equal(mapped[10000], 20000);
      }
      await quiescent(runtime, 'ranges/typed tails/discard');
    });
    if (cycle % 10 === 0) sample(`cycle/${cycle}`);
  }
  await scenario('completion-order/no-missing-or-overlap', async () => {
    const control = gate();
    const iterator = iteratorOf(
      runtime.streamRange(
        task,
        range(11, 3),
        (p) => ({
          input: {
            partition: p,
            mode: 'range',
            ...(p.index === 0 ? { gate: control } : {}),
          },
        }),
        { experimentalMaxBufferedResults: 4 },
      ),
    );
    const first = await iterator.next();
    assert.equal(first.done, false);
    assert.notEqual(first.value.partition.index, 0);
    await until(
      () => entered(control) === 1,
      'delayed first partition started',
    );
    open(control);
    const values = [first.value];
    for await (const value of iterator) values.push(value);
    assert.equal(values.length, 4);
    assert.deepEqual(
      values.flatMap((v) => v.output).sort((a, b) => a - b),
      Array.from({ length: 11 }, (_, i) => i),
    );
  });
  await scenario('consumer-break-return-throw-and-timeout', async () => {
    for (const action of ['break', 'return', 'throw', 'abort', 'timeout']) {
      const controller = new AbortController();
      const iterator = iteratorOf(
        runtime.streamRange(
          task,
          range(30, 1),
          (p) => ({ input: { partition: p, mode: 'binary', bytes: 16 } }),
          strict(16, {
            signal: controller.signal,
            ...(action === 'timeout' ? { timeout: 100 } : {}),
          }),
        ),
      );
      if (action === 'break') {
        for await (const value of iterator) {
          assert.equal(value.output.byteLength, 16);
          break;
        }
      } else {
        await until(
          () => runtime.stats().streamResults.buffered > 0,
          'stream buffered',
        );
        if (action === 'return')
          assert.equal((await iterator.return()).done, true);
        if (action === 'throw')
          await assert.rejects(
            iterator.throw(new Error('consumer failure')),
            /consumer failure/,
          );
        if (action === 'abort') {
          controller.abort();
          await expectError(capture(iterator.next()), PjsCancelledError);
        }
        if (action === 'timeout') {
          await until(
            () => runtime.stats().operations.pending === 0,
            'consumer wait deadline',
          );
          await expectError(capture(iterator.next()), PjsTimeoutError);
        }
      }
      await quiescent(runtime, `consumer ${action}`);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    }
    // Active return cancels queued siblings but cannot terminate posted physical work.
    const control = gate();
    const counter = new SharedArrayBuffer(40);
    const iterator = iteratorOf(
      runtime.streamRange(
        task,
        range(10, 1),
        (p) => ({
          input: {
            partition: p,
            gate: control,
            counter,
            mode: 'binary',
            bytes: 8,
          },
        }),
        strict(8),
      ),
    );
    await until(() => entered(control) === 2, 'two physical stream jobs');
    await iterator.return();
    assert.equal(runtime.stats().workers.busy, 2);
    open(control);
    await quiescent(runtime, 'active return late results');
    assert.equal(
      [...new Int32Array(counter)].reduce((a, b) => a + b, 0),
      2,
    );
  });
  await scenario('public-error-identities-and-recovery', async () => {
    recordSyncError(
      () => main.registry.register('rc-work', fixture, 'work'),
      PjsTaskRegistrationError,
    );
    recordSyncError(
      () => main.registry.register('', fixture, 'work'),
      PjsTaskRegistrationError,
    );
    recordSyncError(
      () =>
        main.registry.register(
          'http',
          'https://example.invalid/task.mjs',
          'work',
        ),
      PjsTaskRegistrationError,
    );
    const foreign = new PjsTaskRegistry().register('foreign', fixture, 'work');
    await expectError(
      capture(runtime.run(foreign, {})),
      PjsTaskRegistrationError,
    );
    recordSyncError(
      () => transfer(new Uint8Array(1), [new SharedArrayBuffer(1)]),
      PjsSerializationError,
    );
    await expectError(
      capture(runtime.run(task, { fn: () => 1 })),
      PjsSerializationError,
    );
    await expectError(
      capture(
        runtime.partitionRange(task, range(1, 1), () => {
          throw new Error('factory failure');
        }),
      ),
      PjsError,
    );
    await expectError(
      capture(
        runtime.parallelMapRange(
          task,
          range(2, 1),
          (p) => ({ input: { partition: p, mode: 'map', lengthDelta: 1 } }),
          { experimentalOutputConstructor: Float64Array },
        ),
      ),
      PjsMapContractError,
    );
    for (const exact of [true, false]) {
      const stream = runtime.streamRange(
        task,
        range(1, 1),
        (p) => ({ input: { partition: p, mode: 'binary', bytes: 17 } }),
        exact
          ? {
              experimentalResultBytes: 16,
              experimentalMaxReservedResultBytes: 16,
            }
          : strict(16),
      );
      await expectError(
        capture(iteratorOf(stream).next()),
        PjsBinaryResultContractError,
      );
    }
    const smaller = runtime.streamRange(
      task,
      range(1, 1),
      (p) => ({ input: { partition: p, mode: 'binary', bytes: 15 } }),
      { experimentalResultBytes: 16, experimentalMaxReservedResultBytes: 16 },
    );
    await expectError(
      capture(iteratorOf(smaller).next()),
      PjsBinaryResultContractError,
    );
    const capacity = runtime.streamRange(
      task,
      range(1, 1),
      (p) => ({ input: { partition: p, mode: 'binary', bytes: 16 } }),
      { experimentalResultBytes: 16, experimentalMaxReservedResultBytes: 8 },
    );
    await expectError(
      capture(iteratorOf(capacity).next()),
      PjsResultCapacityError,
    );
    await quiescent(runtime, 'all contract errors cleaned');
    assert.equal(await runtime.run(task, { value: 91 }), 91);
    for (const badExport of [false, true]) {
      const registry = new PjsTaskRegistry();
      registry.register(
        'broken',
        badExport ? fixture : new URL('./missing-module.mjs', fixture),
        badExport ? 'missingExport' : 'work',
      );
      const broken = new PjsRuntime({ registry, workers: 1, maxRestarts: 2 });
      runtimes.add(broken);
      await expectError(capture(broken.ready()), PjsWorkerError);
      await stop(broken, 'fatal module/export startup', { drain: false });
      assert.equal(broken.stats().workers.restarts, 0);
    }
  });
  await scenario('bounded-worker-crashes-and-storm', async () => {
    for (let i = 0; i < config.crashes; i++) {
      const controller = new AbortController();
      await expectError(
        capture(
          runtime.run(task, { crash: true }, { signal: controller.signal }),
        ),
        PjsWorkerError,
      );
      await until(
        () =>
          runtime.stats().workers.total === 2 &&
          runtime.stats().workers.idle === 2,
        'replacement target',
      );
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      assert.equal(await runtime.run(task, { value: i }), i);
    }
    const storm = create({ workers: 2, maxRestarts: 4 });
    await storm.runtime.ready();
    const control = gate();
    const failures = Array.from({ length: 2 }, () =>
      expectError(
        capture(storm.runtime.run(storm.task, { gate: control, crash: true })),
        PjsWorkerError,
      ),
    );
    await until(
      () => entered(control) === 2,
      'storm simultaneous active workers',
    );
    open(control);
    await Promise.all(failures);
    await until(
      () => storm.runtime.stats().workers.idle === 2,
      'storm repaired',
    );
    assert.equal(storm.runtime.stats().workers.restarts, 2);
    assert.equal(storm.runtime.stats().workers.total, 2);
    assert.equal(await storm.runtime.run(storm.task, { value: 12 }), 12);
    await stop(storm.runtime, 'bounded storm');
    const exhausted = create({ workers: 1, maxRestarts: 0 });
    await exhausted.runtime.ready();
    await expectError(
      capture(exhausted.runtime.run(exhausted.task, { crash: true })),
      PjsWorkerError,
    );
    await until(
      () => exhausted.runtime.stats().state === 'failed',
      'restart exhaustion fatal',
    );
    await expectError(
      capture(exhausted.runtime.run(exhausted.task, {})),
      PjsRuntimeStateError,
    );
    await stop(exhausted.runtime, 'restart exhaustion', { drain: false });
  });
  await scenario('deep-queue-FIFO-overflow-recovery', async () => {
    const fifo = create({ workers: 1, maxQueue: 128 });
    await fifo.runtime.ready();
    const control = gate();
    const blocker = fifo.runtime.run(fifo.task, { gate: control, value: -1 });
    await until(() => entered(control) === 1, 'FIFO blocker');
    const order = [];
    const queued = Array.from({ length: 128 }, (_, value) =>
      fifo.runtime.run(fifo.task, { value }).then((actual) => {
        assert.equal(actual, value);
        order.push(actual);
      }),
    );
    assert.equal(fifo.runtime.stats().queue.size, 128);
    await expectError(
      capture(fifo.runtime.run(fifo.task, { value: 129 })),
      PjsQueueFullError,
    );
    open(control);
    await blocker;
    await Promise.all(queued);
    assert.deepEqual(
      order,
      Array.from({ length: 128 }, (_, i) => i),
    );
    assert.equal(await fifo.runtime.run(fifo.task, { value: 900 }), 900);
    await stop(fifo.runtime, 'deep queue');
  });
  await scenario('small-parallel-CPU-smoke', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        runtime.run(task, { mode: 'cpu', iterations: 100000 }),
      ),
    );
    assert.ok(
      results.every(
        (r) => Number.isFinite(r.value) && r.value === results[0].value,
      ),
    );
    assert.equal(new Set(results.map((r) => r.threadId)).size, 2);
    report.cpuSmoke = {
      tasks: 8,
      iterations: 100000,
      workerThreadIds: [...new Set(results.map((r) => r.threadId))],
      value: results[0].value,
      noPerformanceClaim: true,
    };
  });
  await stop(runtime, 'main after repetition');
  await scenario('shutdown-matrix-identity-and-first-mode', async () => {
    for (const state of [
      'idle',
      'completed',
      'active-graceful',
      'queued-forced',
      'stream-graceful',
      'stream-forced',
      'cancelled-active',
      'replacement',
    ]) {
      const item = create({ workers: 1 });
      await item.runtime.ready();
      const control = gate();
      let pending;
      let iterator;
      if (state === 'completed')
        assert.equal(await item.runtime.run(item.task, { value: 3 }), 3);
      if (
        ['active-graceful', 'queued-forced', 'cancelled-active'].includes(state)
      ) {
        const controller = new AbortController();
        pending = capture(
          item.runtime.run(
            item.task,
            { gate: control, value: 7 },
            { signal: controller.signal },
          ),
        );
        await until(() => entered(control) === 1, 'shutdown active');
        if (state === 'cancelled-active') {
          controller.abort();
          await expectError(pending, PjsCancelledError);
        }
      }
      let queued;
      if (state === 'queued-forced')
        queued = capture(item.runtime.run(item.task, { value: 9 }));
      if (state.startsWith('stream-'))
        iterator = iteratorOf(
          item.runtime.streamRange(
            item.task,
            range(5, 1),
            (p) => ({ input: { partition: p, mode: 'binary', bytes: 8 } }),
            strict(8),
          ),
        );
      if (state === 'replacement')
        await expectError(
          capture(item.runtime.run(item.task, { crash: true })),
          PjsWorkerError,
        );
      const force = state.endsWith('forced');
      const shutdown = item.runtime.shutdown({ drain: !force });
      assert.equal(item.runtime.shutdown({ drain: force }), shutdown);
      await expectError(
        capture(item.runtime.run(item.task, {})),
        PjsRuntimeStateError,
      );
      if (iterator) {
        if (force)
          await expectError(capture(iterator.next()), PjsCancelledError);
        else {
          let count = 0;
          for await (const value of iterator) {
            assert.equal(value.output.byteLength, 8);
            count++;
          }
          assert.equal(count, 5);
        }
      }
      if (!force) open(control);
      if (pending && state !== 'cancelled-active') {
        if (force) await expectError(pending, PjsCancelledError);
        else assert.equal((await pending).value, 7);
      }
      if (queued) await expectError(queued, PjsCancelledError);
      await shutdown;
      assert.equal(item.runtime.shutdown(), shutdown);
      await expectError(
        capture(item.runtime.run(item.task, {})),
        PjsRuntimeStateError,
      );
      await stop(item.runtime, `shutdown/${state}`);
    }
  });
  await scenario('multiple-runtimes-isolated', async () => {
    const a = create({ workers: 1, maxQueue: 1 });
    const b = create({ workers: 1, maxQueue: 3 });
    await Promise.all([a.runtime.ready(), b.runtime.ready()]);
    assert.notEqual(
      a.runtime.stats().workers.details[0].threadId,
      b.runtime.stats().workers.details[0].threadId,
    );
    const control = gate();
    const blocked = capture(a.runtime.run(a.task, { gate: control, value: 1 }));
    await until(() => entered(control) === 1, 'pool A blocked');
    const queued = capture(a.runtime.run(a.task, { value: 2 }));
    await expectError(
      capture(a.runtime.run(a.task, { value: 3 })),
      PjsQueueFullError,
    );
    assert.equal(await b.runtime.run(b.task, { value: 4 }), 4);
    await stop(a.runtime, 'isolated A', { drain: false });
    await expectError(blocked, PjsCancelledError);
    await expectError(queued, PjsCancelledError);
    assert.equal(b.runtime.stats().workers.failures, 0);
    assert.equal(await b.runtime.run(b.task, { value: 5 }), 5);
    await stop(b.runtime, 'isolated B');
  });
  await scenario('repeat-construct-run-shutdown', async () => {
    for (let i = 0; i < config.churn; i++) {
      const item = create({ workers: 1 });
      assert.equal(
        await item.runtime.run(item.task, { value: i }, { timeout: 5000 }),
        i,
      );
      await stop(item.runtime, `churn/${i}`);
      if (i % 10 === 0) sample(`churn/${i}`);
    }
  });
  clearInterval(timer);
  timer = undefined;
  await delay(30);
  sample('after-shutdown');
  assert.ok(
    !report.samples
      .at(-1)
      .resources.some((resource) =>
        ['Timeout', 'MessagePort'].includes(resource),
      ),
    'No runtime timer or worker message-port resources after shutdown',
  );
  assert.equal(runtimes.size, 0);
  assert.equal(report.warnings.length, 0, 'Unexpected Node warnings');
  const errors = Object.keys(api)
    .filter((name) => name.endsWith('Error'))
    .sort();
  assert.equal(errors.length, 12);
  assert.deepEqual(Object.keys(report.publicErrors).sort(), errors);
  report.operationCounts = report.terminals.reduce(
    (sum, t) => ({
      accepted: sum.accepted + t.tasksMetrics.accepted,
      rejected: sum.rejected + t.tasksMetrics.rejected,
      completed: sum.completed + t.tasksMetrics.completed,
      failed: sum.failed + t.tasksMetrics.failed,
      cancelled: sum.cancelled + t.tasksMetrics.cancelled,
      timedOut: sum.timedOut + t.tasksMetrics.timedOut,
    }),
    {
      accepted: 0,
      rejected: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timedOut: 0,
    },
  );
  report.naturalExit =
    'Harness uses no process.exit; parent watchdog reports success only after natural child exit';
  report.durationMs = performance.now() - started;
  report.passed = true;
  save();
  console.log(
    JSON.stringify({
      passed: true,
      profile,
      node: process.version,
      scenarios: report.scenarios.length,
      operations: report.operationCounts,
      durationMs: report.durationMs,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  save();
  throw error;
} finally {
  if (timer) clearInterval(timer);
  await Promise.allSettled(
    [...runtimes].map((runtime) => runtime.shutdown({ drain: false })),
  );
  process.removeListener('warning', warning);
}
