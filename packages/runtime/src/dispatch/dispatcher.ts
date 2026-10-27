import { PjsExecutionLeaseError, PjsWorkerError } from '../errors/index.js';
import type { ProgressControl } from '../workers/progress.js';
import type { RuntimeHost } from '../hosts/contracts.js';
import { PjsPool } from '../pool/pool.js';
import { PjsScheduler } from '../scheduler/fifo.js';
import type { PendingTask } from '../tasks/task.js';
import { internalProfilingEnabled } from '../telemetry/profile.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import type {
  RestartPolicy,
  WorkerResourceLimits,
  WorkerState,
  SchedulingTask,
} from '../types/index.js';
import type {
  ExecutionResultMessage,
  ProgressMessage,
} from '../workers/protocol.js';
import type { PjsWorker, WorkerFailureReason } from '../workers/worker.js';
import type { ResultCreditManager } from '../results/credit.js';

export interface ExecutionDispatcherOptions {
  workers: number;
  concurrency?: number;
  scheduling?: (
    a: Readonly<SchedulingTask>,
    b: Readonly<SchedulingTask>,
  ) => number;
  maxQueue: number;
  startupTimeout: number;
  maxRestarts: number;
  restartPolicy?: RestartPolicy;
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number;
  resourceLimits?: WorkerResourceLimits;
}

export interface ExecutionDispatcherCallbacks {
  ready(): void;
  prepareDispatch?(task: PendingTask): boolean;
  scheduled(
    worker: PjsWorker,
    task: PendingTask,
    scheduledAt: number,
    queueMs: number,
  ): void;
  dispatched(task: PendingTask): void;
  started(worker: PjsWorker, taskId: string): void;
  result(worker: PjsWorker, message: ExecutionResultMessage): void;
  progress?(
    worker: PjsWorker,
    message: ProgressMessage,
    value: unknown,
    acknowledge: () => void,
  ): void;
  failed(error: PjsWorkerError, reason: WorkerFailureReason): void;
  exited(correlationIds: readonly string[]): void;
  revoked(correlationIds: readonly string[]): void;
  dispatchFailed(task: PendingTask, error: Error): void;
  fatal(error: PjsWorkerError): void;
}

export type TaskAdmission =
  | { readonly kind: 'deferred' }
  | { readonly kind: 'direct'; readonly worker: PjsWorker }
  | { readonly kind: 'queued' };

export class ProductionClaim {
  released = false;
  constructor(
    readonly capacity: number,
    readonly worker: PjsWorker | undefined,
    readonly exclusive = false,
    readonly releaseWorker: () => void = () => {},
  ) {}
}

/** Owns bounded admission mechanics and logical-task to physical-message dispatch. */
export class ExecutionDispatcher {
  private readonly scheduler: PjsScheduler<PendingTask>;
  private readonly pool: PjsPool;
  private readonly claims = new Set<{
    worker: PjsWorker;
    exclusive: boolean;
  }>();
  private drain:
    | {
        worker: PjsWorker;
        owner: string;
        production: boolean;
        borrowed: string[];
      }
    | undefined;
  private stopped = false;
  private admissionReservations = 0;
  // Each continuation owns either a vacated execution slot or one queue credit.
  private readonly recoveries = new Map<
    string,
    {
      task: PendingTask;
      kind: 'slot' | 'queue';
      ready: boolean;
    }
  >();
  private readonly postings = new Map<
    string,
    {
      terminate: boolean;
      cancellation?: Int32Array<SharedArrayBuffer>;
      progress?: ProgressControl;
      worker: PjsWorker;
      done?: Promise<void>;
      finish?: () => void;
    }
  >();
  private readonly metrics = {
    executeMessages: 0,
    resultMessages: 0,
    batchedExecuteMessages: 0,
    logicalTasks: 0,
    logicalPartitions: 0,
  };

