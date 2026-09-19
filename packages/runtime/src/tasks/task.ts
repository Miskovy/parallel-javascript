import type { TaskSnapshot } from '../types/index.js';

export interface ScheduledTask {
  readonly id: string;
}

export interface PendingTask extends ScheduledTask {
  snapshot: TaskSnapshot;
  input: unknown;
  transferList: ArrayBuffer[];
  releaseTransfers: () => void;
  admittedAt: number;
  resolve: (output: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}
