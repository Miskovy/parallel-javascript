import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PjsExecutionLeaseError,
  PjsWorkerError,
  PjsTimeoutError,
  PjsCancelledError,
  PjsRuntimeStateError,
  PjsSerializationError,
  PjsRuntime,
  PjsTaskRegistry,
} from '../dist/index.js';
import {
  setup,
  firstWorker,
  clock,
  until,
  bounded,
  assertOwners,
  shared,
  started,
  finish,
} from './helpers/containment.mjs';

for (const outcome of ['pending', 'timeout', 'cancel']) {
  test(
    'lease containment preserves the ' + outcome + ' caller outcome until exit',
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(t);
      const old = firstWorker(runtime),
        time = clock(old),
        exit = control();
      const buffer = shared(),
        abort = new AbortController();
      let settlements = 0,
        observed;
      const task = runtime
        .run(
          tasks.hang,
          { shared: buffer },
          {
            executionLease: 100,
            ...(outcome === 'timeout' ? { timeout: 10 } : {}),
            ...(outcome === 'cancel' ? { signal: abort.signal } : {}),
          },
        )
        .catch((error) => {
          settlements++;
          observed = error;
        });
      await until(() => started(buffer));
      if (outcome === 'cancel') abort.abort();
      if (outcome !== 'pending') await task;
      assert.equal(runtime.stats().workers.busy, 1);
      time.advance(100);
      await task;
      assert.ok(
        observed instanceof
          (outcome === 'pending'
            ? PjsExecutionLeaseError
            : outcome === 'timeout'
              ? PjsTimeoutError
              : PjsCancelledError),
      );
      assert.equal(settlements, 1);
      assert.equal(old.lease, undefined);
      assert.equal(exit.requests, 1);
      assert.equal(exit.confirmed, false);
      assert.equal(runtime.stats().workers.busy, 1);
      assert.equal(runtime.stats().workers.total, 1);
      assert.equal(runtime.stats().containment.workerReplacements, 0);
      assertOwners(runtime);
      const stale = time.timers[0].callback;
      stale();
      old.fail('duplicate error');
      assert.equal(runtime.stats().workers.restarts, 1);
      exit.release();
      await until(() => runtime.stats().workers.idle === 1);
      stale();
      assert.notEqual(firstWorker(runtime).id, old.id);
      assert.equal(await runtime.run(tasks.echo, 42), 42);
      assert.equal(settlements, 1);
      assert.deepEqual(runtime.stats().containment, {
        leaseExpirations: 1,
        leaseTerminationRequests: 1,
        confirmedLeaseExits: 1,
        workerReplacements: 1,
        restartWindowUtilization: undefined,
        restartBudgetExhaustions: 0,
        shutdownEscalations: 0,
      });
      assertOwners(runtime, { quiescent: true });
    },
  );
}

test(
  'completion before expiry clears its token; stale timer cannot affect a later dispatch',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const worker = firstWorker(runtime),
      time = clock(worker),
      buffer = shared();
    const first = runtime.run(
      tasks.controlled,
      { shared: buffer },
      { executionLease: 100 },
    );
    await until(() => started(buffer));
    time.advance(99);
    finish(buffer);
    assert.deepEqual(await first, new Uint8Array(8));
    const stale = time.timers[0];
    assert.equal(stale.cancelled, true);
    assert.equal(worker.lease, undefined);
    const nextBuffer = shared();
    const second = runtime.run(
      tasks.controlled,
      { shared: nextBuffer },
      { executionLease: 100 },
    );
    await until(() => started(nextBuffer));
    stale.callback();
    assert.equal(worker.status, 'busy');
    time.advance(1);
    assert.equal(worker.status, 'busy');
    finish(nextBuffer);
    await second;
    assert.equal(runtime.stats().containment.leaseExpirations, 0);
  },
);

test(
  'early timer wake uses remaining monotonic lease time',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const worker = firstWorker(runtime),
      time = clock(worker),
      buffer = shared();
    const promise = runtime.run(
      tasks.controlled,
      { shared: buffer },
      { executionLease: 100 },
    );
    await until(() => started(buffer));
    time.timers[0].callback();
    assert.equal(time.timers.length, 2);
    assert.equal(worker.status, 'busy');
    finish(buffer);
    await promise;
    assert.equal(time.timers[1].cancelled, true);
  },
);

