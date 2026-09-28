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
}

export interface ShutdownOptions {
  /** Defaults to true. False explicitly permits terminating active executions. */
  drain?: boolean;
}
