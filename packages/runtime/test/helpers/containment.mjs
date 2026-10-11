import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { PjsRuntime, PjsTaskRegistry } from '../../dist/index.js';

export const fixture = new URL(
  '../fixtures/containment-tasks.mjs',
  import.meta.url,
);
export const bounded = { timeout: 10_000 };
export async function until(predicate) {
  const deadline = performance.now() + 5_000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, 'outer watchdog reached');
    await delay(1);
  }
}
export function firstWorker(runtime) {
  return [...runtime.dispatcher.pool.workers.values()][0];
}
export function clock(owner, kind = 'Lease') {
  let now = 0;
  const timers = [];
  owner.monotonicNow = () => now;
  owner['schedule' + kind + 'Timer'] = (callback, delay) => {
    const timer = { callback, deadline: now + delay, cancelled: false };
    timers.push(timer);
    return timer;
  };
  owner['cancel' + kind + 'Timer'] = (timer) => {
    timer.cancelled = true;
  };
  return {
    timers,
    advance(value) {
      now += value;
      for (const timer of [...timers])
        if (!timer.cancelled && timer.deadline <= now) {
          timer.cancelled = true;
          timer.callback();
        }
    },
    get now() {
      return now;
    },
  };
}
export function controlExit(worker) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const terminate = worker.terminateThread.bind(worker);
  const control = { requests: 0, confirmed: false, release };
  worker.thread.once('exit', () => {
    control.confirmed = true;
  });
  worker.terminateThread = async () => {
    control.requests++;
    await gate;
    return terminate();
  };
  return control;
}
export function assertOwners(runtime, { quiescent = false } = {}) {
  const workers = [...runtime.dispatcher.pool.workers.values()];
  const physical = workers
    .filter((w) => w.hasPhysicalExecution)
    .map((w) => w.snapshot().currentTaskId);
  assert.equal(new Set(physical).size, physical.length);
  assert.equal(runtime.stats().workers.busy, physical.length);
  assert.ok(workers.length <= runtime.dispatcher.pool.options.workers);
  const credits = runtime.resultCredits;
  for (const correlation of credits.executions.keys())
    assert.ok(
      physical.includes(correlation),
      'credit retains an exact physical owner',
    );
  for (const reservation of credits.reservations.values()) {
    if (
      (!reservation.dispatched && !reservation.dispatching) ||
      reservation.executionDone
    )
      continue;
    assert.ok(
      [...credits.executions.values()].some((ids) =>
        ids.includes(reservation.taskId),
      ),
    );
  }
  if (quiescent) {
    assert.equal(physical.length, 0);
    assert.equal(runtime.stats().tasks.pending, 0);
    assert.equal(runtime.stats().queue.size, 0);
    assert.deepEqual(credits.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
    for (const worker of workers) assert.equal(worker.lease, undefined);
  }
}
export async function setup(t, options = {}) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    ['hang', 'echo', 'crash', 'controlled'].map((name) => [
      name,
      registry.register(name, fixture, name),
    ]),
  );
  const runtime = new PjsRuntime({ registry, workers: 1, ...options });
  const controls = [];
  t.after(async () => {
    for (const c of controls) c.release();
    await runtime.shutdown({ drain: false });
    assertOwners(runtime, { quiescent: true });
  });
  await runtime.ready();
  return {
    runtime,
    tasks,
    control(worker = firstWorker(runtime)) {
      const c = controlExit(worker);
      controls.push(c);
      return c;
    },
  };
}
export function shared() {
  return new SharedArrayBuffer(8);
}
export function started(buffer) {
  return Atomics.load(new Int32Array(buffer), 0) === 1;
}
export function finish(buffer) {
  Atomics.store(new Int32Array(buffer), 1, 1);
}