for (const winner of ['result', 'lease', 'error', 'exit']) {
  test(
    winner + ' wins overlapping terminal notifications exactly once',
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(t);
      const worker = firstWorker(runtime),
        time = clock(worker),
        exit = control(),
        buffer = shared();
      let settlements = 0,
        error;
      const task = runtime
        .run(tasks.controlled, { shared: buffer }, { executionLease: 100 })
        .then(
          () => {
            settlements++;
          },
          (cause) => {
            settlements++;
            error = cause;
          },
        );
      await until(() => started(buffer) && worker.executionPhase === 'running');
      const id = worker.snapshot().currentTaskId;
      let ends = 0;
      const mark = runtime.resultCredits.markExecutionEnded.bind(
        runtime.resultCredits,
      );
      runtime.resultCredits.markExecutionEnded = (correlation) => {
        ends++;
        mark(correlation);
      };
      if (winner === 'result') {
        finish(buffer);
        await task;
        time.advance(100);
        assert.equal(error, undefined);
        assert.equal(ends, 1);
        assert.equal(runtime.stats().workers.restarts, 0);
      } else {
        if (winner === 'lease') time.advance(100);
        else if (winner === 'error')
          worker.thread.emit('error', new Error('controlled error'));
        else {
          // Actual Node exit, followed by duplicate exit and delayed lease callbacks.
          await worker.thread.terminate();
          await until(() => worker.exitObserved);
        }
        await task;
        assert.ok(
          error instanceof
            (winner === 'lease' ? PjsExecutionLeaseError : PjsWorkerError),
        );
        worker.fail('duplicate');
        time.timers[0].callback();
        // A late valid final response loses to recorded failure/termination state.
        worker.thread.emit('message', {
          type: 'success',
          taskId: id,
          output: new Uint8Array(8),
          executionMs: 0,
        });
        assert.equal(settlements, 1);
        assert.equal(runtime.stats().workers.restarts, 1);
        exit.release();
        await until(() => runtime.stats().workers.idle === 1);
        worker.exited(31);
        worker.exited(31);
        assert.equal(ends, 1);
        assert.equal(runtime.stats().workers.failures, 1);
        assert.equal(runtime.stats().containment.workerReplacements, 1);
      }
      assertOwners(runtime, { quiescent: true });
    },
  );
}

test(
  'queued acceptance and failed posting never arm a lease',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { maxQueue: 1 });
    const worker = firstWorker(runtime),
      time = clock(worker),
      buffer = shared();
    const first = runtime.run(tasks.controlled, { shared: buffer });
    await until(() => started(buffer));
    const queued = runtime.run(tasks.echo, 4, { executionLease: 100 });
    assert.equal(time.timers.length, 0);
    time.advance(10_000);
    assert.equal(runtime.stats().queue.size, 1);
    finish(buffer);
    await first;
    assert.equal(await queued, 4);
    assert.equal(time.timers.length, 1);
    const count = time.timers.length;
    await assert.rejects(
      runtime.run(tasks.echo, () => {}, { executionLease: 100 }),
      PjsSerializationError,
    );
    assert.equal(time.timers.length, count);
    assert.equal(worker.lease, undefined);
    assertOwners(runtime, { quiescent: true });
  },
);

test(
  'posting reentrancy can settle the caller without preventing physical lease ownership',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const worker = firstWorker(runtime),
      time = clock(worker),
      exit = control();
    const abort = new AbortController(),
      buffer = shared();
    const input = {
      shared: buffer,
      get value() {
        abort.abort();
        return 1;
      },
    };
    const promise = runtime.run(tasks.hang, input, {
      signal: abort.signal,
      executionLease: 100,
    });
    await assert.rejects(promise, PjsCancelledError);
    await until(() => started(buffer));
    assert.equal(time.timers.length, 1);
    assertOwners(runtime);
    time.advance(100);
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().workers.busy, 1);
    exit.release();
    await until(() => runtime.stats().workers.idle === 1);
  },
);

