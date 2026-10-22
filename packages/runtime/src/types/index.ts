export type RuntimeState =
  'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
export type WorkerStatus = 'starting' | 'idle' | 'busy' | 'stopped' | 'failed';
export type TaskStatus =
  | 'created'
  | 'queued'
  | 'scheduled'
  | 'running'
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
  status: TaskStatus;
  workerId?: number;
  createdAt: number;
  queuedAt?: number;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  /** Experimental parent/partition context, absent for ordinary run() tasks. */
  operationId?: string;
  partitionIndex?: number;
  rangeStart?: number;
  rangeEnd?: number;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Move these buffers at dispatch. All sender-side views detach on a successful post. */
  transferList?: readonly ArrayBuffer[];
  /** End-to-end deadline in milliseconds, including startup and queue time. */
  timeout?: number;
  /**
   * @experimental Physical dispatch lease; supported ordinary run() only.
   * Integer milliseconds from 1 through 2147483647; undefined disables it.
   * Starts after successful posting, excluding startup/queue wait before dispatch.
   * Expiry requests asynchronous containment; it does not settle an already-settled caller again.
   */
  executionLease?: number;
}

export interface ShutdownOptions {
  /** Defaults to true. False explicitly permits terminating active executions. */
  drain?: boolean;
  /**
   * @experimental Escalate the first graceful shutdown, including remaining startup.
   * Integer milliseconds from 1 through 2147483647; requires drain not to be false.
   * First shutdown options/promise win. Resolution still requires confirmed worker exits;
   * termination rejection cannot report successful cleanup. Undefined adds no escalation deadline.
   */
  forceAfter?: number;
}

/** @experimental Pool-wide monotonic rolling restart decision budget; replaces the lifetime budget. */
export interface RestartPolicy {
  /** Nonnegative safe-integer recovery decision limit, not a replacement-spawn count. */
  maxRestarts: number;
  /** Positive safe-integer milliseconds; decisions expire at age >= windowMs. */
  windowMs: number;
}
