import type {
  WorkerServices,
  WorkerConnection,
  WorkerThread,
} from '../hosts/contracts.js';
import {
  PjsExecutionLeaseError,
  PjsSerializationError,
  PjsWorkerError,
} from '../errors/index.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import {
  internalProfilingEnabled,
  recordInternalProfile,
} from '../telemetry/profile.js';
import type { WorkerResourceLimits, WorkerState } from '../types/index.js';
import type { ProgressControl } from './progress.js';
import { encodeProgress, MAX_PROGRESS_BYTES, utf8Bytes } from './progress.js';
import { isWorkerMessage } from './protocol.js';
import type {
  BatchInput,
  BootstrapData,
  ExecutionResultMessage,
  HostMessage,
  ProgressMessage,
  UpperBoundResultByteContract,
} from './protocol.js';

export type WorkerFailureReason =
  'worker-crash' | 'execution-lease' | 'protocol' | 'bootstrap';

export interface WorkerCallbacks {
  ready(worker: PjsWorker): void;
  started(worker: PjsWorker, taskId: string): void;
  result(worker: PjsWorker, message: ExecutionResultMessage): void;
  failed(
    worker: PjsWorker,
    error: PjsWorkerError,
    wasStarting: boolean,
    reason: WorkerFailureReason,
  ): void;
  exited(worker: PjsWorker, correlationIds: readonly string[]): void;
  progress?(
    worker: PjsWorker,
    message: ProgressMessage,
    value: unknown,
    acknowledge: () => void,
  ): void;
  leaseTerminationRequested?(worker: PjsWorker): void;
  postingQuiescent?(worker: PjsWorker): Promise<void>;
  revoked?(worker: PjsWorker, correlations: readonly string[]): void;
}