for (const mode of ['exact', 'upper']) {
  test(
    mode + ' physical credits survive lease termination until confirmed exit',
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(t);
      const worker = firstWorker(runtime),
        time = clock(worker),
        exit = control(),
        buffer = shared();
      const results = runtime.streamRange(
        tasks.hang,
        { start: 0, end: 1, grainSize: 1 },
        () => ({ input: { shared: buffer } }),
        {
          experimentalMaxBufferedResults: 1,
          experimentalMaxReservedResultBytes: 8,
          ...(mode === 'exact'
            ? { experimentalResultBytes: 8 }
            : { experimentalMaxResultBytes: 8 }),
        },
      );
      const iterator = results[Symbol.asyncIterator]();
      const failed = assert.rejects(iterator.next(), PjsExecutionLeaseError);
      await until(() => started(buffer));
      // Internal containment seam qualifies the existing binary-credit machinery.
      // The public range API deliberately rejects leases.
      worker.armExecutionLease(worker.snapshot().currentTaskId, 100);
      time.advance(100);
      await failed;
      assert.equal(exit.confirmed, false);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
      assertOwners(runtime);
      exit.release();
      await until(() => runtime.stats().workers.idle === 1);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
      assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
      assertOwners(runtime, { quiescent: true });
    },
  );
}

test(
  'unsupported range and batch leases reject before factories or execution',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    let factories = 0;
    const factory = () => {
      factories++;
      return { input: 1 };
    };
    const range = { start: 0, end: 2, grainSize: 1 };
    for (const method of ['partitionRange', 'parallelFor', 'parallelMapRange'])
      await assert.rejects(
        runtime[method](tasks.echo, range, factory, { executionLease: 100 }),
        TypeError,
      );
    const unsupportedStream = runtime.streamRange(tasks.echo, range, factory, {
      executionLease: undefined,
    });
    await assert.rejects(
      unsupportedStream[Symbol.asyncIterator]().next(),
      TypeError,
    );
    await assert.rejects(
      runtime.run(tasks.echo, 1, {
        executionLease: 100,
        experimentalDispatchBatchSize: 1,
      }),
      TypeError,
    );
    assert.equal(factories, 0);
    assert.equal(runtime.stats().dispatch.executeMessages, 0);
    assert.deepEqual(
      await runtime.partitionRange(tasks.echo, range, factory, {
        experimentalDispatchBatchSize: 2,
      }),
      [1, 1],
    );
  },
);

test(
  'rolling budget exhausts once, fails queued work and never replays tasks',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      restartPolicy: { maxRestarts: 1, windowMs: 100 },
    });
    const pool = runtime.dispatcher.pool;
    pool.monotonicNow = () => 0;
    await assert.rejects(runtime.run(tasks.crash, null), PjsWorkerError);
    await until(() => runtime.stats().workers.idle === 1);
    const second = assert.rejects(
      runtime.run(tasks.crash, null),
      PjsWorkerError,
    );
    const queued = assert.rejects(runtime.run(tasks.echo, 1), PjsWorkerError);
    await Promise.all([second, queued]);
    await until(() => runtime.stats().workers.busy === 0);
    assert.equal(runtime.stats().state, 'failed');
    assert.equal(runtime.stats().workers.restarts, 1);
    assert.equal(runtime.stats().containment.restartBudgetExhaustions, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 1);
    assert.equal(runtime.stats().dispatch.executeMessages, 2);
    assertOwners(runtime, { quiescent: true });
  },
);

