import { availableParallelism } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  PjsCancelledError,
  PjsQueueFullError,
  PjsRuntimeStateError,
  PjsSerializationError,
  PjsTaskError,
  PjsTaskRegistrationError,
  PjsTimeoutError,
  PjsWorkerError,
} from './errors/index.js';
import { PjsPool } from './pool/pool.js';
import { PjsScheduler } from './scheduler/fifo.js';
import type { Scheduler } from './scheduler/fifo.js';
import { PjsTaskRegistry } from './tasks/registry.js';
import type { PjsTask, TaskDescriptor } from './tasks/registry.js';
import type { PendingTask } from './tasks/task.js';
import { reserveTransfers, snapshotTransferList } from './tasks/transfer.js';
import { Metrics } from './telemetry/metrics.js';
import type {
  RunOptions,
  RuntimeState,
  ShutdownOptions,
  TaskSnapshot,
} from './types/index.js';
import type { PjsWorker } from './workers/worker.js';
import type { TaskResultMessage } from './workers/protocol.js';

export interface PjsRuntimeOptions {
  registry: PjsTaskRegistry;
  workers?: number;
  minWorkers?: number;
  maxWorkers?: number;
  maxQueue?: number;
  startupTimeout?: number;
  maxRestarts?: number;
}

function integer(
  name: string,
  value: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  return value;
}

export class PjsRuntime {
  private state: RuntimeState = 'created';
  private readonly registry: ReadonlyMap<object, TaskDescriptor>;
  private readonly scheduler: Scheduler<PendingTask>;
  private readonly tasks = new Map<string, PendingTask>();
  private readonly metrics = new Metrics();
  private readonly pool: PjsPool;
  private readonly readyPromise: Promise<void>;
  private shutdownPromise: Promise<void> | undefined;
  private drainMode = true;
  private drainResolve: (() => void) | undefined;

