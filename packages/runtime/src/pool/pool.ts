import { PjsExecutionLeaseError, PjsWorkerError } from '../errors/index.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import { PjsWorker } from '../workers/worker.js';
import type { WorkerCallbacks } from '../workers/worker.js';
import type { RestartPolicy, WorkerState } from '../types/index.js';

export interface PoolOptions {
  workers: number;
  startupTimeout: number;
  maxRestarts: number;
  restartPolicy?: RestartPolicy;
}
interface PoolCallbacks extends Omit<WorkerCallbacks, 'failed'> {
  failed(worker: PjsWorker, error: PjsWorkerError, wasStarting: boolean): void;
  fatal(error: PjsWorkerError): void;
}

/** Owns workers, never task queues or scheduling policy. */
export class PjsPool {
  private readonly workers = new Map<number, PjsWorker>();
  private readonly repairs = new Set<Promise<void>>();
  private state: 'created' | 'active' | 'stopping' | 'stopped' = 'created';
  private readonly handledFailures = new WeakSet<PjsWorker>();
  private readonly restartHistory: number[] = [];
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
  ) {}

  async start(): Promise<void> {
    if (this.state !== 'created')
      throw new PjsWorkerError('Pool already started or stopped');
    this.state = 'active';
    for (let i = 0; i < this.options.workers; i++) this.spawn();
    await Promise.all([...this.workers.values()].map((worker) => worker.ready));
  }
  idle(): PjsWorker[] {
    return [...this.workers.values()].filter(
      (worker) => worker.status === 'idle',
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
        ready: (worker) => this.callbacks.ready(worker),
        started: (worker, taskId) => this.callbacks.started(worker, taskId),
        result: (worker, message) => this.callbacks.result(worker, message),
        failed: (worker, error, wasStarting) =>
          this.failed(worker, error, wasStarting),
        leaseTerminationRequested: () => this.leaseTerminationRequests++,
        exited: (worker, correlationId) => {
          if (worker.leaseExpired) this.confirmedLeaseExits++;
          this.callbacks.exited(worker, correlationId);
        },
      },
    );
    this.workers.set(worker.id, worker);
  }

  private failed(
    worker: PjsWorker,
    error: PjsWorkerError,
    wasStarting: boolean,
  ): void {
    if (this.handledFailures.has(worker)) return;
    this.handledFailures.add(worker);
    this.failures++;
    if (error instanceof PjsExecutionLeaseError) this.leaseExpirations++;
    this.callbacks.failed(worker, error, wasStarting);
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
    const repair = this.replace(worker);
    this.repairs.add(repair);
    void repair.finally(() => this.repairs.delete(repair));
  }

  private async replace(worker: PjsWorker): Promise<void> {
    try {
      // Await exit before creating a replacement, keeping the live-thread bound intact.
      await worker.stop();
      if (this.state !== 'active') return;
      this.workers.delete(worker.id);
      this.spawn();
      this.replacements++;
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
