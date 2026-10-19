import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { test } from 'node:test';
import { setImmediate as immediate } from 'node:timers/promises';
import {
  PjsCancelledError,
  PjsExecutionLeaseError,
  PjsSerializationError,
  PjsTaskError,
  PjsTimeoutError,
  PjsWorkerError,
  sharedReadonly,
} from '../dist/index.js';
import {
  create,
  gate,
  entered,
  open,
  range,
  until,
  firstWorker,
  controlExit,
  clock,
  inspect,
  assertConservation,
  quiescent,
  stop,
  assertStreamReleased,
  assertOperationReleased,
  listeners,
  observeWorkers,
} from './helpers/memory-lifecycle.mjs';

const bounded = { timeout: 10_000 };
async function setup(t, options) {
  const value = create(options);
  value.runtime.r3Cleanup = [];
  t.after(async () => {
    for (const release of value.runtime.r3Cleanup) release();
    await stop(value.runtime);
  });
  await value.runtime.ready();
  return value;
}
function stream(runtime, task, count, input, extra = {}) {
  return runtime.streamRange(task, range(count), () => ({ input }), {
    experimentalMaxBufferedResults: count,
    experimentalMaxResultBytes: 16,
    experimentalMaxReservedResultBytes: count * 16,
    ...extra,
  });
}

test(
  'M1 clone inputs clear at dispatch and repeated success/failure leaves no records',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const inputs = [
      1,
      { small: [1, 2] },
      new ArrayBuffer(256 * 1024),
      new Uint8Array(new ArrayBuffer(256 * 1024), 16, 32),
    ];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const input of inputs) {
        const promise = runtime.run(tasks.echo, input);
        assertConservation(runtime);
        const output = await promise;
        assert.deepEqual(output, input);
        if (typeof input === 'object') assert.notEqual(output, input);
        await quiescent(runtime);
      }
      await assert.rejects(
        runtime.run(tasks.inspect, { data: inputs[2], fail: true }),
        PjsTaskError,
      );
      await quiescent(runtime);
    }
  },
);

for (const reason of ['cancel', 'timeout']) {
  test(
    `M1 multiple queued aliases and active ${reason} separate host and physical ownership`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t);
      const control = gate(),
        signal = new AbortController();
      runtime.r3Cleanup.push(() => open(control));
      const active = runtime.run(
        tasks.inspect,
        { data: new ArrayBuffer(64 * 1024), gate: control },
        reason === 'cancel' ? { signal: signal.signal } : { timeout: 50 },
      );
      const rejected = assert.rejects(
        active,
        reason === 'cancel' ? PjsCancelledError : PjsTimeoutError,
      );
      await until(() => entered(control) === 1);
      const data = new Uint8Array(64 * 1024),
        queued = new AbortController();
      const promises = Array.from({ length: 3 }, () =>
        assert.rejects(
          runtime.run(tasks.inspect, { data }, { signal: queued.signal }),
          PjsCancelledError,
        ),
      );
      const records = [...runtime.taskCoordinator.tasks.values()].filter(
        (v) => v.snapshot.status === 'queued',
      );
      assert.equal(records.length, 3);
      assert.ok(records.every((v) => v.input.data === data));
      assert.equal(listeners(queued.signal), 3);
      queued.abort();
      await Promise.all(promises);
      for (const record of records) assert.equal(record.input, undefined);
      assert.equal(listeners(queued.signal), 0);
      signal.abort();
      await rejected;
      assert.equal(runtime.stats().tasks.pending, 0);
      assert.equal(runtime.stats().workers.busy, 1);
      assert.equal(listeners(signal.signal), 0);
      assertConservation(runtime);
      open(control);
      await quiescent(runtime);
    },
  );
}