interface ExecutionLease {
  readonly correlationId: string;
  readonly deadline: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export class PjsWorker {
  readonly ready: Promise<void>;
  private readonly thread: WorkerThread;
  private readonly connection: WorkerConnection;
  private readonly state: WorkerState & {
    currentTaskIds: string[];
    exclusive: boolean;
  };
  private readonly startupTimer: ReturnType<typeof setTimeout>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private stopPromise: Promise<void> | undefined;
  private readonly executions = new Map<
    string,
    {
      phase: 'scheduled' | 'running';
      posted: boolean;
      itemIds: string[];
      cancellation?: Int32Array<SharedArrayBuffer>;
      exclusive: boolean;
      progress?: {
        control: ProgressControl;
        closeSent: boolean;
        sequences: Map<string, number>;
        pending: boolean;
      };
    }
  >();
  private exitObserved = false;
  private lease: ExecutionLease | undefined;
  leaseExpired = false;

  constructor(
    readonly id: number,
    tasks: TaskDescriptor[],
    startupTimeout: number,
    private readonly callbacks: WorkerCallbacks,
    private readonly services: WorkerServices,
    resourceLimits?: WorkerResourceLimits,
    readonly concurrency = 1,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // A replacement can fail before the pool attaches a readiness waiter.
    void this.ready.catch(() => {});
    this.connection = services.create(
      { version: 2, tasks, concurrency } satisfies BootstrapData,
      resourceLimits,
    );
    this.thread = this.connection.thread;
    this.state = {
      id,
      ...(this.thread.threadId === undefined
        ? {}
        : { threadId: this.thread.threadId }),
      status: 'starting',
      concurrency,
      currentTaskIds: [],
      exclusive: false,
      draining: false,
      completedTasks: 0,
      failedTasks: 0,
      totalExecutionTimeMs: 0,
    } as typeof this.state;
    this.startupTimer = setTimeout(
      () => this.fail('Worker startup deadline exceeded'),
      startupTimeout,
    );
    this.connection.listen({
      message: (message) => this.receive(message),
      messageError: (cause) =>
        this.fail('Worker message could not be deserialized', cause),
      error: (cause) =>
        this.fail(
          `Worker error: ${cause.message}`,
          cause,
          undefined,
          'worker-crash',
        ),
      exit: (code) => this.exited(code),
    });
  }

  snapshot(): WorkerState {
    return { ...this.state, currentTaskIds: [...this.executions.keys()] };
  }

  /** Internal hot-path state check; public snapshots remain defensive copies. */
  get status(): WorkerState['status'] {
    return this.state.status;
  }

  /** Failure and termination intent do not end an occupied physical slot. */
  get hasPhysicalExecution(): boolean {
    return this.executions.size > 0;
  }

  /** Existing internal inspection hooks remain useful for default single execution. */
  get executionPhase(): 'none' | 'scheduled' | 'running' {
    return this.executions.values().next().value?.phase ?? 'none';
  }
  get currentTaskIds(): string[] {
    return [...this.executions.values()].flatMap((entry) => entry.itemIds);
  }
  get activeExecutions(): number {
    return this.executions.size;
  }
  get exclusive(): boolean {
    return this.state.exclusive;
  }
  get availableSlots(): number {
    return (this.status === 'idle' || this.status === 'busy') && !this.exclusive
      ? this.concurrency - this.executions.size
      : 0;
  }
  correlations(): string[] {
    return [...this.executions.keys()];
  }
  owns(correlationId: string): boolean {
    return this.executions.has(correlationId);
  }
  canExecute(exclusive = false): boolean {
    return (
      this.availableSlots > 0 && (!exclusive || this.executions.size === 0)
    );
  }
  private refreshOccupancy(): void {
    this.state.currentTaskIds = this.correlations();
    if (this.executions.size === 1)
      this.state.currentTaskId = this.state.currentTaskIds[0]!;
    else delete this.state.currentTaskId;
    this.state.exclusive = [...this.executions.values()].some(
      (entry) => entry.exclusive,
    );
    if (this.status === 'idle' || this.status === 'busy')
      this.state.status = this.executions.size ? 'busy' : 'idle';
  }
  private begin(
    correlationId: string,
    itemIds: string[],
    cancellation: Int32Array<SharedArrayBuffer> | undefined,
    exclusive: boolean,
    progress?: ProgressControl,
  ): void {
    if (!this.canExecute(exclusive) || this.executions.has(correlationId))
      throw new PjsWorkerError('Worker has no compatible execution slot', {
        taskId: correlationId,
        workerId: this.id,
      });
    this.executions.set(correlationId, {
      phase: 'scheduled',
      posted: false,
      itemIds,
      exclusive,
      ...(cancellation ? { cancellation } : {}),
      ...(progress
        ? {
            progress: {
              control: progress,
              closeSent: false,
              sequences: new Map(),
              pending: false,
            },
          }
        : {}),
    });
    this.refreshOccupancy();
  }

  /** Called only after successful posting and the dispatcher credit claim. */
  armExecutionLease(correlationId: string, duration: number): void {
    if (this.state.status !== 'busy' || !this.executions.has(correlationId))
      return; // Reentrant shutdown during posting has already initiated containment.
    if (this.executions.size !== 1 || (!this.exclusive && this.concurrency > 1))
      throw new PjsWorkerError('Execution leases require exclusive placement');
    const lease: ExecutionLease = {
      correlationId,
      deadline: this.monotonicNow() + duration,
      timer: undefined,
    };
    this.lease = lease;
    lease.timer = this.scheduleLeaseTimer(
      () => this.expireLease(lease),
      duration,
    );
  }

  private monotonicNow(): number {
    return performance.now();
  }

  private scheduleLeaseTimer(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(callback, delay);
  }

  private cancelLeaseTimer(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer);
  }

  private clearLease(): void {
    const lease = this.lease;
    this.lease = undefined;
    if (lease?.timer !== undefined) this.cancelLeaseTimer(lease.timer);
  }

