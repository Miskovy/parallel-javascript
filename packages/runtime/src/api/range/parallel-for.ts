import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { RangeSubmission } from './contracts.js';

export function parallelFor<Input>(
  submission: RangeSubmission,
  task: PjsTask<Input, unknown>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: PartitionOptions = {},
): Promise<void> {
  return submission.start(
    task,
    range,
    createInput,
    options,
    'discard',
  ) as Promise<void>;
}
