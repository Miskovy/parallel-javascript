import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getEventListeners } from 'node:events';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsTaskError,
  PjsWorkerError,
  PjsQueueFullError,
  PjsTimeoutError,
  PjsCancelledError,
  PjsSerializationError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
} from '../dist/index.js';
import { PjsScheduler } from '../dist/scheduler/fifo.js';
import { countPrimes } from '../../../benchmarks/prime-search/task.mjs';

const module = new URL('./fixtures/tasks.mjs', import.meta.url);
function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    [
      'echo',
      'wait',
      'fail',
      'crash',
      'uncaught',
      'badOutput',
      'badProtocol',
      'hang',
      'barrier',
      'gate',
      'strangeError',
    ].map((name) => [name, registry.register(name, module, name)]),
  );
  const primes = registry.register(
    'primes',
    new URL('../../../benchmarks/prime-search/task.mjs', import.meta.url),
    'countPrimes',
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxQueue: 100,
    ...options,
  });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, tasks: { ...tasks, primes }, registry };
}
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('condition not reached');
    await delay(2);
  }
}
function release(buffer) {
  const values = new Int32Array(buffer);
  Atomics.store(values, 1, 1);
  Atomics.notify(values, 1);
}

test('executes before explicit readiness, reuses a worker, and clones input', async (t) => {
  const { runtime, tasks } = setup(t);
  const input = { values: new Uint32Array([1, 2, 3]) };
  const first = await runtime.run(tasks.echo, input);
  const second = await runtime.run(tasks.echo, 42);
  assert.deepEqual(first.input, input);
  assert.notEqual(first.input, input);
  assert.ok(first.threadId > 0);
  assert.equal(second.threadId, first.threadId);
  assert.equal(second.executions, 2);
  assert.equal(runtime.stats().tasks.completed, 2);
});

test('CPU tasks execute simultaneously in four distinct isolates', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 4 });
  await runtime.ready();
  const buffer = new SharedArrayBuffer(4);
  const threads = await Promise.all(
    Array.from({ length: 4 }, () =>
      runtime.run(tasks.barrier, { buffer, participants: 4 }),
    ),
  );
  assert.equal(new Set(threads).size, 4);
  const counts = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      runtime.run(tasks.primes, { from: i * 25_000, to: (i + 1) * 25_000 }),
    ),
  );
  assert.equal(
    counts.reduce((sum, result) => sum + result.count, 0),
    9592,
  );
  assert.equal(countPrimes({ from: 0, to: 100_000 }).count, 9592);
});

test('FIFO queue, queued removal, and bounded admission', async (t) => {
  const { runtime, tasks } = setup(t, { maxQueue: 2 });
  await runtime.ready();
  const buffer = new SharedArrayBuffer(8);
  const active = runtime.run(tasks.gate, { buffer });
  const controller = new AbortController();
  const removed = runtime.run(tasks.echo, 'removed', {
    signal: controller.signal,
  });
  const removedCheck = assert.rejects(removed, PjsCancelledError);
  const order = [];
  const a = runtime
    .run(tasks.echo, 'a')
    .then((result) => order.push(result.input));
  await assert.rejects(runtime.run(tasks.echo, 'overflow'), PjsQueueFullError);
  controller.abort();
  await removedCheck;
  const b = runtime
    .run(tasks.echo, 'b')
    .then((result) => order.push(result.input));
  assert.equal(runtime.stats().queue.size, 2);
  release(buffer);
  await Promise.all([active, a, b]);
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(runtime.stats().tasks.pending, 0);
});

test('zero queue accepts only immediately idle capacity', async (t) => {
  const { runtime, tasks } = setup(t, { maxQueue: 0 });
  await assert.rejects(runtime.run(tasks.echo, 1), PjsQueueFullError);
  await runtime.ready();
  const a = runtime.run(tasks.wait, { ms: 20, value: 1 });
  await assert.rejects(runtime.run(tasks.echo, 2), PjsQueueFullError);
  assert.equal(await a, 1);
});

