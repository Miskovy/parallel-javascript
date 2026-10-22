import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsExecutionLeaseError,
  PjsWorkerError,
  PjsCancelledError,
} from '@pjavascript/runtime';
import type {
  RunOptions,
  RestartPolicy,
  ShutdownOptions,
  PjsContainmentStats,
} from '@pjavascript/runtime';

async function until(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!predicate()) {
    assert.ok(
      performance.now() < deadline,
      'installed TS containment condition reached',
    );
    await delay(1);
  }
}

export async function containmentContracts(): Promise<void> {
  const watchdog = setTimeout(() => {
    console.error('Installed TypeScript containment watchdog');
    process.exit(1);
  }, 10_000);
  const registry = new PjsTaskRegistry();
  const module = new URL('./task.js', import.meta.url);
  const hang = registry.register<SharedArrayBuffer, never>(
    'contained-hang',
    module,
    'containmentHang',
  );
  const crash = registry.register<null, never>(
    'contained-crash',
    module,
    'containmentCrash',
  );
  const policy: RestartPolicy = { maxRestarts: 1, windowMs: 60_000 };
  const leasedOptions: RunOptions = { executionLease: 100 };
  const shutdownOptions: ShutdownOptions = { drain: true, forceAfter: 100 };
  try {
    const rolling = new PjsRuntime({
      registry,
      workers: 1,
      restartPolicy: policy,
    });
    try {
      await rolling.ready();
      const shared = new SharedArrayBuffer(12);
      let settlements = 0;
      const rejected = assert.rejects(
        rolling.run(hang, shared, leasedOptions),
        (error: unknown) => {
          settlements++;
          assert.ok(error instanceof PjsExecutionLeaseError);
          assert.ok(error instanceof PjsWorkerError);
          assert.equal(typeof error.taskId, 'string');
          assert.equal(typeof error.workerId, 'number');
          return true;
        },
      );
      await until(() => Atomics.load(new Int32Array(shared), 0) === 1);
      await rejected;
      await until(() => rolling.stats().workers.idle === 1);
      const containment: PjsContainmentStats = rolling.stats().containment;
      assert.equal(containment.restartWindowUtilization, 1);
      assert.equal(containment.confirmedLeaseExits, 1);
      assert.equal(containment.workerReplacements, 1);
      assert.equal(settlements, 1);
      assert.equal(Atomics.load(new Int32Array(shared), 2), 1);

      const activeShared = new SharedArrayBuffer(12);
      const active = assert.rejects(
        rolling.run(hang, activeShared),
        PjsCancelledError,
      );
      await until(() => Atomics.load(new Int32Array(activeShared), 0) === 1);
      const shutdown: Promise<void> = rolling.shutdown(shutdownOptions);
      let laterReads = 0;
      const later: ShutdownOptions = {
        get forceAfter(): number {
          laterReads++;
          throw new Error('later TS shutdown options read');
        },
        get drain(): boolean {
          laterReads++;
          throw new Error('later TS drain read');
        },
      };
      assert.equal(rolling.shutdown(later), shutdown);
      assert.equal(laterReads, 0);
      assert.equal(rolling.stats().workers.busy, 1);
      await active;
      await shutdown;
      assert.equal(Atomics.load(new Int32Array(activeShared), 2), 1);
      assert.equal(rolling.stats().state, 'stopped');
      assert.equal(rolling.stats().workers.busy, 0);
      assert.equal(rolling.stats().workers.restarts, 1);
      assert.equal(rolling.stats().containment.shutdownEscalations, 1);
      assert.equal(rolling.stats().containment.workerReplacements, 1);
    } finally {
      await rolling.shutdown({ drain: false });
    }
    for (const configured of [undefined, 0]) {
      const budget = configured === undefined ? 4 : configured;
      const lifetime = new PjsRuntime({
        registry,
        workers: 1,
        ...(configured === undefined ? {} : { maxRestarts: configured }),
      });
      try {
        await lifetime.ready();
        for (let failure = 0; failure <= budget; failure++) {
          await assert.rejects(lifetime.run(crash, null), PjsWorkerError);
          if (failure < budget)
            await until(() => lifetime.stats().workers.idle === 1);
        }
        await until(
          () =>
            lifetime.stats().state === 'failed' &&
            lifetime.stats().workers.busy === 0,
        );
        const containment: PjsContainmentStats = lifetime.stats().containment;
        assert.equal(containment.restartWindowUtilization, undefined);
        assert.equal(containment.restartBudgetExhaustions, 1);
        assert.equal(containment.workerReplacements, budget);
        assert.equal(lifetime.stats().workers.restarts, budget);
        assert.equal(lifetime.stats().dispatch.executeMessages, budget + 1);
      } finally {
        await lifetime.shutdown({ drain: false });
      }
    }
    console.log(
      JSON.stringify({
        containmentTypeConsumer: true,
        activeEscalation: true,
        shutdownIdentity: true,
        lifetimeBudgets: ['default:4', 0],
      }),
    );
  } finally {
    clearTimeout(watchdog);
  }
}
