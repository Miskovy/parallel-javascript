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
}

export interface RunOptions {
  signal?: AbortSignal;
  /** End-to-end deadline in milliseconds, including startup and queue time. */
  timeout?: number;
}

export interface ShutdownOptions {
  /** Defaults to true. False explicitly permits terminating active executions. */
  drain?: boolean;
}