  constructor(
    options: ExecutionDispatcherOptions,
    tasks: TaskDescriptor[],
    private readonly resultCredits: ResultCreditManager,
    private readonly callbacks: ExecutionDispatcherCallbacks,
    private readonly host: RuntimeHost,
  ) {
    this.scheduler = new PjsScheduler(options.maxQueue, options.scheduling);
    this.pool = new PjsPool(
      {
        workers: options.workers,
        concurrency: options.concurrency ?? 1,
        startupTimeout: options.startupTimeout,
        maxRestarts: options.maxRestarts,
        ...(options.minWorkers === undefined
          ? {}
          : { minWorkers: options.minWorkers }),
        ...(options.maxWorkers === undefined
          ? {}
          : { maxWorkers: options.maxWorkers }),
        ...(options.idleTimeout === undefined
          ? {}
          : { idleTimeout: options.idleTimeout }),
        ...(options.resourceLimits
          ? { resourceLimits: options.resourceLimits }
          : {}),
        ...(options.restartPolicy
          ? { restartPolicy: options.restartPolicy }
          : {}),
      },
      tasks,
      {
        ready: () => this.callbacks.ready(),
        started: (worker, taskId) => this.callbacks.started(worker, taskId),
        progress: (worker, message, value, acknowledge) => {
          if (this.callbacks.progress)
            this.callbacks.progress(worker, message, value, acknowledge);
          else acknowledge();
        },
        result: (worker, message) => {
          this.metrics.resultMessages++;
          this.resultCredits.markExecutionEnded(
            message.type === 'batchResult' ? message.batchId : message.taskId,
          );
          this.callbacks.result(worker, message);
        },
        failed: (worker, error, _wasStarting, reason) => {
          this.cancelDrainForWorker(worker);
          const ids = worker.correlations();
          for (const taskId of ids) {
            const failure =
              error instanceof PjsExecutionLeaseError
                ? new PjsExecutionLeaseError(error.message, {
                    taskId,
                    workerId: worker.id,
                    cause: error.cause,
                  })
                : new PjsWorkerError(error.message, {
                    taskId,
                    workerId: worker.id,
                    cause: error.cause,
                  });
            this.callbacks.failed(failure, reason);
          }
          if (!ids.length) this.callbacks.failed(error, reason);
        },
        exited: (worker, correlationIds) => {
          this.cancelDrainForWorker(worker);
          for (const id of correlationIds)
            this.resultCredits.markExecutionEnded(id);
          this.callbacks.exited(correlationIds);
        },
        postingQuiescent: (worker) => this.postingQuiescent(worker),
        revoked: (_worker, correlations) => {
          for (const id of correlations)
            this.resultCredits.abandonExecution(id);
          this.callbacks.revoked(correlations);
        },
        fatal: (error) => this.callbacks.fatal(error),
      },
      host,
    );
  }

  get queueSize(): number {
    return this.scheduler.size;
  }

  get queueCapacity(): number {
    return this.scheduler.capacity;
  }

  get busy(): number {
    return this.pool.busy;
  }

  get failures(): number {
    return this.pool.failures;
  }

  get restarts(): number {
    return this.pool.restarts;
  }

  start(): Promise<void> {
    return this.pool.start();
  }

  stop(): Promise<void> {
    this.stopped = true;
    this.clearDrain();
    this.claims.clear();
    this.recoveries.clear();
    this.admissionReservations = 0;
    return this.pool.stop();
  }

  recoverySnapshot() {
    return this.pool.recoverySnapshot();
  }

  workerSnapshots(): WorkerState[] {
    return this.pool.snapshots().map((worker) => ({
      ...worker,
      draining: this.drain?.worker.id === worker.id,
    }));
  }

