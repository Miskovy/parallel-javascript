import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { RangeSubmission } from './contracts.js';
import { optionSpelling } from '../../internal/option-spelling.js';
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
  options: TypedMapRangeOptions<Constructor, NoInfer<Input>>,
): Promise<InstanceType<Constructor>>;
/** @experimental Ordered element map assembled from validated array blocks. */
export function parallelMapRange<Input, Output>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly Output[]>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: PartitionOptions<NoInfer<Input>, readonly NoInfer<Output>[]>,
): Promise<Output[]>;
export function parallelMapRange<Input>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly unknown[] | PjsTypedArray>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options:
    | PartitionOptions<Input, readonly unknown[] | PjsTypedArray>
    | TypedMapRangeOptions<PjsTypedArrayConstructor, Input>,
): Promise<unknown[] | PjsTypedArray>;
export function parallelMapRange<Input>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly unknown[] | PjsTypedArray>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions<Input, readonly unknown[] | PjsTypedArray> & {
    outputConstructor?: PjsTypedArrayConstructor;
    experimentalOutputConstructor?: PjsTypedArrayConstructor;
  } = {},
): Promise<unknown[] | PjsTypedArray> {
  const constructorName = optionSpelling(
    options,
    'outputConstructor',
    'experimentalOutputConstructor',
  );
  const outputConstructor =
    constructorName === undefined ? undefined : options[constructorName];
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
