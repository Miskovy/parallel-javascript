import type { TaskSnapshot } from '../types/index.js';
import type { PartitionChild } from '../partition/operation.js';

export interface ScheduledTask {
  readonly id: string;
}

export interface PendingTask extends ScheduledTask {
  child?: PartitionChild;
  snapshot: TaskSnapshot;
  input: unknown;
  transferList: ArrayBuffer[];
  releaseTransfers: () => void;
  admittedAt: number;
  resolve: (output: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}