test(
  'restart history expires monotonically and policy snapshots ignore later application mutation',
  bounded,
  async (t) => {
    const policy = { maxRestarts: 1, windowMs: 100 };
    const { runtime, tasks } = await setup(t, { restartPolicy: policy });
    policy.maxRestarts = 0;
    let now = 0;
    runtime.dispatcher.pool.monotonicNow = () => now;
    await assert.rejects(runtime.run(tasks.crash, null), PjsWorkerError);
    await until(() => runtime.stats().workers.idle === 1);
    assert.equal(runtime.stats().containment.restartWindowUtilization, 1);
    now = 99;
    assert.equal(runtime.stats().containment.restartWindowUtilization, 1);
    now = 100;
    assert.equal(runtime.stats().containment.restartWindowUtilization, 0);
    await assert.rejects(runtime.run(tasks.crash, null), PjsWorkerError);
    await until(() => runtime.stats().workers.idle === 1);
    assert.equal(runtime.stats().workers.restarts, 2);
    assert.equal(runtime.stats().containment.restartWindowUtilization, 1);
    assert.equal(await runtime.run(tasks.echo, 7), 7);
  },
);

test(
  'replacement bootstrap failure is fatal without another restart',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      restartPolicy: { maxRestarts: 3, windowMs: 100 },
    });
    // Corrupt only the internal replacement descriptor, after original bootstrap.
    runtime.dispatcher.pool.tasks[0] = {
      ...runtime.dispatcher.pool.tasks[0],
      exportName: 'missing_export',
    };
    await assert.rejects(runtime.run(tasks.crash, null), PjsWorkerError);
    await until(() => runtime.stats().state === 'failed');
    assert.equal(runtime.stats().workers.restarts, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 1);
    assert.equal(runtime.stats().containment.restartBudgetExhaustions, 0);
  },
);

test(
  'graceful shutdown without escalation retains ownership until normal completion',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const buffer = shared(),
      worker = firstWorker(runtime),
      time = clock(worker);
    const task = runtime.run(
      tasks.controlled,
      { shared: buffer },
      { executionLease: 100 },
    );
    await until(() => started(buffer));
    const shutdown = runtime.shutdown();
    assert.equal(runtime.shutdown({ drain: false }), shutdown);
    await assert.rejects(runtime.run(tasks.echo, 1), PjsRuntimeStateError);
    assert.equal(runtime.stats().workers.busy, 1);
    finish(buffer);
    await task;
    await shutdown;
    assert.equal(time.timers[0].cancelled, true);
    assert.equal(runtime.stats().containment.shutdownEscalations, 0);
    assert.equal(runtime.stats().workers.failures, 0);
  },
);

test(
  'forced escalation coordinates concurrent callers and awaits actual exit',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const worker = firstWorker(runtime),
      leaseTime = clock(worker),
      time = clock(runtime, 'Shutdown'),
      exit = control();
    const buffer = shared();
    const failed = assert.rejects(
      runtime.run(tasks.hang, { shared: buffer }, { executionLease: 1000 }),
      PjsCancelledError,
    );
    await until(() => started(buffer));
    const queued = assert.rejects(
      runtime.run(tasks.echo, 1),
      PjsCancelledError,
    );
    const shutdown = runtime.shutdown({ forceAfter: 100 });
    assert.equal(runtime.shutdown({ forceAfter: 1 }), shutdown);
    let stopped = false;
    void shutdown.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    time.advance(99);
    assert.equal(exit.requests, 0);
    time.advance(1);
    await Promise.all([failed, queued]);
    await Promise.resolve();
    assert.equal(stopped, false);
    assert.equal(runtime.drainMode, false);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(leaseTime.timers[0].cancelled, true);
    assert.equal(runtime.stats().workers.restarts, 0);
    assertOwners(runtime);
    exit.release();
    await shutdown;
    assert.equal(runtime.stats().containment.shutdownEscalations, 1);
    assert.equal(runtime.stats().workers.failures, 0);
    assertOwners(runtime, { quiescent: true });
  },
);

test(
  'shutdown during lease termination cannot spawn a replacement or release ownership early',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const worker = firstWorker(runtime),
      time = clock(worker),
      exit = control(),
      buffer = shared();
    const failed = assert.rejects(
      runtime.run(tasks.hang, { shared: buffer }, { executionLease: 100 }),
      PjsExecutionLeaseError,
    );
    await until(() => started(buffer));
    time.advance(100);
    await failed;
    const shutdown = runtime.shutdown({ drain: false });
    let stopped = false;
    void shutdown.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(stopped, false);
    assert.equal(runtime.stats().workers.busy, 1);
    exit.release();
    await shutdown;
    assert.equal(exit.requests, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 0);
  },
);

