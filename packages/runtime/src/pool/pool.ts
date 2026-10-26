import { PjsExecutionLeaseError, PjsWorkerError } from '../errors/index.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import { PjsWorker } from '../workers/worker.js';
import type {
  WorkerCallbacks,
  WorkerFailureReason,
} from '../workers/worker.js';
import type {
  RestartPolicy,
  WorkerResourceLimits,
  WorkerState,
} from '../types/index.js';

export interface PoolOptions {
  workers: number;
  concurrency?: number;
  startupTimeout: number;
  maxRestarts: number;
  restartPolicy?: RestartPolicy;
  minWorkers?: number;
  maxWorkers?: number;
  idleTimeout?: number;
  resourceLimits?: WorkerResourceLimits;
}
interface PoolCallbacks extends Omit<WorkerCallbacks, 'failed'> {
  failed(
    worker: PjsWorker,
    error: PjsWorkerError,
    wasStarting: boolean,
    reason: WorkerFailureReason,
  ): void;
  fatal(error: PjsWorkerError): void;
}

/** Owns workers, never task queues or scheduling policy. */
export class PjsPool {
  private readonly workers = new Map<number, PjsWorker>();
  private readonly repairs = new Set<Promise<void>>();
  private state: 'created' | 'active' | 'stopping' | 'stopped' = 'created';
  private readonly handledFailures = new WeakSet<PjsWorker>();
  private readonly restartHistory: number[] = [];
  private desired: number;
  private initializing = true;
  private protectedWorkers: ReadonlySet<number> = new Set();
  private readonly retiring = new Set<PjsWorker>();
  private readonly idleTimers = new Map<
    PjsWorker,
    {
      deadline: number;
      timer: ReturnType<typeof setTimeout> | undefined;
    }
  >();
  private nextId = 1;
  replacements = 0;
  budgetExhaustions = 0;
  leaseExpirations = 0;
  leaseTerminationRequests = 0;
  confirmedLeaseExits = 0;
  private stopPromise: Promise<void> | undefined;
  failures = 0;
  restarts = 0;

  constructor(
    private readonly options: PoolOptions,
    private readonly tasks: TaskDescriptor[],
    private readonly callbacks: PoolCallbacks,
  ) {
    this.desired = options.workers;
  }

  async start(): Promise<void> {
    if (this.state !== 'created')
      throw new PjsWorkerError('Pool already started or stopped');
    this.state = 'active';
    for (let i = 0; i < this.options.workers; i++) this.spawn();
    await Promise.all([...this.workers.values()].map((worker) => worker.ready));
    this.initializing = false;
    this.reconcile();
  }

  /** Dispatcher supplies demand and admission claims; the pool alone owns population. */
  setDemand(required: number, protectedWorkers: ReadonlySet<number>): void {
    if (this.options.idleTimeout === undefined || this.state !== 'active')
      return;
    this.desired = Math.max(
      this.options.minWorkers ?? this.options.workers,
      Math.min(this.options.maxWorkers ?? this.options.workers, required),
    );
    this.protectedWorkers = new Set(protectedWorkers);
    this.reconcile();
  }

  private reconcile(): void {
    if (
      this.options.idleTimeout === undefined ||
      this.state !== 'active' ||
      this.initializing
    )
      return;
    try {
      // Retiring/failed threads retain their population slot until confirmed exit.
      while (this.workers.size < this.desired) this.spawn();
    } catch (cause) {
      this.callbacks.fatal(
        new PjsWorkerError('Could not grow worker pool', { cause }),
      );
      return;
    }
    for (const worker of this.workers.values()) {
      if (!this.canRetire(worker)) {
        this.clearIdleTimer(worker);
        continue;
      }
      if (this.idleTimers.has(worker)) continue;
      const token: {
        deadline: number;
        timer: ReturnType<typeof setTimeout> | undefined;
      } = {
        deadline: this.monotonicNow() + this.options.idleTimeout,
        timer: undefined,
      };
      const expire = () => {
        if (this.idleTimers.get(worker) !== token) return;
        if (!this.canRetire(worker)) {
          this.clearIdleTimer(worker);
          return;
        }
        const remaining = token.deadline - this.monotonicNow();
        if (remaining > 0) {
          token.timer = this.scheduleIdleTimer(expire, remaining);
          return;
        }
        this.idleTimers.delete(worker);
        this.retiring.add(worker);
        this.handledFailures.add(worker);
        this.trackRepair(this.retireIdle(worker));
      };
      token.timer = this.scheduleIdleTimer(expire, this.options.idleTimeout);
      this.idleTimers.set(worker, token);
    }
  }

