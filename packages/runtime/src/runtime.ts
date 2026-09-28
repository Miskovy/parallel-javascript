import { availableParallelism } from 'node:os';
import { randomUUID } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';
import { PartitionOperation } from './partition/operation.js';
import type { PartitionChild, OperationStatus } from './partition/operation.js';
import { planRange, partitionAt } from './partition/range.js';
import type {
  PartitionRange,
  PartitionInput,
  PartitionOptions,
  RangePartition,
} from './partition/range.js';
import { serializeError } from './workers/protocol.js';
import {
  PjsError,
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
  private readonly workerCount: number;
  private readonly operationLimit: number;
  private readonly operations = new Map<string, PartitionOperation>();
  private readonly operationMetrics = {
    accepted: 0,
    rejected: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    timedOut: 0,
  };
  private readonly partitionMetrics = {
    generated: 0,
    admitted: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  private admissionReservations = 0;
  private pumping = false;
  private productionTick: ReturnType<typeof setImmediate> | undefined;
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
    this.workerCount = workers;
    this.operationLimit = Math.min(
      Number.MAX_SAFE_INTEGER,
      workers + this.scheduler.capacity,
    );
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

  /**
   * @experimental Host-coordinated numeric ranges; this API is not yet stable.
   * The synchronous factory runs lazily on the main thread with reserved admission.
   * Results are collected by partition index. maxQueue does not bound result bytes.
   */
  partitionRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions = {},
  ): Promise<Output[]> {
    const id = randomUUID();
    const acceptedAt = performance.now();
    const reject = (error: Error): Promise<Output[]> => {
      this.operationMetrics.rejected++;
      return Promise.reject(error);
    };
    if (!isMainThread)
      return reject(
        new PjsRuntimeStateError(
          'Partition operations require the main thread; nested worker partitioning is unsupported',
          { operationId: id },
        ),
      );
    let plan;
    let timeout: number | undefined;
    let signal: AbortSignal | undefined;
    try {
      plan = planRange(range);
      if (typeof createInput !== 'function')
        throw new TypeError('createInput must be a synchronous function');
      timeout = options.timeout;
      signal = options.signal;
      if (timeout !== undefined) integer('timeout', timeout, 1, 2 ** 31 - 1);
    } catch (error) {
      return reject(error as Error);
    }
    if (this.state !== 'starting' && this.state !== 'running')
      return reject(
        new PjsRuntimeStateError(`Runtime is ${this.state}`, {
          operationId: id,
        }),
      );
    if (!this.registry.has(task))
      return reject(
        new PjsTaskRegistrationError(
          'Task does not belong to this runtime registry snapshot',
          { operationId: id },
        ),
      );
    if (signal?.aborted)
      return reject(
        new PjsCancelledError('Partition operation was already aborted', {
          operationId: id,
          cause: signal.reason,
        }),
      );
    if (this.operations.size >= this.operationLimit)
      return reject(
        new PjsQueueFullError(
          `Partition operation capacity ${this.operationLimit} exhausted`,
          { operationId: id },
        ),
      );

    return new Promise<Output[]>((resolve, reject) => {
      const operation = new PartitionOperation(
        id,
        task as PjsTask<unknown, unknown>,
        plan,
        createInput,
        timeout === undefined ? undefined : acceptedAt + timeout,
        (outputs) => resolve(outputs as Output[]),
        reject,
      );
      operation.status = 'running';
      this.operations.set(id, operation);
      this.operationMetrics.accepted++;
      const abort = () => {
        this.finishOperation(
          operation,
          'cancelled',
          new PjsCancelledError(
            'Partition operation cancelled; active executions may still finish',
            { operationId: id, cause: signal?.reason },
          ),
        );
        this.pump();
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      operation.cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (timeout !== undefined) {
        const onDeadline = () => {
          if (
            !this.expireOperation(operation) &&
            operation.status === 'running'
          )
            timer = setTimeout(
              onDeadline,
              Math.max(1, Math.ceil(operation.deadline! - performance.now())),
            );
          this.pump();
        };
        timer = setTimeout(
          onDeadline,
          Math.max(1, Math.ceil(timeout - (performance.now() - acceptedAt))),
        );
      }
      if (!this.expireOperation(operation)) {
        if (plan.chunkCount === 0) this.finishOperation(operation, 'completed');
        else this.pump();
      }
    });
  }

  run<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions = {},
  ): Promise<Output> {
    return this.submit(task, input, options);
  }

  private submit<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions,
    child?: PartitionChild,
  ): Promise<Output> {
    const id = randomUUID();
    const reject = (error: Error): Promise<Output> => {
      this.metrics.rejected++;
      if (child)
        this.finishOperation(
          child.operation,
          'failed',
          this.childError(error, child),
        );
      return Promise.reject(error);
    };
    if (!this.canSubmit(child))
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
    if (!this.canSubmit(child))
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
      this.dispatchAllowed() && this.scheduler.size === 0
        ? this.pool.idle()[0]
        : undefined;
    if (
      (!idle && this.scheduler.size >= this.scheduler.capacity) ||
      (!child &&
        this.admissionReservations > 0 &&
        this.availableAdmission() <= 0)
    )
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
        ...(child ? { child } : {}),
        snapshot: {
          id,
          ...(child ? this.childContext(child) : {}),
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
      if (child) {
        child.operation.children.set(id, child.partition);
        child.operation.admitted++;
        this.partitionMetrics.admitted++;
      }
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
      operations: {
        ...this.operationMetrics,
        pending: this.operations.size,
        capacity: this.operationLimit,
      },
      partitions: { ...this.partitionMetrics },
      activeOperations: [...this.operations.values()].map((operation) => {
        let queued = 0,
          running = 0;
        for (const id of operation.children.keys()) {
          const status = this.tasks.get(id)?.snapshot.status;
          if (status === 'queued') queued++;
          else if (status === 'scheduled' || status === 'running') running++;
        }
        return {
          id: operation.id,
          taskName: operation.task.id,
          status: operation.status,
          ...operation.plan,
          generated: operation.generated,
          admitted: operation.admitted,
          queued,
          running,
          completed: operation.completed,
          failed: operation.failed,
          cancelled: operation.cancelled,
        };
      }),
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
        for (const operation of this.operations.values())
          this.finishOperation(
            operation,
            'cancelled',
            new PjsCancelledError(
              'Runtime shutdown cancelled partition operation',
              { operationId: operation.id },
            ),
          );
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
      if (this.productionTick) clearImmediate(this.productionTick);
      this.productionTick = undefined;
      this.state = 'stopped';
    });
    return this.shutdownPromise;
  }

  private dispatchAllowed(): boolean {
    return (
      this.state === 'running' || (this.state === 'stopping' && this.drainMode)
    );
  }

  private canSubmit(child?: PartitionChild): boolean {
    if (
      child &&
      (child.operation.status !== 'running' ||
        this.expireOperation(child.operation))
    )
      return false;
    return (
      this.state === 'starting' ||
      this.state === 'running' ||
      (child !== undefined && this.state === 'stopping' && this.drainMode)
    );
  }

  private availableAdmission(): number {
    return (
      this.scheduler.capacity -
      this.scheduler.size +
      (this.dispatchAllowed() ? this.pool.idle().length : 0) -
      this.admissionReservations
    );
  }

  private childContext(child: PartitionChild) {
    return {
      operationId: child.operation.id,
      partitionIndex: child.partition.index,
      rangeStart: child.partition.start,
      rangeEnd: child.partition.end,
    };
  }

  private childError(error: Error, child: PartitionChild): Error {
    // These are runtime-created child errors, not application-owned factory errors.
    return Object.assign(error, this.childContext(child));
  }

  private expireOperation(operation: PartitionOperation): boolean {
    if (operation.status !== 'running') return true;
    if (
      operation.deadline === undefined ||
      performance.now() < operation.deadline
    )
      return false;
    this.finishOperation(
      operation,
      'timed_out',
      new PjsTimeoutError(
        'Partition operation deadline exceeded; active executions may still finish',
        { operationId: operation.id },
      ),
    );
    return true;
  }

  private finishOperation(
    operation: PartitionOperation,
    status: Exclude<OperationStatus, 'created' | 'running'>,
    error?: Error,
  ): void {
    if (operation.status !== 'running') return;
    operation.status = status;
    this.operations.delete(operation.id);
    operation.cleanup();
    operation.cleanup = () => {};
    operation.createInput = undefined;
    if (status === 'timed_out') this.operationMetrics.timedOut++;
    else this.operationMetrics[status]++;
    // Set terminal state before cancelling siblings; their settlement is reentrant.
    for (const id of operation.children.keys()) {
      const task = this.tasks.get(id);
      if (task)
        this.settle(
          task,
          'cancelled',
          new PjsCancelledError(
            'Partition sibling cancelled after parent settlement',
            {
              taskId: id,
              operationId: operation.id,
              cause: error,
              ...(task.snapshot.workerId === undefined
                ? {}
                : { workerId: task.snapshot.workerId }),
            },
          ),
        );
    }
    const outputs = operation.outputs;
    operation.outputs = [];
    if (error) operation.reject(error);
    else operation.resolve(outputs);
  }

  private childSettled(
    task: PendingTask,
    status: 'completed' | 'failed' | 'cancelled' | 'timed_out',
    error?: Error,
    output?: unknown,
  ): void {
    const child = task.child!;
    const operation = child.operation;
    operation.children.delete(task.id);
    const counter = status === 'timed_out' ? 'cancelled' : status;
    operation[counter]++;
    this.partitionMetrics[counter]++;
    if (operation.status !== 'running') return;
    if (error) {
      this.finishOperation(operation, 'failed', this.childError(error, child));
    } else if (!this.expireOperation(operation)) {
      operation.outputs[child.partition.index] = output;
      if (operation.completed === operation.plan.chunkCount)
        this.finishOperation(operation, 'completed');
    }
  }

  private nextProducer(): PartitionOperation | undefined {
    for (const operation of this.operations.values()) {
      if (
        operation.generated < operation.plan.chunkCount &&
        operation.children.size < this.workerCount
      )
        return operation;
    }
    return undefined;
  }

  private producePartitions(): void {
    // Bound synchronous factory work too; yield if immediate failures leave more producers.
    for (
      let produced = 0;
      produced < this.workerCount &&
      this.dispatchAllowed() &&
      this.availableAdmission() > 0;
      produced++
    ) {
      const operation = this.nextProducer();
      if (!operation) break;
      this.operations.delete(operation.id);
      this.operations.set(operation.id, operation);
      if (this.expireOperation(operation)) continue;
      const partition = partitionAt(operation.plan, operation.generated++);
      this.partitionMetrics.generated++;
      const child = { operation, partition };
      this.admissionReservations++;
      try {
        const prepared = operation.createInput!(partition);
        if (
          operation.status !== 'running' ||
          !this.dispatchAllowed() ||
          this.expireOperation(operation)
        )
          continue;
        if (
          prepared === null ||
          typeof prepared !== 'object' ||
          !('input' in prepared)
        )
          throw new TypeError(
            'createInput must synchronously return { input, transferList? }',
          );
        const input = prepared.input;
        const transferList = prepared.transferList;
        if (
          operation.status !== 'running' ||
          !this.dispatchAllowed() ||
          this.expireOperation(operation)
        )
          continue;
        // Child outcomes notify the parent synchronously in settle/reject. No Promise list.
        void this.submit(
          operation.task,
          input,
          transferList === undefined ? {} : { transferList },
          child,
        ).catch(() => {});
      } catch (cause) {
        this.finishOperation(
          operation,
          'failed',
          new PjsError(
            `Partition input factory failed: ${serializeError(cause).message}`,
            {
              ...this.childContext(child),
              cause,
            },
          ),
        );
      } finally {
        this.admissionReservations--;
      }
    }
    if (
      this.dispatchAllowed() &&
      this.availableAdmission() > 0 &&
      this.nextProducer() &&
      !this.productionTick
    ) {
      this.productionTick = setImmediate(() => {
        this.productionTick = undefined;
        this.pump();
      });
    }
  }

  private pump(): void {
    if (this.pumping) return;
    if (!this.dispatchAllowed()) {
      this.checkDrained();
      return;
    }
    this.pumping = true;
    try {
      this.dispatchQueued();
      if (this.operations.size > 0) {
        this.producePartitions();
        this.dispatchQueued();
      }
    } finally {
      this.pumping = false;
    }
    this.checkDrained();
  }

  private dispatchQueued(): void {
    for (const worker of this.pool.idle()) {
      while (this.dispatchAllowed() && worker.snapshot().status === 'idle') {
        const task = this.scheduler.next(worker.snapshot());
        if (!task) break;
        this.dispatch(worker, task);
      }
    }
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
    if (task.child) this.childSettled(task, status, error, output);
  }

  private checkDrained(): void {
    if (
      this.tasks.size === 0 &&
      this.operations.size === 0 &&
      this.pool.busy === 0
    ) {
      this.drainResolve?.();
      this.drainResolve = undefined;
    }
  }

  private fail(error: Error): void {
    if (this.state === 'failed' || this.state === 'stopped') return;
    this.state = 'failed';
    for (const operation of this.operations.values())
      this.finishOperation(
        operation,
        'failed',
        new PjsWorkerError(error.message, {
          operationId: operation.id,
          cause: error,
        }),
      );
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