test(
  'option validation happens before worker creation or task dispatch',
  bounded,
  async (t) => {
    const registry = new PjsTaskRegistry();
    for (const policy of [
      { maxRestarts: -1, windowMs: 1 },
      { maxRestarts: 1, windowMs: 0 },
    ])
      assert.throws(
        () => new PjsRuntime({ registry, restartPolicy: policy }),
        RangeError,
      );
    assert.throws(
      () =>
        new PjsRuntime({
          registry,
          maxRestarts: 1,
          restartPolicy: { maxRestarts: 1, windowMs: 1 },
        }),
      TypeError,
    );
    const { runtime, tasks } = await setup(t);
    for (const executionLease of [0, -1, NaN, Infinity, 0.5, 2 ** 31])
      await assert.rejects(
        runtime.run(tasks.echo, 1, { executionLease }),
        RangeError,
      );
    assert.throws(() => runtime.shutdown({ forceAfter: 0 }), RangeError);
    assert.throws(
      () => runtime.shutdown({ drain: false, forceAfter: 1 }),
      TypeError,
    );
    assert.equal(runtime.stats().state, 'running');
    assert.equal(runtime.stats().dispatch.executeMessages, 0);
  },
);

test(
  'real infinite JavaScript is contained; transferred input remains detached and shared writes persist',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const old = firstWorker(runtime),
      exit = control(),
      buffer = shared(),
      transferred = new ArrayBuffer(8);
    const failed = assert.rejects(
      runtime.run(
        tasks.hang,
        { shared: buffer, transferred },
        { executionLease: 200, transferList: [transferred] },
      ),
      PjsExecutionLeaseError,
    );
    await until(() => started(buffer));
    assert.equal(transferred.byteLength, 0);
    assert.equal(old.hasPhysicalExecution, true);
    await failed;
    assert.equal(exit.requests, 1);
    assert.equal(exit.confirmed, false);
    assert.equal(runtime.stats().workers.busy, 1);
    exit.release();
    await until(() => runtime.stats().workers.idle === 1);
    assert.equal(exit.confirmed, true);
    assert.equal(old.hasPhysicalExecution, false);
    assert.notEqual(firstWorker(runtime).id, old.id);
    assert.equal(await runtime.run(tasks.echo, 99), 99);
    assert.equal(transferred.byteLength, 0);
    assert.equal(started(buffer), true);
  },
);

test(
  'real logical timeout precedes physical containment with one caller settlement',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const exit = control(),
      buffer = shared();
    let settlements = 0;
    const promise = runtime
      .run(tasks.hang, { shared: buffer }, { timeout: 20, executionLease: 200 })
      .catch((error) => {
        settlements++;
        assert.ok(error instanceof PjsTimeoutError);
      });
    await promise;
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(exit.requests, 0);
    await until(() => exit.requests === 1);
    assert.equal(settlements, 1);
    exit.release();
    await until(() => runtime.stats().workers.idle === 1);
    assert.equal(settlements, 1);
  },
);

test(
  'four workers contain only two leased infinite tasks and restore configured capacity',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t, { workers: 4 });
    const workers = [...runtime.dispatcher.pool.workers.values()];
    const exits = [control(workers[0]), control(workers[1])];
    const buffers = [shared(), shared()];
    const failures = buffers.map((buffer) =>
      assert.rejects(
        runtime.run(tasks.hang, { shared: buffer }, { executionLease: 250 }),
        PjsExecutionLeaseError,
      ),
    );
    const healthy = await Promise.all([
      runtime.run(tasks.echo, 'C'),
      runtime.run(tasks.echo, 'D'),
    ]);
    assert.deepEqual(healthy, ['C', 'D']);
    await until(() => buffers.every(started));
    await Promise.all(failures);
    assert.equal(runtime.stats().workers.busy, 2);
    assert.equal(runtime.stats().workers.total, 4);
    assert.equal(runtime.stats().containment.workerReplacements, 0);
    assertOwners(runtime);
    for (const exit of exits) exit.release();
    await until(() => runtime.stats().workers.idle === 4);
    assert.equal(runtime.stats().containment.workerReplacements, 2);
    assert.deepEqual(
      await Promise.all([1, 2, 3, 4].map((n) => runtime.run(tasks.echo, n))),
      [1, 2, 3, 4],
    );
    assertOwners(runtime, { quiescent: true });
  },
);

