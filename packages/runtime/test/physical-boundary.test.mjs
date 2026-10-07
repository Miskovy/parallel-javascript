import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsWorkerError,
  PjsCancelledError,
  PjsTimeoutError,
  PjsTaskError,
  PjsSerializationError,
} from '../dist/index.js';

const fixture = new URL(
  './fixtures/physical-boundary-tasks.mjs',
  import.meta.url,
);
const bounded = { timeout: 10_000 };

async function until(predicate) {
  const deadline = performance.now() + 5_000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, 'bounded observation reached');
    await delay(1);
  }
}

function firstWorker(runtime) {
  return [...runtime.dispatcher.pool.workers.values()][0];
}

function assertOwners(runtime) {
  const workers = [...runtime.dispatcher.pool.workers.values()];
  const physical = workers
    .filter((worker) => worker.hasPhysicalExecution)
    .map((worker) => worker.snapshot().currentTaskId);
  assert.equal(new Set(physical).size, physical.length);
  assert.equal(runtime.stats().workers.busy, physical.length);
  const credits = runtime.resultCredits;
  for (const correlation of credits.executions.keys())
    assert.ok(physical.includes(correlation), 'credit has a physical owner');
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
      'physically active reservation keeps its execution correlation',
    );
  }
}

function controlExit(worker) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const terminate = worker.terminateThread.bind(worker);
  const control = { requested: false, confirmed: false, release };
  worker.thread.once('exit', () => {
    control.confirmed = true;
  });
  worker.terminateThread = async () => {
    control.requested = true;
    await gate;
    return terminate();
  };
  return control;
}

