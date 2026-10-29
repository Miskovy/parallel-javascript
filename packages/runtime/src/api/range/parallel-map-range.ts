import type { ProgressValue } from '../../types/index.js';
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
  Progress = ProgressValue,
>(
  submission: RangeSubmission,
  task: PjsTask<Input, InstanceType<Constructor>, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: TypedMapRangeOptions<Constructor, NoInfer<Input>, NoInfer<Progress>>,
): Promise<InstanceType<Constructor>>;
/** @experimental Ordered element map assembled from validated array blocks. */
export function parallelMapRange<Input, Output, Progress = ProgressValue>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly Output[], Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: PartitionOptions<
    NoInfer<Input>,
    readonly NoInfer<Output>[],
    NoInfer<Progress>
  >,
): Promise<Output[]>;
export function parallelMapRange<Input, Progress = ProgressValue>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly unknown[] | PjsTypedArray, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options:
    | PartitionOptions<Input, readonly unknown[] | PjsTypedArray, Progress>
    | TypedMapRangeOptions<PjsTypedArrayConstructor, Input, Progress>,
): Promise<unknown[] | PjsTypedArray>;
export function parallelMapRange<Input, Progress = ProgressValue>(
  submission: RangeSubmission,
  task: PjsTask<Input, readonly unknown[] | PjsTypedArray, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions<
    Input,
    readonly unknown[] | PjsTypedArray,
    Progress
  > & {
    outputConstructor?: PjsTypedArrayConstructor;
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