test(
  'bounded fault injection soak recreates runtimes without accounting drift',
  bounded,
  async (t) => {
    for (let iteration = 0; iteration < 4; iteration++) {
      const { runtime, tasks } = await setup(t, {
        restartPolicy: { maxRestarts: 2, windowMs: 100_000 },
      });
      assert.equal(await runtime.run(tasks.echo, iteration), iteration);
      const abort = new AbortController(),
        buffer = shared(),
        worker = firstWorker(runtime),
        time = clock(worker);
      const kind = iteration % 2 === 0 ? 'timeout' : 'cancel';
      const promise = runtime.run(
        tasks.hang,
        { shared: buffer },
        {
          executionLease: 100,
          ...(kind === 'timeout' ? { timeout: 10 } : { signal: abort.signal }),
        },
      );
      const rejected = assert.rejects(
        promise,
        kind === 'timeout' ? PjsTimeoutError : PjsCancelledError,
      );
      await until(() => started(buffer));
      if (kind === 'cancel') abort.abort();
      await rejected;
      assertOwners(runtime);
      time.advance(100);
      await until(() => runtime.stats().workers.idle === 1);
      assert.equal(await runtime.run(tasks.echo, iteration), iteration);
      await assert.rejects(runtime.run(tasks.crash, null), PjsWorkerError);
      await until(() => runtime.stats().workers.idle === 1);
      if (iteration % 2 === 0) {
        await assert.rejects(runtime.run(tasks.crash, null), PjsWorkerError);
        await until(() => runtime.stats().workers.busy === 0);
        assert.equal(runtime.stats().state, 'failed');
        assert.equal(runtime.stats().containment.restartBudgetExhaustions, 1);
        await runtime.shutdown();
      } else {
        const pending = assert.rejects(
          runtime.run(tasks.hang, { shared: shared() }),
          PjsCancelledError,
        );
        await runtime.shutdown({ forceAfter: 20 });
        await pending;
        assert.equal(runtime.stats().containment.shutdownEscalations, 1);
      }
      assertOwners(runtime, { quiescent: true });
      assert.equal(
        time.timers.every((timer) => timer.cancelled),
        true,
      );
    }
  },
);

test(
  'graceful completion cancels the escalation timer; stale escalation cannot change stopped state',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const time = clock(runtime, 'Shutdown');
    assert.equal(await runtime.run(tasks.echo, 1), 1);
    const shutdown = runtime.shutdown({ forceAfter: 100 });
    await shutdown;
    assert.equal(time.timers[0].cancelled, true);
    time.timers[0].callback();
    assert.equal(runtime.stats().state, 'stopped');
    assert.equal(runtime.stats().containment.shutdownEscalations, 0);
  },
);

test(
  'monotonic escalation includes startup and ignores early timer wakes',
  bounded,
  async () => {
    const registry = new PjsTaskRegistry();
    const runtime = new PjsRuntime({ registry, workers: 1 });
    const time = clock(runtime, 'Shutdown');
    const shutdown = runtime.shutdown({ forceAfter: 100 });
    time.timers[0].callback();
    assert.equal(time.timers.length, 2);
    assert.equal(runtime.drainMode, true);
    time.advance(100);
    await shutdown;
    await assert.rejects(runtime.ready());
    assert.equal(runtime.stats().containment.shutdownEscalations, 1);
    assert.equal(runtime.stats().workers.failures, 0);
    assertOwners(runtime, { quiescent: true });
  },
);