  constructor(options: PjsRuntimeOptions) {
    const minimum = integer('minWorkers', options.minWorkers ?? 1, 1);
    const maximum = integer(
      'maxWorkers',
      options.maxWorkers ??
        Math.max(minimum, options.workers ?? availableParallelism()),
      minimum,
    );
    const workers = integer(
      'workers',
      options.workers ??
        Math.max(minimum, Math.min(maximum, availableParallelism())),
      minimum,
      maximum,
    );
    const startupTimeout = integer(
      'startupTimeout',
      options.startupTimeout ?? 30_000,
      1,
      2 ** 31 - 1,
    );
    const maxRestarts = integer(
      'maxRestarts',
      options.maxRestarts ?? workers * 4,
      0,
    );
    this.scheduler = new PjsScheduler(options.maxQueue ?? 1024);
    this.registry = options.registry.snapshot();
    this.pool = new PjsPool(
      { workers, startupTimeout, maxRestarts },
      [...this.registry.values()],
      {
        ready: () => this.pump(),
        started: (worker, taskId) => {
          const task = this.tasks.get(taskId);
          if (task) {
            task.snapshot.status = 'running';
            task.snapshot.startedAt = Date.now();
            task.snapshot.workerId = worker.id;
          }
        },
        result: (worker, message) => this.result(worker, message),
        failed: (_worker, error) => {
          const task = error.taskId ? this.tasks.get(error.taskId) : undefined;
          if (task) this.settle(task, 'failed', error);
        },
        fatal: (error) => this.fail(error),
      },
    );
    this.state = 'starting';
    this.readyPromise = this.pool
      .start()
      .then(() => {
        if (this.state === 'starting') this.state = 'running';
        if (
          this.state === 'failed' ||
          this.state === 'stopped' ||
          (this.state === 'stopping' && !this.drainMode)
        )
          throw new PjsRuntimeStateError('Runtime stopped during startup');
        this.pump();
      })
      .catch((cause: unknown) => {
        const error =
          cause instanceof Error ? cause : new PjsWorkerError(String(cause));
        if (this.state !== 'stopping' && this.state !== 'stopped')
          this.fail(error);
        throw error;
      });
    void this.readyPromise.catch(() => {});
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  run<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions = {},
  ): Promise<Output> {
    const id = randomUUID();
    const reject = (error: Error): Promise<Output> => {
      this.metrics.rejected++;
      return Promise.reject(error);
    };
    if (this.state !== 'starting' && this.state !== 'running')
      return reject(
        new PjsRuntimeStateError(`Runtime is ${this.state}`, { taskId: id }),
      );
    const descriptor = this.registry.get(task);
    if (!descriptor)
      return reject(
        new PjsTaskRegistrationError(
          'Task does not belong to this runtime registry snapshot',
          { taskId: id },
        ),
      );
    if (options.timeout !== undefined) {
      try {
        integer('timeout', options.timeout, 1, 2 ** 31 - 1);
      } catch (error) {
        return reject(error as Error);
      }
    }
    if (options.signal?.aborted)
      return reject(
        new PjsCancelledError('Task was already aborted', {
          taskId: id,
          cause: options.signal.reason,
        }),
      );
    let transferList: ArrayBuffer[];
    try {
      transferList = snapshotTransferList(
        options.transferList === undefined ? [] : options.transferList,
      );
    } catch (cause) {
      return reject(
        new PjsSerializationError(
          cause instanceof Error ? cause.message : 'Invalid transfer list',
          { taskId: id, cause },
        ),
      );
    }
    // Reading an application-provided list may invoke getters/iterators.
    if (this.state !== 'starting' && this.state !== 'running')
      return reject(
        new PjsRuntimeStateError(`Runtime is ${this.state}`, { taskId: id }),
      );
    if (options.signal?.aborted)
      return reject(
        new PjsCancelledError('Task was aborted before admission', {
          taskId: id,
          cause: options.signal.reason,
        }),
      );
    const idle =
      this.state === 'running' && this.scheduler.size === 0
        ? this.pool.idle()[0]
        : undefined;
    if (!idle && this.scheduler.size >= this.scheduler.capacity)
      return reject(
        new PjsQueueFullError(
          `Queue capacity ${this.scheduler.capacity} exhausted`,
          { taskId: id },
        ),
      );

    let releaseTransfers: () => void;
    try {
      releaseTransfers = reserveTransfers(transferList, id);
    } catch (error) {
      return reject(error as Error);
    }

    return new Promise<Output>((resolve, reject) => {
      const pending: PendingTask = {
        id,
        snapshot: {
          id,
          taskName: descriptor.id,
          status: 'created',
          createdAt: Date.now(),
        },
        input,
        transferList,
        releaseTransfers,
        admittedAt: performance.now(),
        resolve: (output) => resolve(output as Output),
        reject,
        cleanup: () => {},
      };
      this.tasks.set(id, pending);
      this.metrics.accepted++;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const signal = options.signal;
      const abort = (): void => {
        this.settle(
          pending,
          'cancelled',
          new PjsCancelledError(
            'Task cancelled; an active execution may still finish',
            {
              taskId: id,
              ...(pending.snapshot.workerId !== undefined
                ? { workerId: pending.snapshot.workerId }
                : {}),
              cause: signal?.reason,
            },
          ),
        );
        this.pump();
      };
      pending.cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        // A getter may abort during postMessage. Hold ownership until posting finishes.
        if (
          pending.snapshot.status === 'created' ||
          pending.snapshot.status === 'queued'
        )
          this.releaseTransfers(pending);
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (options.timeout !== undefined)
        timer = setTimeout(() => {
          this.settle(
            pending,
            'timed_out',
            new PjsTimeoutError(
              'Task deadline exceeded; an active execution may still finish',
              {
                taskId: id,
                ...(pending.snapshot.workerId !== undefined
                  ? { workerId: pending.snapshot.workerId }
                  : {}),
              },
            ),
          );
          this.pump();
        }, options.timeout);
      pending.snapshot.status = 'queued';
      pending.snapshot.queuedAt = Date.now();
      if (idle) {
        this.dispatch(idle, pending);
        this.pump();
      } else {
        this.scheduler.enqueue(pending);
        this.pump();
      }
    });
  }

  stats() {
    const workers = this.pool.snapshots();
    return {
      state: this.state,
      workers: {
        total: workers.length,
        busy: workers.filter((w) => w.status === 'busy').length,
        idle: workers.filter((w) => w.status === 'idle').length,
        starting: workers.filter((w) => w.status === 'starting').length,
        failures: this.pool.failures,
        restarts: this.pool.restarts,
        details: workers,
      },
      queue: { size: this.scheduler.size, capacity: this.scheduler.capacity },
      tasks: {
        accepted: this.metrics.accepted,
        rejected: this.metrics.rejected,
        pending: this.tasks.size,
        completed: this.metrics.completed,
        failed: this.metrics.failed,
        cancelled: this.metrics.cancelled,
        timedOut: this.metrics.timedOut,
      },
      timing: this.metrics.timing(),
      activeTasks: [...this.tasks.values()].map((task): TaskSnapshot => ({
        ...task.snapshot,
      })),
    };
  }

  shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.drainMode = options.drain ?? true;
    const failed = this.state === 'failed';
    if (!failed) this.state = 'stopping';
    // Defer the body so the idempotent promise is installed before any cleanup occurs.
    this.shutdownPromise = Promise.resolve().then(async () => {
      if (!failed && this.drainMode) {
        await this.readyPromise.catch(() => {});
        await new Promise<void>((resolve) => {
          this.drainResolve = resolve;
          this.pump();
          this.checkDrained();
        });
      } else {
        for (const task of this.tasks.values())
          this.settle(
            task,
            'cancelled',
            new PjsCancelledError('Runtime shutdown cancelled task', {
              taskId: task.id,
              ...(task.snapshot.workerId !== undefined
                ? { workerId: task.snapshot.workerId }
                : {}),
            }),
          );
      }
      await this.pool.stop();
      this.state = 'stopped';
    });
    return this.shutdownPromise;
  }

  private pump(): void {
    if (
      this.state !== 'running' &&
      !(this.state === 'stopping' && this.drainMode)
    ) {
      this.checkDrained();
      return;
    }
    for (const worker of this.pool.idle()) {
      // Serialization failures release a slot synchronously; continue consuming FIFO work.
      while (worker.snapshot().status === 'idle') {
        const task = this.scheduler.next(worker.snapshot());
        if (!task) break;
        this.dispatch(worker, task);
      }
    }
    this.checkDrained();
  }

  private dispatch(worker: PjsWorker, task: PendingTask): void {
    task.snapshot.status = 'scheduled';
    task.snapshot.scheduledAt = Date.now();
    task.snapshot.workerId = worker.id;
    this.metrics.scheduled(performance.now() - task.admittedAt);
    try {
      worker.execute(
        task.id,
        task.snapshot.taskName,
        task.input,
        task.transferList,
      );
    } catch (error) {
      this.settle(task, 'failed', error as Error);
    } finally {
      task.input = undefined;
      this.releaseTransfers(task);
    }
  }

  private releaseTransfers(task: PendingTask): void {
    task.releaseTransfers();
    task.releaseTransfers = () => {};
    task.transferList = [];
  }

  private result(worker: PjsWorker, message: TaskResultMessage): void {
    this.metrics.executed(message.executionMs);
    const task = this.tasks.get(message.taskId);
    // Late results after cancellation/deadline free the worker without settling twice.
    if (task) {
      if (message.type === 'success')
        this.settle(task, 'completed', undefined, message.output);
      else {
        const context = { taskId: task.id, workerId: worker.id };
        const error =
          message.kind === 'serialization'
            ? new PjsSerializationError(
                `Task output could not be serialized: ${message.error.message}`,
                { ...context, cause: message.error },
              )
            : new PjsTaskError(message.error, context);
        this.settle(task, 'failed', error);
      }
    }
    this.pump();
  }

  private settle(
    task: PendingTask,
    status: 'completed' | 'failed' | 'cancelled' | 'timed_out',
    error?: Error,
    output?: unknown,
  ): void {
    if (!this.tasks.delete(task.id)) return;
    this.scheduler.remove(task.id);
    task.cleanup();
    task.input = undefined;
    task.snapshot.status = status;
    task.snapshot.completedAt = Date.now();
    this.metrics.settled(performance.now() - task.admittedAt);
    if (status === 'timed_out') this.metrics.timedOut++;
    else this.metrics[status]++;
    if (error) task.reject(error);
    else task.resolve(output);
  }

  private checkDrained(): void {
    if (this.tasks.size === 0 && this.pool.busy === 0) {
      this.drainResolve?.();
      this.drainResolve = undefined;
    }
  }

  private fail(error: Error): void {
    if (this.state === 'failed' || this.state === 'stopped') return;
    this.state = 'failed';
    for (const task of this.tasks.values())
      this.settle(
        task,
        'failed',
        new PjsWorkerError(error.message, {
          taskId: task.id,
          ...(task.snapshot.workerId !== undefined
            ? { workerId: task.snapshot.workerId }
            : {}),
          cause: error,
        }),
      );
    void this.pool.stop().then(() => this.checkDrained());
  }
}
