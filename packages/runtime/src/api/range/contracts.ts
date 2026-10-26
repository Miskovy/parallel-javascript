import type { ProgressValue } from '../../types/index.js';
import type { ResultByteMode } from '../../results/credit.js';
import type { RangeResultMode } from '../../partition/operation.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  PjsTypedArray,
  PjsTypedArrayConstructor,
  RangePartition,
  ResultByteDeclaration,
} from '../../partition/range.js';
import type { RangeStream } from '../../partition/stream.js';
import type { PjsTask } from '../../tasks/registry.js';

/** Accepted-operation state and settlement remain behind this engine boundary. */
export interface RangeSubmission {
  start<Input, Progress = ProgressValue>(
    task: PjsTask<Input, unknown, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions<Input, unknown, Progress>,
    resultMode: RangeResultMode,
    stream?: RangeStream<unknown>,
    mapOutputConstructor?: PjsTypedArrayConstructor,
    resultByteDeclaration?: ResultByteDeclaration,
    resultByteCapacity?: number,
    resultByteMode?: ResultByteMode,
  ): Promise<unknown[] | PjsTypedArray | void>;
}

/** Construction defaults and rejection accounting, without mutable owner access. */
export interface StreamRangeSubmission extends RangeSubmission {
  readonly workerCount: number;
  rejectedOptions(): void;
  rejectedResultBytes(): void;
}
