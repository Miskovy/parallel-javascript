import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setImmediate as immediate } from 'node:timers/promises';
import { PjsRuntime, PjsTaskRegistry } from '../../dist/index.js';
import { assertOwners, until } from './containment.mjs';

export { until, firstWorker, controlExit, clock } from './containment.mjs';
export const fixture = new URL('../fixtures/memory-tasks.mjs', import.meta.url);
export const range = (count) => ({ start: 0, end: count, grainSize: 1 });
export const gate = () => new SharedArrayBuffer(8);
export const entered = (buffer) => Atomics.load(new Int32Array(buffer), 0);
export function open(buffer) {
  const view = new Int32Array(buffer);
  Atomics.store(view, 1, 1);
  Atomics.notify(view, 1);
}
export function create(options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    ['echo', 'inspect', 'move', 'binary', 'crash', 'hang', 'memory'].map(
      (name) => [name, registry.register(name, fixture, name)],
    ),
  );
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxQueue: 8,
    ...options,
  });
  return { runtime, tasks };
}

/** Numeric observations only: sampling must not become a payload owner. */
export function inspect(runtime) {
  const stats = runtime.stats();
  const pool = runtime.dispatcher.pool;
  const workers = [...pool.workers.values()];
  const credits = runtime.resultCredits;
  return {
    state: stats.state,
    pending: stats.tasks.pending,
    operations: stats.operations.pending,
    queue: stats.queue.size,
    physical: stats.workers.busy,
    workerRecords: workers.length,
    liveWorkers: workers.filter((w) => !w.exitObserved).length,
    starting: stats.workers.starting,
    repairs: pool.repairs.size,
    leases: workers.filter((w) => w.lease !== undefined).length,
    reservations: credits.diagnostics().reservations,
    executions: credits.diagnostics().executions,
    creditOperations: credits.diagnostics().operations,
    reservedBytes: stats.streamResults.currentReservedResultBytes,
    buffered: stats.streamResults.buffered,
    bufferedVisibleBytes: stats.streamResults.knownBufferedPayloadBytes,
    productionTick: Number(
      runtime.rangeCoordinator.productionTick !== undefined,
    ),
    admissionClaims: runtime.dispatcher.admissionReservations,
    reservedWorkers: runtime.dispatcher.reservedWorkers.size,
    shutdownTimer: Number(runtime.shutdownTimer !== undefined),
    drainWaiter: Number(runtime.drainResolve !== undefined),
  };
}

/** Independent sums complement the production debug scanner and R2 model. */
export function assertConservation(runtime) {
  assertOwners(runtime);
  const stats = runtime.stats();
  const credits = runtime.resultCredits;
  let total = 0;
  const owners = new Map();
  for (const r of credits.reservations.values()) {
    assert.ok(Number.isSafeInteger(r.creditedBytes) && r.creditedBytes >= 0);
    assert.ok(r.creditedBytes <= r.bytes);
    total += r.creditedBytes;
    const owner = owners.get(r.operation) ?? { bytes: 0, partitions: 0 };
    owner.bytes += r.creditedBytes;
    owner.partitions++;
    owners.set(r.operation, owner);
  }
  assert.equal(total, stats.streamResults.currentReservedResultBytes);
  assert.equal(owners.size, credits.operations.size);
  for (const [operation, expected] of owners) {
    const actual = credits.operations.get(operation);
    assert.equal(actual.bytes, expected.bytes);
    assert.equal(actual.taskByPartition.size, expected.partitions);
    assert.ok(actual.bytes <= operation.resultByteCapacity);
  }
  assert.equal(runtime.taskCoordinator.tasks.size, stats.tasks.pending);
  assert.ok(stats.queue.size <= stats.queue.capacity);
  for (const task of runtime.taskCoordinator.tasks.values()) {
    if (['scheduled', 'running'].includes(task.snapshot.status)) {
      assert.equal(task.input, undefined, 'posted host input released');
      assert.deepEqual(task.transferList, [], 'posting claim released');
    }
  }
  for (const operation of runtime.rangeCoordinator.operations.values()) {
    if (!operation.stream) continue;
    assert.ok(
      operation.stream.buffered + operation.children.size <=
        operation.stream.capacity,
    );
    assert.equal(operation.stream.buffer.length, operation.stream.buffered);
  }
}

const zeroAtQuiescence = [
  'pending',
  'operations',
  'queue',
  'physical',
  'starting',
  'repairs',
  'leases',
  'reservations',
  'executions',
  'creditOperations',
  'reservedBytes',
  'buffered',
  'bufferedVisibleBytes',
  'productionTick',
  'admissionClaims',
  'reservedWorkers',
  'shutdownTimer',
  'drainWaiter',
];
export async function quiescent(runtime, { stopped = false } = {}) {
  await until(() => {
    const d = inspect(runtime);
    return zeroAtQuiescence.every((key) => d[key] === 0);
  });
  assertConservation(runtime);
  const d = inspect(runtime);
  for (const key of zeroAtQuiescence) assert.equal(d[key], 0, key);
  if (stopped) {
    assert.equal(d.state, 'stopped');
    assert.equal(d.liveWorkers, 0);
    for (const worker of runtime.dispatcher.pool.workers.values()) {
      assert.equal(worker.exitObserved, true);
      assert.equal(worker.thread.threadId, -1);
      assert.deepEqual(worker.thread.eventNames(), []);
      assert.deepEqual(worker.currentTaskIds, []);
    }
  }
  return d;
}
export async function stop(runtime, options = { drain: false }) {
  await runtime.shutdown(options);
  await immediate();
  return quiescent(runtime, { stopped: true });
}
export function assertStreamReleased(stream) {
  assert.equal(stream.buffered, 0);
  assert.equal(stream.knownBufferedPayloadBytes, 0);
  assert.equal(stream.unknownBufferedResults, 0);
  assert.equal(stream.waiter, undefined);
  assert.equal(stream.callbacks, undefined);
}
export function assertOperationReleased(operation) {
  assert.equal(operation.createInput, undefined);
  assert.equal(operation.outputs, undefined);
  assert.equal(operation.pendingResultDeclaration, undefined);
  assert.equal(operation.children.size, 0);
}
export function listeners(signal) {
  return getEventListeners(signal, 'abort').length;
}

/** Track real thread exits without retaining retired Worker objects. */
export function observeWorkers(runtime) {
  const pool = runtime.dispatcher.pool;
  const live = new Set();
  const counters = { created: 0, confirmedExits: 0, peakLive: 0 };
  function attach(worker) {
    const id = worker.id;
    if (live.has(id)) return;
    live.add(id);
    counters.created++;
    counters.peakLive = Math.max(counters.peakLive, live.size);
    assert.ok(
      live.size <= pool.options.workers,
      'no spawn before confirmed exit',
    );
    worker.thread.once('exit', () => {
      live.delete(id);
      counters.confirmedExits++;
    });
  }
  for (const worker of pool.workers.values()) attach(worker);
  const spawn = pool.spawn.bind(pool);
  pool.spawn = () => {
    spawn();
    for (const worker of pool.workers.values()) attach(worker);
  };
  return () => ({ ...counters, live: live.size });
}