  /** Legacy internal inspection view; claims now reserve slots or entire workers. */
  get reservedWorkers(): ReadonlySet<number> {
    return new Set([...this.claims].map((claim) => claim.worker.id));
  }
  get activeExecutions(): number {
    return this.pool.activeExecutions;
  }
  get policyErrors(): number {
    return this.scheduler.policyErrors;
  }
  get productionOwner(): string | undefined {
    return this.drain?.production ? this.drain.owner : undefined;
  }
  invalidate(): void {
    this.scheduler.invalidate();
  }
  private exclusive(task: PendingTask): boolean {
    return (
      (task.child?.operation.cancellation ?? task.cancellation) ===
        'terminate' || task.executionLease !== undefined
    );
  }
  private stamp(task: PendingTask): void {
    this.scheduler.stamp(task, {
      taskId: task.id,
      taskName: task.snapshot.taskName,
      priority: task.priority ?? 0,
      queuedAt: Date.now(),
      weight: task.admissionWeight ?? 1,
      exclusive: this.exclusive(task),
      ...(task.child
        ? {
            operationId: task.child.operation.id,
            partitionIndex: task.child.partition.index,
          }
        : {}),
    });
  }
  private reserve(worker: PjsWorker, exclusive: boolean): () => void {
    const claim = { worker, exclusive };
    this.claims.add(claim);
    this.invalidate();
    return () => {
      if (this.claims.delete(claim)) this.invalidate();
    };
  }
  private rawSlots(worker: PjsWorker): number {
    let slots = worker.availableSlots;
    for (const claim of this.claims)
      if (claim.worker === worker) {
        if (claim.exclusive) return 0;
        slots--;
      }
    return Math.max(0, slots);
  }
  /** Virtual allocation protects accepted ordinary recovery without multiplying claims. */
  private layout(ignoreDrain = false) {
    const workers = this.pool
      .dispatchable()
      .sort((a, b) => b.activeExecutions - a.activeExecutions || a.id - b.id);
    const slots = new Map(
      workers.map((worker) => [
        worker.id,
        !ignoreDrain && this.drain?.worker === worker
          ? 0
          : this.rawSlots(worker),
      ]),
    );
    const owners = new Map<number, string[]>();
    let missingShared = 0,
      missingExclusive = 0;
    for (const recovery of this.recoveries.values()) {
      if (recovery.kind !== 'slot') continue;
      const exclusive = this.exclusive(recovery.task);
      const worker = workers.find(
        (entry) =>
          (slots.get(entry.id) ?? 0) > 0 &&
          (!exclusive ||
            (entry.activeExecutions === 0 &&
              slots.get(entry.id) === entry.concurrency)),
      );
      if (!worker) {
        if (exclusive) missingExclusive++;
        else missingShared++;
        continue;
      }
      slots.set(worker.id, exclusive ? 0 : slots.get(worker.id)! - 1);
      owners.set(worker.id, [
        ...(owners.get(worker.id) ?? []),
        recovery.task.id,
      ]);
    }
    return { workers, slots, owners, missingShared, missingExclusive };
  }
  private admissionWorker(
    exclusive: boolean,
    owner?: string,
  ): PjsWorker | undefined {
    if (owner && this.drain?.owner === owner) {
      const worker = this.drain.worker;
      if (
        worker.canExecute(true) &&
        this.rawSlots(worker) === worker.concurrency
      )
        return worker;
      return undefined;
    }
    const { workers, slots } = this.layout();
    return workers.find(
      (worker) =>
        (slots.get(worker.id) ?? 0) > 0 &&
        (!exclusive ||
          (worker.activeExecutions === 0 &&
            slots.get(worker.id) === worker.concurrency)),
    );
  }
  prepareAdmission(
    deferred: boolean,
    child: boolean,
    dispatchAllowed: boolean,
    exclusive = false,
  ): TaskAdmission | undefined {
    if (deferred) return { kind: 'deferred' };
    if (this.scheduler.selecting) this.invalidate();
    const worker =
      dispatchAllowed && !this.scheduler.selecting && this.scheduler.size === 0
        ? this.admissionWorker(exclusive)
        : undefined;
    if (
      (!worker &&
        this.scheduler.size + this.admissionReservations >=
          this.scheduler.capacity) ||
      (!child &&
        this.admissionReservations > 0 &&
        this.availableAdmission(dispatchAllowed) <= 0)
    )
      return undefined;
    return worker ? { kind: 'direct', worker } : { kind: 'queued' };
  }
  admit(
    admission: TaskAdmission,
    task: PendingTask,
    deferred?: PendingTask[],
  ): void {
    if (admission.kind === 'deferred') deferred!.push(task);
    else if (admission.kind === 'direct') this.dispatch(admission.worker, task);
    else {
      this.stamp(task);
      this.scheduler.enqueue(task);
    }
  }
  remove(taskId: string): PendingTask | undefined {
    this.cancelProduction(taskId);
    const recovery = this.recoveries.get(taskId);
    if (recovery) {
      this.recoveries.delete(taskId);
      if (recovery.kind === 'queue') this.admissionReservations--;
      this.invalidate();
    }
    return this.scheduler.remove(taskId);
  }
  closeProgress(correlationId: string): void {
    const progress = this.postings.get(correlationId)?.progress;
    if (progress) {
      progress.closed = true;
      if (progress.flag) Atomics.store(progress.flag, 0, -1);
    }
    this.pool.closeProgress(correlationId);
  }
  cooperateExecution(correlationId: string): void {
    const posting = this.postings.get(correlationId);
    if (posting?.cancellation) Atomics.store(posting.cancellation, 0, 1);
    else this.pool.cooperateExecution(correlationId);
  }
  private async postingQuiescent(worker: PjsWorker): Promise<void> {
    if (this.host.kind !== 'browser')
      throw new Error('Node cannot revoke endpoints');
    await Promise.all(
      [...this.postings.values()]
        .filter((p) => p.worker === worker)
        .map((p) => p.done),
    );
    if ([...this.postings.values()].some((p) => p.worker === worker))
      throw new Error('Endpoint still owns a posting transaction');
  }
  terminateExecution(correlationId: string): void {
    const posting = this.postings.get(correlationId);
    if (posting) posting.terminate = true;
    else this.pool.terminateExecution(correlationId);
  }
  retainRecovery(task: PendingTask): void {
    if (this.recoveries.has(task.id))
      throw new Error('Duplicate recovery claim');
    this.recoveries.set(task.id, { task, kind: 'slot', ready: false });
    this.invalidate();
    this.moveRecoveriesToQueue();
  }
  readyRecovery(taskId: string): void {
    const recovery = this.recoveries.get(taskId);
    if (!recovery) return;
    recovery.ready = true;
    this.stamp(recovery.task);
    this.invalidate();
    if (recovery.kind === 'queue') this.enqueueRecovery(recovery);
  }
  private enqueueRecovery(recovery: {
    task: PendingTask;
    kind: 'slot' | 'queue';
    ready: boolean;
  }): void {
    this.recoveries.delete(recovery.task.id);
    this.admissionReservations--;
    this.scheduler.enqueue(recovery.task);
  }
  private moveRecoveriesToQueue(preferred: readonly string[] = []): void {
    const entries = [...this.recoveries.values()];
    entries.sort(
      (a, b) =>
        Number(preferred.includes(b.task.id)) -
        Number(preferred.includes(a.task.id)),
    );
    for (const recovery of entries) {
      if (
        this.scheduler.size + this.admissionReservations >=
        this.scheduler.capacity
      )
        break;
      if (recovery.kind !== 'slot') continue;
      recovery.kind = 'queue';
      this.admissionReservations++;
      this.invalidate();
      if (recovery.ready) this.enqueueRecovery(recovery);
    }
  }
  availableAdmission(dispatchAllowed: boolean): number {
    const available = dispatchAllowed
      ? [...this.layout().slots.values()].reduce((sum, slots) => sum + slots, 0)
      : 0;
    return (
      this.scheduler.capacity -
      this.scheduler.size -
      this.admissionReservations +
      available
    );
  }
  claimProduction(
    maximum: number,
    exclusive = false,
    owner?: string,
  ): ProductionClaim | undefined {
    if (maximum < 1 || this.stopped) return undefined;
    const pinned = owner !== undefined && this.drain?.owner === owner;
    const worker =
      this.scheduler.size === 0 || pinned
        ? this.admissionWorker(exclusive, owner)
        : undefined;
    const queueCapacity =
      this.scheduler.capacity -
      this.scheduler.size -
      this.admissionReservations;
    if (!worker && queueCapacity <= 0) {
      if (exclusive && owner) this.pin(owner, true);
      this.updateDemand(exclusive ? 'exclusive' : 'shared');
      return undefined;
    }
    if (pinned && !worker) this.clearDrain();
    const capacity = worker ? maximum : Math.min(maximum, queueCapacity);
    if (capacity < 1) return undefined;
    if (worker && pinned) this.clearDrain();
    const release = worker ? this.reserve(worker, exclusive) : () => {};
    if (!worker) this.admissionReservations += capacity;
    return new ProductionClaim(capacity, worker, exclusive, release);
  }
  finishProductionClaim(claim: ProductionClaim, staged: PendingTask[]): void {
    try {
      if (staged.length === 0 || this.stopped) return;
      const leader = staged[0]!;
      leader.batch = staged;
      Object.assign(leader, { admissionWeight: staged.length });
      for (const task of staged) task.batchLeaderId = leader.id;
      if (claim.worker)
        this.dispatch(claim.worker, leader, claim.releaseWorker);
      else {
        this.admissionReservations -= claim.capacity;
        claim.released = true;
        this.stamp(leader);
        this.scheduler.enqueue(leader);
      }
    } finally {
      this.releaseProductionClaim(claim);
    }
  }
  releaseProductionClaim(claim: ProductionClaim): void {
    if (claim.released) return;
    claim.released = true;
    if (claim.worker) claim.releaseWorker();
    else if (!this.stopped) this.admissionReservations -= claim.capacity;
  }
  cancelProduction(owner: string): void {
    if (this.drain?.owner === owner) this.clearDrain();
    this.invalidate();
  }
  private clearDrain(): void {
    this.drain = undefined;
    this.invalidate();
  }
  private cancelDrainForWorker(worker: PjsWorker): void {
    if (this.drain?.worker === worker) this.clearDrain();
  }
  private drainCandidate(task?: PendingTask): PjsWorker | undefined {
    if (this.drain || this.stopped) return undefined;
    const layout = this.layout();
    const credit =
      task && this.scheduler.values().includes(task)
        ? (task.admissionWeight ?? 1) +
          this.scheduler.capacity -
          this.scheduler.size -
          this.admissionReservations
        : 0;
    return layout.workers
      .filter(
        (worker) =>
          !worker.exclusive &&
          ![...this.claims].some((claim) => claim.worker === worker) &&
          (layout.owners.get(worker.id)?.length ?? 0) <= credit,
      )
      .sort(
        (a, b) => a.activeExecutions - b.activeExecutions || a.id - b.id,
      )[0];
  }
  private pin(owner: string, production: boolean, task?: PendingTask): void {
    const worker = this.drainCandidate(task);
    if (worker) {
      this.drain = {
        worker,
        owner,
        production,
        borrowed: this.layout().owners.get(worker.id) ?? [],
      };
      this.invalidate();
    }
  }
  private placement(task: PendingTask, queued: boolean): PjsWorker | undefined {
    const exclusive = this.exclusive(task);
    const ownPin = this.drain?.owner === task.id ? this.drain : undefined;
    if (ownPin)
      return ownPin.worker.canExecute(true) &&
        this.rawSlots(ownPin.worker) === ownPin.worker.concurrency
        ? ownPin.worker
        : undefined;
    const layout = this.layout();
    const credit = queued
      ? (task.admissionWeight ?? 1) +
        this.scheduler.capacity -
        this.scheduler.size -
        this.admissionReservations
      : 0;
    return layout.workers.find((worker) => {
      if (this.drain?.worker === worker || this.rawSlots(worker) < 1)
        return false;
      if (!exclusive)
        return (
          queued ||
          this.recoveries.get(task.id)?.kind === 'slot' ||
          (layout.slots.get(worker.id) ?? 0) > 0
        );
      if (
        worker.activeExecutions ||
        this.rawSlots(worker) !== worker.concurrency
      )
        return false;
      const owners = layout.owners.get(worker.id) ?? [];
      return owners.filter((id) => id !== task.id).length <= credit;
    });
  }
  dispatchQueued(dispatchAllowed: () => boolean): void {
    if (this.scheduler.selecting || this.stopped) return;
    this.moveRecoveriesToQueue();
    this.updateDemand();
    while (dispatchAllowed() && !this.stopped) {
      const queued = this.scheduler.values();
      const ready = [...this.recoveries.values()]
        .filter((entry) => entry.kind === 'slot' && entry.ready)
        .map((entry) => entry.task);
      let pinned: PendingTask | undefined;
      if (this.drain && !this.drain.production)
        pinned = [...queued, ...ready].find(
          (task) => task.id === this.drain!.owner,
        );
      if (this.drain && !this.drain.production && !pinned) this.clearDrain();
      if (this.drain) {
        // Another hosted invocation may fail while a worker drains. Revalidate
        // the queue credits needed to exchange *all* newly retained slots.
        const owners = (
          this.layout(true).owners.get(this.drain.worker.id) ?? []
        ).filter((id) => id !== pinned?.id);
        const credit =
          pinned && queued.includes(pinned)
            ? (pinned.admissionWeight ?? 1) +
              this.scheduler.capacity -
              this.scheduler.size -
              this.admissionReservations
            : 0;
        if (owners.length > credit) {
          this.clearDrain();
          pinned = undefined;
        } else this.drain.borrowed = owners;
      }
      const candidates = [...queued, ...ready].filter(
        (task) =>
          this.placement(task, queued.includes(task)) ||
          (this.exclusive(task) && this.drainCandidate(task)),
      );
      const errors = this.scheduler.policyErrors;
      const task =
        pinned && this.placement(pinned, queued.includes(pinned))
          ? pinned
          : this.scheduler.select(candidates, dispatchAllowed);
      if (!task) {
        if (this.scheduler.policyErrors !== errors) continue;
        break;
      }
      let worker = this.placement(task, queued.includes(task));
      if (!worker) {
        this.pin(task.id, false, task);
        worker = this.placement(task, queued.includes(task));
        if (!worker) {
          // The pinned job is now ineligible; other workers may keep dispatching.
          if (this.drain) continue;
          break;
        }
      }
      const borrowed =
        this.drain?.owner === task.id
          ? this.drain.borrowed
          : (this.layout().owners.get(worker.id) ?? []);
      if (this.drain?.owner === task.id) this.clearDrain();
      if (queued.includes(task)) {
        if (!this.scheduler.remove(task.id)) continue;
        this.moveRecoveriesToQueue(borrowed);
      } else {
        this.recoveries.delete(task.id);
        this.invalidate();
      }
      this.dispatch(worker, task);
    }
    this.updateDemand();
  }
  private updateDemand(productionDemand?: 'shared' | 'exclusive'): void {
    const layout = this.layout();
    const protectedWorkers = new Set<number>(
      [...this.claims].map((claim) => claim.worker.id),
    );
    for (const id of layout.owners.keys()) protectedWorkers.add(id);
    if (this.drain) protectedWorkers.add(this.drain.worker.id);
    const snapshots = this.pool.snapshots();
    const base = snapshots.filter(
      (worker) =>
        (worker.currentTaskIds?.length ?? 0) > 0 ||
        protectedWorkers.has(worker.id),
    );
    const spare = base.reduce(
      (sum, worker) => sum + (layout.slots.get(worker.id) ?? 0),
      0,
    );
    const queued = this.scheduler
      .values()
      .filter((task) => task.id !== this.drain?.owner);
    const exclusive =
      queued.filter((task) => this.exclusive(task)).length +
      layout.missingExclusive +
      (productionDemand === 'exclusive' && !this.drain ? 1 : 0);
    const shared =
      queued.length -
      queued.filter((task) => this.exclusive(task)).length +
      layout.missingShared +
      (productionDemand === 'shared' ? 1 : 0);
    const concurrency = snapshots[0]?.concurrency ?? 1;
    this.pool.setDemand(
      base.length +
        exclusive +
        Math.ceil(Math.max(0, shared - spare) / concurrency),
      protectedWorkers,
    );
  }
  snapshot() {
    return {
      ...this.metrics,
      averageLogicalTasksPerExecute: this.metrics.executeMessages
        ? this.metrics.logicalTasks / this.metrics.executeMessages
        : 0,
    };
  }
  private dispatch(
    worker: PjsWorker,
    task: PendingTask,
    releaseClaim?: () => void,
  ): void {
    const release = releaseClaim ?? this.reserve(worker, this.exclusive(task));
    try {
      if (this.callbacks.prepareDispatch?.(task) === false || this.stopped)
        return;
      this.post(worker, task, release);
    } finally {
      release();
    }
  }

