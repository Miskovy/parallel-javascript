import { Worker } from 'node:worker_threads';
import {
  PjsExecutionLeaseError,
  PjsSerializationError,
  PjsWorkerError,
} from '../errors/index.js';
import type { TaskDescriptor } from '../tasks/registry.js';
import { validateTransferList } from '../tasks/transfer.js';
import {
  internalProfilingEnabled,
  recordInternalProfile,
} from '../telemetry/profile.js';
import type { WorkerState } from '../types/index.js';
import { isWorkerMessage } from './protocol.js';
import type {
  BatchInput,
  BootstrapData,
  ExecutionResultMessage,
  HostMessage,
  UpperBoundResultByteContract,
} from './protocol.js';

export interface WorkerCallbacks {
  ready(worker: PjsWorker): void;
  started(worker: PjsWorker, taskId: string): void;
  result(worker: PjsWorker, message: ExecutionResultMessage): void;
  failed(worker: PjsWorker, error: PjsWorkerError, wasStarting: boolean): void;
  exited(worker: PjsWorker, correlationId: string | undefined): void;
  leaseTerminationRequested?(worker: PjsWorker): void;
}

interface ExecutionLease {
  readonly correlationId: string;
  readonly deadline: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export class PjsWorker {
  readonly ready: Promise<void>;
  private readonly thread: Worker;
  private readonly state: WorkerState;
  private readonly startupTimer: ReturnType<typeof setTimeout>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private stopPromise: Promise<void> | undefined;
  private executionPhase: 'none' | 'scheduled' | 'running' = 'none';
  private currentTaskIds: string[] = [];
  private exitObserved = false;
  private lease: ExecutionLease | undefined;
  leaseExpired = false;

  constructor(
    readonly id: number,
    tasks: TaskDescriptor[],
    startupTimeout: number,
    private readonly callbacks: WorkerCallbacks,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // A replacement can fail before the pool attaches a readiness waiter.
    void this.ready.catch(() => {});
    this.thread = new Worker(new URL('./bootstrap.js', import.meta.url), {
      workerData: { version: 2, tasks } satisfies BootstrapData,
    });
    this.state = {
      id,
      threadId: this.thread.threadId,
      status: 'starting',
      completedTasks: 0,
      failedTasks: 0,
      totalExecutionTimeMs: 0,
    };
    this.startupTimer = setTimeout(
      () => this.fail('Worker startup deadline exceeded'),
      startupTimeout,
    );
    this.thread.on('message', (message: unknown) => this.receive(message));
    this.thread.on('messageerror', (cause: Error) =>
      this.fail('Worker message could not be deserialized', cause),
    );
    this.thread.on('error', (cause: Error) =>
      this.fail(`Worker error: ${cause.message}`, cause),
    );
    this.thread.on('exit', (code) => this.exited(code));
  }

  snapshot(): WorkerState {
    return { ...this.state };
  }

  /** Internal hot-path state check; public snapshots remain defensive copies. */
  get status(): WorkerState['status'] {
    return this.state.status;
  }

  /** Failure and termination intent do not end an occupied physical slot. */
  get hasPhysicalExecution(): boolean {
    return this.state.currentTaskId !== undefined;
  }

  /** Called only after successful posting and the dispatcher credit claim. */
  armExecutionLease(correlationId: string, duration: number): void {
    if (
      this.state.status !== 'busy' ||
      this.state.currentTaskId !== correlationId
    )
      return; // Reentrant shutdown during posting has already initiated containment.
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
      this.state.currentTaskId !== lease.correlationId
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
  ): void {
    if (this.state.status !== 'idle')
      throw new PjsWorkerError('Worker is not idle', {
        taskId,
        workerId: this.id,
      });
    this.state.status = 'busy';
    this.state.currentTaskId = taskId;
    this.executionPhase = 'scheduled';
    try {
      validateTransferList(transferList);
      const postStarted = profile ? performance.now() : 0;
      if (profile)
        this.thread.postMessage(
          {
            type: 'execute',
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
      if (profile)
        recordInternalProfile(
          'hostPostMessage',
          performance.now() - postStarted,
        );
    } catch (cause) {
      this.state.status = 'idle';
      delete this.state.currentTaskId;
      this.currentTaskIds = [];
      this.executionPhase = 'none';
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
  ): void {
    if (this.state.status !== 'idle')
      throw new PjsWorkerError('Worker is not idle', {
        taskId: batchId,
        workerId: this.id,
      });
    if (items.length < 2)
      throw new PjsWorkerError('A physical batch requires multiple items', {
        taskId: batchId,
        workerId: this.id,
      });
    this.state.status = 'busy';
    this.state.currentTaskId = batchId;
    this.currentTaskIds = items.map((item) => item.taskId);
    this.executionPhase = 'scheduled';
    try {
      const profile = internalProfilingEnabled();
      const postStarted = profile ? performance.now() : 0;
      this.thread.postMessage({
        type: 'executeBatch',
        batchId,
        taskName,
        items,
        ...(profile ? { profile: true } : {}),
        ...(completionOnly ? { completionOnly: true } : {}),
      } satisfies HostMessage);
      if (profile)
        recordInternalProfile(
          'hostPostMessage',
          performance.now() - postStarted,
        );
    } catch (cause) {
      this.state.status = 'idle';
      delete this.state.currentTaskId;
      this.currentTaskIds = [];
      this.executionPhase = 'none';
      throw new PjsSerializationError(
        `Batch input could not be serialized: ${cause instanceof Error ? cause.message : 'unknown cause'}`,
        { taskId: batchId, workerId: this.id, cause },
      );
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    clearTimeout(this.startupTimer);
    this.clearLease();
    this.rejectReady(
      new PjsWorkerError('Worker stopped before ready', { workerId: this.id }),
    );
    if (this.state.status === 'idle')
      this.thread.postMessage({ type: 'shutdown' } satisfies HostMessage);
    this.state.status = 'stopped';
    if (this.leaseExpired) this.callbacks.leaseTerminationRequested?.(this);
    this.stopPromise = this.terminateThread().then(() => {
      this.thread.removeAllListeners();
    });
    return this.stopPromise;
  }

  /** Internal Node boundary; tests can delay termination on one worker instance. */
  private terminateThread(): Promise<number> {
    return this.thread.terminate();
  }

  private exited(code: number): void {
    if (this.exitObserved) return;
    this.exitObserved = true;
    this.clearLease();
    const correlationId = this.state.currentTaskId;
    // A direct exit reports logical failure before releasing physical ownership.
    if (this.state.status !== 'stopped' && this.state.status !== 'failed')
      this.fail(`Worker unexpectedly exited with code ${code}`);
    delete this.state.currentTaskId;
    this.currentTaskIds = [];
    this.executionPhase = 'none';
    this.callbacks.exited(this, correlationId);
  }

  private receive(value: unknown): void {
    if (this.state.status === 'failed' || this.state.status === 'stopped')
      return;
    if (!isWorkerMessage(value)) {
      this.fail('Invalid worker protocol message');
      return;
    }
    if (value.type === 'bootstrapFailure') {
      this.fail(`Worker bootstrap failed: ${value.error.message}`, value.error);
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
    if (
      this.state.status !== 'busy' ||
      this.state.currentTaskId !== correlationId
    ) {
      this.fail(`Unexpected task message for ${correlationId}`);
      return;
    }
    if (value.type === 'started') {
      if (this.executionPhase !== 'scheduled') {
        this.fail('Duplicate task start');
        return;
      }
      this.executionPhase = 'running';
      this.callbacks.started(this, value.taskId);
      return;
    }
    if (this.executionPhase !== 'running') {
      this.fail('Task result arrived before start');
      return;
    }
    if (this.currentTaskIds.length > 0 !== (value.type === 'batchResult')) {
      this.fail('Unexpected final response kind for physical execution');
      return;
    }
    if (value.type === 'batchResult') {
      const ids = [
        ...value.items.map((item) => item.taskId),
        ...value.skippedTaskIds,
      ];
      const failureIndex = value.items.findIndex(
        (item) => item.type === 'failure',
      );
      if (
        ids.length !== this.currentTaskIds.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id, index) => id !== this.currentTaskIds[index]) ||
        value.items.filter((item) => item.type === 'failure').length > 1 ||
        (failureIndex >= 0 && failureIndex !== value.items.length - 1) ||
        (value.skippedTaskIds.length > 0 && failureIndex < 0)
      ) {
        this.fail('Invalid logical task correlation in batch result');
        return;
      }
    }
    this.clearLease();
    this.state.status = 'idle';
    delete this.state.currentTaskId;
    this.currentTaskIds = [];
    this.executionPhase = 'none';
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
      else this.state.failedTasks++;
      this.state.totalExecutionTimeMs += value.executionMs;
    }
    if (value.profile) {
      recordInternalProfile('workerIngress', value.profile.workerIngressMs);
      recordInternalProfile(
        'workerOutputPreparation',
        value.profile.outputPreparationMs,
      );
      recordInternalProfile(
        'workerResultTransport',
        Number(process.hrtime.bigint() - value.profile.postedAtNs) / 1e6,
      );
    }
    this.callbacks.result(this, value);
  }

  private fail(
    message: string,
    cause?: unknown,
    leaseError?: PjsExecutionLeaseError,
  ): void {
    if (this.state.status === 'failed' || this.state.status === 'stopped')
      return;
    const wasStarting = this.state.status === 'starting';
    const taskId = this.state.currentTaskId;
    if (taskId) this.state.failedTasks++;
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
    this.callbacks.failed(this, error, wasStarting);
  }
}
