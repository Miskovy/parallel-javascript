import type { PjsWorkerError } from '../errors/index.js';
import { PjsPool } from '../pool/pool.js';
import { PjsScheduler } from '../scheduler/fifo.js';
import type { PendingTask } from '../tasks/task.js';
import { internalProfilingEnabled } from '../telemetry/profile.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import type { WorkerState } from '../types/index.js';
import type { ExecutionResultMessage } from '../workers/protocol.js';
import type { PjsWorker } from '../workers/worker.js';
import type { ResultCreditManager } from '../results/credit.js';

export interface ExecutionDispatcherOptions {
  workers: number;
  maxQueue: number;
  startupTimeout: number;
  maxRestarts: number;
}

export interface ExecutionDispatcherCallbacks {
  ready(): void;
  scheduled(
    worker: PjsWorker,
    task: PendingTask,
    scheduledAt: number,
    queueMs: number,
  ): void;
  dispatched(task: PendingTask): void;
  started(worker: PjsWorker, taskId: string): void;
  result(worker: PjsWorker, message: ExecutionResultMessage): void;
  failed(error: PjsWorkerError): void;
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
        failed: (_worker, error) => {
          if (error.taskId) this.resultCredits.markExecutionEnded(error.taskId);
          this.callbacks.failed(error);
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
    return this.scheduler.remove(taskId);
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
    if (!worker && queueCapacity <= 0) return undefined;
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
    else if (this.admissionReservations >= claim.capacity)
      this.admissionReservations -= claim.capacity;
  }

  dispatchQueued(dispatchAllowed: () => boolean): void {
    for (const worker of this.idleWorkers()) {
      while (dispatchAllowed() && worker.status === 'idle') {
        const task = this.scheduler.next(worker.snapshot());
        if (!task) break;
        this.dispatch(worker, task);
      }
    }
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
    const idle = this.pool.idle();
    return this.reservedWorkers.size === 0
      ? idle
      : idle.filter((worker) => !this.reservedWorkers.has(worker.id));
  }

  private dispatch(worker: PjsWorker, task: PendingTask): void {
    const items = task.batch;
    const scheduledAt = Date.now();
    const monotonicNow = performance.now();
    if (items) {
      for (const item of items)
        this.callbacks.scheduled(
          worker,
          item,
          scheduledAt,
          monotonicNow - item.admittedAt,
        );
    } else
      this.callbacks.scheduled(
        worker,
        task,
        scheduledAt,
        monotonicNow - task.admittedAt,
      );
    try {
      if (items && items.length > 1)
        worker.executeBatch(
          task.id,
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
          task.id,
          task.snapshot.taskName,
          task.input,
          task.transferList,
          Boolean(task.child && internalProfilingEnabled()),
          task.child?.operation.resultMode === 'discard',
          task.expectedResultBytes,
          task.resultByteContract,
        );
      this.resultCredits.markDispatched(
        task.id,
        (items ?? [task]).map((item) => item.id),
      );
      this.metrics.executeMessages++;
      this.metrics.logicalTasks += items?.length ?? 1;
      this.metrics.logicalPartitions += items
        ? items.reduce((count, item) => count + (item.child ? 1 : 0), 0)
        : task.child
          ? 1
          : 0;
      if (items && items.length > 1) this.metrics.batchedExecuteMessages++;
    } catch (error) {
      this.callbacks.dispatchFailed(task, error as Error);
    } finally {
      this.callbacks.dispatched(task);
    }
  }
}
