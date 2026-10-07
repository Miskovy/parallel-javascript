import { PjsWorkerError } from '../errors/index.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import { PjsWorker } from '../workers/worker.js';
import type { WorkerCallbacks } from '../workers/worker.js';
import type { WorkerState } from '../types/index.js';

export interface PoolOptions {
  workers: number;
  startupTimeout: number;
  maxRestarts: number;
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
  private nextId = 1;
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
        exited: (worker, correlationId) =>
          this.callbacks.exited(worker, correlationId),
      },
    );
    this.workers.set(worker.id, worker);
  }

  private failed(
    worker: PjsWorker,
    error: PjsWorkerError,
    wasStarting: boolean,
  ): void {
    this.failures++;
    this.callbacks.failed(worker, error, wasStarting);
    if (this.state !== 'active') return;
    // Bootstrap failures are configuration failures. Never enter an import/respawn loop.
    if (wasStarting || this.restarts >= this.options.maxRestarts) {
      this.callbacks.fatal(
        new PjsWorkerError(
          wasStarting ? error.message : 'Worker restart budget exhausted',
          { workerId: worker.id, cause: error },
        ),
      );
      return;
    }
    this.restarts++;
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
