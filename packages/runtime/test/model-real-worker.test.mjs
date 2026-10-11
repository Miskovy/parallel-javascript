import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import {
  PjsCancelledError,
  PjsExecutionLeaseError,
  PjsTimeoutError,
  PjsWorkerError,
} from '../dist/index.js';
import {
  setup,
  bounded,
  firstWorker,
  clock,
  until,
  shared,
  started,
  finish,
  assertOwners,
} from './helpers/containment.mjs';

const evidence = [];
const save = () => {
  if (process.env.PJS_R2_REAL_REPORT)
    writeFileSync(
      process.env.PJS_R2_REAL_REPORT,
      JSON.stringify(evidence, null, 2) + '\n',
    );
};
save();
function scenario(name, body) {
  test(name, bounded, async () => {
    const record = { name, passed: false, cleanup: false };
    evidence.push(record);
    save();
    const cleanups = [];
    const create = (options) =>
      setup({ after: (fn) => cleanups.push(fn) }, options);
    try {
      await body(create);
      record.passed = true;
    } catch (error) {
      record.error = error.message;
      throw error;
    } finally {
      try {
        for (const fn of cleanups.reverse()) await fn();
        record.cleanup = true;
      } finally {
        save();
      }
    }
  });
}
scenario('R2 real non-returning CPU execution lease', async (create) => {
  const { runtime, tasks } = await create();
  const buffer = shared();
  const result = assert.rejects(
    runtime.run(tasks.hang, { shared: buffer }, { executionLease: 100 }),
    PjsExecutionLeaseError,
  );
  await until(() => started(buffer));
  await result;
  await until(() => runtime.stats().containment.workerReplacements === 1);
  assert.equal(runtime.stats().containment.confirmedLeaseExits, 1);
  assertOwners(runtime);
});
scenario('R2 real caller timeout precedes lease expiry', async (create) => {
  const { runtime, tasks, control } = await create();
  const worker = firstWorker(runtime),
    exit = control(worker);
  const result = assert.rejects(
    runtime.run(tasks.hang, {}, { timeout: 20, executionLease: 100 }),
    PjsTimeoutError,
  );
  await result;
  assert.equal(runtime.stats().workers.busy, 1);
  await until(() => exit.requests > 0);
  assert.equal(exit.confirmed, false);
  assert.equal(runtime.stats().tasks.timedOut, 1);
  assert.equal(runtime.stats().tasks.failed, 0);
  exit.release();
  await until(() => runtime.stats().containment.workerReplacements === 1);
});
scenario(
  'R2 real final response at controlled lease boundary, both callback orders',
  async (create) => {
    for (const resultFirst of [true, false]) {
      const { runtime, tasks, control } = await create();
      const worker = firstWorker(runtime),
        time = clock(worker),
        exit = control(worker),
        buffer = shared();
      const result = runtime.run(
        tasks.controlled,
        { shared: buffer },
        { executionLease: 10 },
      );
      const captured = result.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await until(() => started(buffer));
      time.advance(9);
      if (resultFirst) {
        finish(buffer);
        assert.equal((await captured).value.byteLength, 8);
        time.advance(1);
        time.timers[0].callback();
        assert.equal(runtime.stats().containment.leaseExpirations, 0);
      } else {
        time.advance(1);
        assert.ok((await captured).error instanceof PjsExecutionLeaseError);
        finish(buffer);
        assert.equal(runtime.stats().workers.busy, 1);
        assert.equal(exit.confirmed, false);
        exit.release();
        await until(() => runtime.stats().containment.workerReplacements === 1);
      }
    }
  },
);
scenario(
  'R2 real unexpected worker exit restores capacity without replay',
  async (create) => {
    const { runtime, tasks } = await create();
    await assert.rejects(runtime.run(tasks.crash, {}), PjsWorkerError);
    await until(
      () =>
        runtime.stats().containment.workerReplacements === 1 &&
        runtime.stats().workers.idle === 1,
    );
    assert.equal(runtime.stats().dispatch.executeMessages, 1);
    assert.equal(await runtime.run(tasks.echo, 23), 23);
  },
);
scenario(
  'R2 real two lease failures retain four-worker population until exits',
  async (create) => {
    const { runtime, tasks, control } = await create({
      workers: 4,
      restartPolicy: { maxRestarts: 2, windowMs: 100 },
    });
    const workers = [...runtime.dispatcher.pool.workers.values()];
    const times = workers.slice(0, 2).map((w) => clock(w)),
      exits = workers.slice(0, 2).map((w) => control(w));
    const buffers = [shared(), shared()];
    const results = buffers.map((buffer) =>
      assert.rejects(
        runtime.run(tasks.hang, { shared: buffer }, { executionLease: 10 }),
        PjsExecutionLeaseError,
      ),
    );
    await until(() => buffers.every(started));
    for (const time of times) time.advance(10);
    await Promise.all(results);
    assert.equal(runtime.stats().workers.busy, 2);
    assert.equal(runtime.stats().workers.total, 4);
    assert.equal(runtime.stats().containment.workerReplacements, 0);
    assert.equal(runtime.stats().workers.restarts, 2);
    for (const exit of exits) exit.release();
    await until(
      () =>
        runtime.stats().containment.workerReplacements === 2 &&
        runtime.stats().workers.idle === 4,
    );
    assert.equal(runtime.stats().dispatch.executeMessages, 2);
  },
);
scenario(
  'R2 real rolling restart budget expires at monotonic boundary',
  async (create) => {
    const { runtime, tasks } = await create({
      restartPolicy: { maxRestarts: 1, windowMs: 100 },
    });
    const time = clock(runtime.dispatcher.pool);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(runtime.run(tasks.crash, {}), PjsWorkerError);
      await until(
        () =>
          runtime.stats().containment.workerReplacements === i + 1 &&
          runtime.stats().workers.idle === 1,
      );
      if (i === 0) {
        time.advance(99);
        assert.equal(runtime.stats().containment.restartWindowUtilization, 1);
        time.advance(1);
        assert.equal(runtime.stats().containment.restartWindowUtilization, 0);
      }
    }
    assert.equal(runtime.stats().workers.restarts, 2);
  },
);
scenario(
  'R2 real graceful shutdown escalates and waits for delayed exit',
  async (create) => {
    const { runtime, tasks, control } = await create();
    const worker = firstWorker(runtime),
      exit = control(worker),
      buffer = shared();
    const result = assert.rejects(
      runtime.run(tasks.hang, { shared: buffer }),
      PjsCancelledError,
    );
    await until(() => started(buffer));
    let resolved = false;
    const shutdown = runtime.shutdown({ forceAfter: 20 });
    void shutdown.then(() => {
      resolved = true;
    });
    assert.equal(runtime.shutdown({ drain: false }), shutdown);
    await until(() => exit.requests > 0);
    await result;
    assert.equal(resolved, false);
    assert.equal(exit.confirmed, false);
    assert.equal(runtime.stats().workers.busy, 1);
    exit.release();
    await shutdown;
    assertOwners(runtime, { quiescent: true });
  },
);
scenario('R2 real repeated runtime creation and teardown', async (create) => {
  for (let i = 0; i < 3; i++) {
    const { runtime, tasks } = await create({ workers: i + 1 });
    assert.equal(await runtime.run(tasks.echo, i), i);
    await runtime.shutdown();
    assertOwners(runtime, { quiescent: true });
  }
});