  private expireLease(lease: ExecutionLease): void {
    if (
      this.lease !== lease ||
      this.state.status !== 'busy' ||
      !this.executions.has(lease.correlationId)
    )
      return;
    const remaining = lease.deadline - this.monotonicNow();
    if (remaining > 0) {
      lease.timer = this.scheduleLeaseTimer(
        () => this.expireLease(lease),
        remaining,
      );
      return;
    }
    this.leaseExpired = true;
    this.fail(
      'Physical execution lease expired',
      undefined,
      new PjsExecutionLeaseError('Physical execution lease expired', {
        workerId: this.id,
        taskId: lease.correlationId,
      }),
    );
  }

  execute(
    taskId: string,
    taskName: string,
    input: unknown,
    transferList: readonly ArrayBuffer[] = [],
    profile = false,
    completionOnly = false,
    expectedResultBytes?: number,
    resultByteContract?: UpperBoundResultByteContract,
    cancellation?: Int32Array<SharedArrayBuffer>,
    exclusive = false,
    progress?: ProgressControl,
  ): void {
    if (!this.canExecute(exclusive))
      throw new PjsWorkerError('Worker is not idle', {
        taskId,
        workerId: this.id,
      });
    this.begin(taskId, [], cancellation, exclusive, progress);
    try {
      this.services.validateTransferList(transferList);
      const postStarted = profile ? performance.now() : 0;
      if (profile)
        this.thread.postMessage(
          {
            type: 'execute',
            exclusive,
            ...(progress
              ? progress.flag
                ? { progressBuffer: progress.flag.buffer }
                : { progressMode: 'message' as const }
              : {}),
            ...(cancellation
              ? { cancellationBuffer: cancellation.buffer }
              : {}),
            taskId,
            taskName,
            input,
            profile: true,
            ...(completionOnly ? { completionOnly: true } : {}),
            ...(expectedResultBytes === undefined
              ? {}
              : { expectedResultBytes }),
            ...(resultByteContract === undefined ? {} : { resultByteContract }),
          } satisfies HostMessage,
          transferList,
        );
      else
        this.thread.postMessage(
          {
            type: 'execute',
            exclusive,
            ...(progress
              ? progress.flag
                ? { progressBuffer: progress.flag.buffer }
                : { progressMode: 'message' as const }
              : {}),
            ...(cancellation
              ? { cancellationBuffer: cancellation.buffer }
              : {}),
            taskId,
            taskName,
            input,
            ...(completionOnly ? { completionOnly: true } : {}),
            ...(expectedResultBytes === undefined
              ? {}
              : { expectedResultBytes }),
            ...(resultByteContract === undefined ? {} : { resultByteContract }),
          } satisfies HostMessage,
          transferList,
        );
      this.markPosted(taskId);
      if (profile)
        recordInternalProfile(
          'hostPostMessage',
          performance.now() - postStarted,
        );
    } catch (cause) {
      this.closeProgress(taskId);
      this.executions.delete(taskId);
      this.refreshOccupancy();
      throw new PjsSerializationError(
        `Task input could not be serialized: ${cause instanceof Error ? cause.message : 'unknown cause'}`,
        {
          taskId,
          workerId: this.id,
          cause,
        },
      );
    }
  }

