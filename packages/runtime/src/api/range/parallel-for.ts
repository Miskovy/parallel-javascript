import type { ProgressValue } from '../../types/index.js';
import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { RangeSubmission } from './contracts.js';

export function parallelFor<Input, Progress = ProgressValue>(
  submission: RangeSubmission,
  task: PjsTask<Input, unknown, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions<NoInfer<Input>, unknown, NoInfer<Progress>> = {},
): Promise<void> {
  return submission.start(
    task,
    range,
    createInput,
    options,
    'discard',
  ) as Promise<void>;
}