test(
  'M2 queued transfer claims release without detachment; duplicate and failed posting are atomic',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const control = gate();
    runtime.r3Cleanup.push(() => open(control));
    const active = runtime.run(tasks.inspect, {
      data: new ArrayBuffer(1),
      gate: control,
    });
    await until(() => entered(control) === 1);
    const data = new ArrayBuffer(1024),
      abort = new AbortController();
    const queued = assert.rejects(
      runtime.run(tasks.echo, data, {
        transferList: [data],
        signal: abort.signal,
      }),
      PjsCancelledError,
    );
    const record = [...runtime.taskCoordinator.tasks.values()].find(
      (v) => v.input === data,
    );
    await assert.rejects(
      runtime.run(tasks.echo, data, { transferList: [data] }),
      /already reserved/,
    );
    abort.abort();
    await queued;
    assert.equal(data.byteLength, 1024);
    assert.equal(record.input, undefined);
    assert.deepEqual(record.transferList, []);
    open(control);
    await active;
    await assert.rejects(
      runtime.run(tasks.echo, { data, invalid() {} }, { transferList: [data] }),
      PjsSerializationError,
    );
    assert.equal(data.byteLength, 1024);
    const output = await runtime.run(tasks.move, data, {
      transferList: [data],
    });
    assert.equal(data.byteLength, 0);
    assert.equal(output.byteLength, 1024);
    await quiescent(runtime);
  },
);

test(
  'M2 cancellation after successful posting cannot reclaim transferred backing',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const control = gate(),
      abort = new AbortController(),
      data = new Uint8Array(4096);
    runtime.r3Cleanup.push(() => open(control));
    const pending = assert.rejects(
      runtime.run(
        tasks.inspect,
        { data, gate: control },
        {
          signal: abort.signal,
          transferList: [data.buffer],
        },
      ),
      PjsCancelledError,
    );
    await until(() => entered(control) === 1);
    abort.abort();
    await pending;
    assert.equal(data.byteLength, 0);
    assert.equal(runtime.stats().tasks.pending, 0);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(listeners(abort.signal), 0);
    open(control);
    await quiescent(runtime);
    assert.equal(data.byteLength, 0);
  },
);

test(
  'M2 reentrant abort preserves posting claim and repeated returned backing is consumer-owned',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { workers: 2 });
    let data = new Uint8Array(4096);
    const abort = new AbortController();
    let duplicate;
    await assert.rejects(
      runtime.run(
        tasks.echo,
        {
          data,
          get trigger() {
            abort.abort();
            duplicate = assert.rejects(
              runtime.run(tasks.move, data, { transferList: [data.buffer] }),
              /already reserved/,
            );
            return true;
          },
        },
        { transferList: [data.buffer], signal: abort.signal },
      ),
      PjsCancelledError,
    );
    await duplicate;
    assert.equal(data.byteLength, 0);
    await quiescent(runtime);
    data = new Uint8Array(4096);
    data[0] = 19;
    for (let cycle = 0; cycle < 12; cycle++) {
      const previous = data;
      data = await runtime.run(tasks.move, previous, {
        transferList: [previous.buffer],
      });
      assert.equal(previous.byteLength, 0);
      assert.equal(data[0], 19);
    }
    await stop(runtime);
    assert.equal(data.byteLength, 4096);
    assert.equal(data[0], 19);
  },
);

test(
  'M2 transferred backing stays detached through crash and held lease exit without replay',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const workers = observeWorkers(runtime);
    const marker = gate();
    for (const kind of ['crash', 'hang']) {
      const old = firstWorker(runtime),
        data = new ArrayBuffer(4096);
      const time = clock(old),
        exit = controlExit(old),
        control = gate();
      runtime.r3Cleanup.push(exit.release);
      const rejected = assert.rejects(
        runtime.run(
          tasks[kind],
          { data, marker, gate: control },
          {
            transferList: [data],
            ...(kind === 'hang' ? { executionLease: 100 } : {}),
          },
        ),
        kind === 'hang' ? PjsExecutionLeaseError : PjsWorkerError,
      );
      assert.equal(data.byteLength, 0);
      if (kind === 'hang') {
        await until(() => entered(control) === 1);
        time.advance(100);
      }
      await rejected;
      if (kind === 'hang') {
        assert.equal(old.exitObserved, false);
        assert.equal(runtime.stats().workers.busy, 1);
        assert.equal(runtime.dispatcher.pool.repairs.size, 1);
        assert.equal(runtime.dispatcher.pool.workers.has(old.id), true);
      }
      exit.release();
      await until(
        () =>
          runtime.stats().workers.idle === 1 &&
          runtime.dispatcher.pool.repairs.size === 0,
      );
      assert.equal(runtime.dispatcher.pool.workers.has(old.id), false);
      assert.equal(old.thread.threadId, -1);
      assert.deepEqual(old.thread.eventNames(), []);
      assert.equal(old.lease, undefined);
      assert.equal(data.byteLength, 0);
      assert.equal(await runtime.run(tasks.echo, 7), 7);
    }
    assert.equal(
      entered(marker),
      2,
      'each failing application task executed once',
    );
    await stop(runtime);
    assert.equal(workers().created, workers().confirmedExits);
    assert.equal(workers().peakLive, 1);
  },
);

