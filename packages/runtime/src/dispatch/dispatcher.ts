import type { PjsWorkerError } from '../errors/index.js';
import { PjsPool } from '../pool/pool.js';
import { PjsScheduler } from '../scheduler/fifo.js';
import type { PendingTask } from '../tasks/task.js';
import { internalProfilingEnabled } from '../telemetry/profile.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import type {
  RestartPolicy,
  WorkerResourceLimits,
  WorkerState,
} from '../types/index.js';
import type { ExecutionResultMessage } from '../workers/protocol.js';
import type { PjsWorker, WorkerFailureReason } from '../workers/worker.js';
import type { ResultCreditManager } from '../results/credit.js';

export interface ExecutionDispatcherOptions {
  workers: number;
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
  failed(error: PjsWorkerError, reason: WorkerFailureReason): void;
  exited(correlationId?: string): void;
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
  ) {}
}

/** Owns bounded admission mechanics and logical-task to physical-message dispatch. */
export class ExecutionDispatcher {
  private readonly scheduler: PjsScheduler<PendingTask>;
  private readonly pool: PjsPool;
  private readonly reservedWorkers = new Set<number>();
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
  private readonly postings = new Map<string, { terminate: boolean }>();
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
  ) {
    this.scheduler = new PjsScheduler(options.maxQueue);
    this.pool = new PjsPool(
      {
        workers: options.workers,
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
        result: (worker, message) => {
          this.metrics.resultMessages++;
          this.resultCredits.markExecutionEnded(
            message.type === 'batchResult' ? message.batchId : message.taskId,
          );
          this.callbacks.result(worker, message);
        },
        failed: (_worker, error, _wasStarting, reason) =>
          this.callbacks.failed(error, reason),
        exited: (_worker, correlationId) => {
          if (correlationId)
            this.resultCredits.markExecutionEnded(correlationId);
          this.callbacks.exited(correlationId);
        },
        fatal: (error) => this.callbacks.fatal(error),
      },
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
    return this.pool.stop();
  }

  recoverySnapshot() {
    return this.pool.recoverySnapshot();
  }

  workerSnapshots(): WorkerState[] {
    return this.pool.snapshots();
  }

  prepareAdmission(
    deferred: boolean,
    child: boolean,
    dispatchAllowed: boolean,
  ): TaskAdmission | undefined {
    if (deferred) return { kind: 'deferred' };
    const worker =
      dispatchAllowed && this.scheduler.size === 0
        ? this.idleWorkers()[0]
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
    else this.scheduler.enqueue(task);
  }

  remove(taskId: string): PendingTask | undefined {
    const recovery = this.recoveries.get(taskId);
    if (recovery) {
      this.recoveries.delete(taskId);
      if (recovery.kind === 'queue') this.admissionReservations--;
    }
    return this.scheduler.remove(taskId);
  }

  terminateExecution(correlationId: string): void {
    const posting = this.postings.get(correlationId);
    if (posting) posting.terminate = true;
    else this.pool.terminateExecution(correlationId);
  }

  /** Called synchronously at physical completion, before capacity is pumped. */
  retainRecovery(task: PendingTask): void {
    if (this.recoveries.has(task.id))
      throw new Error('Duplicate recovery claim');
    this.recoveries.set(task.id, { task, kind: 'slot', ready: false });
    this.moveRecoveriesToQueue();
  }

  readyRecovery(taskId: string): void {
    const recovery = this.recoveries.get(taskId);
    if (!recovery) return;
    recovery.ready = true;
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

  private moveRecoveriesToQueue(): void {
    for (const recovery of this.recoveries.values()) {
      if (
        this.scheduler.size + this.admissionReservations >=
        this.scheduler.capacity
      )
        break;
      if (recovery.kind !== 'slot') continue;
      recovery.kind = 'queue';
      this.admissionReservations++;
      if (recovery.ready) this.enqueueRecovery(recovery);
    }
  }

  availableAdmission(dispatchAllowed: boolean): number {
    return (
      this.scheduler.capacity -
      this.scheduler.size +
      (dispatchAllowed ? this.idleWorkers().length : 0) -
      this.admissionReservations
    );
  }

  claimProduction(maximum: number): ProductionClaim | undefined {
    const worker =
      this.scheduler.size === 0 ? this.idleWorkers()[0] : undefined;
    const queueCapacity =
      this.scheduler.capacity -
      this.scheduler.size -
      this.admissionReservations;
    if (!worker && queueCapacity <= 0) {
      // A lazy accepted range is outstanding demand even with no queue slots.
      if (maximum > 0) this.updateDemand(1);
      return undefined;
    }
    const capacity = worker ? maximum : Math.min(maximum, queueCapacity);
    if (capacity < 1) return undefined;
    if (worker) this.reservedWorkers.add(worker.id);
    else this.admissionReservations += capacity;
    return new ProductionClaim(capacity, worker);
  }

  finishProductionClaim(claim: ProductionClaim, staged: PendingTask[]): void {
    try {
      if (staged.length === 0) return;
      const leader = staged[0]!;
      leader.batch = staged;
      Object.assign(leader, { admissionWeight: staged.length });
      for (const task of staged) task.batchLeaderId = leader.id;
      if (claim.worker) this.dispatch(claim.worker, leader);
      else {
        this.admissionReservations -= claim.capacity;
        claim.released = true;
        this.scheduler.enqueue(leader);
      }
    } finally {
      this.releaseProductionClaim(claim);
    }
  }

  releaseProductionClaim(claim: ProductionClaim): void {
    if (claim.released) return;
    claim.released = true;
    if (claim.worker) this.reservedWorkers.delete(claim.worker.id);
    else this.admissionReservations -= claim.capacity;
  }

  dispatchQueued(dispatchAllowed: () => boolean): void {
    this.moveRecoveriesToQueue();
    this.updateDemand();
    for (const worker of this.unreservedIdleWorkers()) {
      while (dispatchAllowed() && worker.status === 'idle') {
        const task = this.scheduler.next(worker.snapshot());
        if (task) {
          // Give FIFO work the slot, and recovery the credit freed by dequeue.
          this.moveRecoveriesToQueue();
          this.dispatch(worker, task);
        } else {
          const recovery = [...this.recoveries.values()].find(
            (entry) => entry.kind === 'slot' && entry.ready,
          );
          if (!recovery) break;
          this.recoveries.delete(recovery.task.id);
          this.dispatch(worker, recovery.task);
        }
      }
    }
    this.updateDemand();
  }

  private updateDemand(productionDemand = 0): void {
    const slots = [...this.recoveries.values()].filter(
      (entry) => entry.kind === 'slot',
    ).length;
    const protectedWorkers = new Set(this.reservedWorkers);
    for (const worker of this.unreservedIdleWorkers().slice(0, slots))
      protectedWorkers.add(worker.id);
    this.pool.setDemand(
      this.pool.busy +
        this.reservedWorkers.size +
        slots +
        Math.max(this.scheduler.dispatchCount, productionDemand),
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

  private idleWorkers(): PjsWorker[] {
    const slots = [...this.recoveries.values()].filter(
      (entry) => entry.kind === 'slot',
    ).length;
    return this.unreservedIdleWorkers().slice(slots);
  }

  private unreservedIdleWorkers(): PjsWorker[] {
    const idle = this.pool.idle();
    return this.reservedWorkers.size === 0
      ? idle
      : idle.filter((worker) => !this.reservedWorkers.has(worker.id));
  }

  private dispatch(worker: PjsWorker, task: PendingTask): void {
    if (this.callbacks.prepareDispatch?.(task) === false) return;
    const items = task.batch;
    const executionId = task.executionId ?? task.id;
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
    const posting = { terminate: false };
    this.postings.set(executionId, posting);
    try {
      this.resultCredits.markDispatching(executionId, taskIds);
      if (items && items.length > 1)
        worker.executeBatch(
          executionId,
          task.snapshot.taskName,
          items.map((item) => ({
            taskId: item.id,
            input: item.input,
            ...(item.expectedResultBytes === undefined
              ? {}
              : { expectedResultBytes: item.expectedResultBytes }),
            ...(item.resultByteContract === undefined
              ? {}
              : { resultByteContract: item.resultByteContract }),
          })),
          task.child?.operation.resultMode === 'discard',
        );
      else
        worker.execute(
          executionId,
          task.snapshot.implementation ?? task.snapshot.taskName,
          task.input,
          task.transferList,
          Boolean(task.child && internalProfilingEnabled()),
          task.child?.operation.resultMode === 'discard',
          task.expectedResultBytes,
          task.resultByteContract,
        );
      this.resultCredits.markDispatched(executionId, taskIds);
      if (task.executionLease !== undefined)
        worker.armExecutionLease(executionId, task.executionLease);
      if (posting.terminate) this.pool.terminateExecution(executionId);
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
      this.postings.delete(executionId);
      this.callbacks.dispatched(task);
    }
  }
}
