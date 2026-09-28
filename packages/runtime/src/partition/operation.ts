import { AsyncResource } from 'node:async_hooks';
import type { PjsTask } from '../tasks/registry.js';
import type { PartitionInput, RangePartition, RangePlan } from './range.js';
import type { RangeStream } from './stream.js';

export type OperationStatus =
  'created' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
export type RangeResultMode = 'collect' | 'discard' | 'stream';

/** Host-owned state only. No worker slot and no preallocated child Promise list. */
export class RangeOperation extends AsyncResource {
  status: OperationStatus = 'created';
  generated = 0;
  admitted = 0;
  completed = 0;
  failed = 0;
  cancelled = 0;
  readonly children = new Map<string, RangePartition>();
  outputs: unknown[] | undefined;
  cleanup: () => void = () => {};

  constructor(
    readonly id: string,
    readonly task: PjsTask<unknown, unknown>,
    readonly plan: RangePlan,
    readonly dispatchBatchSize: number,
    readonly resultMode: RangeResultMode,
    readonly stream: RangeStream<unknown> | undefined,
    public createInput:
      ((partition: RangePartition) => PartitionInput<unknown>) | undefined,
    readonly deadline: number | undefined,
    readonly resolve: (outputs: unknown[] | undefined) => void,
    readonly reject: (error: Error) => void,
  ) {
    super('PjsRangeOperation', { requireManualDestroy: true });
    this.outputs = resultMode === 'collect' ? [] : undefined;
  }
}

export interface PartitionChild {
  operation: RangeOperation;
  partition: RangePartition;
}