  private canRetire(worker: PjsWorker): boolean {
    return (
      this.state === 'active' &&
      worker.status === 'idle' &&
      !worker.hasPhysicalExecution &&
      !this.protectedWorkers.has(worker.id) &&
      [...this.workers.values()].filter(
        (entry) => !this.handledFailures.has(entry),
      ).length > this.desired
    );
  }

  private scheduleIdleTimer(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, delay);
    timer.unref();
    return timer;
  }

  private clearIdleTimer(worker: PjsWorker): void {
    const token = this.idleTimers.get(worker);
    if (token?.timer !== undefined) this.cancelIdleTimer(token.timer);
    this.idleTimers.delete(worker);
  }

  private cancelIdleTimer(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer);
  }

  private async retireIdle(worker: PjsWorker): Promise<void> {
    try {
      await worker.stop();
      this.workers.delete(worker.id);
      this.retiring.delete(worker);
      this.reconcile();
    } catch (cause) {
      this.callbacks.fatal(
        new PjsWorkerError('Could not retire idle worker', {
          workerId: worker.id,
          cause,
        }),
      );
    }
  }
  idle(): PjsWorker[] {
    return [...this.workers.values()].filter(
      (worker) => worker.status === 'idle',
    );
  }
  worker(id: number): PjsWorker | undefined {
    return this.workers.get(id);
  }
  dispatchable(): PjsWorker[] {
    return [...this.workers.values()].filter(
      (worker) =>
        !this.handledFailures.has(worker) &&
        (worker.status === 'idle' || worker.status === 'busy'),
    );
  }
  get activeExecutions(): number {
    return [...this.workers.values()].reduce(
      (sum, worker) => sum + worker.activeExecutions,
      0,
    );
  }
  snapshots(): WorkerState[] {
    return [...this.workers.values()].map((worker) => worker.snapshot());
  }
  get busy(): number {
    return [...this.workers.values()].filter(
      (worker) => worker.hasPhysicalExecution,
    ).length;
  }

  closeProgress(correlationId: string): void {
    for (const worker of this.workers.values())
      worker.closeProgress(correlationId);
  }

  cooperateExecution(correlationId: string): void {
    for (const worker of this.workers.values())
      if (worker.status === 'busy' && worker.owns(correlationId))
        worker.requestCancellation(correlationId);
  }

  /** Intentional containment restores capacity without charging a failure budget. */
  terminateExecution(correlationId: string): void {
    if (this.state !== 'active') return;
    for (const worker of this.workers.values()) {
      if (
        worker.status !== 'busy' ||
        !worker.owns(correlationId) ||
        this.handledFailures.has(worker)
      )
        continue;
      if (!worker.exclusive || worker.activeExecutions !== 1) return;
      this.handledFailures.add(worker);
      this.repair(worker);
      return;
    }
  }

  private monotonicNow(): number {
    return performance.now();
  }

  get restartWindowUtilization(): number | undefined {
    const policy = this.options.restartPolicy;
    if (!policy) return undefined;
    const cutoff = this.monotonicNow() - policy.windowMs;
    while (this.restartHistory.length > 0 && this.restartHistory[0]! <= cutoff)
      this.restartHistory.shift();
    return this.restartHistory.length;
  }

  recoverySnapshot() {
    return {
      leaseExpirations: this.leaseExpirations,
      leaseTerminationRequests: this.leaseTerminationRequests,
      confirmedLeaseExits: this.confirmedLeaseExits,
      workerReplacements: this.replacements,
      restartWindowUtilization: this.restartWindowUtilization,
      restartBudgetExhaustions: this.budgetExhaustions,
    };
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.state = 'stopping';
    for (const worker of this.idleTimers.keys()) this.clearIdleTimer(worker);
    this.protectedWorkers = new Set();
    this.stopPromise = (async () => {
      await Promise.all(
        [...this.workers.values()].map((worker) => worker.stop()),
      );
      await Promise.all(this.repairs);
      this.state = 'stopped';
    })();
    return this.stopPromise;
  }

  private spawn(): void {
    const worker = new PjsWorker(
      this.nextId++,
      this.tasks,
      this.options.startupTimeout,
      {
        ready: (worker) => {
          this.callbacks.ready(worker);
          this.reconcile();
        },
        progress: (worker, message, value, acknowledge) => {
          if (this.callbacks.progress)
            this.callbacks.progress(worker, message, value, acknowledge);
          else acknowledge();
        },
        started: (worker, taskId) => this.callbacks.started(worker, taskId),
        result: (worker, message) => {
          this.callbacks.result(worker, message);
          this.reconcile();
        },
        failed: (worker, error, wasStarting, reason) =>
          this.failed(worker, error, wasStarting, reason),
        leaseTerminationRequested: () => this.leaseTerminationRequests++,
        exited: (worker, correlationId) => {
          if (worker.leaseExpired) this.confirmedLeaseExits++;
          this.callbacks.exited(worker, correlationId);
        },
      },
      this.options.resourceLimits,
      this.options.concurrency ?? 1,
    );
    this.workers.set(worker.id, worker);
  }

  private failed(
    worker: PjsWorker,
    error: PjsWorkerError,
    wasStarting: boolean,
    reason: WorkerFailureReason,
  ): void {
    if (this.handledFailures.has(worker)) return;
    this.clearIdleTimer(worker);
    this.handledFailures.add(worker);
    this.failures++;
    if (error instanceof PjsExecutionLeaseError) this.leaseExpirations++;
    this.callbacks.failed(worker, error, wasStarting, reason);
    if (this.state !== 'active') return;
    // Bootstrap failures are configuration failures. Never enter an import/respawn loop.
    const policy = this.options.restartPolicy;
    const exhausted = policy
      ? this.restartWindowUtilization! >= policy.maxRestarts
      : this.restarts >= this.options.maxRestarts;
    if (wasStarting || exhausted) {
      if (!wasStarting) this.budgetExhaustions++;
      this.callbacks.fatal(
        new PjsWorkerError(
          wasStarting ? error.message : 'Worker restart budget exhausted',
          { workerId: worker.id, cause: error },
        ),
      );
      return;
    }
    this.restarts++;
    if (policy) this.restartHistory.push(this.monotonicNow());
    this.repair(worker);
  }

  private repair(worker: PjsWorker): void {
    this.clearIdleTimer(worker);
    this.trackRepair(this.replace(worker));
  }

  private trackRepair(repair: Promise<void>): void {
    this.repairs.add(repair);
    void repair.finally(() => this.repairs.delete(repair));
  }

  private async replace(worker: PjsWorker): Promise<void> {
    try {
      // Await exit before creating a replacement, keeping the live-thread bound intact.
      await worker.stop();
      if (this.state !== 'active') return;
      this.workers.delete(worker.id);
      if (
        this.options.idleTimeout === undefined ||
        this.workers.size < this.desired
      ) {
        this.spawn();
        this.replacements++;
      }
      this.reconcile();
    } catch (cause) {
      this.callbacks.fatal(
        new PjsWorkerError('Could not replace worker', {
          workerId: worker.id,
          cause,
        }),
      );
    }
  }
}
