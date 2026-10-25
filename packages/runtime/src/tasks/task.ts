import type {
  RecoveryAttempt,
  RecoveryCause,
  TaskSnapshot,
} from '../types/index.js';
import type { TaskDescriptor } from './registry.js';
import type { PartitionChild } from '../partition/operation.js';
import type { UpperBoundResultByteContract } from '../workers/protocol.js';

export interface ScheduledTask {
  readonly id: string;
  /** @internal Logical queue credits consumed by this physical FIFO entry. */
  readonly admissionWeight?: number;
}

export interface PendingTask extends ScheduledTask {
  cancellation?: 'terminate' | 'cooperative';
  executionId?: string;
  recovery?: TaskRecovery;
  attemptQueuedAt?: number;
  child?: PartitionChild;
  batch?: PendingTask[];
  batchLeaderId?: string;
  snapshot: TaskSnapshot;
  input: unknown;
  transferList: ArrayBuffer[];
  executionLease?: number;
  expectedResultBytes?: number;
  resultByteContract?: UpperBoundResultByteContract;
  releaseTransfers: () => void;
  admittedAt: number;
  resolve: (output: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}

/** Logical recovery state; physical ownership remains with the worker. */
export interface TaskRecovery {
  rebuildInput?: (
    next: RecoveryAttempt,
  ) => import('../partition/range.js').PartitionInput<unknown>;
  maxAttempts: number;
  backoffMs: number;
  on: readonly RecoveryCause[];
  fallback?: { descriptor: TaskDescriptor; on: readonly RecoveryCause[] };
  posted?: boolean;
  ready?: boolean;
  skipped?: boolean;
  attempts: number;
  fallbackUsed: boolean;
  lastPrimaryError?: Error;
  pendingFailure?: Error;
  timer?: ReturnType<typeof setTimeout>;
  deadline?: number;
  signal?: AbortSignal;
}
