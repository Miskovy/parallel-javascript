import { runtimeComponents, runtimeController } from './runtime-inspection.mjs';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsTimeoutError,
  PjsCancelledError,
  PjsTaskError,
  PjsWorkerError,
  PjsExecutionLeaseError,
  PjsSerializationError,
} from '../../dist/index.js';
import { clock, controlExit, fixture, until } from './containment.mjs';
import { LifecycleModel, InvalidHistory } from './lifecycle-model.mjs';
import { compare, inspect, Divergence } from './lifecycle-oracles.mjs';

const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
const callerOutcome = (error) =>
  error instanceof PjsTimeoutError
    ? 'timed_out'
    : error instanceof PjsCancelledError
      ? 'cancelled'
      : 'failed';
export const replayCommand = (h) =>
  `npm run test:r2:replay -- --seed=${h.seed} --case=${h.caseId} --profile=${h.profile}`;

// Real bootstrap/exit, controlled host protocol. Never patches global Worker or timers.
class Controller {
  constructor(config) {
    this.controls = new Map();
    this.records = new Map();
    this.rawToAlias = new Map();
    this.streams = new Map();
    this.unhandled = [];
    this.postingChecks = 0;
    this.onUnhandled = (reason) => this.unhandled.push(String(reason));
    process.on('unhandledRejection', this.onUnhandled);
    const registry = new PjsTaskRegistry();
    this.task = registry.register('echo', fixture, 'echo');
    this.runtime = new PjsRuntime({
      registry,
      workers: config.workers,
      maxQueue: config.maxQueue,
      ...(config.rolling
        ? { restartPolicy: { maxRestarts: config.maxRestarts, windowMs: 100 } }
        : { maxRestarts: config.maxRestarts }),
    });
    this.shutdownTime = clock(runtimeController(this.runtime), 'Shutdown');
    this.pool = runtimeComponents(this.runtime).dispatcher.pool;
    this.poolTime = clock(this.pool);
    const spawn = this.pool.spawn.bind(this.pool);
    this.pool.spawn = () => {
      spawn();
      for (const w of this.pool.workers.values()) this.install(w);
    };
    for (const w of this.pool.workers.values()) this.install(w);
    // Observe actual resolve/reject invocations, even when Promise itself hides duplicates.
    const tasks = runtimeComponents(this.runtime).taskCoordinator.tasks;
    const set = tasks.set.bind(tasks);
    tasks.set = (id, pending) => {
      const alias = pending.child
        ? this.submission.stream + ':' + pending.child.partition.index
        : this.submission.task;
      const controller = this.submission.controller;
      this.rawToAlias.set(id, alias);
      const r = {
        pending,
        controller,
        settlements: 0,
        outcome: null,
        error: null,
        listeners: () =>
          controller ? getEventListeners(controller.signal, 'abort').length : 0,
      };
      this.records.set(alias, r);
      for (const method of ['resolve', 'reject']) {
        const original = pending[method];
        pending[method] = (value) => {
          r.settlements++;
          r.outcome =
            method === 'resolve'
              ? 'completed'
              : value instanceof PjsTimeoutError
                ? 'timed_out'
                : value?.name === 'PjsCancelledError'
                  ? 'cancelled'
                  : 'failed';
          r.error = method === 'reject' ? value.name : null;
          if (method === 'reject') {
            const classes = {
              PjsTimeoutError,
              PjsCancelledError,
              PjsTaskError,
              PjsWorkerError,
              PjsExecutionLeaseError,
              PjsSerializationError,
            };
            assert.ok(
              value instanceof classes[value.name],
              'public error class identity',
            );
            assert.equal(
              value.taskId,
              id,
              'public error retains logical identity',
            );
            if (value.workerId !== undefined)
              assert.equal(value.workerId, pending.snapshot.workerId);
          }
          return original(value);
        };
      }
      return set(id, pending);
    };
  }
  install(worker) {
    if (this.controls.has(worker.id)) return;
    const receive = worker.receive.bind(worker);
    const c = {
      worker,
      exit: controlExit(worker),
      time: clock(worker),
      receive,
      ready: undefined,
      stale: [],
    };
    this.controls.set(worker.id, c);
    worker.receive = (message) => {
      if (message?.type === 'ready') c.ready = message;
      else receive(message);
    };
    worker.thread.postMessage = (message, transfers = []) => {
      if (message.type === 'shutdown') return; // Exit remains behind the existing termination gate.
      this.postingChecks++;
      assert.ok(
        worker.hasPhysicalExecution,
        'posting owns physical correlation',
      );
      const ids = message.items?.map((x) => x.taskId) ?? [message.taskId];
      for (const id of ids) {
        const reservation = runtimeComponents(
          this.runtime,
        ).resultCredits.reservations.get(id);
        if (reservation)
          assert.ok(reservation.dispatching, 'posting retains credit claim');
      }
      // Node structured clone invokes getters synchronously, including transfer detachment.
      structuredClone(message, { transfer: transfers });
      for (const id of ids) {
        const reservation = runtimeComponents(
          this.runtime,
        ).resultCredits.reservations.get(id);
        if (reservation)
          assert.ok(
            reservation.dispatching,
            'posting claim survived clone reentrancy',
          );
      }
      for (const id of ids) {
        const r = this.records.get(this.rawToAlias.get(id));
        r.posts = (r.posts ?? 0) + 1;
      }
      c.posted = message;
    };
    const schedule = worker.scheduleLeaseTimer;
    worker.scheduleLeaseTimer = (callback, delay) => {
      c.stale.push(callback);
      return schedule(callback, delay);
    };
  }
  async ready(c) {
    await until(() => c.ready);
    c.receive(c.ready);
    c.ready = undefined;
    await flush();
  }
  async act(a) {
    const r = this.runtime;
    const c = this.controls.get(a.worker);
    const record = this.records.get(a.task);
    switch (a.type) {
      case 'CREATE_RUNTIME':
        break;
      case 'OBSERVE_READY':
        for (const value of this.controls.values()) await this.ready(value);
        await r.ready();
        break;
      case 'OBSERVE_REPLACEMENT_READY':
        await this.ready(c);
        break;
      case 'INJECT_BOOTSTRAP_FAILURE':
        c.receive({
          type: 'bootstrapFailure',
          error: { name: 'Error', message: 'R2 bootstrap fault' },
        });
        break;
      case 'SUBMIT_TASK': {
        const controller = new AbortController();
        this.submission = { ...a, controller };
        const input = {};
        const transferred = a.transfer ? new ArrayBuffer(8) : undefined;
        if (transferred) input.transferred = transferred;
        if (a.post)
          Object.defineProperty(input, 'value', {
            enumerable: true,
            get: () => {
              if (a.reentrant) {
                const nestedController = new AbortController(),
                  original = this.submission;
                const alias = 'nested-' + a.task;
                this.submission = { task: alias, controller: nestedController };
                const nested = r.run(
                  this.task,
                  {},
                  { signal: nestedController.signal },
                );
                nestedController.abort();
                const entry = this.records.get(alias);
                entry.caller = nested.then(
                  (value) => ({ outcome: 'completed', value }),
                  (error) => ({
                    outcome: callerOutcome(error),
                    error: error.name,
                  }),
                );
                this.submission = original;
              }
              if (a.post === 'cancel') controller.abort();
              if (a.post === 'shutdown') this.begin({ drain: false });
              if (a.post === 'fail') throw new Error('R2 posting fault');
              assert.ok(
                [...this.pool.workers.values()].some(
                  (w) => w.hasPhysicalExecution,
                ),
                'reentrant posting ownership',
              );
              return 1;
            },
          });
        const promise = r.run(this.task, input, {
          signal: controller.signal,
          ...(a.leased ? { executionLease: 10 } : {}),
          ...(transferred ? { transferList: [transferred] } : {}),
        });
        if (transferred)
          assert.equal(
            transferred.byteLength,
            0,
            'successful clone transfers input despite caller cancellation',
          );
        // External caller observation is independent of resolve/reject instrumentation.
        const entry = this.records.get(a.task);
        entry.caller = promise.then(
          (value) => ({ outcome: 'completed', value }),
          (error) => ({ outcome: callerOutcome(error), error: error.name }),
        );
        break;
      }
      case 'START_BINARY_STREAM': {
        const controller = new AbortController();
        this.submission = { ...a, controller };
        const stream = r.streamRange(
          this.task,
          { start: 0, end: a.count, grainSize: 1 },
          () => {
            const input = {};
            if (a.post)
              Object.defineProperty(input, 'value', {
                enumerable: true,
                get: () => {
                  if (a.post === 'cancel') controller.abort();
                  else throw new Error('R2 binary posting fault');
                  return 1;
                },
              });
            return { input };
          },
          {
            signal: controller.signal,
            experimentalDispatchBatchSize: a.count,
            experimentalMaxBufferedResults: a.count,
            experimentalMaxReservedResultBytes: a.count * 8,
            ...(a.mode === 'exact'
              ? { experimentalResultBytes: 8 }
              : { experimentalMaxResultBytes: 8 }),
          },
        );
        this.streams.set(a.stream, stream);
        break;
      }
      case 'CANCEL_TASK':
        record.controller.abort();
        break;
      case 'EXPIRE_CALLER_TIMEOUT':
        // Deliver the host timeout transition, without replacing global Node timers.
        runtimeComponents(r).taskCoordinator.settle(
          record.pending,
          'timed_out',
          new PjsTimeoutError('R2 controlled timeout', {
            taskId: record.pending.id,
            ...(record.pending.snapshot.workerId === undefined
              ? {}
              : { workerId: record.pending.snapshot.workerId }),
          }),
        );
        runtimeController(r).pump();
        break;
      case 'DELIVER_STARTED':
        c.receive({
          type: 'started',
          taskId: c.worker.snapshot().currentTaskId,
        });
        break;
      case 'DELIVER_VALID_RESULT':
      case 'DELIVER_TASK_FAILURE': {
        const ids = c.posted.items?.map((x) => x.taskId) ?? [c.posted.taskId];
        const success = (taskId) => ({
          type: 'success',
          taskId,
          output: new Uint8Array(a.bytes ?? 8),
          actualResultBytes: a.bytes ?? 8,
          executionMs: 0,
        });
        const failure = {
          type: 'failure',
          taskId: ids[0],
          kind: 'task',
          error: { name: 'Error', message: 'R2 task fault' },
          executionMs: 0,
        };
        c.receive(
          ids.length > 1
            ? {
                type: 'batchResult',
                batchId: c.posted.batchId,
                items:
                  a.type === 'DELIVER_TASK_FAILURE'
                    ? [failure]
                    : ids.map(success),
                skippedTaskIds:
                  a.type === 'DELIVER_TASK_FAILURE' ? ids.slice(1) : [],
                executionMs: 0,
              }
            : a.type === 'DELIVER_TASK_FAILURE'
              ? failure
              : success(ids[0]),
        );
        break;
      }
      case 'CONSUME_STREAM':
        assert.equal((await this.streams.get(a.stream).next()).done, false);
        break;
      case 'ABANDON_STREAM':
        await this.streams.get(a.stream).return();
        break;
      case 'ADVANCE_LEASE_CLOCK':
        c.time.advance(10);
        break;
      case 'EXPIRE_RESTART_WINDOW':
        this.poolTime.advance(a.ms);
        break;
      case 'INJECT_WORKER_ERROR':
        c.worker.thread.emit('error', new Error('R2 injected error'));
        break;
      case 'INJECT_PROTOCOL_FAILURE':
        c.receive({ type: 'R2 invalid protocol' });
        break;
      case 'DELIVER_STALE_RESULT':
        c.receive({
          type: 'success',
          taskId: c.posted.taskId ?? c.posted.batchId,
          output: 1,
          executionMs: 0,
        });
        break;
      case 'FIRE_STALE_LEASE':
        c.stale[0]();
        break;
      case 'INJECT_TERMINATION_REJECTION':
        c.rejected = true;
        c.worker.terminateThread = () => {
          c.exit.requests++;
          return Promise.reject(new Error('R2 termination rejection'));
        };
        break;
      case 'CONFIRM_WORKER_EXIT': {
        c.exit.release();
        if (c.rejected) await c.worker.thread.terminate();
        else await c.worker.stop();
        await flush();
        assert.ok(c.exit.confirmed, 'Node exit confirmed');
        break;
      }
      case 'DELIVER_DUPLICATE_EXIT':
        c.worker.exited(0);
        break;
      case 'BEGIN_GRACEFUL_SHUTDOWN':
        this.begin({
          drain: true,
          ...(a.forceAfter ? { forceAfter: a.forceAfter } : {}),
        });
        break;
      case 'BEGIN_FORCED_SHUTDOWN':
        this.begin({ drain: false });
        break;
      case 'CONCURRENT_SHUTDOWN':
        assert.equal(r.shutdown({ drain: false }), this.shutdownPromise);
        break;
      case 'ADVANCE_SHUTDOWN_CLOCK':
        this.shutdownTime.advance(10);
        break;
      case 'OBSERVE_SHUTDOWN_COMPLETION':
        await this.shutdownPromise;
        break;
      case 'OBSERVE_SHUTDOWN_REJECTION':
        await assert.rejects(this.shutdownPromise, /R2 termination rejection/);
        break;
      default:
        throw new InvalidHistory('Unknown controller action ' + a.type);
    }
    await flush();
  }
  begin(options) {
    const promise = this.runtime.shutdown(options);
    this.shutdownPromise ??= promise;
    void promise.then(
      () => {
        this.shutdownOutcome = 'completed';
      },
      () => {
        this.shutdownOutcome = 'rejected';
      },
    );
    void promise.catch(() => {});
    return promise;
  }
  observation() {
    const r = this.runtime,
      s = r.stats(),
      containment = s.containment;
    return {
      state: s.state,
      drain: runtimeController(r).drainMode,
      shutdownOutcome: this.shutdownOutcome ?? null,
      logicalMetrics: {
        accepted: s.tasks.accepted,
        pending: s.tasks.pending,
        completed: s.tasks.completed,
        failed: s.tasks.failed,
        cancelled: s.tasks.cancelled,
        timedOut: s.tasks.timedOut,
      },
      tasks: [...this.records].map(([id, t]) => ({
        id,
        status: t.outcome ? 'settled' : t.pending.snapshot.status,
        outcome: t.outcome,
        error: t.error,
        settlements: t.settlements,
        credit:
          runtimeComponents(r).resultCredits.reservations.get(t.pending.id)
            ?.creditedBytes ?? null,
        mode: t.pending.resultByteContract
          ? 'upper-bound'
          : t.pending.expectedResultBytes !== undefined
            ? 'exact'
            : null,
      })),
      dispatches: [...this.records].map(([id, t]) => ({
        id,
        count: t.posts ?? 0,
      })),
      queue: s.queue.size,
      workers: [...this.pool.workers.values()].map((w) => {
        const c = this.controls.get(w.id);
        const ids = w.currentTaskIds.length
          ? w.currentTaskIds
          : w.hasPhysicalExecution
            ? [w.snapshot().currentTaskId]
            : [];
        return {
          id: w.id,
          status: w.status,
          live: !c.exit.confirmed,
          termination: c.exit.requests > 0,
          ids: ids.map((id) => this.rawToAlias.get(id)),
        };
      }),
      posts: s.dispatch.executeMessages,
      failures: s.workers.failures,
      restarts: s.workers.restarts,
      replacements: containment.workerReplacements,
      exhaustions: containment.restartBudgetExhaustions,
      utilization: containment.restartWindowUtilization ?? null,
      leaseExpirations: containment.leaseExpirations,
      leaseRequests: containment.leaseTerminationRequests,
      leaseExits: containment.confirmedLeaseExits,
      escalations: containment.shutdownEscalations,
      refunded: s.streamResults.refundedResultBytes,
      reconciled: s.streamResults.upperBoundResultsReconciled,
      streams: [...this.streams].map(([id, stream]) => ({
        id,
        buffered: stream.buffered,
        closed: stream.done,
      })),
      livePopulation: [...this.controls.values()].filter(
        (c) => !c.exit.confirmed,
      ).length,
      poolLimit: this.pool.options.workers,
    };
  }
  async cleanup() {
    for (const c of this.controls.values()) c.exit.release();
    // A first graceful call cannot be overridden; close test streams and contain remaining workers explicitly.
    for (const s of this.streams.values()) await s.return();
    for (const c of this.controls.values()) {
      if (c.worker.hasPhysicalExecution && c.worker.status === 'busy')
        c.receive({ type: 'R2 cleanup fault' });
    }
    for (const c of this.controls.values()) c.exit.release();
    const rejected = [...this.controls.values()].some((c) => c.rejected);
    if (rejected) {
      for (const c of this.controls.values()) await c.worker.thread.terminate();
      await runtimeComponents(this.runtime)
        .dispatcher.stop()
        .catch(() => {});
      await this.begin({ drain: false }).catch(() => {});
    } else {
      await runtimeComponents(this.runtime).dispatcher.stop();
      await this.begin({ drain: false });
    }
    await flush();
    await turn();
    inspect(this.runtime, this, true);
    process.removeListener('unhandledRejection', this.onUnhandled);
  }
}

