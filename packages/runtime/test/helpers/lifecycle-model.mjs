// Contract specification: no production imports, protocol validators or credit helpers.
export const MODEL_VERSION = 'r2-model-1';
export const INVARIANTS = [
  'I1',
  'I2',
  'I3',
  'I4',
  'I5',
  'I6',
  'I7',
  'I8',
  'I9',
  'I10',
];

export class InvalidHistory extends Error {}

export class LifecycleModel {
  constructor(config) {
    this.config = config;
    this.state = 'created';
    this.workers = new Map();
    this.retiredWorkers = new Map();
    this.tasks = new Map();
    this.queue = [];
    this.streams = new Map();
    this.nextWorker = 1;
    this.now = 0;
    this.decisions = [];
    this.failures = 0;
    this.restarts = 0;
    this.replacements = 0;
    this.exhaustions = 0;
    this.leaseExpirations = 0;
    this.leaseRequests = 0;
    this.leaseExits = 0;
    this.escalations = 0;
    this.refunded = 0;
    this.reconciled = 0;
    this.posts = 0;
    this.drain = true;
    this.shutdown = 'none';
    this.coverage = {};
  }
  require(value, action) {
    if (!value)
      throw new InvalidHistory('Disabled action: ' + JSON.stringify(action));
  }
  addWorker() {
    const w = {
      id: this.nextWorker++,
      status: 'starting',
      live: true,
      execution: undefined,
      termination: false,
      failed: false,
      leaseExpired: false,
      staleLeases: 0,
    };
    this.workers.set(w.id, w);
    return w;
  }
  pending() {
    return [...this.tasks.values()].filter((t) => !t.outcome);
  }
  settle(t, outcome, error) {
    if (t.outcome) return;
    t.outcome = outcome;
    t.error = error;
    t.settlements = 1;
    t.status = 'settled';
    this.queue = this.queue.filter((id) => id !== t.id);
    if (t.credit !== undefined && !this.owns(t.id)) t.credit = undefined;
  }
  owns(id) {
    return [...this.workers.values()].some((w) =>
      w.execution?.ids.includes(id),
    );
  }
  dispatch(w, ids) {
    this.coverage['physical:not posted:posting'] =
      (this.coverage['physical:not posted:posting'] ?? 0) + 1;
    this.coverage['physical:posting:occupied'] =
      (this.coverage['physical:posting:occupied'] ?? 0) + 1;
    w.status = 'busy';
    w.execution = {
      ids,
      phase: 'occupied',
      started: false,
      leaseDeadline: this.tasks.get(ids[0]).leased ? this.now + 10 : undefined,
    };
    this.posts++;
    for (const id of ids) {
      const t = this.tasks.get(id);
      t.postCount = (t.postCount ?? 0) + 1;
      t.worker = w.id;
      t.physical = 'occupied';
      if (!t.outcome) t.status = 'scheduled';
    }
  }
  pump() {
    if (!(
      this.state === 'running' ||
      (this.state === 'stopping' && this.drain)
    ))
      return;
    for (const w of this.workers.values()) {
      if (w.status !== 'idle' || !this.queue.length) continue;
      this.dispatch(w, [this.queue.shift()]);
    }
  }
  end(w, proof) {
    if (!w.execution) return;
    w.lastEnd = proof;
    if (w.execution.leaseDeadline !== undefined) w.staleLeases++;
    for (const id of w.execution.ids) {
      const t = this.tasks.get(id);
      t.physical = proof === 'exit' ? 'exit confirmed' : 'completion observed';
      if (t.outcome && t.outcome !== 'completed') t.credit = undefined;
    }
    w.execution = undefined;
  }
  fail(w, lease = false, bootstrap = false) {
    if (w.failed || w.termination) return;
    w.failed = true;
    w.status = 'failed';
    this.failures++;
    if (lease) {
      w.leaseExpired = true;
      this.leaseExpirations++;
    }
    if (w.execution) {
      const leader = this.tasks.get(w.execution.ids[0]);
      this.settle(
        leader,
        'failed',
        lease ? 'PjsExecutionLeaseError' : 'PjsWorkerError',
      );
      if (leader.stream) this.closeStream(leader.stream, 'failed');
    }
    if (this.shutdown === 'forced shutdown' || this.state === 'failed') return;
    const utilization = this.config.rolling
      ? this.decisions.filter((n) => this.now - n < 100).length
      : this.restarts;
    if (bootstrap || utilization >= this.config.maxRestarts) {
      if (!bootstrap) this.exhaustions++;
      this.state = 'failed';
      this.shutdown = 'fatal';
      for (const s of this.streams.keys()) this.closeStream(s, 'failed');
      for (const t of this.pending())
        this.settle(t, 'failed', 'PjsWorkerError');
      this.terminateAll();
    } else {
      this.restarts++;
      this.decisions.push(this.now);
      w.recovery = 'budget consumed';
      this.terminate(w);
    }
  }
  terminate(w) {
    if (!w.termination) {
      w.termination = true;
      w.status = 'stopped';
      if (w.leaseExpired) this.leaseRequests++;
      if (w.execution) w.execution.phase = 'termination requested';
    }
  }
  terminateAll() {
    for (const w of this.workers.values()) this.terminate(w);
  }
  closeStream(id, outcome = 'cancelled') {
    const s = this.streams.get(id);
    if (s.closed) return;
    s.closed = true;
    s.buffer = [];
    for (const t of this.tasks.values())
      if (t.stream === id) {
        this.settle(t, 'cancelled', 'PjsCancelledError');
        if (!this.owns(t.id)) t.credit = undefined;
      }
    s.outcome = outcome;
  }
  force() {
    this.drain = false;
    this.shutdown = 'forced shutdown';
    for (const id of this.streams.keys()) this.closeStream(id);
    for (const t of this.pending())
      this.settle(t, 'cancelled', 'PjsCancelledError');
    this.terminateAll();
  }
  checkpoint() {
    this.pump();
    if (
      this.state === 'stopping' &&
      this.drain &&
      !this.pending().length &&
      ![...this.workers.values()].some((w) => w.execution) &&
      ![...this.streams.values()].some((s) => !s.closed)
    ) {
      this.shutdown = 'exit waiting';
      this.terminateAll();
    }
  }
  apply(a) {
    const before = this.state;
    const dimensions = () =>
      new Map([
        ['runtime', this.state],
        ['shutdown', this.shutdown],
        ...[...this.tasks].flatMap(([id, t]) => [
          ['logical:' + id, t.status],
          ['physical:' + id, t.physical],
          [
            'credit:' + id,
            t.credit === undefined
              ? 'released'
              : this.owns(id)
                ? t.outcome
                  ? 'caller settled'
                  : 'dispatched'
                : t.outcome === 'completed'
                  ? 'reconciled / buffered'
                  : 'reserved',
          ],
        ]),
        ...[...this.workers].flatMap(([id, w]) => [
          ['worker:' + id, w.status],
          ['recovery:' + id, w.recovery ?? 'none'],
        ]),
      ]);
    const priorDimensions = dimensions();
    const w = this.workers.get(a.worker) ?? this.retiredWorkers.get(a.worker);
    const t = this.tasks.get(a.task);
    switch (a.type) {
      case 'CREATE_RUNTIME':
        this.require(this.state === 'created', a);
        this.state = 'starting';
        for (let i = 0; i < this.config.workers; i++) this.addWorker();
        break;
      case 'OBSERVE_READY':
        this.require(this.state === 'starting', a);
        for (const worker of this.workers.values()) worker.status = 'idle';
        this.state = 'running';
        break;
      case 'OBSERVE_REPLACEMENT_READY':
        this.require(w?.status === 'starting' && !w.termination, a);
        w.status = 'idle';
        w.recovery = 'replacement ready';
        break;
      case 'INJECT_BOOTSTRAP_FAILURE':
        this.require(w?.status === 'starting' && !w.termination, a);
        this.fail(w, false, true);
        break;
      case 'SUBMIT_TASK': {
        this.require(
          (this.state === 'running' || this.state === 'starting') &&
            !this.tasks.has(a.task),
          a,
        );
        const idle =
          this.state === 'running'
            ? [...this.workers.values()].find((x) => x.status === 'idle')
            : undefined;
        this.require(idle || this.queue.length < this.config.maxQueue, a);
        const task = {
          id: a.task,
          status: 'queued',
          leased: Boolean(a.leased),
          settlements: 0,
          physical: 'not posted',
        };
        this.tasks.set(a.task, task);
        if (idle) {
          if (a.post === 'fail') {
            this.settle(task, 'failed', 'PjsSerializationError');
            break;
          }
          this.dispatch(idle, [a.task]);
          if (a.reentrant) {
            const nested = {
              id: 'nested-' + a.task,
              status: 'queued',
              settlements: 0,
              physical: 'not posted',
            };
            this.tasks.set(nested.id, nested);
            const next = [...this.workers.values()].find(
              (w) => w.status === 'idle',
            );
            if (next) this.dispatch(next, [nested.id]);
            else {
              this.require(this.queue.length < this.config.maxQueue, a);
              this.queue.push(nested.id);
            }
            this.settle(nested, 'cancelled', 'PjsCancelledError');
          }
          if (a.post === 'cancel')
            this.settle(task, 'cancelled', 'PjsCancelledError');
          if (a.post === 'shutdown') {
            this.shutdownCalled = true;
            this.state = 'stopping';
            this.force();
          }
        } else {
          this.require(!a.post, a);
          this.queue.push(a.task);
        }
        break;
      }
      case 'START_BINARY_STREAM': {
        this.require(
          this.state === 'running' && !this.streams.has(a.stream),
          a,
        );
        const idle = [...this.workers.values()].find(
          (x) => x.status === 'idle',
        );
        this.require(idle && !this.queue.length, a);
        const ids = Array.from(
          { length: a.count },
          (_, i) => a.stream + ':' + i,
        );
        this.streams.set(a.stream, { buffer: [], closed: false, ids });
        for (const id of ids)
          this.tasks.set(id, {
            id,
            stream: a.stream,
            status: 'queued',
            settlements: 0,
            mode: a.mode,
            declaration: 8,
            credit: 8,
            physical: 'not posted',
          });
        if (a.post === 'fail') {
          this.settle(
            this.tasks.get(ids[0]),
            'failed',
            'PjsSerializationError',
          );
          this.closeStream(a.stream, 'failed');
        } else {
          this.dispatch(idle, ids);
          if (a.post === 'cancel') this.closeStream(a.stream);
        }
        break;
      }
      case 'CANCEL_TASK':
      case 'EXPIRE_CALLER_TIMEOUT':
        this.require(t && !t.stream, a);
        this.settle(
          t,
          a.type === 'CANCEL_TASK' ? 'cancelled' : 'timed_out',
          a.type === 'CANCEL_TASK' ? 'PjsCancelledError' : 'PjsTimeoutError',
        );
        break;
      case 'DELIVER_STARTED':
        this.require(
          w?.status === 'busy' && w.execution && !w.execution.started,
          a,
        );
        w.execution.started = true;
        for (const id of w.execution.ids)
          if (!this.tasks.get(id).outcome)
            this.tasks.get(id).status = 'running';
        break;
      case 'DELIVER_VALID_RESULT':
      case 'DELIVER_TASK_FAILURE': {
        this.require(w?.status === 'busy' && w.execution?.started, a);
        const ids = [...w.execution.ids];
        if (a.type === 'DELIVER_VALID_RESULT')
          this.require(
            ids.every(
              (id) => this.tasks.get(id).mode !== 'exact' || a.bytes === 8,
            ),
            a,
          );
        this.end(w, 'result');
        w.status = 'idle';
        for (const [index, id] of ids.entries()) {
          const task = this.tasks.get(id);
          if (task.outcome) continue;
          if (a.type === 'DELIVER_TASK_FAILURE' && index === 0) {
            this.settle(task, 'failed', 'PjsTaskError');
            if (task.stream) this.closeStream(task.stream, 'failed');
            break;
          }
          if (task.mode === 'upper-bound') {
            task.credit = a.bytes;
            this.refunded += 8 - a.bytes;
            this.reconciled++;
          }
          this.settle(task, 'completed');
          if (task.stream) {
            task.credit = task.mode === 'exact' ? 8 : a.bytes;
            this.streams.get(task.stream).buffer.push(id);
          }
        }
        break;
      }
      case 'CONSUME_STREAM': {
        const s = this.streams.get(a.stream);
        this.require(s && s.buffer.length && !s.closed, a);
        this.tasks.get(s.buffer.shift()).credit = undefined;
        if (
          !s.buffer.length &&
          s.ids.every((id) => this.tasks.get(id).outcome === 'completed')
        ) {
          s.closed = true;
          s.outcome = 'completed';
        }
        break;
      }
      case 'ABANDON_STREAM':
        this.require(this.streams.has(a.stream), a);
        this.closeStream(a.stream);
        break;
      case 'ADVANCE_LEASE_CLOCK':
        this.require(
          w?.status === 'busy' && w.execution?.leaseDeadline !== undefined,
          a,
        );
        this.fail(w, true);
        break;
      case 'EXPIRE_RESTART_WINDOW':
        this.require(this.config.rolling, a);
        this.now += a.ms;
        break;
      case 'INJECT_WORKER_ERROR':
      case 'INJECT_PROTOCOL_FAILURE':
        this.require(w?.live, a);
        this.fail(w);
        break;
      case 'DELIVER_STALE_RESULT':
        this.require(w?.failed || w?.termination, a);
        break;
      case 'FIRE_STALE_LEASE':
        this.require(w?.staleLeases > 0 || w?.leaseExpired, a);
        break;
      case 'INJECT_TERMINATION_REJECTION':
        this.require(w?.live && !w.termination, a);
        w.rejectTermination = true;
        this.terminationRejected = true;
        break;
      case 'CONFIRM_WORKER_EXIT': {
        this.require(w?.termination && w.live, a);
        this.end(w, 'exit');
        w.live = false;
        w.recovery = 'exit confirmed';
        if (w.leaseExpired) this.leaseExits++;
        this.checkpoint();
        if (
          w.failed &&
          this.state !== 'failed' &&
          this.shutdown !== 'forced shutdown' &&
          this.shutdown !== 'exit waiting'
        ) {
          this.retiredWorkers.set(w.id, w);
          this.workers.delete(w.id);
          this.addWorker().recovery = 'replacement spawned';
          this.replacements++;
        }
        break;
      }
      case 'DELIVER_DUPLICATE_EXIT':
        this.require(w && !w.live, a);
        break;
      case 'BEGIN_GRACEFUL_SHUTDOWN':
        this.require(this.state === 'running' || this.state === 'starting', a);
        this.shutdownCalled = true;
        this.state = 'stopping';
        this.shutdown = 'graceful drain';
        this.forceAfter = a.forceAfter;
        break;
      case 'BEGIN_FORCED_SHUTDOWN':
        this.require(this.state !== 'created' && this.state !== 'stopped', a);
        this.shutdownCalled = true;
        if (this.shutdown === 'none' || this.shutdown === 'fatal') {
          if (this.state !== 'failed') this.state = 'stopping';
          this.force();
        }
        break;
      case 'CONCURRENT_SHUTDOWN':
        this.require(this.shutdown !== 'none', a);
        break;
      case 'ADVANCE_SHUTDOWN_CLOCK':
        this.require(
          this.state === 'stopping' && this.drain && this.forceAfter,
          a,
        );
        this.escalations++;
        this.force();
        break;
      case 'OBSERVE_SHUTDOWN_COMPLETION':
        this.require(!this.terminationRejected, a);
        this.require(
          this.shutdown !== 'none' &&
            [...this.workers.values()].every((x) => !x.live),
          a,
        );
        this.state = 'stopped';
        this.shutdown = 'completed';
        break;
      case 'OBSERVE_SHUTDOWN_REJECTION':
        this.require(this.terminationRejected && this.shutdownCalled, a);
        this.shutdown = 'failed termination';
        break;
      default:
        throw new InvalidHistory('Unknown action: ' + a.type);
    }
    this.checkpoint();
    if (
      this.shutdownCalled &&
      !this.terminationRejected &&
      [...this.workers.values()].every((x) => !x.live)
    ) {
      this.state = 'stopped';
      this.shutdown = 'completed';
    }
    const edge = before + ':' + a.type + ':' + this.state;
    this.coverage[edge] = (this.coverage[edge] ?? 0) + 1;
    for (const [dimension, after] of dimensions()) {
      const prior = priorDimensions.get(dimension) ?? 'absent';
      if (prior === after) continue;
      const edge = dimension.split(':')[0] + ':' + prior + ':' + after;
      this.coverage[edge] = (this.coverage[edge] ?? 0) + 1;
    }
  }
  observation() {
    return {
      state: this.state,
      drain: this.drain,
      shutdownOutcome: this.shutdownCalled
        ? this.terminationRejected
          ? 'rejected'
          : this.state === 'stopped'
            ? 'completed'
            : null
        : null,
      logicalMetrics: {
        accepted: this.tasks.size,
        pending: this.pending().length,
        ...Object.fromEntries(
          ['completed', 'failed', 'cancelled', 'timed_out'].map((outcome) => [
            outcome === 'timed_out' ? 'timedOut' : outcome,
            [...this.tasks.values()].filter((t) => t.outcome === outcome)
              .length,
          ]),
        ),
      },
      tasks: [...this.tasks.values()].map((t) => ({
        id: t.id,
        status: t.status,
        outcome: t.outcome ?? null,
        error: t.error ?? null,
        settlements: t.settlements,
        credit: t.credit ?? null,
        mode: t.mode ?? null,
      })),
      queue: this.queue.length,
      workers: [...this.workers.values()].map((w) => ({
        id: w.id,
        status: w.status,
        live: w.live,
        termination: w.termination,
        ids: w.execution?.ids ?? [],
      })),
      dispatches: [...this.tasks.values()].map((t) => ({
        id: t.id,
        count: t.postCount ?? 0,
      })),
      posts: this.posts,
      failures: this.failures,
      restarts: this.restarts,
      replacements: this.replacements,
      exhaustions: this.exhaustions,
      utilization: this.config.rolling
        ? this.decisions.filter((n) => this.now - n < 100).length
        : null,
      leaseExpirations: this.leaseExpirations,
      leaseRequests: this.leaseRequests,
      leaseExits: this.leaseExits,
      escalations: this.escalations,
      refunded: this.refunded,
      reconciled: this.reconciled,
      streams: [...this.streams].map(([id, s]) => ({
        id,
        buffered: s.buffer.length,
        closed: s.closed,
      })),
    };
  }
}