async function setup(t, options = {}, module = fixture) {
  const registry = new PjsTaskRegistry();
  const tasks = Object.fromEntries(
    ['pulse', 'binary', 'echo'].map((name) => [
      name,
      registry.register(name, module, name),
    ]),
  );
  const runtime = new PjsRuntime({ registry, workers: 1, ...options });
  const controls = [];
  t.after(async () => {
    for (const control of controls) control.release();
    await runtime.shutdown({ drain: false });
    assert.equal(runtime.stats().workers.busy, 0);
    assert.equal(runtime.stats().tasks.pending, 0);
    assert.equal(runtime.stats().operations.pending, 0);
    assert.equal(runtime.stats().queue.size, 0);
    assert.deepEqual(runtime.resultCredits.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
  });
  await runtime.ready();
  return {
    runtime,
    tasks,
    control: () => {
      const value = controlExit(firstWorker(runtime));
      controls.push(value);
      return value;
    },
  };
}

function stream(runtime, task, shared, mode, extra = {}, count = 1) {
  const results = runtime.streamRange(
    task,
    { start: 0, end: count, grainSize: 1 },
    () => ({ input: { shared } }),
    {
      experimentalMaxBufferedResults: count,
      experimentalMaxReservedResultBytes: count * 8,
      ...(mode === 'exact'
        ? { experimentalResultBytes: 8 }
        : { experimentalMaxResultBytes: 8 }),
      ...extra,
    },
  );
  return results[Symbol.asyncIterator]();
}

function observeEnds(runtime) {
  const ends = [];
  const credits = runtime.resultCredits;
  const mark = credits.markExecutionEnded.bind(credits);
  credits.markExecutionEnded = (correlation) => {
    assert.ok(
      [...runtime.dispatcher.pool.workers.values()].every(
        (worker) => worker.snapshot().currentTaskId !== correlation,
      ),
      'physical correlation cleared before credit completion',
    );
    ends.push(correlation);
    mark(correlation);
  };
  return ends;
}

test(
  'a correlated single-item response cannot complete a physical batch',
  bounded,
  async (t) => {
    const { runtime, tasks, control } = await setup(t);
    const old = firstWorker(runtime);
    const exit = control();
    const shared = new SharedArrayBuffer(8);
    const iterator = stream(
      runtime,
      tasks.pulse,
      shared,
      'exact',
      {
        experimentalDispatchBatchSize: 3,
      },
      3,
    );
    const failed = assert.rejects(iterator.next(), PjsWorkerError);
    await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
    old.thread.emit('message', {
      type: 'success',
      taskId: old.snapshot().currentTaskId,
      output: new Uint8Array(8),
      executionMs: 1,
    });
    await failed;
    assert.equal(exit.confirmed, false);
    assert.equal(runtime.stats().workers.busy, 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 24);
    assertOwners(runtime);
    exit.release();
    assert.equal(await runtime.run(tasks.echo, 1), 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  },
);

for (const mode of ['exact', 'upper-bound']) {
  for (const postFails of [false, true]) {
    test(
      `${mode}: abort during clone retains posting credit (post fails=${postFails})`,
      bounded,
      async (t) => {
        const { runtime, tasks, control } = await setup(t);
        const exit = control();
        const shared = new SharedArrayBuffer(8);
        const controller = new AbortController();
        const results = runtime.streamRange(
          tasks.pulse,
          { start: 0, end: 1, grainSize: 1 },
          () => ({
            input: {
              get shared() {
                controller.abort();
                assert.equal(
                  runtime.stats().streamResults.currentReservedResultBytes,
                  8,
                );
                assertOwners(runtime);
                if (postFails) throw new Error('failed clone after abort');
                return shared;
              },
            },
          }),
          {
            signal: controller.signal,
            experimentalMaxReservedResultBytes: 8,
            ...(mode === 'exact'
              ? { experimentalResultBytes: 8 }
              : { experimentalMaxResultBytes: 8 }),
          },
        );
        await assert.rejects(
          results[Symbol.asyncIterator]().next(),
          PjsCancelledError,
        );
        if (postFails) {
          assert.equal(runtime.stats().workers.busy, 0);
          assert.equal(
            runtime.stats().streamResults.currentReservedResultBytes,
            0,
          );
          assert.equal(exit.requested, false);
          assertOwners(runtime);
        } else {
          await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
          assert.equal(
            runtime.stats().streamResults.currentReservedResultBytes,
            8,
          );
          Atomics.store(new Int32Array(shared), 1, 1);
          await until(() => exit.requested);
          assert.equal(runtime.stats().workers.busy, 1);
          assertOwners(runtime);
          exit.release();
          assert.equal(await runtime.run(tasks.echo, 2), 2);
          assert.equal(
            runtime.stats().streamResults.currentReservedResultBytes,
            0,
          );
        }
      },
    );
  }
}

for (const mode of ['exact', 'upper-bound']) {
  for (const batch of [1, 3]) {
    test(
      `${mode} batch=${batch}: protocol failure holds credit and occupancy until real exit`,
      bounded,
      async (t) => {
        const { runtime, tasks, control } = await setup(t);
        const old = firstWorker(runtime);
        const exit = control();
        const ends = observeEnds(runtime);
        const shared = new SharedArrayBuffer(8);
        const state = new Int32Array(shared);
        const iterator = stream(
          runtime,
          tasks.pulse,
          shared,
          mode,
          {
            experimentalDispatchBatchSize: batch,
          },
          batch,
        );
        const failed = assert.rejects(iterator.next(), PjsWorkerError);
        await until(() => Atomics.load(state, 0) !== 0);
        const correlation = old.snapshot().currentTaskId;
        assertOwners(runtime);
        Atomics.store(state, 1, 1);
        await failed;
        assert.equal(exit.requested, true);
        assert.equal(exit.confirmed, false);
        assert.equal(old.snapshot().currentTaskId, correlation);
        assert.equal(old.hasPhysicalExecution, true);
        assert.equal(
          runtime.stats().streamResults.currentReservedResultBytes,
          batch * 8,
        );
        assert.equal(runtime.stats().streamResults.resultByteRefunds, 0);
        assert.equal(ends.length, 0);
        assertOwners(runtime);
        const before = Atomics.load(state, 0);
        await until(() => Atomics.load(state, 0) !== before);
        // Failed workers ignore even correctly correlated late successes.
        old.thread.emit('message', {
          type: 'success',
          taskId: correlation,
          output: new Uint8Array(1),
          executionMs: 1,
          actualResultBytes: 1,
        });
        assert.equal(
          runtime.stats().streamResults.currentReservedResultBytes,
          batch * 8,
        );
        const queued = runtime.run(tasks.echo, 'replacement usable');
        assert.equal(runtime.stats().queue.size, 1);
        assert.equal(runtime.stats().workers.total, 1);
        exit.release();
        assert.equal(await queued, 'replacement usable');
        assert.equal(exit.confirmed, true);
        assert.equal(old.hasPhysicalExecution, false);
        const finalPulse = Atomics.load(state, 0);
        await delay(5);
        assert.equal(Atomics.load(state, 0), finalPulse);
        assert.equal(ends.filter((id) => id === correlation).length, 1);
        old.exited(23);
        assert.equal(ends.filter((id) => id === correlation).length, 1);
        assert.equal(
          runtime.stats().streamResults.currentReservedResultBytes,
          0,
        );
        assert.equal(runtime.stats().workers.failures, 1);
        assert.equal(runtime.stats().workers.restarts, 1);
        assert.notEqual(firstWorker(runtime).id, old.id);
        assertOwners(runtime);
        old.receive({ type: 'started', taskId: correlation });
        assert.equal(
          await runtime.run(tasks.echo, 'old callbacks ignored'),
          'old callbacks ignored',
        );
      },
    );
  }
}

for (const event of ['error', 'messageerror']) {
  test(
    `${event} before real exit reports one failure and one physical end`,
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(t);
      const old = firstWorker(runtime);
      const exit = control();
      const ends = observeEnds(runtime);
      const shared = new SharedArrayBuffer(8);
      const iterator = stream(runtime, tasks.pulse, shared, 'exact');
      const failed = assert.rejects(iterator.next(), PjsWorkerError);
      await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
      old.thread.emit(event, new Error('controlled infrastructure failure'));
      await failed;
      assert.equal(ends.length, 0);
      assert.equal(runtime.stats().workers.failures, 1);
      assert.equal(runtime.stats().workers.busy, 1);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assertOwners(runtime);
      exit.release();
      assert.equal(await runtime.run(tasks.echo, 42), 42);
      assert.equal(ends.length, 2); // Failed execution, then successful echo.
      assert.equal(runtime.stats().workers.failures, 1);
      assert.equal(runtime.stats().workers.restarts, 1);
    },
  );
}

test(
  'direct unexpected exit reports logical failure before exactly one physical end',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const ends = observeEnds(runtime);
    const old = firstWorker(runtime);
    let logicalBeforePhysical = false;
    const failTask = runtime.taskCoordinator.failTask.bind(
      runtime.taskCoordinator,
    );
    runtime.taskCoordinator.failTask = (error) => {
      logicalBeforePhysical = old.hasPhysicalExecution && ends.length === 0;
      failTask(error);
    };
    const shared = new SharedArrayBuffer(8);
    const iterator = stream(runtime, tasks.pulse, shared, 'upper-bound');
    const failed = assert.rejects(iterator.next(), PjsWorkerError);
    await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
    Atomics.store(new Int32Array(shared), 1, 2);
    await failed;
    assert.equal(logicalBeforePhysical, true);
    assert.equal(ends.length, 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    assert.equal(await runtime.run(tasks.echo, 7), 7);
    assert.equal(runtime.stats().workers.failures, 1);
    assert.equal(runtime.stats().workers.restarts, 1);
  },
);

for (const reason of ['timeout', 'abort']) {
  test(
    `failure after ${reason} preserves logical outcome and physical credit`,
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(t);
      const exit = control();
      const controller = new AbortController();
      const shared = new SharedArrayBuffer(8);
      const iterator = stream(
        runtime,
        tasks.pulse,
        shared,
        'upper-bound',
        reason === 'timeout' ? { timeout: 100 } : { signal: controller.signal },
      );
      const rejected = assert.rejects(
        iterator.next(),
        reason === 'timeout' ? PjsTimeoutError : PjsCancelledError,
      );
      await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
      if (reason === 'abort') controller.abort();
      await rejected;
      Atomics.store(new Int32Array(shared), 1, 1);
      await until(() => exit.requested);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assert.equal(runtime.stats().workers.busy, 1);
      assertOwners(runtime);
      exit.release();
      assert.equal(await runtime.run(tasks.echo, 9), 9);
      assert.equal(
        runtime.stats().operations.timedOut,
        reason === 'timeout' ? 1 : 0,
      );
      assert.equal(
        runtime.stats().streamResults.upperBoundResultsReconciled,
        0,
      );
    },
  );
}