export async function runHistory(history, { mutateObservation } = {}) {
  // Reject invalid reduced candidates before allocating any workers.
  const validation = new LifecycleModel(history.config);
  for (const a of history.actions) validation.apply(a);
  validation.require(
    (validation.state === 'stopped' &&
      history.actions.at(-1)?.type === 'OBSERVE_SHUTDOWN_COMPLETION') ||
      (validation.terminationRejected &&
        history.actions.at(-1)?.type === 'OBSERVE_SHUTDOWN_REJECTION'),
    history.actions.at(-1),
  );
  const model = new LifecycleModel(history.config);
  const controller = new Controller(history.config);
  const evidence = {
    seed: history.seed,
    caseId: history.caseId,
    config: history.config,
    actions: history.actions,
    observations: [],
    invariantChecks: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => ['I' + (i + 1), 0]),
    ),
    transitionCoverage: {},
    passed: false,
    cleanup: false,
    replayCommand: replayCommand(history),
  };
  let primary;
  try {
    for (const [index, a] of history.actions.entries()) {
      model.apply(a);
      await controller.act(a);
      const expected = model.observation(),
        actual = controller.observation();
      mutateObservation?.(actual, a, index);
      evidence.observations.push({ index, action: a, expected, actual });
      for (const id of compare(expected, actual))
        evidence.invariantChecks[id]++;
      inspect(
        controller.runtime,
        controller,
        a.type === 'OBSERVE_SHUTDOWN_COMPLETION',
      );
      if (a.type === 'OBSERVE_SHUTDOWN_COMPLETION')
        evidence.invariantChecks.I10++;
    }
    for (const t of controller.records.values())
      if (t.caller) {
        const caller = await t.caller;
        assert.equal(caller.outcome, t.outcome);
        assert.equal(caller.error ?? null, t.error);
      }
    evidence.passed = true;
  } catch (error) {
    primary = error;
    evidence.firstFailingInvariant = error.invariant ?? 'controller';
    evidence.failure = {
      message: error.message,
      detail: error.cause?.message,
      actionIndex: evidence.observations.length - 1,
    };
  } finally {
    evidence.transitionCoverage = { ...model.coverage };
    try {
      await controller.cleanup();
      evidence.cleanup = true;
      evidence.invariantChecks.I10++;
    } catch (error) {
      primary ??= error;
      evidence.firstFailingInvariant ??= 'I10';
      evidence.failure ??= {
        message: error.message,
        detail: error.cause?.message,
      };
    } finally {
      process.removeListener('unhandledRejection', controller.onUnhandled);
    }
  }
  if (primary) {
    const error = new Divergence(
      evidence.firstFailingInvariant,
      `${primary.message}\nseed=${history.seed} case=${history.caseId}\nReplay: ${evidence.replayCommand}`,
      primary,
    );
    error.evidence = evidence;
    error.property = primary.property ?? evidence.firstFailingInvariant;
    throw error;
  }
  return evidence;
}

export async function reduceHistory(
  history,
  property,
  replay = runHistory,
  budget = 40,
) {
  let best = history,
    attempts = 0;
  let signature;
  try {
    await replay(history);
    throw new Error('Cannot reduce a passing history');
  } catch (error) {
    if (error.invariant !== property) throw error;
    signature = error.property;
  }
  for (
    let width = Math.max(1, Math.floor(history.actions.length / 2));
    width >= 1 && attempts < budget;
    width = Math.floor(width / 2)
  ) {
    for (let start = 1; start < best.actions.length - 1 && attempts < budget;) {
      const candidate = {
        ...best,
        actions: best.actions.filter((_, i) => i < start || i >= start + width),
      };
      attempts++;
      try {
        await replay(candidate);
        start++;
      } catch (error) {
        if (
          error instanceof InvalidHistory ||
          error.invariant !== property ||
          error.property !== signature
        ) {
          start++;
          continue;
        }
        best = candidate;
      }
    }
  }
  return {
    history: best,
    attempts,
    property,
    signature,
    originalActions: history.actions.length,
    reducedActions: best.actions.length,
  };
}
