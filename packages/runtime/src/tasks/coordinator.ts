import type { ProgressValue } from '../types/index.js';
import type { TaskServices } from '../hosts/contracts.js';
import type { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import {
  PjsBinaryResultContractError,
  PjsCancelledError,
  PjsExecutionLeaseError,
  PjsError,
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
  RetryOptions,
  RunOptions,
  RuntimeState,
  TaskSnapshot,
  TaskProgress,
} from '../types/index.js';
import type {
  BatchItemResult,
  ExecutionResultMessage,
  TaskResultMessage,
  ProgressMessage,
} from '../workers/protocol.js';
import type { PjsWorker, WorkerFailureReason } from '../workers/worker.js';
import type { PjsTask, TaskDescriptor } from './registry.js';
import type {
  PendingTask,
  TaskRecovery,
  ProgressSubscription,
} from './task.js';
import { reserveTransfers } from './transfer-core.js';

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
  private readonly executions = new Map<string, string[]>();
  private readonly pendingProgress = new Map<
    string,
    {
      worker: PjsWorker;
      message: ProgressMessage;
      value: unknown;
      acknowledge: () => void;
      subscription: ProgressSubscription;
      logicalId: string;
    }
  >();
  private progressTick: (() => void) | undefined;
  progressErrors = 0;

  constructor(
    private readonly registry: ReadonlyMap<object, TaskDescriptor>,
    private readonly dispatcher: ExecutionDispatcher,
    private readonly resultCredits: ResultCreditManager,
    private readonly runtime: TaskRuntimePort,
    private readonly parents: TaskParentPort,
    private readonly host: TaskServices,
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
      if (
        !item.recovery ||
        (item.recovery.rebuildInput && (task.batch?.length ?? 1) === 1) ||
        !this.tasks.has(item.id)
      ) {
        item.input = undefined;
      }
      this.releaseTransfers(item);
    }
  }

  /** Gate each recovery-enabled posting against the original caller lifetime. */
  prepareDispatch(task: PendingTask): boolean {
    const members = task.batch ?? [task];
    for (const task of members) {
      if (!this.tasks.has(task.id) || (task.child && !this.canContinue(task))) {
        return false;
      }
      const recovery = task.recovery;
      if (!recovery) {
        continue;
      }
      if (!this.canContinue(task)) {
        return false;
      }
      if (recovery.attempts > 0 && !recovery.skipped && recovery.rebuildInput) {
        try {
          const prepared = recovery.rebuildInput({
            attempt: recovery.attempts + 1,
            implementation: recovery.fallbackUsed ? 'fallback' : 'primary',
          });
          // Invalid async factories must not leak an unhandled rejection on the host.
          if (this.host.isPromise(prepared)) {
            void prepared.catch(() => {});
            if (!this.canContinue(task)) {
              return false;
            }
            throw new PjsSerializationError(
              'rebuildInput must synchronously return { input, transferList? }',
              { taskId: task.id },
            );
          }
          if (!this.canContinue(task)) {
            return false;
          }
          if (
            !prepared ||
            typeof prepared !== 'object' ||
            !('input' in prepared) ||
            'then' in prepared
          ) {
            throw new PjsSerializationError(
              'rebuildInput must synchronously return { input, transferList? }',
              { taskId: task.id },
            );
          }
          const input = prepared.input;
          if (!this.canContinue(task)) {
            return false;
          }
          const requestedTransfers = prepared.transferList;
          if (!this.canContinue(task)) {
            return false;
          }
          const transferList = this.host.snapshotTransferList(
            requestedTransfers ?? [],
          );
          if (!this.canContinue(task)) {
            return false;
          }
          if (
            task.child &&
            task.child.operation.dispatchBatchSize > 1 &&
            transferList.length > 0
          ) {
            throw new PjsSerializationError(
              'Batched partition dispatch does not accept input transfer lists; use batch size 1',
              { taskId: task.id },
            );
          }
          const release = reserveTransfers(transferList, task.id);
          task.input = input;
          task.transferList = transferList;
          task.releaseTransfers = release;
        } catch (cause) {
          if (this.canContinue(task)) {
            this.finishFailure(
              task,
              cause instanceof PjsSerializationError
                ? cause
                : new PjsError('Recovery input factory failed', {
                    taskId: task.id,
                    cause,
                  }),
            );
          }
          return false;
        }
      }
      const executionId = !recovery.posted ? task.id : this.host.id();
      task.executionId = executionId;
      this.attempts.set(executionId, task);
      recovery.posted = true;
      if (!recovery.fallbackUsed) {
        recovery.attempts++;
      }
      task.snapshot.attempt =
        recovery.attempts + (recovery.fallbackUsed ? 1 : 0);
      task.snapshot.executionId = executionId;
      delete recovery.ready;
      delete recovery.skipped;
    }
    const correlationId =
      members.length > 1
        ? task.recovery
          ? this.host.id()
          : task.id
        : (task.executionId ?? task.id);
    for (const member of members) {
      member.batchLeaderId = correlationId;
    }
    this.executions.set(
      correlationId,
      members.map((member) => member.id),
    );
    return true;
  }

  submit<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    input: Input,
    options:
      | RunOptions<NoInfer<Input>, NoInfer<Output>, NoInfer<Progress>>
      | RunOptions<unknown, never, NoInfer<Progress>>,
    child?: PartitionChild,
    deferred?: PendingTask[],
  ): Promise<Output> {
    const id = this.host.id();
    const rejectSubmission = (error: Error): Promise<Output> => {
      this.metrics.rejected++;
      if (child) {
        this.parents.rejected(child, error);
      }
      return Promise.reject(error);
    };
    if (!this.canSubmit(child)) {
      return rejectSubmission(
        new PjsRuntimeStateError(`Runtime is ${this.runtime.state()}`, {
          taskId: id,
        }),
      );
    }
    const descriptor = this.registry.get(task);
    if (!descriptor) {
      return rejectSubmission(
        new PjsTaskRegistrationError(
          'Task does not belong to this runtime registry snapshot',
          { taskId: id },
        ),
      );
    }
    let recovery: TaskRecovery | undefined;
    let priority = 0;
    let progress: ProgressSubscription | undefined;
    let cancellation: 'terminate' | 'cooperative' | undefined;
    let timeout: number | undefined;
    let signal: AbortSignal | undefined;
    try {
      if ('experimentalDispatchBatchSize' in options) {
        throw new TypeError(
          'experimentalDispatchBatchSize was removed; use dispatchBatchSize',
        );
      }
      const mode = options.cancellation;
      const retry = options.retry;
      const fallback = options.fallback;
      const repeatable = options.repeatable;
      const rebuildInput = options.rebuildInput;
      if (
        rebuildInput !== undefined &&
        (typeof rebuildInput !== 'function' ||
          (retry === undefined && fallback === undefined))
      ) {
        throw new TypeError(
          'rebuildInput requires a function and retry or fallback',
        );
      }
      const controlled = [
        'cancellation',
        'repeatable',
        'retry',
        'fallback',
      ].some((name) => name in options);
      if (controlled && 'dispatchBatchSize' in options) {
        throw new TypeError(
          'Execution resilience requires an exclusive ordinary run() dispatch',
        );
      }
      if (
        mode !== undefined &&
        mode !== 'settle' &&
        mode !== 'terminate' &&
        mode !== 'cooperative'
      ) {
        throw new TypeError(
          'cancellation must be settle, cooperative or terminate',
        );
      }
      if (mode === 'cooperative' && !this.host.sharedMemory) {
        throw new TypeError(
          'Cooperative cancellation requires usable shared memory in page and worker',
        );
      }
      if (mode === 'terminate' || mode === 'cooperative') {
        cancellation = mode;
      }
      recovery = this.createRecovery(
        task,
        retry,
        fallback,
        repeatable,
        rebuildInput,
        { taskId: id },
      );
      if (child?.operation.recovery) {
        recovery = { ...child.operation.recovery };
        const rebuild = child.operation.rebuildInput;
        if (rebuild) {
          recovery.rebuildInput = (next) =>
            child.operation.runInAsyncScope(
              rebuild,
              undefined,
              child.partition,
              next,
            );
        }
      }
      timeout = options.timeout;
      if (timeout !== undefined) {
        integer('timeout', timeout, 1, 2 ** 31 - 1);
      }
      signal = options.signal;
      priority = child
        ? child.operation.priority
        : integer(
            'priority',
            'priority' in options ? (options.priority ?? 0) : 0,
            -(2 ** 31),
            2 ** 31 - 1,
          );
      progress = child
        ? child.operation.progress
        : this.createProgress(
            'onProgress' in options ? options.onProgress : undefined,
          );
      if (recovery && signal) {
        recovery.signal = signal;
      }
    } catch (error) {
      return rejectSubmission(error as Error);
    }
    let executionLease: number | undefined;
    try {
      executionLease = options.executionLease;
      if (executionLease !== undefined) {
        integer('executionLease', executionLease, 1, 2 ** 31 - 1);
        if (child || 'dispatchBatchSize' in options) {
          throw new TypeError(
            'executionLease requires an exclusive ordinary run() dispatch',
          );
        }
      }
    } catch (error) {
      return rejectSubmission(error as Error);
    }
    if (signal?.aborted) {
      return rejectSubmission(
        new PjsCancelledError('Task was already aborted', {
          taskId: id,
          cause: signal.reason,
        }),
      );
    }
    let transferList: ArrayBuffer[];
    try {
      transferList = this.host.snapshotTransferList(
        options.transferList === undefined ? [] : options.transferList,
      );
      if (
        transferList.length > 0 &&
        recovery &&
        (recovery.maxAttempts > 1 || recovery.fallback) &&
        !recovery.rebuildInput
      ) {
        throw new PjsSerializationError(
          'Input transfer lists cannot be combined with retries or fallback',
          { taskId: id },
        );
      }
      if (
        child &&
        child.operation.dispatchBatchSize > 1 &&
        transferList.length > 0
      ) {
        throw new PjsSerializationError(
          'Batched partition dispatch does not accept input transfer lists; use batch size 1',
          { taskId: id },
        );
      }
    } catch (cause) {
      return rejectSubmission(
        new PjsSerializationError(
          cause instanceof Error ? cause.message : 'Invalid transfer list',
          { taskId: id, cause },
        ),
      );
    }
    // Reading an application-provided list may invoke getters/iterators.
    if (!this.canSubmit(child)) {
      return rejectSubmission(
        new PjsRuntimeStateError(`Runtime is ${this.runtime.state()}`, {
          taskId: id,
        }),
      );
    }
    if (signal?.aborted) {
      return rejectSubmission(
        new PjsCancelledError('Task was aborted before admission', {
          taskId: id,
          cause: signal.reason,
        }),
      );
    }
    const admission = this.dispatcher.prepareAdmission(
      deferred !== undefined,
      child !== undefined,
      this.runtime.dispatchAllowed(),
      (child?.operation.cancellation ?? cancellation) === 'terminate' ||
        executionLease !== undefined,
    );
    if (!admission) {
      return rejectSubmission(
        new PjsQueueFullError(
          `Queue capacity ${this.dispatcher.queueCapacity} exhausted`,
          { taskId: id },
        ),
      );
    }

    let releaseTransfers: () => void;
    try {
      releaseTransfers = reserveTransfers(transferList, id);
    } catch (error) {
      return rejectSubmission(error as Error);
    }

    return new Promise<Output>((resolve, reject) => {
      const pending: PendingTask = {
        id,
        priority,
        ...(progress ? { progress } : {}),
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
      if (timeout !== undefined) {
        pending.deadline = pending.admittedAt + timeout;
        if (recovery) {
          recovery.deadline = pending.deadline;
        }
      }
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
      if (child) {
        this.parents.admitted(child, id);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = (): void => {
        this.cancel(pending, 'cancelled', signal?.reason);
        this.runtime.requestPump();
      };
      pending.cleanup = () => {
        if (timer) {
          this.host.clearTimer(timer);
        }
        signal?.removeEventListener('abort', abort);
        // A getter may abort during postMessage. Hold ownership until posting finishes.
        if (
          pending.snapshot.status === 'created' ||
          pending.snapshot.status === 'queued' ||
          pending.snapshot.status === 'recovering'
        ) {
          this.releaseTransfers(pending);
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (timeout !== undefined) {
        timer = this.host.setTimer(() => {
          this.cancel(pending, 'timed_out');
          this.runtime.requestPump();
        }, timeout);
      }
      pending.snapshot.status = 'queued';
      pending.snapshot.queuedAt = Date.now();
      this.dispatcher.admit(admission, pending, deferred);
      if (!deferred) {
        this.runtime.requestPump();
      }
    });
  }

  progress(
    worker: PjsWorker,
    message: ProgressMessage,
    value: unknown,
    acknowledge: () => void,
  ): void {
    const task = this.executionTask(message.taskId);
    const subscription = task?.progress;
    if (
      !task ||
      !subscription?.active ||
      (task.batchLeaderId ?? task.executionId ?? task.id) !==
        message.correlationId
    ) {
      acknowledge();
      return;
    }
    this.pendingProgress.set(message.correlationId, {
      worker,
      message,
      value,
      acknowledge,
      subscription,
      logicalId: task.id,
    });
    this.scheduleProgress();
  }

  private scheduleProgress(): void {
    if (this.progressTick || !this.pendingProgress.size) {
      return;
    }
    this.progressTick = this.host.defer(() => {
      this.progressTick = undefined;
      for (let count = 0; count < 64; count++) {
        const entry = this.pendingProgress.values().next().value;
        if (!entry) {
          break;
        }
        this.pendingProgress.delete(entry.message.correlationId);
        const { worker, message, subscription, acknowledge } = entry;
        try {
          const task = this.executionTask(message.taskId);
          if (
            !task ||
            !subscription.active ||
            task.progress !== subscription ||
            (task.batchLeaderId ?? task.executionId ?? task.id) !==
              message.correlationId
          ) {
            continue;
          }
          if (task.child && !this.parents.canSubmit(task.child)) {
            continue;
          }
          if (
            task.deadline !== undefined &&
            performance.now() >= task.deadline
          ) {
            this.cancel(task, 'timed_out');
            this.runtime.requestPump();
            continue;
          }
          const event: TaskProgress<unknown> = Object.freeze({
            value: entry.value,
            taskId: task.id,
            taskName: task.snapshot.taskName,
            executionId: message.taskId,
            correlationId: message.correlationId,
            implementation:
              task.snapshot.implementation ?? task.snapshot.taskName,
            attempt: task.snapshot.attempt ?? 1,
            sequence: message.sequence,
            workerId: worker.id,
            ...(task.child
              ? {
                  operationId: task.child.operation.id,
                  partitionIndex: task.child.partition.index,
                }
              : {}),
          });
          try {
            const result: unknown = subscription.callback(event);
            if (
              result &&
              (typeof result === 'object' || typeof result === 'function') &&
              'then' in result &&
              typeof result.then === 'function'
            ) {
              void Promise.resolve(result).catch(() => {});
              throw new TypeError('onProgress must be synchronous');
            }
          } catch {
            this.progressErrors++;
            this.disableProgress(subscription);
          }
        } finally {
          acknowledge();
        }
      }
      this.scheduleProgress();
    });
  }

  private disableProgress(subscription: ProgressSubscription): void {
    subscription.active = false;
    for (const task of this.tasks.values()) {
      if (task.progress === subscription) {
        this.dispatcher.closeProgress(
          task.batchLeaderId ?? task.executionId ?? task.id,
        );
      }
    }
    for (const [id, entry] of this.pendingProgress) {
      if (entry.subscription === subscription) {
        this.pendingProgress.delete(id);
        entry.acknowledge();
      }
    }
    this.clearProgressTick();
  }

  private discardProgress(task: PendingTask): void {
    this.dispatcher.closeProgress(
      task.batchLeaderId ?? task.executionId ?? task.id,
    );
    for (const [id, entry] of this.pendingProgress) {
      if (entry.logicalId === task.id) {
        this.pendingProgress.delete(id);
        entry.acknowledge();
      }
    }
    this.clearProgressTick();
  }

  private clearProgressTick(): void {
    if (!this.pendingProgress.size && this.progressTick) {
      this.progressTick();
      this.progressTick = undefined;
    }
  }

  started(worker: PjsWorker, taskId: string): void {
    const single = this.executionTask(taskId);
    for (const id of this.executions.get(taskId) ??
      (single ? [single.id] : [])) {
      const task = this.tasks.get(id);
      if (!task) {
        continue;
      }
      task.snapshot.status = 'running';
      task.snapshot.startedAt = Date.now();
      task.snapshot.workerId = worker.id;
    }
  }

  result(worker: PjsWorker, message: ExecutionResultMessage): void {
    const profileStarted = message.profile ? performance.now() : 0;
    const correlationId =
      message.type === 'batchResult' ? message.batchId : message.taskId;
    if (message.type === 'batchResult') {
      for (const item of message.items) {
        this.resultItem(worker, item);
      }
      // Only a task-failure suffix proves these functions were never invoked.
      const failure = message.items.at(-1);
      if (failure?.type === 'failure' && failure.kind === 'task') {
        for (const id of message.skippedTaskIds) {
          const task = this.executionTask(id);
          if (!task?.recovery || !this.canContinue(task)) {
            continue;
          }
          task.recovery.attempts--;
          task.recovery.skipped = true;
          task.snapshot.status = 'recovering';
          this.queueRecovery(task, 0);
        }
      }
    } else {
      this.resultItem(worker, message);
    }
    this.executions.delete(correlationId);
    if (profileStarted) {
      recordInternalProfile(
        'hostResultSettlement',
        performance.now() - profileStarted,
      );
    }
    this.runtime.requestPump();
  }

  failTask(error: PjsWorkerError, reason?: WorkerFailureReason): void {
    const members = error.taskId
      ? this.executions.get(error.taskId)
      : undefined;
    const single = error.taskId ? this.executionTask(error.taskId) : undefined;
    for (const id of members ?? (single ? [single.id] : [])) {
      const task = this.tasks.get(id);
      if (!task) {
        continue;
      }
      this.discardProgress(task);
      const context = {
        taskId: task.id,
        ...(error.workerId === undefined ? {} : { workerId: error.workerId }),
        cause: error.cause,
      };
      const logical =
        error.taskId === task.id
          ? error
          : error instanceof PjsExecutionLeaseError
            ? new PjsExecutionLeaseError(error.message, context)
            : new PjsWorkerError(error.message, context);
      this.failedAttempt(
        task,
        logical,
        reason === 'worker-crash' || reason === 'execution-lease'
          ? reason
          : undefined,
        false,
      );
    }
  }

  revoked(correlationId: string): void {
    if (this.host.lifecycle !== 'endpoint-revocation') {
      throw new Error('Node cannot revoke attempts');
    }
    const members = new Set(this.executions.get(correlationId) ?? []);
    for (const id of members) {
      if (this.tasks.has(id)) {
        throw new Error('Cannot abandon a nonterminal caller');
      }
    }
    this.executions.delete(correlationId);
    for (const [id, task] of this.attempts) {
      if (members.has(task.id)) {
        this.attempts.delete(id);
      }
    }
  }

  exited(correlationId: string): void {
    const members = this.executions.get(correlationId);
    this.executions.delete(correlationId);
    for (const id of members ?? []) {
      const task = this.tasks.get(id);
      if (task?.recovery?.pendingFailure) {
        this.queueRecovery(task);
      }
    }
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
    this.executions.delete(task.batchLeaderId ?? task.executionId ?? task.id);
    for (const member of task.batch ?? [task]) {
      if (this.tasks.has(member.id)) {
        this.finishFailure(member, logical);
      }
    }
  }

  settle(
    task: PendingTask,
    status: TaskTerminalStatus,
    error?: Error,
    output?: unknown,
  ): void {
    if (!this.tasks.delete(task.id)) {
      return;
    }
    this.discardProgress(task);
    if (!task.child && task.progress) {
      task.progress.active = false;
    }
    if (task.executionId) {
      this.attempts.delete(task.executionId);
    }
    const recovery = task.recovery;
    if (recovery) {
      if (recovery.timer) {
        this.host.clearTimer(recovery.timer);
      }
      delete recovery.timer;
      delete recovery.pendingFailure;
      delete recovery.lastPrimaryError;
    }
    if (status !== 'completed' || error) {
      this.resultCredits.markCallerSettled(task.id);
    }
    this.dispatcher.remove(task.id);
    task.cleanup();
    task.input = undefined;
    task.snapshot.status = status;
    task.snapshot.completedAt = Date.now();
    this.metrics.settled(performance.now() - task.admittedAt);
    if (status === 'timed_out') {
      this.metrics.timedOut++;
    } else {
      this.metrics[status]++;
    }
    if (error) {
      task.reject(error);
    } else {
      task.resolve(output);
    }
    if (task.child) {
      this.parents.settled(task, status, error, output);
    }
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
    if (child && !this.parents.canSubmit(child)) {
      return false;
    }
    return this.runtime.canAccept(child !== undefined);
  }

  createProgress(callback: unknown): ProgressSubscription | undefined {
    if (callback === undefined) {
      return undefined;
    }
    if (typeof callback !== 'function') {
      throw new TypeError('onProgress must be a function');
    }
    return {
      active: true,
      callback: callback as ProgressSubscription['callback'],
    };
  }

  createRecovery(
    task: object,
    retry: RetryOptions | undefined,
    fallback: { task: object; on?: readonly RecoveryCause[] } | undefined,
    repeatable: unknown,
    rebuildInput: TaskRecovery['rebuildInput'],
    context: { taskId?: string; operationId?: string },
  ): TaskRecovery | undefined {
    const policy = this.host.recovery;
    if (policy.mode === 'limited') {
      if (
        retry !== undefined &&
        this.recoveryCauses(retry.on, ['worker-crash']).some(
          (cause) => !policy.causes.includes(cause),
        )
      ) {
        throw new TypeError(policy.retryError);
      }
      if (
        fallback !== undefined &&
        this.recoveryCauses(fallback.on, ['task-error']).some(
          (cause) => !policy.causes.includes(cause),
        )
      ) {
        throw new TypeError(policy.fallbackError);
      }
    }
    const descriptor = this.registry.get(task);
    let recovery: TaskRecovery | undefined;
    if (repeatable !== undefined && repeatable !== true) {
      throw new TypeError('repeatable must be true');
    }
    if (retry !== undefined || fallback !== undefined) {
      if (repeatable !== true) {
        throw new TypeError('retry and fallback require repeatable: true');
      }
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
        ...(rebuildInput ? { rebuildInput } : {}),
        maxAttempts,
        backoffMs,
        on: this.recoveryCauses(retry?.on, ['worker-crash']),
        attempts: 0,
        fallbackUsed: false,
      };
      if (fallback !== undefined) {
        const alternative = this.registry.get(fallback.task);
        if (!alternative || alternative === descriptor) {
          throw new PjsTaskRegistrationError(
            'Fallback must be a different task in this runtime registry snapshot',
            context,
          );
        }
        recovery.fallback = {
          descriptor: alternative,
          on: this.recoveryCauses(fallback.on, ['task-error']),
        };
      }
    }
    return recovery;
  }

  private recoveryCauses(
    value: readonly RecoveryCause[] | undefined,
    defaults: RecoveryCause[],
  ): readonly RecoveryCause[] {
    if (value === undefined) {
      return defaults;
    }
    if (!Array.isArray(value) || value.length === 0) {
      throw new TypeError(
        'Recovery on must be a nonempty array of supported causes',
      );
    }
    const causes = Array.from(value);
    if (
      causes.some(
        (cause) =>
          !['worker-crash', 'execution-lease', 'task-error'].includes(cause),
      )
    ) {
      throw new TypeError('Unsupported recovery cause');
    }
    return [...new Set(causes)];
  }

  private executionTask(correlationId: string): PendingTask | undefined {
    const task =
      this.attempts.get(correlationId) ?? this.tasks.get(correlationId);
    if (!task || !this.tasks.has(task.id)) {
      return undefined;
    }
    if (task.recovery && task.executionId !== correlationId) {
      return undefined;
    }
    return task;
  }

  private cancel(
    task: PendingTask,
    status: 'cancelled' | 'timed_out',
    cause?: unknown,
  ): void {
    if (!this.tasks.has(task.id)) {
      return;
    }
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
        : task.cancellation === 'cooperative'
          ? '; cooperative cancellation requested'
          : '; an active execution may still finish';
    const error =
      status === 'cancelled'
        ? new PjsCancelledError(message + detail, context)
        : new PjsTimeoutError(message + detail, context);
    this.settle(task, status, error);
    if (task.cancellation === 'terminate') {
      this.dispatcher.terminateExecution(correlationId);
    } else if (task.cancellation === 'cooperative') {
      this.dispatcher.cooperateExecution(correlationId);
    }
  }

  private canContinue(task: PendingTask): boolean {
    if (!this.tasks.has(task.id)) {
      return false;
    }
    if (task.child && !this.parents.canSubmit(task.child)) {
      return false;
    }
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
    if (!this.canContinue(task)) {
      return;
    }
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
    if (ended) {
      this.queueRecovery(task);
    }
  }

  private queueRecovery(task: PendingTask, overrideDelay?: number): void {
    if (!this.canContinue(task)) {
      return;
    }
    const recovery = task.recovery!;
    if (task.executionId) {
      this.attempts.delete(task.executionId);
    }
    delete task.executionId;
    delete task.snapshot.executionId;
    delete task.snapshot.workerId;
    delete task.snapshot.scheduledAt;
    delete task.snapshot.startedAt;
    delete recovery.pendingFailure;
    task.attemptQueuedAt = performance.now();
    delete task.batch;
    delete task.batchLeaderId;
    if (!task.child) {
      this.dispatcher.retainRecovery(task);
    }
    const ready = () => {
      if (task.child) {
        recovery.ready = true;
      } else {
        this.dispatcher.readyRecovery(task.id);
      }
    };
    const delay =
      overrideDelay ?? (recovery.fallbackUsed ? 0 : recovery.backoffMs);
    if (delay === 0) {
      ready();
    } else {
      const timer = this.host.setTimer(() => {
        if (recovery.timer !== timer || !this.tasks.has(task.id)) {
          return;
        }
        delete recovery.timer;
        if (this.canContinue(task)) {
          ready();
        }
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
    if (message.type === 'failure' && message.kind === 'binaryContract') {
      this.resultCredits.recordContractFailure(message.binaryContract?.mode);
    }
    const task = this.executionTask(message.taskId);
    // Late results after cancellation/deadline free the worker without settling twice.
    if (!task) {
      return;
    }
    if (task.recovery && !this.canContinue(task)) {
      return;
    }
    if (message.type === 'success') {
      if (task.resultByteContract) {
        // A deadline may have expired before its timer callback ran. Expire the
        // parent before reconciling a result that can no longer be delivered.
        if (task.child && !this.parents.canSubmit(task.child)) {
          return;
        }
        try {
          this.resultCredits.reconcile(task.id, message.actualResultBytes);
        } catch (error) {
          this.resultCredits.recordContractFailure('upper-bound');
          this.settle(task, 'failed', error as Error);
          return;
        }
      }
      this.settle(task, 'completed', undefined, message.output);
    } else if (message.type === 'completed') {
      this.settle(task, 'completed');
    } else if (message.type === 'cancelled') {
      this.cancel(task, 'cancelled');
    } else {
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