test('task errors retain remote details and serialization failures preserve worker health', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  await assert.rejects(runtime.run(tasks.fail, null), (error) => {
    assert.ok(error instanceof PjsTaskError);
    assert.equal(error.remoteName, 'RangeError');
    assert.match(error.remoteStack, /deliberate task failure/);
    assert.ok(error.taskId);
    assert.ok(error.workerId);
    return true;
  });
  await assert.rejects(
    runtime.run(tasks.echo, () => 0),
    PjsSerializationError,
  );
  await assert.rejects(
    runtime.run(tasks.badOutput, null),
    PjsSerializationError,
  );
  await assert.rejects(runtime.run(tasks.strangeError, null), PjsTaskError);
  assert.equal((await runtime.run(tasks.echo, 'healthy')).input, 'healthy');
  assert.equal(runtime.stats().workers.failures, 0);
});

for (const code of [0, 23])
  test(`worker exit ${code} fails its task once and replaces the worker`, async (t) => {
    const { runtime, tasks } = setup(t);
    await runtime.ready();
    const originalId = runtime.stats().workers.details[0].id;
    const crash = assert.rejects(
      runtime.run(tasks.crash, code),
      (error) =>
        error instanceof PjsWorkerError &&
        error.workerId === originalId &&
        !!error.taskId,
    );
    const queued = runtime.run(tasks.echo, 'survived');
    await crash;
    assert.equal((await queued).input, 'survived');
    const stats = runtime.stats();
    assert.equal(stats.workers.failures, 1);
    assert.equal(stats.workers.restarts, 1);
    assert.notEqual(stats.workers.details[0].id, originalId);
    assert.equal(stats.tasks.failed, 1);
  });

test('invalid worker messages fail the occupied task and recover', async (t) => {
  const { runtime, tasks } = setup(t);
  await assert.rejects(runtime.run(tasks.badProtocol, null), PjsWorkerError);
  assert.equal((await runtime.run(tasks.echo, 3)).input, 3);
});

test('uncaught error followed by exit counts once and recovers', async (t) => {
  const { runtime, tasks } = setup(t);
  await assert.rejects(runtime.run(tasks.uncaught, null), (error) => {
    assert.ok(error instanceof PjsWorkerError);
    assert.match(error.message, /uncaught worker exception/);
    return true;
  });
  await runtime.run(tasks.echo, 1);
  assert.equal(runtime.stats().workers.failures, 1);
  assert.equal(runtime.stats().workers.restarts, 1);
});

test('abort listeners and timers are removed after successful and failed settlement', async (t) => {
  const { runtime, tasks } = setup(t);
  const controller = new AbortController();
  const options = { signal: controller.signal, timeout: 2000 };
  await runtime.run(tasks.echo, 1, options);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await assert.rejects(runtime.run(tasks.fail, null, options), PjsTaskError);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  controller.abort();
  assert.equal(runtime.stats().tasks.cancelled, 0);
});

test('serialization getters may enqueue and throw without stranding the queue', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  let queued;
  const input = {
    get value() {
      queued = runtime.run(tasks.echo, 'queued reentrantly');
      throw new Error('getter failed');
    },
  };
  await assert.rejects(runtime.run(tasks.echo, input), PjsSerializationError);
  assert.equal((await queued).input, 'queued reentrantly');
  assert.equal(runtime.stats().tasks.pending, 0);
});

test('bounded crash replacement fails remaining work when budget is exhausted', async (t) => {
  const { runtime, tasks } = setup(t, { maxRestarts: 0 });
  await runtime.ready();
  const outcomes = await Promise.allSettled([
    runtime.run(tasks.crash, 1),
    runtime.run(tasks.echo, 2),
  ]);
  assert.ok(
    outcomes.every(
      (result) =>
        result.status === 'rejected' && result.reason instanceof PjsWorkerError,
    ),
  );
  assert.equal(runtime.stats().state, 'failed');
  assert.equal(runtime.stats().workers.restarts, 0);
  await runtime.shutdown();
  assert.equal(runtime.stats().state, 'stopped');
});