test(
  'forced shutdown reentrant in cloning clears the successful post lease and awaits exit',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const worker = firstWorker(runtime),
      time = clock(worker),
      exit = control();
    let shutdown;
    const rejected = assert.rejects(
      runtime.run(
        tasks.echo,
        {
          get trigger() {
            shutdown = runtime.shutdown({ drain: false });
            return 1;
          },
        },
        { executionLease: 100 },
      ),
      PjsCancelledError,
    );
    await rejected;
    assert.equal(time.timers.length, 1);
    assert.equal(time.timers[0].cancelled, true);
    assert.equal(exit.confirmed, false);
    assert.equal(runtime.stats().workers.busy, 1);
    assertOwners(runtime);
    exit.release();
    await shutdown;
    assertOwners(runtime, { quiescent: true });
  },
);

for (const mode of ['exact', 'upper']) {
  test(
    mode + ' credits stay held during shutdown escalation',
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(t);
      const exit = control(),
        time = clock(runtime, 'Shutdown'),
        buffer = shared();
      const results = runtime.streamRange(
        tasks.hang,
        { start: 0, end: 1, grainSize: 1 },
        () => ({ input: { shared: buffer } }),
        {
          experimentalMaxBufferedResults: 1,
          experimentalMaxReservedResultBytes: 8,
          ...(mode === 'exact'
            ? { experimentalResultBytes: 8 }
            : { experimentalMaxResultBytes: 8 }),
        },
      );
      const cancelled = assert.rejects(
        results[Symbol.asyncIterator]().next(),
        PjsCancelledError,
      );
      await until(() => started(buffer));
      const shutdown = runtime.shutdown({ forceAfter: 100 });
      await Promise.resolve();
      time.advance(100);
      await cancelled;
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
      assert.equal(runtime.stats().workers.busy, 1);
      assertOwners(runtime);
      exit.release();
      await shutdown;
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
      assertOwners(runtime, { quiescent: true });
    },
  );
}

test(
  'lease-driven containment consumes the restart window and exhaustion fails closed',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, {
      restartPolicy: { maxRestarts: 0, windowMs: 100 },
    });
    const worker = firstWorker(runtime),
      time = clock(worker),
      buffer = shared();
    const failed = assert.rejects(
      runtime.run(tasks.hang, { shared: buffer }, { executionLease: 100 }),
      PjsExecutionLeaseError,
    );
    await until(() => started(buffer));
    time.advance(100);
    await failed;
    await until(() => runtime.stats().workers.busy === 0);
    assert.equal(runtime.stats().state, 'failed');
    assert.equal(runtime.stats().workers.restarts, 0);
    assert.equal(runtime.stats().containment.restartBudgetExhaustions, 1);
    assert.equal(runtime.stats().containment.confirmedLeaseExits, 1);
    assert.equal(runtime.stats().containment.workerReplacements, 0);
  },
);

test(
  'termination rejection never releases still-physical credits or resolves shutdown',
  bounded,
  async (t) => {
    const registry = new PjsTaskRegistry();
    const module = new URL('./fixtures/containment-tasks.mjs', import.meta.url);
    const hang = registry.register('hang', module, 'hang');
    const runtime = new PjsRuntime({ registry, workers: 1 });
    await runtime.ready();
    const worker = firstWorker(runtime),
      buffer = shared();
    t.after(async () => {
      // Confirm actual exit using the original Node lifecycle, after the rejected seam.
      await worker.thread.terminate();
      worker.thread.removeAllListeners();
      assertOwners(runtime, { quiescent: true });
    });
    const results = runtime.streamRange(
      hang,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { shared: buffer } }),
      {
        experimentalResultBytes: 8,
        experimentalMaxReservedResultBytes: 8,
      },
    );
    const cancelled = assert.rejects(
      results[Symbol.asyncIterator]().next(),
      PjsCancelledError,
    );
    await until(() => started(buffer));
    worker.terminateThread = () =>
      Promise.reject(new Error('controlled termination rejection'));
    await assert.rejects(
      runtime.shutdown({ drain: false }),
      /controlled termination rejection/,
    );
    await cancelled;
    assert.equal(runtime.stats().state, 'stopping');
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
    assertOwners(runtime);
  },
);
