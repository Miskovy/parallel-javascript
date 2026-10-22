import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsExecutionLeaseError,
  PjsWorkerError,
  PjsCancelledError,
  PjsRuntimeStateError,
} from '@pjavascript/runtime';

const watchdog = setTimeout(() => {
  console.error('Installed containment watchdog');
  process.exit(1);
}, 10_000);
const registry = new PjsTaskRegistry();
const module = new URL('./containment-tasks.mjs', import.meta.url);
const hang = registry.register('hang', module, 'hang');
const echo = registry.register('echo', module, 'echo');
const crash = registry.register('crash', module, 'crash');

async function until(predicate) {
  const deadline = performance.now() + 5_000;
  while (!predicate()) {
    assert.ok(
      performance.now() < deadline,
      'installed containment condition reached',
    );
    await delay(1);
  }
}

async function rollingLease() {
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxRestarts: undefined,
    restartPolicy: { maxRestarts: 2, windowMs: 60_000 },
  });
  try {
    await runtime.ready();
    const shared = new SharedArrayBuffer(12);
    let settlements = 0;
    const rejected = assert.rejects(
      runtime.run(hang, { shared }, { executionLease: 100 }),
      (error) => {
        settlements++;
        assert.ok(error instanceof PjsExecutionLeaseError);
        assert.ok(error instanceof PjsWorkerError);
        assert.equal(error.name, 'PjsExecutionLeaseError');
        assert.equal(typeof error.taskId, 'string');
        assert.equal(typeof error.workerId, 'number');
        return true;
      },
    );
    await until(() => Atomics.load(new Int32Array(shared), 0) === 1);
    await rejected;
    await until(() => runtime.stats().workers.idle === 1);
    assert.equal(settlements, 1);
    assert.equal(Atomics.load(new Int32Array(shared), 2), 1);
    assert.equal(runtime.stats().containment.confirmedLeaseExits, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 1);
    assert.equal(runtime.stats().containment.restartWindowUtilization, 1);
    assert.equal(await runtime.run(echo, 123), 123);
    await runtime.shutdown({ forceAfter: 1000 });
    assert.equal(runtime.stats().workers.busy, 0);
    assert.equal(runtime.stats().containment.shutdownEscalations, 0);
  } finally {
    await runtime.shutdown({ drain: false });
  }
}

async function activeEscalation() {
  const runtime = new PjsRuntime({ registry, workers: 1, maxRestarts: 0 });
  try {
    await runtime.ready();
    const shared = new SharedArrayBuffer(12);
    const transferred = new ArrayBuffer(16);
    let settlements = 0;
    const active = assert.rejects(
      runtime.run(
        hang,
        { shared, transferred },
        { transferList: [transferred] },
      ),
      (error) => {
        settlements++;
        assert.ok(error instanceof PjsCancelledError);
        return true;
      },
    );
    await until(() => Atomics.load(new Int32Array(shared), 0) === 1);
    assert.equal(transferred.byteLength, 0);
    const queued = assert.rejects(
      runtime.run(echo, 'not executed'),
      PjsCancelledError,
    );
    const shutdown = runtime.shutdown({ drain: true, forceAfter: 100 });
    let laterReads = 0;
    assert.equal(
      runtime.shutdown({
        get forceAfter() {
          laterReads++;
          throw new Error('later escalation options read');
        },
        get drain() {
          laterReads++;
          throw new Error('later drain option read');
        },
      }),
      shutdown,
    );
    assert.equal(laterReads, 0);
    assert.equal(runtime.stats().workers.busy, 1);
    await Promise.all([active, queued]);
    await shutdown;
    assert.equal(settlements, 1);
    assert.equal(Atomics.load(new Int32Array(shared), 2), 1);
    assert.equal(transferred.byteLength, 0);
    const stats = runtime.stats();
    assert.equal(stats.state, 'stopped');
    assert.equal(stats.workers.busy, 0);
    assert.equal(stats.workers.restarts, 0);
    assert.equal(stats.tasks.pending, 0);
    assert.equal(stats.dispatch.executeMessages, 1);
    assert.equal(stats.containment.shutdownEscalations, 1);
    assert.equal(stats.containment.leaseExpirations, 0);
    assert.equal(stats.containment.workerReplacements, 0);
    assert.equal(stats.containment.restartWindowUtilization, undefined);
  } finally {
    await runtime.shutdown({ drain: false });
  }
}

async function lifetimeBudget(configured, expected) {
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    ...(configured === undefined ? {} : { maxRestarts: configured }),
  });
  try {
    await runtime.ready();
    for (let failure = 0; failure <= expected; failure++) {
      await assert.rejects(runtime.run(crash, null), PjsWorkerError);
      if (failure < expected) {
        await until(() => runtime.stats().workers.idle === 1);
        assert.equal(runtime.stats().workers.restarts, failure + 1);
      }
    }
    await until(
      () =>
        runtime.stats().state === 'failed' &&
        runtime.stats().workers.busy === 0,
    );
    const stats = runtime.stats();
    assert.equal(stats.workers.restarts, expected);
    assert.equal(stats.workers.failures, expected + 1);
    assert.equal(stats.dispatch.executeMessages, expected + 1);
    assert.equal(stats.containment.workerReplacements, expected);
    assert.equal(stats.containment.restartBudgetExhaustions, 1);
    assert.ok(Object.hasOwn(stats.containment, 'restartWindowUtilization'));
    assert.equal(stats.containment.restartWindowUtilization, undefined);
    await assert.rejects(runtime.run(echo, 'no replay'), PjsRuntimeStateError);
  } finally {
    await runtime.shutdown({ drain: false });
  }
}

try {
  await rollingLease();
  await activeEscalation();
  await lifetimeBudget(undefined, 4);
  await lifetimeBudget(0, 0);
  await lifetimeBudget(1, 1);
  console.log(
    JSON.stringify({
      containment: true,
      rollingLease: true,
      activeEscalation: true,
      shutdownIdentity: true,
      lifetimeBudgets: ['default:4', 0, 1],
    }),
  );
} finally {
  clearTimeout(watchdog);
}