test('queued deadlines remove bookkeeping; pre-abort never enters the queue', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const buffer = new SharedArrayBuffer(8);
  const active = runtime.run(tasks.gate, { buffer });
  await assert.rejects(
    runtime.run(tasks.echo, 2, { timeout: 10 }),
    PjsTimeoutError,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runtime.run(tasks.echo, 3, { signal: controller.signal }),
    PjsCancelledError,
  );
  assert.equal(runtime.stats().queue.size, 0);
  assert.equal(runtime.stats().tasks.pending, 1);
  release(buffer);
  await active;
});

for (const mode of ['abort', 'timeout'])
  test(`running ${mode} settles caller without releasing execution capacity`, async (t) => {
    const { runtime, tasks } = setup(t);
    await runtime.ready();
    const controller = new AbortController();
    const buffer = new SharedArrayBuffer(8);
    const result = runtime.run(
      tasks.gate,
      { buffer },
      mode === 'abort' ? { signal: controller.signal } : { timeout: 100 },
    );
    const rejected = assert.rejects(
      result,
      mode === 'abort' ? PjsCancelledError : PjsTimeoutError,
    );
    await until(() => Atomics.load(new Int32Array(buffer), 0) === 1);
    controller.abort();
    await rejected;
    assert.equal(runtime.stats().tasks.pending, 0);
    assert.equal(runtime.stats().workers.busy, 1);
    let resolved = false;
    const next = runtime.run(tasks.echo, 4).then((value) => {
      resolved = true;
      return value;
    });
    await delay(10);
    assert.equal(resolved, false);
    const shutdown = runtime.shutdown();
    release(buffer);
    assert.equal((await next).input, 4);
    await shutdown;
    assert.equal(runtime.stats().tasks.completed, 1);
    assert.equal(runtime.stats().timing.executionSamples, 2);
  });

test('graceful shutdown drains startup, active, and queued work, and is idempotent', async (t) => {
  const { runtime, tasks } = setup(t);
  const results = Array.from({ length: 10 }, (_, i) =>
    runtime.run(tasks.echo, i),
  );
  const shutdown = runtime.shutdown();
  assert.equal(runtime.shutdown(), shutdown);
  await assert.rejects(runtime.run(tasks.echo, 11), PjsRuntimeStateError);
  assert.deepEqual(
    (await Promise.all(results)).map((r) => r.input),
    Array.from({ length: 10 }, (_, i) => i),
  );
  await shutdown;
  assert.equal(runtime.stats().state, 'stopped');
  assert.ok(
    runtime
      .stats()
      .workers.details.every((worker) => worker.status === 'stopped'),
  );
});

test('shutdown handles a crash while draining accepted work', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const crashed = assert.rejects(runtime.run(tasks.crash, 1), PjsWorkerError);
  const queued = runtime.run(tasks.echo, 'drained');
  const shutdown = runtime.shutdown();
  await crashed;
  assert.equal((await queued).input, 'drained');
  await shutdown;
});

test('explicit non-draining shutdown terminates uncooperative work', async (t) => {
  const { runtime, tasks } = setup(t);
  await runtime.ready();
  const active = assert.rejects(
    runtime.run(tasks.hang, null),
    PjsCancelledError,
  );
  const queued = assert.rejects(
    runtime.run(tasks.echo, null),
    PjsCancelledError,
  );
  await until(() =>
    runtime.stats().activeTasks.some((task) => task.status === 'running'),
  );
  await runtime.shutdown({ drain: false });
  await Promise.all([active, queued]);
  assert.equal(runtime.stats().tasks.pending, 0);
});

test('shutdown during startup cancels tasks without spawning replacements', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 4 });
  const check = assert.rejects(runtime.run(tasks.echo, 1), PjsCancelledError);
  await runtime.shutdown({ drain: false });
  await check;
  assert.equal(runtime.stats().workers.restarts, 0);
});