for (const kind of ['graceful', 'forced', 'fatal']) {
  test(
    `${kind} cleanup waits for confirmed physical exit`,
    bounded,
    async (t) => {
      const { runtime, tasks, control } = await setup(
        t,
        kind === 'fatal' ? { maxRestarts: 0 } : {},
      );
      const exit = control();
      const shared = new SharedArrayBuffer(8);
      const iterator = stream(runtime, tasks.pulse, shared, 'exact');
      const rejected = assert.rejects(
        iterator.next(),
        kind === 'forced' ? PjsCancelledError : PjsWorkerError,
      );
      await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
      let releases = 0;
      const releaseAll = runtime.resultCredits.releaseAll.bind(
        runtime.resultCredits,
      );
      runtime.resultCredits.releaseAll = () => {
        assert.equal(
          exit.confirmed,
          true,
          'releaseAll requires confirmed stop',
        );
        assert.ok(
          [...runtime.dispatcher.pool.workers.values()].every(
            (worker) => worker.exitObserved,
          ),
        );
        releases++;
        releaseAll();
      };
      let shutdown;
      if (kind !== 'fatal')
        shutdown = runtime.shutdown({ drain: kind === 'graceful' });
      // During forced shutdown, late failure messages are ignored by the stopped worker.
      Atomics.store(new Int32Array(shared), 1, 1);
      await rejected;
      await until(() => exit.requested);
      assert.equal(releases, 0);
      assert.equal(runtime.stats().workers.busy, 1);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 8);
      assertOwners(runtime);
      if (kind === 'fatal') shutdown = runtime.shutdown();
      let complete = false;
      void shutdown.then(() => {
        complete = true;
      });
      await delay(2);
      assert.equal(complete, false);
      exit.release();
      await shutdown;
      assert.ok(releases >= 1);
      assert.equal(runtime.stats().workers.busy, 0);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
      assert.equal(
        runtime.stats().workers.restarts,
        kind === 'graceful' ? 1 : 0,
      );
    },
  );
}

