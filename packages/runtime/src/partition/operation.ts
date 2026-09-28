import type { PjsTask } from '../tasks/registry.js';
import type { PartitionInput, RangePartition, RangePlan } from './range.js';

export type OperationStatus =
  'created' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';

/** Host-owned state only. No worker slot and no preallocated child Promise list. */
export class PartitionOperation {
  status: OperationStatus = 'created';
  generated = 0;
  admitted = 0;
  completed = 0;
  failed = 0;
  cancelled = 0;
  readonly children = new Map<string, RangePartition>();
  outputs: unknown[] = [];
  cleanup: () => void = () => {};

  constructor(
    readonly id: string,
    readonly task: PjsTask<unknown, unknown>,
    readonly plan: RangePlan,
    readonly dispatchBatchSize: number,
    public createInput:
      ((partition: RangePartition) => PartitionInput<unknown>) | undefined,
    readonly deadline: number | undefined,
    readonly resolve: (outputs: unknown[]) => void,
    readonly reject: (error: Error) => void,
  ) {}
}

export interface PartitionChild {
  operation: PartitionOperation;
  partition: RangePartition;
}