  executeBatch(
    batchId: string,
    taskName: string,
    items: BatchInput[],
    completionOnly = false,
    cancellation?: Int32Array<SharedArrayBuffer>,
    exclusive = false,
    progress?: ProgressControl,
  ): void {
    if (!this.canExecute(exclusive))
      throw new PjsWorkerError('Worker is not idle', {
        taskId: batchId,
        workerId: this.id,
      });
    if (items.length < 2)
      throw new PjsWorkerError('A physical batch requires multiple items', {
        taskId: batchId,
        workerId: this.id,
      });
    this.begin(
      batchId,
      items.map((item) => item.taskId),
      cancellation,
      exclusive,
      progress,
    );
    try {
      const profile =
        this.services.kind === 'node' && internalProfilingEnabled();
      const postStarted = profile ? performance.now() : 0;
      this.thread.postMessage({
        type: 'executeBatch',
        exclusive,
        ...(progress
          ? progress.flag
            ? { progressBuffer: progress.flag.buffer }
            : { progressMode: 'message' as const }
          : {}),
        ...(cancellation ? { cancellationBuffer: cancellation.buffer } : {}),
        batchId,
        taskName,
        items,
        ...(profile ? { profile: true } : {}),
        ...(completionOnly ? { completionOnly: true } : {}),
      } satisfies HostMessage);
      this.markPosted(batchId);
      if (profile)
        recordInternalProfile(
          'hostPostMessage',
          performance.now() - postStarted,
        );
    } catch (cause) {
      this.closeProgress(batchId);
      this.executions.delete(batchId);
      this.refreshOccupancy();
      throw new PjsSerializationError(
        `Batch input could not be serialized: ${cause instanceof Error ? cause.message : 'unknown cause'}`,
        { taskId: batchId, workerId: this.id, cause },
      );
    }
  }

  private markPosted(correlationId: string): void {
    const execution = this.executions.get(correlationId);
    if (!execution) return;
    execution.posted = true;
    if (execution.progress?.control.closed) this.closeProgress(correlationId);
  }

  closeProgress(correlationId: string): void {
    const execution = this.executions.get(correlationId);
    const progress = execution?.progress;
    if (!progress || !execution) return;
    progress.control.closed = true;
    if (progress.control.flag) Atomics.store(progress.control.flag, 0, -1);
    else if (execution.posted && !progress.closeSent) {
      progress.closeSent = true;
      try {
        this.thread.postMessage({
          type: 'progressClose',
          correlationId,
        } satisfies HostMessage);
      } catch {
        /* Retirement/serialization cleanup already owns failure. */
      }
    }
  }
  private receiveProgress(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const raw = value as Partial<ProgressMessage>;
    const execution =
      typeof raw.correlationId === 'string'
        ? this.executions.get(raw.correlationId)
        : undefined;
    const progress = execution?.progress;
    if (
      !progress ||
      !execution ||
      progress.control.closed ||
      (progress.control.flag && Atomics.load(progress.control.flag, 0) < 0)
    )
      return;
    try {
      if (
        !isWorkerMessage(value) ||
        value.type !== 'progress' ||
        execution.phase !== 'running' ||
        progress.pending ||
        (progress.control.flag &&
          Atomics.load(progress.control.flag, 0) !== 0) ||
        !Number.isSafeInteger(value.sequence) ||
        (execution.itemIds.length
          ? !execution.itemIds.includes(value.taskId)
          : value.taskId !== value.correlationId) ||
        value.sequence <= (progress.sequences.get(value.taskId) ?? 0) ||
        utf8Bytes(value.payload) > MAX_PROGRESS_BYTES
      )
        throw new Error('Invalid progress frame');
      const decoded: unknown = JSON.parse(value.payload);
      if (encodeProgress(decoded) === undefined)
        throw new Error('Invalid progress payload');
      progress.sequences.set(value.taskId, value.sequence);
      progress.pending = true;
      let acknowledged = false;
      const acknowledge = () => {
        if (acknowledged) return;
        acknowledged = true;
        progress.pending = false;
        if (
          this.executions.get(value.correlationId) !== execution ||
          progress.control.closed
        )
          return;
        const flag = progress.control.flag;
        if (flag) {
          if (Atomics.compareExchange(flag, 0, 0, 1) !== 0) return;
          // CPU polling can consume the permit before the control turn; latch wakeups.
          if (Atomics.compareExchange(flag, 1, 0, 1) !== 0) return;
        }
        try {
          this.thread.postMessage({
            type: 'progressAck',
            correlationId: value.correlationId,
            ...(!flag
              ? { taskId: value.taskId, sequence: value.sequence }
              : {}),
          } satisfies HostMessage);
        } catch {
          this.closeProgress(value.correlationId);
        }
      };
      if (this.callbacks.progress)
        this.callbacks.progress(this, value, decoded, acknowledge);
      else acknowledge();
    } catch {
      if (raw.correlationId) this.closeProgress(raw.correlationId);
    }
  }

