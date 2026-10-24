import { randomUUID } from 'node:crypto';
import type { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import {
  PjsBinaryResultContractError,
  PjsCancelledError,
  PjsExecutionLeaseError,
  PjsQueueFullError,
  PjsRuntimeStateError,
  PjsSerializationError,
  PjsTaskError,
  PjsTaskRegistrationError,
  PjsTimeoutError,
  PjsWorkerError,
} from '../errors/index.js';
import { integer } from '../internal/integer.js';
import type { PartitionChild } from '../partition/operation.js';
import type { ResultCreditManager } from '../results/credit.js';
import { Metrics } from '../telemetry/metrics.js';
import { recordInternalProfile } from '../telemetry/profile.js';
import type {
  RecoveryCause,
  RunOptions,
  RuntimeState,
  TaskSnapshot,
} from '../types/index.js';
import type {
  BatchItemResult,
  ExecutionResultMessage,
  TaskResultMessage,
} from '../workers/protocol.js';
import type { PjsWorker, WorkerFailureReason } from '../workers/worker.js';
import type { PjsTask, TaskDescriptor } from './registry.js';
import type { PendingTask, TaskRecovery } from './task.js';
import { reserveTransfers, snapshotTransferList } from './transfer.js';

export type TaskTerminalStatus =
  'completed' | 'failed' | 'cancelled' | 'timed_out';

export interface TaskRuntimePort {
  state(): RuntimeState;
  canAccept(child: boolean): boolean;
  dispatchAllowed(): boolean;
  requestPump(): void;
}

export interface TaskParentPort {
  canSubmit(child: PartitionChild): boolean;
  context(child: PartitionChild): {
    operationId: string;
    partitionIndex: number;
    rangeStart: number;
    rangeEnd: number;
  };
  rejected(child: PartitionChild, error: Error): void;
  admitted(child: PartitionChild, taskId: string): void;
  settled(
    task: PendingTask,
    status: TaskTerminalStatus,
    error?: Error,
    output?: unknown,
  ): void;
}

/** Owns accepted logical task records, caller settlement, timers, and transfers. */
export class TaskCoordinator {
  private readonly tasks = new Map<string, PendingTask>();
  private readonly attempts = new Map<string, PendingTask>();
  private readonly metrics = new Metrics();

  constructor(
    private readonly registry: ReadonlyMap<object, TaskDescriptor>,
    private readonly dispatcher: ExecutionDispatcher,
    private readonly resultCredits: ResultCreditManager,
    private readonly runtime: TaskRuntimePort,
    private readonly parents: TaskParentPort,
  ) {}

  get size(): number {
    return this.tasks.size;
  }

  get(taskId: string): PendingTask | undefined {
    return this.tasks.get(taskId);
  }

  has(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  values(): IterableIterator<PendingTask> {
    return this.tasks.values();
  }

  scheduled(
    worker: PjsWorker,
    task: PendingTask,
    scheduledAt: number,
    queueMs: number,
  ): void {
    task.snapshot.status = 'scheduled';
    task.snapshot.scheduledAt = scheduledAt;
    task.snapshot.workerId = worker.id;
    this.metrics.scheduled(queueMs);
  }

  dispatched(task: PendingTask): void {
    for (const item of task.batch ?? [task]) {
      if (!item.recovery || !this.tasks.has(item.id)) item.input = undefined;
      this.releaseTransfers(item);
    }
  }

  /** Gate each recovery-enabled posting against the original caller lifetime. */
  prepareDispatch(task: PendingTask): boolean {
    const recovery = task.recovery;
    if (!recovery) return true;
    if (!this.canContinue(task)) return false;
    const executionId = recovery.attempts === 0 ? task.id : randomUUID();
    task.executionId = executionId;
    this.attempts.set(executionId, task);
    if (!recovery.fallbackUsed) recovery.attempts++;
    task.snapshot.attempt = recovery.attempts + (recovery.fallbackUsed ? 1 : 0);
    task.snapshot.executionId = executionId;
    return true;
  }

  submit<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions<NoInfer<Input>, NoInfer<Output>>,
    child?: PartitionChild,
    deferred?: PendingTask[],
  ): Promise<Output> {
    const id = randomUUID();
    const rejectSubmission = (error: Error): Promise<Output> => {
      this.metrics.rejected++;
      if (child) this.parents.rejected(child, error);
      return Promise.reject(error);
    };
    if (!this.canSubmit(child))
      return rejectSubmission(
        new PjsRuntimeStateError(`Runtime is ${this.runtime.state()}`, {
          taskId: id,
        }),
      );
    const descriptor = this.registry.get(task);
    if (!descriptor)
      return rejectSubmission(
        new PjsTaskRegistrationError(
          'Task does not belong to this runtime registry snapshot',
          { taskId: id },
        ),
      );
    let recovery: TaskRecovery | undefined;
    let cancellation: 'terminate' | undefined;
    let timeout: number | undefined;
    let signal: AbortSignal | undefined;
    try {
      const mode = options.cancellation;
      const retry = options.retry;
      const fallback = options.fallback;
      const repeatable = options.repeatable;
      const controlled = [
        'cancellation',
        'repeatable',
        'retry',
        'fallback',
      ].some((name) => name in options);
      if (
        controlled &&
        (child ||
          'dispatchBatchSize' in options ||
          'experimentalDispatchBatchSize' in options)
      )
        throw new TypeError(
          'Execution resilience requires an exclusive ordinary run() dispatch',
        );
      if (mode !== undefined && mode !== 'settle' && mode !== 'terminate')
        throw new TypeError('cancellation must be settle or terminate');
      if (mode === 'terminate') cancellation = mode;
      if (repeatable !== undefined && repeatable !== true)
        throw new TypeError('repeatable must be true');
      if (retry !== undefined || fallback !== undefined) {
        if (repeatable !== true)
          throw new TypeError('retry and fallback require repeatable: true');
        const maxAttempts =
          retry === undefined
            ? 1
            : integer('retry.maxAttempts', retry.maxAttempts, 1);
        const backoffMs = integer(
          'retry.backoffMs',
          retry?.backoffMs ?? 0,
          0,
          2 ** 31 - 1,
        );
        recovery = {
          maxAttempts,
          backoffMs,
          on: this.recoveryCauses(retry?.on, ['worker-crash']),
          attempts: 0,
          fallbackUsed: false,
        };
        if (fallback !== undefined) {
          const alternative = this.registry.get(fallback.task);
          if (!alternative || alternative === descriptor)
            throw new PjsTaskRegistrationError(
              'Fallback must be a different task in this runtime registry snapshot',
              { taskId: id },
            );
          recovery.fallback = {
            descriptor: alternative,
            on: this.recoveryCauses(fallback.on, ['task-error']),
          };
        }
      }
      timeout = options.timeout;
      if (timeout !== undefined) integer('timeout', timeout, 1, 2 ** 31 - 1);
      signal = options.signal;
      if (recovery && signal) recovery.signal = signal;
    } catch (error) {
      return rejectSubmission(error as Error);
    }
    let executionLease: number | undefined;
    try {
      executionLease = options.executionLease;
      if (executionLease !== undefined) {
        integer('executionLease', executionLease, 1, 2 ** 31 - 1);
        if (
          child ||
          'experimentalDispatchBatchSize' in options ||
          'dispatchBatchSize' in options
        )
          throw new TypeError(
            'executionLease requires an exclusive ordinary run() dispatch',
          );
      }
    } catch (error) {
      return rejectSubmission(error as Error);
    }
    if (signal?.aborted)
      return rejectSubmission(
        new PjsCancelledError('Task was already aborted', {
          taskId: id,
          cause: signal.reason,
        }),
      );
    let transferList: ArrayBuffer[];
    try {
      transferList = snapshotTransferList(
        options.transferList === undefined ? [] : options.transferList,
      );
      if (
        transferList.length > 0 &&
        recovery &&
        (recovery.maxAttempts > 1 || recovery.fallback)
      )
        throw new PjsSerializationError(
          'Input transfer lists cannot be combined with retries or fallback',
          { taskId: id },
        );
      if (
        child &&
        child.operation.dispatchBatchSize > 1 &&
        transferList.length > 0
      )
        throw new PjsSerializationError(
          'Batched partition dispatch does not accept input transfer lists; use batch size 1',
          { taskId: id },
        );
    } catch (cause) {
      return rejectSubmission(
        new PjsSerializationError(
          cause instanceof Error ? cause.message : 'Invalid transfer list',
          { taskId: id, cause },
        ),
      );
    }
    // Reading an application-provided list may invoke getters/iterators.
    if (!this.canSubmit(child))
      return rejectSubmission(
        new PjsRuntimeStateError(`Runtime is ${this.runtime.state()}`, {
          taskId: id,
        }),
      );
    if (signal?.aborted)
      return rejectSubmission(
        new PjsCancelledError('Task was aborted before admission', {
          taskId: id,
          cause: signal.reason,
        }),
      );
    const admission = this.dispatcher.prepareAdmission(
      deferred !== undefined,
      child !== undefined,
      this.runtime.dispatchAllowed(),
    );
    if (!admission)
      return rejectSubmission(
        new PjsQueueFullError(
          `Queue capacity ${this.dispatcher.queueCapacity} exhausted`,
          { taskId: id },
        ),
      );

    let releaseTransfers: () => void;
    try {
      releaseTransfers = reserveTransfers(transferList, id);
    } catch (error) {
      return rejectSubmission(error as Error);
    }

    return new Promise<Output>((resolve, reject) => {
      const pending: PendingTask = {
        id,
        ...(recovery ? { recovery } : {}),
        ...(cancellation ? { cancellation } : {}),
        ...(executionLease === undefined ? {} : { executionLease }),
        ...(child ? { child } : {}),
        snapshot: {
          id,
          ...(child ? this.parents.context(child) : {}),
          taskName: descriptor.id,
          ...(recovery ? { implementation: descriptor.id } : {}),
          status: 'created',
          createdAt: Date.now(),
        },
        input,
        transferList,
        ...(child?.expectedResultBytes === undefined
          ? {}
          : { expectedResultBytes: child.expectedResultBytes }),
        ...(child?.resultByteContract === undefined
          ? {}
          : { resultByteContract: child.resultByteContract }),
        releaseTransfers,
        admittedAt: performance.now(),
        resolve: (output) => resolve(output as Output),
        reject,
        cleanup: () => {},
      };
      if (recovery && timeout !== undefined)
        recovery.deadline = pending.admittedAt + timeout;
      if (
        child &&
        (child.expectedResultBytes !== undefined || child.resultByteContract)
      ) {
        try {
          this.resultCredits.reserve(
            pending.id,
            child.operation,
            child.partition.index,
            child.expectedResultBytes ?? child.resultByteContract!.bytes,
            this.parents.context(child),
            child.resultByteContract?.mode,
          );
        } catch (cause) {
          releaseTransfers();
          this.metrics.rejected++;
          const error =
            cause instanceof Error ? cause : new Error(String(cause));
          this.parents.rejected(child, error);
          reject(error);
          return;
        }
      }
      this.tasks.set(id, pending);
      this.metrics.accepted++;
      if (child) this.parents.admitted(child, id);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = (): void => {
        this.cancel(pending, 'cancelled', signal?.reason);
        this.runtime.requestPump();
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
      if (timeout !== undefined)
        timer = setTimeout(() => {
          this.cancel(pending, 'timed_out');
          this.runtime.requestPump();
        }, timeout);
      pending.snapshot.status = 'queued';
      pending.snapshot.queuedAt = Date.now();
      this.dispatcher.admit(admission, pending, deferred);
      if (!deferred) this.runtime.requestPump();
    });
  }

  started(worker: PjsWorker, taskId: string): void {
    const task = this.executionTask(taskId);
    if (task?.batch) {
      for (const item of task.batch) {
        item.snapshot.status = 'running';
        item.snapshot.startedAt = Date.now();
        item.snapshot.workerId = worker.id;
      }
    } else if (task) {
      task.snapshot.status = 'running';
      task.snapshot.startedAt = Date.now();
      task.snapshot.workerId = worker.id;
    }
  }

  result(worker: PjsWorker, message: ExecutionResultMessage): void {
    const profileStarted = message.profile ? performance.now() : 0;
    if (message.type === 'batchResult') {
      for (const item of message.items) this.resultItem(worker, item);
    } else this.resultItem(worker, message);
    if (profileStarted)
      recordInternalProfile(
        'hostResultSettlement',
        performance.now() - profileStarted,
      );
    this.runtime.requestPump();
  }

  failTask(error: PjsWorkerError, reason?: WorkerFailureReason): void {
    const task = error.taskId ? this.executionTask(error.taskId) : undefined;
    if (!task) return;
    const logical =
      error.taskId === task.id
        ? error
        : error instanceof PjsExecutionLeaseError
          ? new PjsExecutionLeaseError(error.message, {
              taskId: task.id,
              ...(error.workerId === undefined
                ? {}
                : { workerId: error.workerId }),
              cause: error.cause,
            })
          : new PjsWorkerError(error.message, {
              taskId: task.id,
              ...(error.workerId === undefined
                ? {}
                : { workerId: error.workerId }),
              cause: error.cause,
            });
    this.failedAttempt(
      task,
      logical,
      reason === 'worker-crash' || reason === 'execution-lease'
        ? reason
        : undefined,
      false,
    );
  }

  exited(correlationId: string): void {
    const task = this.executionTask(correlationId);
    if (task?.recovery?.pendingFailure) this.queueRecovery(task);
  }

  dispatchFailed(task: PendingTask, error: Error): void {
    const logical =
      error instanceof PjsSerializationError && error.taskId !== task.id
        ? new PjsSerializationError(error.message, {
            taskId: task.id,
            ...(error.workerId === undefined
              ? {}
              : { workerId: error.workerId }),
            cause: error.cause,
          })
        : error;
    this.finishFailure(task, logical);
  }

  settle(
    task: PendingTask,
    status: TaskTerminalStatus,
    error?: Error,
    output?: unknown,
  ): void {
    if (!this.tasks.delete(task.id)) return;
    if (task.executionId) this.attempts.delete(task.executionId);
    const recovery = task.recovery;
    if (recovery) {
      if (recovery.timer) clearTimeout(recovery.timer);
      delete recovery.timer;
      delete recovery.pendingFailure;
      delete recovery.lastPrimaryError;
    }
    if (status !== 'completed' || error)
      this.resultCredits.markCallerSettled(task.id);
    this.dispatcher.remove(task.id);
    task.cleanup();
    task.input = undefined;
    task.snapshot.status = status;
    task.snapshot.completedAt = Date.now();
    this.metrics.settled(performance.now() - task.admittedAt);
    if (status === 'timed_out') this.metrics.timedOut++;
    else this.metrics[status]++;
    if (error) task.reject(error);
    else task.resolve(output);
    if (task.child) this.parents.settled(task, status, error, output);
  }

  snapshot() {
    return {
      metrics: {
        accepted: this.metrics.accepted,
        rejected: this.metrics.rejected,
        pending: this.tasks.size,
        completed: this.metrics.completed,
        failed: this.metrics.failed,
        cancelled: this.metrics.cancelled,
        timedOut: this.metrics.timedOut,
      },
      timing: this.metrics.timing(),
      active: [...this.tasks.values()].map((task): TaskSnapshot => ({
        ...task.snapshot,
      })),
    };
  }

  private canSubmit(child?: PartitionChild): boolean {
    if (child && !this.parents.canSubmit(child)) return false;
    return this.runtime.canAccept(child !== undefined);
  }

  private recoveryCauses(
    value: readonly RecoveryCause[] | undefined,
    defaults: RecoveryCause[],
  ): readonly RecoveryCause[] {
    if (value === undefined) return defaults;
    if (!Array.isArray(value) || value.length === 0)
      throw new TypeError(
        'Recovery on must be a nonempty array of supported causes',
      );
    const causes = Array.from(value);
    if (
      causes.some(
        (cause) =>
          !['worker-crash', 'execution-lease', 'task-error'].includes(cause),
      )
    )
      throw new TypeError('Unsupported recovery cause');
    return [...new Set(causes)];
  }

  private executionTask(correlationId: string): PendingTask | undefined {
    const task =
      this.attempts.get(correlationId) ?? this.tasks.get(correlationId);
    if (!task || !this.tasks.has(task.id)) return undefined;
    if (task.recovery && task.executionId !== correlationId) return undefined;
    return task;
  }

  private cancel(
    task: PendingTask,
    status: 'cancelled' | 'timed_out',
    cause?: unknown,
  ): void {
    if (!this.tasks.has(task.id)) return;
    const correlationId = task.executionId ?? task.id;
    const context = {
      taskId: task.id,
      ...(task.snapshot.workerId === undefined
        ? {}
        : { workerId: task.snapshot.workerId }),
      cause,
    };
    const message =
      status === 'cancelled' ? 'Task cancelled' : 'Task deadline exceeded';
    const detail =
      task.cancellation === 'terminate'
        ? '; physical cancellation enabled'
        : '; an active execution may still finish';
    const error =
      status === 'cancelled'
        ? new PjsCancelledError(message + detail, context)
        : new PjsTimeoutError(message + detail, context);
    this.settle(task, status, error);
    if (task.cancellation === 'terminate')
      this.dispatcher.terminateExecution(correlationId);
  }

  private canContinue(task: PendingTask): boolean {
    if (!this.tasks.has(task.id)) return false;
    const recovery = task.recovery;
    if (recovery?.signal?.aborted) {
      this.cancel(task, 'cancelled', recovery.signal.reason);
      return false;
    }
    if (
      recovery?.deadline !== undefined &&
      performance.now() >= recovery.deadline
    ) {
      this.cancel(task, 'timed_out');
      return false;
    }
    if (!this.runtime.dispatchAllowed()) {
      this.settle(
        task,
        'failed',
        new PjsRuntimeStateError(`Runtime is ${this.runtime.state()}`, {
          taskId: task.id,
        }),
      );
      return false;
    }
    return this.tasks.has(task.id);
  }

  private finishFailure(task: PendingTask, error: Error): void {
    const primary = task.recovery?.lastPrimaryError;
    this.settle(
      task,
      'failed',
      task.recovery?.fallbackUsed && primary
        ? new AggregateError(
            [primary, error],
            'Primary and fallback execution failed',
          )
        : error,
    );
  }

  private failedAttempt(
    task: PendingTask,
    error: Error,
    cause: RecoveryCause | undefined,
    ended: boolean,
  ): void {
    if (!task.recovery) {
      this.settle(task, 'failed', error);
      return;
    }
    if (!this.canContinue(task)) return;
    const recovery = task.recovery;
    if (!cause || recovery.fallbackUsed) {
      this.finishFailure(task, error);
      return;
    }
    if (!(
      recovery.on.includes(cause) && recovery.attempts < recovery.maxAttempts
    )) {
      if (!recovery.fallback?.on.includes(cause)) {
        this.finishFailure(task, error);
        return;
      }
      recovery.fallbackUsed = true;
      recovery.lastPrimaryError = error;
      task.snapshot.implementation = recovery.fallback.descriptor.id;
    }
    recovery.pendingFailure = error;
    task.snapshot.status = 'recovering';
    if (ended) this.queueRecovery(task);
  }

  private queueRecovery(task: PendingTask): void {
    if (!this.canContinue(task)) return;
    const recovery = task.recovery!;
    if (task.executionId) this.attempts.delete(task.executionId);
    delete task.executionId;
    delete task.snapshot.executionId;
    delete task.snapshot.workerId;
    delete task.snapshot.scheduledAt;
    delete task.snapshot.startedAt;
    delete recovery.pendingFailure;
    task.attemptQueuedAt = performance.now();
    this.dispatcher.retainRecovery(task);
    const delay = recovery.fallbackUsed ? 0 : recovery.backoffMs;
    if (delay === 0) this.dispatcher.readyRecovery(task.id);
    else {
      const timer = setTimeout(() => {
        if (recovery.timer !== timer || !this.tasks.has(task.id)) return;
        delete recovery.timer;
        if (this.canContinue(task)) this.dispatcher.readyRecovery(task.id);
        this.runtime.requestPump();
      }, delay);
      recovery.timer = timer;
    }
  }

  private resultItem(
    worker: PjsWorker,
    message: TaskResultMessage | BatchItemResult,
  ): void {
    this.metrics.executed(message.executionMs);
    if (message.type === 'failure' && message.kind === 'binaryContract')
      this.resultCredits.recordContractFailure(message.binaryContract?.mode);
    const task = this.executionTask(message.taskId);
    // Late results after cancellation/deadline free the worker without settling twice.
    if (!task) return;
    if (task.recovery && !this.canContinue(task)) return;
    if (message.type === 'success') {
      if (task.resultByteContract) {
        // A deadline may have expired before its timer callback ran. Expire the
        // parent before reconciling a result that can no longer be delivered.
        if (task.child && !this.parents.canSubmit(task.child)) return;
        try {
          this.resultCredits.reconcile(task.id, message.actualResultBytes);
        } catch (error) {
          this.resultCredits.recordContractFailure('upper-bound');
          this.settle(task, 'failed', error as Error);
          return;
        }
      }
      this.settle(task, 'completed', undefined, message.output);
    } else if (message.type === 'completed') this.settle(task, 'completed');
    else {
      const context = { taskId: task.id, workerId: worker.id };
      const error =
        message.kind === 'serialization'
          ? new PjsSerializationError(
              `Task output could not be serialized: ${message.error.message}`,
              { ...context, cause: message.error },
            )
          : message.kind === 'binaryContract'
            ? new PjsBinaryResultContractError(message.error.message, {
                ...context,
                cause: message.error,
                declaredBytes: message.binaryContract!.declaredBytes,
                ...(message.binaryContract!.actualBytes === undefined
                  ? {}
                  : { actualBytes: message.binaryContract!.actualBytes }),
                actualType: message.binaryContract!.actualType,
              })
            : new PjsTaskError(message.error, context);
      this.failedAttempt(
        task,
        error,
        message.kind === 'task' ? 'task-error' : undefined,
        true,
      );
    }
  }

  private releaseTransfers(task: PendingTask): void {
    task.releaseTransfers();
    task.releaseTransfers = () => {};
    task.transferList = [];
  }
}