for (const fixture of ['broken.mjs', 'hanging-import.mjs', 'missing.mjs'])
  test(`bootstrap failure is bounded: ${fixture}`, async (t) => {
    const registry = new PjsTaskRegistry();
    const task = registry.register(
      'broken',
      new URL(`./fixtures/${fixture}`, import.meta.url),
    );
    const runtime = new PjsRuntime({
      registry,
      workers: 2,
      startupTimeout: 1000,
    });
    t.after(() => runtime.shutdown({ drain: false }));
    const result = assert.rejects(runtime.run(task, null), PjsWorkerError);
    await assert.rejects(runtime.ready(), PjsWorkerError);
    await result;
    assert.equal(runtime.stats().workers.restarts, 0);
    await runtime.shutdown();
  });

test('configuration and registry boundaries are checked', async (t) => {
  const { runtime, tasks, registry } = setup(t, {
    minWorkers: 1,
    maxWorkers: 2,
  });
  assert.throws(
    () => registry.register('echo', module),
    PjsTaskRegistrationError,
  );
  assert.throws(
    () => registry.register('remote', new URL('https://example.com/task.js')),
    PjsTaskRegistrationError,
  );
  const late = registry.register('late', module, 'echo');
  await assert.rejects(runtime.run(late, null), PjsTaskRegistrationError);
  await assert.rejects(
    runtime.run({ id: 'echo' }, null),
    PjsTaskRegistrationError,
  );
  await assert.rejects(
    runtime.run(tasks.echo, null, { timeout: Infinity }),
    RangeError,
  );
  for (const options of [
    { workers: 0 },
    { minWorkers: 3, maxWorkers: 2 },
    { maxQueue: -1 },
    { startupTimeout: 0 },
  ])
    assert.throws(() => new PjsRuntime({ registry, ...options }), RangeError);
});

test('stress mixed concurrent outcomes preserve accounting and release listeners', async (t) => {
  const { runtime, tasks } = setup(t, { workers: 4, maxQueue: 600 });
  await runtime.ready();
  const promises = Array.from({ length: 500 }, (_, i) => {
    if (i % 7 === 0) return runtime.run(tasks.fail, i);
    const controller = new AbortController();
    const promise = runtime.run(tasks.echo, i, { signal: controller.signal });
    if (i % 5 === 0) controller.abort();
    return promise;
  });
  const results = await Promise.allSettled(promises);
  await runtime.shutdown();
  const stats = runtime.stats();
  assert.equal(stats.tasks.accepted, 500);
  assert.equal(stats.tasks.pending, 0);
  assert.equal(stats.queue.size, 0);
  assert.equal(
    stats.tasks.completed +
      stats.tasks.failed +
      stats.tasks.cancelled +
      stats.tasks.timedOut,
    500,
  );
  assert.equal(
    results.filter((r) => r.status === 'fulfilled').length,
    stats.tasks.completed,
  );
  assert.equal(stats.workers.failures, 0);
  assert.ok(stats.timing.averageQueueMs >= 0);
});

test('scheduler policy is independent of worker transport', () => {
  const scheduler = new PjsScheduler(3);
  scheduler.enqueue({ id: 'a' });
  scheduler.enqueue({ id: 'b' });
  scheduler.enqueue({ id: 'c' });
  assert.equal(scheduler.next({ status: 'busy' }), undefined);
  assert.equal(scheduler.remove('b').id, 'b');
  assert.equal(scheduler.next({ status: 'idle' }).id, 'a');
  assert.equal(scheduler.next({ status: 'idle' }).id, 'c');
  assert.equal(scheduler.size, 0);
});

test('scheduler capacity and size count logical admission weight', () => {
  const scheduler = new PjsScheduler(4);
  scheduler.enqueue({ id: 'batch', admissionWeight: 3 });
  scheduler.enqueue({ id: 'ordinary' });
  assert.equal(scheduler.size, 4);
  assert.throws(() => scheduler.enqueue({ id: 'overflow' }), PjsQueueFullError);
  assert.equal(scheduler.remove('ordinary').id, 'ordinary');
  assert.equal(scheduler.size, 3);
  assert.equal(scheduler.next({ status: 'idle' }).id, 'batch');
  assert.equal(scheduler.size, 0);
});