test(
  'M3 compact shared slice and direct SAB survive cancellation and replacement; release adds no registration',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { workers: 2 });
    const source = new Uint8Array([99, 11, 12, 88]);
    const retained = sharedReadonly(source.subarray(1, 3));
    assert.deepEqual([...retained], [11, 12]);
    assert.equal(retained.buffer.byteLength, 2);
    source[1] = 44;
    const cloneRegistrySize = runtime.registry.size;
    const reads = await Promise.all(
      [retained, retained.buffer].map((data) =>
        runtime.run(tasks.inspect, { data }),
      ),
    );
    assert.ok(
      reads.every((v) => v.shared && v.first === 11 && v.visible === 2),
    );
    const control = gate(),
      abort = new AbortController();
    runtime.r3Cleanup.push(() => open(control));
    const active = assert.rejects(
      runtime.run(
        tasks.inspect,
        { data: retained, gate: control },
        { signal: abort.signal },
      ),
      PjsCancelledError,
    );
    await until(() => entered(control) === 1);
    abort.abort();
    await active;
    assert.equal(runtime.stats().workers.busy, 1);
    open(control);
    await quiescent(runtime);
    await assert.rejects(runtime.run(tasks.crash, {}), PjsWorkerError);
    await until(() => runtime.stats().workers.idle === 2);
    assert.equal(
      (await runtime.run(tasks.inspect, { data: retained })).first,
      11,
    );
    assert.equal(runtime.registry.size, cloneRegistrySize);
    await stop(runtime);
    assert.equal(retained[1], 12, 'application retention remains valid');
  },
);

test(
  'M4 visible credit, underlying backing and consumer ownership differ across concurrent batches',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t, { workers: 2 });
    const a = runtime.streamRange(
      tasks.binary,
      range(4),
      () => ({ input: { bytes: 8, backing: 4096, move: true } }),
      {
        experimentalMaxBufferedResults: 4,
        experimentalResultBytes: 8,
        experimentalMaxReservedResultBytes: 32,
        experimentalDispatchBatchSize: 2,
      },
    );
    const b = stream(
      runtime,
      tasks.binary,
      4,
      { bytes: 8, backing: 4096 },
      { experimentalDispatchBatchSize: 2 },
    );
    const operations = [...runtime.rangeCoordinator.operations.values()];
    await until(() => runtime.stats().streamResults.buffered === 8);
    assertConservation(runtime);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 64);
    assert.equal(runtime.stats().streamResults.knownBufferedPayloadBytes, 64);
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 32);
    const retained = [];
    for await (const { output } of a) {
      assert.equal(output.byteLength, 8);
      assert.equal(output.buffer.byteLength, 4096);
      retained.push(output);
    }
    await b.return();
    await quiescent(runtime);
    for (const op of operations) assertOperationReleased(op);
    assertStreamReleased(a);
    assertStreamReleased(b);
    await stop(runtime);
    assert.equal(retained.length, 4);
    assert.equal(retained[0][0], 7);
  },
);

