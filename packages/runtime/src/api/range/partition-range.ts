import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { RangeSubmission } from './contracts.js';

export function partitionRange<Input, Output>(
  submission: RangeSubmission,
  task: PjsTask<Input, Output>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions = {},
): Promise<Output[]> {
  return submission.start(
    task,
    range,
    createInput,
    options,
    'collect',
  ) as Promise<Output[]>;
}