  private post(
    worker: PjsWorker,
    task: PendingTask,
    releaseClaim: () => void,
  ): void {
    const items = task.batch;
    const executionId = task.batchLeaderId ?? task.executionId ?? task.id;
    const taskIds = items ? items.map((item) => item.id) : [task.id];
    const scheduledAt = Date.now();
    const monotonicNow = performance.now();
    if (items) {
      for (const item of items)
        this.callbacks.scheduled(
          worker,
          item,
          scheduledAt,
          monotonicNow - (item.attemptQueuedAt ?? item.admittedAt),
        );
    } else
      this.callbacks.scheduled(
        worker,
        task,
        scheduledAt,
        monotonicNow - (task.attemptQueuedAt ?? task.admittedAt),
      );
    const mode = task.child?.operation.cancellation ?? task.cancellation;
    const cancellation =
      mode === 'cooperative'
        ? new Int32Array(new SharedArrayBuffer(4))
        : undefined;
    const progress: ProgressControl | undefined = task.progress
      ? {
          ...(this.host.sharedMemory
            ? { flag: new Int32Array(new SharedArrayBuffer(8)) }
            : {}),
          closed: !task.progress.active,
        }
      : undefined;
    if (progress?.flag)
      Atomics.store(progress.flag, 0, progress.closed ? -1 : 1);
    let finish: (() => void) | undefined;
    const done =
      this.host.kind === 'browser'
        ? new Promise<void>((resolve) => {
            finish = resolve;
          })
        : undefined;
    const posting = {
      terminate: false,
      worker,
      ...(done ? { done } : {}),
      ...(finish ? { finish } : {}),
      ...(progress ? { progress } : {}),
      ...(cancellation ? { cancellation } : {}),
    };
    this.postings.set(executionId, posting);
    try {
      this.resultCredits.beginAttempt(taskIds);
      this.resultCredits.markDispatching(executionId, taskIds);
      // Worker.begin installs physical occupancy synchronously, before cloning can reenter.
      releaseClaim();
      if (items && items.length > 1)
        worker.executeBatch(
          executionId,
          task.snapshot.taskName,
          items.map((item) => ({
            taskId: item.executionId ?? item.id,
            input: item.input,
            ...(item.expectedResultBytes === undefined
              ? {}
              : { expectedResultBytes: item.expectedResultBytes }),
            ...(item.resultByteContract === undefined
              ? {}
              : { resultByteContract: item.resultByteContract }),
          })),
          task.child?.operation.resultMode === 'discard',
          cancellation,
          this.exclusive(task),
          progress,
        );
      else
        worker.execute(
          executionId,
          task.snapshot.implementation ?? task.snapshot.taskName,
          task.input,
          task.transferList,
          Boolean(
            this.host.kind === 'node' &&
            task.child &&
            internalProfilingEnabled(),
          ),
          task.child?.operation.resultMode === 'discard',
          task.expectedResultBytes,
          task.resultByteContract,
          cancellation,
          this.exclusive(task),
          progress,
        );
      this.resultCredits.markDispatched(executionId, taskIds);
      if (task.executionLease !== undefined)
        worker.armExecutionLease(executionId, task.executionLease);
      if (posting.terminate) this.pool.terminateExecution(executionId);
      else if (cancellation && Atomics.load(cancellation, 0) !== 0)
        this.pool.cooperateExecution(executionId);
      this.metrics.executeMessages++;
      this.metrics.logicalTasks += items?.length ?? 1;
      this.metrics.logicalPartitions += items
        ? items.reduce((count, item) => count + (item.child ? 1 : 0), 0)
        : task.child
          ? 1
          : 0;
      if (items && items.length > 1) this.metrics.batchedExecuteMessages++;
    } catch (error) {
      this.resultCredits.rollbackDispatch(executionId);
      this.callbacks.dispatchFailed(task, error as Error);
    } finally {
      if (this.host.kind === 'browser') {
        try {
          this.callbacks.dispatched(task);
        } finally {
          this.postings.delete(executionId);
          finish?.();
        }
      } else {
        this.postings.delete(executionId);
        this.callbacks.dispatched(task);
      }
    }
  }
}