for (const mode of ['exact', 'upper-bound']) {
  test(
    `M4 ${mode} physical batch cancellation holds every credit until confirmed exit`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t);
      const old = firstWorker(runtime),
        exit = controlExit(old),
        control = gate();
      runtime.r3Cleanup.push(exit.release);
      runtime.r3Cleanup.push(() => open(control));
      const results = runtime.streamRange(
        tasks.binary,
        range(3),
        () => ({ input: { bytes: 8, gate: control } }),
        {
          experimentalMaxBufferedResults: 3,
          experimentalDispatchBatchSize: 3,
          experimentalMaxReservedResultBytes: 48,
          ...(mode === 'exact'
            ? { experimentalResultBytes: 16 }
            : { experimentalMaxResultBytes: 16 }),
        },
      );
      await until(() => entered(control) === 1);
      await results.return();
      assertStreamReleased(results);
      assert.equal(runtime.stats().tasks.pending, 0);
      assert.equal(
        runtime.stats().streamResults.currentReservedResultBytes,
        48,
      );
      assert.equal(runtime.resultCredits.executions.size, 1);
      assert.equal(runtime.resultCredits.reservations.size, 3);
      // Fault notification precedes physical completion, regardless of late payloads.
      old.thread.emit('error', new Error('controlled failure'));
      assert.equal(old.exitObserved, false);
      assert.equal(
        runtime.stats().streamResults.currentReservedResultBytes,
        48,
      );
      assertConservation(runtime);
      exit.release();
      await until(() => runtime.stats().workers.idle === 1);
      await quiescent(runtime);
      assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
    },
  );
}

test(
  'M4 stream abandonment clears factories, waiters, signals and buffered output',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    for (const action of ['return', 'abort', 'throw', 'shutdown']) {
      const abort = new AbortController();
      const results = stream(
        runtime,
        tasks.binary,
        2,
        { bytes: 8 },
        { signal: abort.signal, timeout: 5000 },
      );
      const operation = [...runtime.rangeCoordinator.operations.values()][0];
      await until(() => results.buffered === 2);
      if (action === 'abort') abort.abort();
      else if (action === 'throw')
        await assert.rejects(
          results.throw(new Error('consumer stopped')),
          /consumer stopped/,
        );
      else if (action === 'shutdown') await stop(runtime);
      else await results.return();
      assert.equal(listeners(abort.signal), 0);
      assertOperationReleased(operation);
      assertStreamReleased(results);
      await quiescent(runtime);
    }
  },
);

test(
  'M4 failed output and cancelled consumer waiter do not fabricate refunds',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const failed = stream(runtime, tasks.binary, 1, { bytes: 8, fail: true });
    await assert.rejects(failed.next(), PjsTaskError);
    assertStreamReleased(failed);
    await quiescent(runtime);
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
    const control = gate(),
      abort = new AbortController();
    runtime.r3Cleanup.push(() => open(control));
    const results = stream(
      runtime,
      tasks.binary,
      1,
      { bytes: 8, gate: control },
      { signal: abort.signal },
    );
    const pending = assert.rejects(results.next(), PjsCancelledError);
    await until(() => entered(control) === 1);
    abort.abort();
    await pending;
    assertStreamReleased(results);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 16);
    open(control);
    await quiescent(runtime);
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
  },
);

test(
  'M5 rolling history expires; bootstrap and budget failures stop without repair accumulation',
  bounded,
  async (t) => {
    for (const kind of ['expiry', 'bootstrap', 'exhaustion']) {
      const { runtime, tasks } = await setup(t, {
        restartPolicy: { maxRestarts: 1, windowMs: 100 },
      });
      let now = 0;
      runtime.dispatcher.pool.monotonicNow = () => now;
      if (kind === 'bootstrap')
        runtime.dispatcher.pool.tasks[0] = {
          ...runtime.dispatcher.pool.tasks[0],
          exportName: 'missing',
        };
      await assert.rejects(runtime.run(tasks.crash, {}), PjsWorkerError);
      if (kind === 'bootstrap')
        await until(() => runtime.stats().state === 'failed');
      else {
        await until(() => runtime.stats().workers.idle === 1);
        if (kind === 'expiry') {
          now = 100;
          assert.equal(runtime.stats().containment.restartWindowUtilization, 0);
          assert.equal(runtime.dispatcher.pool.restartHistory.length, 0);
        }
        await assert.rejects(runtime.run(tasks.crash, {}), PjsWorkerError);
        await until(() =>
          kind === 'expiry'
            ? runtime.stats().workers.idle === 1
            : runtime.stats().state === 'failed',
        );
      }
      await stop(runtime);
      assert.equal(runtime.dispatcher.pool.repairs.size, 0);
      assert.equal(
        runtime.stats().dispatch.executeMessages,
        kind === 'bootstrap' ? 1 : 2,
      );
    }
  },
);

