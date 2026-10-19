import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { RangeSubmission } from './contracts.js';
import type {
  PjsTypedArray,
  PjsTypedArrayConstructor,
  TypedMapRangeOptions,
} from '../../partition/range.js';

export function parallelMapRange<
  Input,
  Constructor extends PjsTypedArrayConstructor,
>(
  submission: RangeSubmission,
  task: PjsTask<Input, InstanceType<Constructor>>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: TypedMapRangeOptions<Constructor>,
): Promise<InstanceType<Constructor>>;
/** @experimental Ordered element map assembled from validated array blocks. */
export function parallelMapRange<Input, Output>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly Output[]>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: PartitionOptions,
): Promise<Output[]>;
export function parallelMapRange<Input>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly unknown[] | PjsTypedArray>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions | TypedMapRangeOptions,
): Promise<unknown[] | PjsTypedArray>;
export function parallelMapRange<Input>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly unknown[] | PjsTypedArray>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions | TypedMapRangeOptions = {},
): Promise<unknown[] | PjsTypedArray> {
  const outputConstructor =
    'experimentalOutputConstructor' in options
      ? options.experimentalOutputConstructor
      : undefined;
  return submission.start(
    task,
    range,
    createInput,
    options,
    'map',
    undefined,
    outputConstructor,
  ) as Promise<unknown[] | PjsTypedArray>;
}
