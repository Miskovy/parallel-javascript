import type { ProgressValue } from '../../types/index.js';
import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { RangeSubmission } from './contracts.js';

export function partitionRange<Input, Output, Progress = ProgressValue>(
  submission: RangeSubmission,
  task: PjsTask<Input, Output, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions<
    NoInfer<Input>,
    NoInfer<Output>,
    NoInfer<Progress>
  > = {},
): Promise<Output[]> {
  return submission.start(
    task,
    range,
    createInput,
    options,
    'collect',
  ) as Promise<Output[]>;
}
