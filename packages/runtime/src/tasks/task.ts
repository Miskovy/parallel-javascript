import type { TaskSnapshot } from '../types/index.js';
import type { PartitionChild } from '../partition/operation.js';

export interface ScheduledTask {
  readonly id: string;
  /** @internal Logical queue credits consumed by this physical FIFO entry. */
  readonly admissionWeight?: number;
}

export interface PendingTask extends ScheduledTask {
  child?: PartitionChild;
  batch?: PendingTask[];
  batchLeaderId?: string;
  snapshot: TaskSnapshot;
  input: unknown;
  transferList: ArrayBuffer[];
  expectedResultBytes?: number;
  releaseTransfers: () => void;
  admittedAt: number;
  resolve: (output: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}
