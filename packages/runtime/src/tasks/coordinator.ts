import { randomUUID } from 'node:crypto';
import type { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import {
  PjsBinaryResultContractError,
  PjsCancelledError,
  PjsQueueFullError,
  PjsRuntimeStateError,
  PjsSerializationError,
  PjsTaskError,
  PjsTaskRegistrationError,
  PjsTimeoutError,
  type PjsWorkerError,
} from '../errors/index.js';
import { integer } from '../internal/integer.js';
import type { PartitionChild } from '../partition/operation.js';
import type { ResultCreditManager } from '../results/credit.js';
import { Metrics } from '../telemetry/metrics.js';
import { recordInternalProfile } from '../telemetry/profile.js';
import type { RunOptions, RuntimeState, TaskSnapshot } from '../types/index.js';
import type {
  BatchItemResult,
  ExecutionResultMessage,
  TaskResultMessage,
} from '../workers/protocol.js';
import type { PjsWorker } from '../workers/worker.js';
import type { PjsTask, TaskDescriptor } from './registry.js';
import type { PendingTask } from './task.js';
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
      item.input = undefined;
      this.releaseTransfers(item);
    }
  }

  submit<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions,
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
    let executionLease: number | undefined;
    try {
      executionLease = options.executionLease;
      if (executionLease !== undefined) {
        integer('executionLease', executionLease, 1, 2 ** 31 - 1);
        if (child || 'experimentalDispatchBatchSize' in options)
          throw new TypeError(
            'executionLease requires an exclusive ordinary run() dispatch',
          );
      }
    } catch (error) {
      return rejectSubmission(error as Error);
    }
    if (options.timeout !== undefined) {
      try {
        integer('timeout', options.timeout, 1, 2 ** 31 - 1);
      } catch (error) {
        return rejectSubmission(error as Error);
      }
    }
    if (options.signal?.aborted)
      return rejectSubmission(
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
    if (options.signal?.aborted)
      return rejectSubmission(
        new PjsCancelledError('Task was aborted before admission', {
          taskId: id,
          cause: options.signal.reason,
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
        ...(executionLease === undefined ? {} : { executionLease }),
        ...(child ? { child } : {}),
        snapshot: {
          id,
          ...(child ? this.parents.context(child) : {}),
          taskName: descriptor.id,
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
          this.runtime.requestPump();
        }, options.timeout);
      pending.snapshot.status = 'queued';
      pending.snapshot.queuedAt = Date.now();
      this.dispatcher.admit(admission, pending, deferred);
      if (!deferred) this.runtime.requestPump();
    });
  }

  started(worker: PjsWorker, taskId: string): void {
    const task = this.tasks.get(taskId);
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

  failTask(error: PjsWorkerError): void {
    const task = error.taskId ? this.tasks.get(error.taskId) : undefined;
    if (task) this.settle(task, 'failed', error);
  }

  settle(
    task: PendingTask,
    status: TaskTerminalStatus,
    error?: Error,
    output?: unknown,
  ): void {
    if (!this.tasks.delete(task.id)) return;
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

  private resultItem(
    worker: PjsWorker,
    message: TaskResultMessage | BatchItemResult,
  ): void {
    this.metrics.executed(message.executionMs);
    if (message.type === 'failure' && message.kind === 'binaryContract')
      this.resultCredits.recordContractFailure(message.binaryContract?.mode);
    const task = this.tasks.get(message.taskId);
    // Late results after cancellation/deadline free the worker without settling twice.
    if (!task) return;
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
      this.settle(task, 'failed', error);
    }
  }

  private releaseTransfers(task: PendingTask): void {
    task.releaseTransfers();
    task.releaseTransfers = () => {};
    task.transferList = [];
  }
}