  requestCancellation(correlationId: string): void {
    const cancellation = this.executions.get(correlationId)?.cancellation;
    if (!cancellation) return;
    Atomics.store(cancellation, 0, 1);
    try {
      this.thread.postMessage({
        type: 'cancel',
        correlationId,
      } satisfies HostMessage);
    } catch (cause) {
      this.fail('Could not notify cooperative cancellation', cause);
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    clearTimeout(this.startupTimer);
    this.clearLease();
    this.rejectReady(
      new PjsWorkerError('Worker stopped before ready', { workerId: this.id }),
    );
    if (this.services.kind === 'node' && this.state.status === 'idle')
      this.thread.postMessage({ type: 'shutdown' } satisfies HostMessage);
    for (const id of this.executions.keys()) this.closeProgress(id);
    this.state.status = 'stopped';
    if (this.leaseExpired) this.callbacks.leaseTerminationRequested?.(this);
    if (this.services.kind === 'browser') {
      // This promise confirms local posting/retirement only, never native exit.
      this.stopPromise = Promise.resolve().then(async () => {
        if (!this.callbacks.postingQuiescent || !this.callbacks.revoked)
          throw new Error('Browser retirement requires dispatcher ownership');
        await this.callbacks.postingQuiescent(this);
        this.thread.terminate(); // A throwing native terminate leaves claims intact.
        const correlations = this.correlations();
        this.connection.detach();
        this.callbacks.revoked(this, correlations);
        this.executions.clear();
        this.refreshOccupancy();
      });
    } else {
      this.stopPromise = this.terminateThread().then(() => {
        this.connection.detach();
      });
    }
    return this.stopPromise;
  }

  /** Internal Node boundary; tests can delay termination on one worker instance. */
  private terminateThread(): Promise<number> {
    return this.thread.terminate() as Promise<number>;
  }

  private exited(code: number): void {
    if (this.exitObserved) return;
    this.exitObserved = true;
    this.clearLease();
    const correlationIds = this.correlations();
    // A direct exit reports logical failure before releasing physical ownership.
    if (this.state.status !== 'stopped' && this.state.status !== 'failed')
      this.fail(
        `Worker unexpectedly exited with code ${code}`,
        undefined,
        undefined,
        'worker-crash',
      );
    this.executions.clear();
    this.refreshOccupancy();
    this.callbacks.exited(this, correlationIds);
  }

  private receive(value: unknown): void {
    if (this.state.status === 'failed' || this.state.status === 'stopped')
      return;
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'progress'
    ) {
      this.receiveProgress(value);
      return;
    }
    if (!isWorkerMessage(value)) {
      this.fail('Invalid worker protocol message');
      return;
    }
    if (value.type === 'progress') return;
    if (value.type === 'bootstrapFailure') {
      this.fail(`Worker bootstrap failed: ${value.error.message}`, value.error);
      return;
    }
    if (value.type === 'workerFailure') {
      this.fail(
        'Worker error: ' + value.error.message,
        value.error,
        undefined,
        this.services.kind === 'browser' ? 'worker-crash' : 'protocol',
      );
      return;
    }
    if (value.type === 'ready') {
      if (this.state.status !== 'starting') {
        this.fail('Duplicate worker readiness');
        return;
      }
      clearTimeout(this.startupTimer);
      this.state.status = 'idle';
      this.resolveReady();
      this.callbacks.ready(this);
      return;
    }
    const correlationId =
      value.type === 'batchResult' ? value.batchId : value.taskId;
    if (this.state.status !== 'busy' || !this.executions.has(correlationId)) {
      this.fail(`Unexpected task message for ${correlationId}`);
      return;
    }
    const execution = this.executions.get(correlationId)!;
    if (value.type === 'started') {
      if (execution.phase !== 'scheduled') {
        this.fail('Duplicate task start');
        return;
      }
      execution.phase = 'running';
      this.callbacks.started(this, value.taskId);
      return;
    }
    if (execution.phase !== 'running') {
      this.fail('Task result arrived before start');
      return;
    }
    if (execution.itemIds.length > 0 !== (value.type === 'batchResult')) {
      this.fail('Unexpected final response kind for physical execution');
      return;
    }
    if (value.type === 'batchResult') {
      const ids = [
        ...value.items.map((item) => item.taskId),
        ...value.skippedTaskIds,
      ];
      const failureIndex = value.items.findIndex(
        (item) => item.type === 'failure' || item.type === 'cancelled',
      );
      if (
        ids.length !== execution.itemIds.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id, index) => id !== execution.itemIds[index]) ||
        value.items.filter(
          (item) => item.type === 'failure' || item.type === 'cancelled',
        ).length > 1 ||
        (failureIndex >= 0 && failureIndex !== value.items.length - 1) ||
        (value.skippedTaskIds.length > 0 && failureIndex < 0)
      ) {
        this.fail('Invalid logical task correlation in batch result');
        return;
      }
    }
    const hasCancellation =
      value.type === 'cancelled' ||
      (value.type === 'batchResult' &&
        value.items.some((item) => item.type === 'cancelled'));
    if (
      hasCancellation &&
      (!execution.cancellation || Atomics.load(execution.cancellation, 0) === 0)
    ) {
      this.fail('Unrequested cooperative cancellation result');
      return;
    }
    if (this.lease?.correlationId === correlationId) this.clearLease();
    this.closeProgress(correlationId);
    this.executions.delete(correlationId);
    this.refreshOccupancy();
    if (value.type === 'batchResult') {
      this.state.completedTasks += value.items.filter(
        (item) => item.type === 'success' || item.type === 'completed',
      ).length;
      this.state.failedTasks += value.items.filter(
        (item) => item.type === 'failure',
      ).length;
      this.state.totalExecutionTimeMs += value.items.reduce(
        (total, item) => total + item.executionMs,
        0,
      );
    } else {
      if (value.type === 'success' || value.type === 'completed')
        this.state.completedTasks++;
      else if (value.type === 'failure') this.state.failedTasks++;
      this.state.totalExecutionTimeMs += value.executionMs;
    }
    if (value.profile && this.services.kind !== 'node') {
      this.fail('Worker profiling is unsupported on this host');
      return;
    }
    if (value.profile) {
      recordInternalProfile('workerIngress', value.profile.workerIngressMs);
      recordInternalProfile(
        'workerOutputPreparation',
        value.profile.outputPreparationMs,
      );
      recordInternalProfile(
        'workerResultTransport',
        Number(this.services.timestampNs() - value.profile.postedAtNs) / 1e6,
      );
    }
    this.callbacks.result(this, value);
  }

  private fail(
    message: string,
    cause?: unknown,
    leaseError?: PjsExecutionLeaseError,
    reason: WorkerFailureReason = 'protocol',
  ): void {
    if (this.state.status === 'failed' || this.state.status === 'stopped')
      return;
    const wasStarting = this.state.status === 'starting';
    const taskId = this.state.currentTaskId;
    this.state.failedTasks += this.executions.size;
    for (const id of this.executions.keys()) this.closeProgress(id);
    this.state.status = 'failed';
    this.clearLease();
    clearTimeout(this.startupTimer);
    const error =
      leaseError ??
      new PjsWorkerError(message, {
        workerId: this.id,
        ...(taskId ? { taskId } : {}),
        cause,
      });
    this.rejectReady(error);
    this.callbacks.failed(
      this,
      error,
      wasStarting,
      wasStarting ? 'bootstrap' : leaseError ? 'execution-lease' : reason,
    );
  }
}