for (const fail of [false, true]) {
  test(
    `valid final response (task exception=${fail}) completes execution without thread exit`,
    bounded,
    async (t) => {
      const { runtime, tasks } = await setup(t);
      const old = firstWorker(runtime);
      const ends = observeEnds(runtime);
      const results = runtime.streamRange(
        tasks.binary,
        { start: 0, end: 1, grainSize: 1 },
        () => ({ input: { fail } }),
        {
          experimentalMaxResultBytes: 8,
          experimentalMaxReservedResultBytes: 8,
        },
      );
      const iterator = results[Symbol.asyncIterator]();
      if (fail) await assert.rejects(iterator.next(), PjsTaskError);
      else {
        const value = await iterator.next();
        assert.equal(value.value.output.byteLength, 8);
        assert.equal((await iterator.next()).done, true);
      }
      assert.equal(ends.length, 1);
      assert.equal(old.exitObserved, false);
      assert.equal(old.hasPhysicalExecution, false);
      assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
      assert.equal(runtime.stats().workers.restarts, 0);
      assertOwners(runtime);
    },
  );
}

test(
  'serialization failure before successful post creates no physical credit or termination',
  bounded,
  async (t) => {
    const { runtime, tasks } = await setup(t);
    const old = firstWorker(runtime);
    const ends = observeEnds(runtime);
    const results = runtime.streamRange(
      tasks.binary,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: () => 0 }),
      {
        experimentalResultBytes: 8,
        experimentalMaxReservedResultBytes: 8,
      },
    );
    const iterator = results[Symbol.asyncIterator]();
    await assert.rejects(iterator.next(), PjsSerializationError);
    assert.equal(old.hasPhysicalExecution, false);
    assert.equal(old.exitObserved, false);
    assert.equal(ends.length, 0);
    assert.deepEqual(runtime.resultCredits.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
    assert.equal(await runtime.run(tasks.echo, 10), 10);
  },
);

test('idle protocol failure ends no task correlation', bounded, async (t) => {
  const { runtime, tasks } = await setup(t);
  const ends = observeEnds(runtime);
  const old = firstWorker(runtime);
  old.thread.emit('message', { type: 'invalid' });
  assert.equal(ends.length, 0);
  assert.equal(runtime.stats().workers.busy, 0);
  assert.equal(await runtime.run(tasks.echo, 11), 11);
  assert.equal(ends.length, 1);
});

test(
  'replacement bootstrap failure remains fatal without inventing physical ownership',
  bounded,
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'pjs-r1a-bootstrap-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'task.mjs');
    await writeFile(
      path,
      `export { pulse, binary, echo } from ${JSON.stringify(fixture.href)};`,
    );
    const { runtime, tasks, control } = await setup(t, {}, pathToFileURL(path));
    const exit = control();
    const ends = observeEnds(runtime);
    const shared = new SharedArrayBuffer(8);
    const iterator = stream(runtime, tasks.pulse, shared, 'exact');
    const failed = assert.rejects(iterator.next(), PjsWorkerError);
    await until(() => Atomics.load(new Int32Array(shared), 0) !== 0);
    await writeFile(path, 'throw new Error("replacement bootstrap invalid");');
    Atomics.store(new Int32Array(shared), 1, 1);
    await failed;
    const queued = assert.rejects(runtime.run(tasks.echo, 12), PjsWorkerError);
    exit.release();
    await queued;
    await runtime.shutdown();
    assert.equal(ends.length, 1);
    assert.equal(runtime.stats().workers.failures, 2);
    assert.equal(runtime.stats().workers.restarts, 1);
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  },
);