test(
  'M6 graceful drain, escalation and pending replacement require real exit',
  bounded,
  async (t) => {
    for (const kind of ['drain', 'force', 'repair']) {
      const { runtime, tasks } = await setup(t);
      const control = gate(),
        old = firstWorker(runtime),
        exit = controlExit(old);
      runtime.r3Cleanup.push(exit.release);
      runtime.r3Cleanup.push(() => open(control));
      const abort = new AbortController();
      const work = runtime.run(
        kind === 'repair' ? tasks.crash : tasks.inspect,
        { data: new ArrayBuffer(32), gate: control },
        { signal: abort.signal },
      );
      const outcome =
        kind === 'drain'
          ? work
          : assert.rejects(
              work,
              kind === 'repair' ? PjsWorkerError : PjsCancelledError,
            );
      if (kind !== 'repair') await until(() => entered(control) === 1);
      else await outcome;
      const time = clock(runtime, 'Shutdown');
      const ending = runtime.shutdown(
        kind === 'force' ? { forceAfter: 100 } : { drain: kind === 'drain' },
      );
      let settled = false;
      void ending.then(() => {
        settled = true;
      });
      await immediate();
      if (kind === 'force') time.advance(100);
      if (kind === 'drain') open(control);
      await outcome;
      await until(() => exit.requests === 1);
      assert.equal(settled, false);
      exit.release();
      await ending;
      await quiescent(runtime, { stopped: true });
      assert.equal(listeners(abort.signal), 0);
      assert.equal(runtime.stats().containment.workerReplacements, 0);
    }
  },
);

test(
  'M6 termination rejection keeps physical credit and reports failure until independent exit',
  bounded,
  async () => {
    const { runtime, tasks } = create();
    await runtime.ready();
    const worker = firstWorker(runtime),
      control = gate();
    try {
      const results = stream(runtime, tasks.binary, 1, {
        bytes: 8,
        gate: control,
      });
      const pending = assert.rejects(results.next(), PjsCancelledError);
      await until(() => entered(control) === 1);
      worker.terminateThread = () =>
        Promise.reject(new Error('controlled stop rejection'));
      await assert.rejects(
        runtime.shutdown({ drain: false }),
        /controlled stop rejection/,
      );
      await pending;
      assert.equal(runtime.stats().state, 'stopping');
      assert.equal(inspect(runtime).physical, 1);
      assert.equal(inspect(runtime).reservedBytes, 16);
      assertConservation(runtime);
    } finally {
      await worker.thread.terminate();
      worker.thread.removeAllListeners();
      await quiescent(runtime);
    }
  },
);

test(
  'M6 repeated lifetimes destroy task/lease/escalation timers and remove signal listeners',
  bounded,
  async () => {
    const ids = new Set();
    let capturing = false;
    const hook = createHook({
      init(id, type) {
        if (capturing && (type === 'Timeout' || type === 'Immediate'))
          ids.add(id);
      },
      destroy(id) {
        ids.delete(id);
      },
    }).enable();
    try {
      for (let cycle = 0; cycle < 4; cycle++) {
        const { runtime, tasks } = create();
        const workers = observeWorkers(runtime);
        try {
          await runtime.ready();
          const abort = new AbortController();
          capturing = true;
          const work = runtime.run(tasks.echo, cycle, {
            signal: abort.signal,
            timeout: 5000,
            executionLease: 5000,
          });
          capturing = false;
          assert.equal(await work, cycle);
          assert.equal(listeners(abort.signal), 0);
          capturing = true;
          const ending = runtime.shutdown({ forceAfter: 5000 });
          capturing = false;
          await ending;
          await quiescent(runtime, { stopped: true });
          assert.equal(workers().created, workers().confirmedExits);
        } finally {
          capturing = false;
          await stop(runtime);
        }
      }
      await immediate();
      await immediate();
      assert.equal(
        ids.size,
        0,
        'captured real timer/immediate resources destroyed',
      );
    } finally {
      hook.disable();
    }
  },
);
