import type { PjsTask } from '../tasks/registry.js';
import type { PartitionInput } from '../partition/range.js';

/** Node JS-engine limits in MiB; excludes ArrayBuffers, native allocations and RSS. */
export interface WorkerResourceLimits {
  maxOldGenerationSizeMb?: number;
  maxYoungGenerationSizeMb?: number;
  codeRangeSizeMb?: number;
  stackSizeMb?: number;
}

export type RuntimeState =
  'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
export type WorkerStatus = 'starting' | 'idle' | 'busy' | 'stopped' | 'failed';
export type TaskStatus =
  | 'created'
  | 'queued'
  | 'scheduled'
  | 'running'
  | 'recovering'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface WorkerState {
  id: number;
  threadId: number;
  status: WorkerStatus;
  currentTaskId?: string;
  completedTasks: number;
  failedTasks: number;
  totalExecutionTimeMs: number;
}

export interface TaskSnapshot {
  id: string;
  taskName: string;
  /** Present for opt-in recovery; taskName and id retain logical identity. */
  attempt?: number;
  executionId?: string;
  implementation?: string;
  status: TaskStatus;
  workerId?: number;
  createdAt: number;
  queuedAt?: number;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  /** Parent/partition context, absent for ordinary run() tasks. */
  operationId?: string;
  partitionIndex?: number;
  rangeStart?: number;
  rangeEnd?: number;
}

export type RecoveryCause = 'worker-crash' | 'execution-lease' | 'task-error';

export interface RetryOptions {
  /** Includes the initial primary attempt; positive safe integer. */
  maxAttempts: number;
  /** Fixed delay after physical completion, default zero. */
  backoffMs?: number;
  /** Defaults to worker-crash. Serialization and admission failures are terminal. */
  on?: readonly RecoveryCause[];
}

/** Supplied as the second task argument only in explicit cooperative mode. */
export interface TaskContext {
  readonly signal: AbortSignal;
  /** Poll shared cancellation state, abort the local signal and throw AbortError. */
  throwIfCancelled(): void;
}

/** Metadata for a selected recovery execution, including the single fallback. */
export interface RecoveryAttempt {
  readonly attempt: number;
  readonly implementation: 'primary' | 'fallback';
}

// A never output keeps legacy non-generic options assignable to every run schema.
export interface RunOptions<Input = unknown, Output = never> {
  signal?: AbortSignal;
  /** Move these buffers at dispatch. All sender-side views detach on a successful post. */
  transferList?: readonly ArrayBuffer[];
  /** End-to-end deadline in milliseconds, including startup and queue time. */
  timeout?: number;
  /**
   * Physical dispatch lease; supported ordinary run() only.
   * Integer milliseconds from 1 through 2147483647; undefined disables it.
   * Starts after successful posting, excluding startup/queue wait before dispatch.
   * Expiry requests asynchronous containment; it does not settle an already-settled caller again.
   */
  executionLease?: number;
  /** Applies to both signal abort and timeout; defaults to settle. */
  cancellation?: 'settle' | 'cooperative' | 'terminate';
  /** Required with retry/fallback: partial and repeated execution must be safe. */
  repeatable?: true;
  /** Synchronous reconstruction after capacity is claimed; never used for initial input. */
  rebuildInput?: [Output] extends [never]
    ? never
    : (next: RecoveryAttempt) => PartitionInput<Input>;
  retry?: RetryOptions;
  /** One alternative implementation in this runtime's pool; never retried. */
  fallback?: {
    task: PjsTask<Input, Output>;
    on?: readonly RecoveryCause[];
  };
}

export interface ShutdownOptions {
  /** Defaults to true. False explicitly permits terminating active executions. */
  drain?: boolean;
  /**
   * Escalate the first graceful shutdown, including remaining startup.
   * Integer milliseconds from 1 through 2147483647; requires drain not to be false.
   * First shutdown options/promise win. Resolution still requires confirmed worker exits;
   * termination rejection cannot report successful cleanup. Undefined adds no escalation deadline.
   */
  forceAfter?: number;
}

/** Pool-wide monotonic rolling restart decision budget; replaces the lifetime budget. */
export interface RestartPolicy {
  /** Nonnegative safe-integer recovery decision limit, not a replacement-spawn count. */
  maxRestarts: number;
  /** Positive safe-integer milliseconds; decisions expire at age >= windowMs. */
  windowMs: number;
}
