import type { ProgressValue } from '../../types/index.js';
import type { PjsTask } from '../../tasks/registry.js';
import type {
  PartitionInput,
  PartitionRange,
  RangePartition,
} from '../../partition/range.js';
import type { StreamRangeSubmission } from './contracts.js';
import { integer } from '../../internal/integer.js';
import { optionSpelling } from '../../internal/option-spelling.js';
import { PjsBinaryResultContractError } from '../../errors/index.js';
import { RangeStream } from '../../partition/stream.js';
import type { PjsRangeStream } from '../../partition/stream.js';
import type {
  BinaryStreamRangeOptions,
  CountOnlyStreamRangeOptions,
  UpperBoundBinaryStreamRangeOptions,
  StreamRangeOptions,
  PjsBinaryResult,
  ResultByteDeclaration,
} from '../../partition/range.js';
import type { ResultByteMode } from '../../results/credit.js';
export function streamRange<
  Input,
  Output extends PjsBinaryResult,
  Progress = ProgressValue,
>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options:
    | BinaryStreamRangeOptions<
        NoInfer<Input>,
        NoInfer<Output>,
        NoInfer<Progress>
      >
    | UpperBoundBinaryStreamRangeOptions<
        NoInfer<Input>,
        NoInfer<Output>,
        NoInfer<Progress>
      >,
): PjsRangeStream<Output>;
export function streamRange<Input, Output, Progress = ProgressValue>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: CountOnlyStreamRangeOptions<
    NoInfer<Input>,
    NoInfer<Output>,
    NoInfer<Progress>
  >,
): PjsRangeStream<Output>;
export function streamRange<Input, Output, Progress = ProgressValue>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options:
    | StreamRangeOptions<NoInfer<Input>, NoInfer<Output>, NoInfer<Progress>>
    | BinaryStreamRangeOptions<
        NoInfer<Input>,
        NoInfer<Output>,
        NoInfer<Progress>
      >
    | UpperBoundBinaryStreamRangeOptions<
        NoInfer<Input>,
        NoInfer<Output>,
        NoInfer<Progress>
      >,
): PjsRangeStream<Output>;
export function streamRange<Input, Output, Progress = ProgressValue>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output, Progress>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: StreamRangeOptions<
    NoInfer<Input>,
    NoInfer<Output>,
    NoInfer<Progress>
  > & {
    resultBytes?: ResultByteDeclaration;
    experimentalResultBytes?: ResultByteDeclaration;
    maxResultBytes?: ResultByteDeclaration;
    experimentalMaxResultBytes?: ResultByteDeclaration;
    maxReservedResultBytes?: number;
    experimentalMaxReservedResultBytes?: number;
  } = {},
): PjsRangeStream<Output> {
  let capacity: number;
  let resultByteDeclaration:
    BinaryStreamRangeOptions['experimentalResultBytes'] | undefined;
  let resultByteCapacity: number | undefined;
  let resultByteMode: ResultByteMode = 'exact';
  try {
    // Preserve the previous property-read behavior for invalid primitive/null
    // options before the existing byte-presence validation/rejection path.
    const countName =
      options !== null &&
      (typeof options === 'object' || typeof options === 'function')
        ? optionSpelling(
            options,
            'maxBufferedResults',
            'experimentalMaxBufferedResults',
          )
        : 'experimentalMaxBufferedResults';
    capacity = integer(
      countName ?? 'maxBufferedResults',
      (countName === undefined ? undefined : options[countName]) ??
        submission.workerCount,
      1,
    );
    const exactName = optionSpelling(
      options,
      'resultBytes',
      'experimentalResultBytes',
    );
    const maximumName = optionSpelling(
      options,
      'maxResultBytes',
      'experimentalMaxResultBytes',
    );
    const hasExact = exactName !== undefined;
    const hasMaximum = maximumName !== undefined;
    if (hasExact && hasMaximum)
      throw new TypeError(
        'Exact and upper-bound result declarations are mutually exclusive',
      );
    const hasDeclaration = hasExact || hasMaximum;
    const capacityName = optionSpelling(
      options,
      'maxReservedResultBytes',
      'experimentalMaxReservedResultBytes',
    );
    const hasByteCapacity = capacityName !== undefined;
    if (hasDeclaration !== hasByteCapacity)
      throw new TypeError(
        'One result-byte declaration and maxReservedResultBytes must be provided together',
      );
    if (hasDeclaration && hasByteCapacity) {
      resultByteMode = hasMaximum ? 'upper-bound' : 'exact';
      const declarationName = maximumName ?? exactName!;
      resultByteDeclaration = options[declarationName];
      resultByteCapacity = integer(capacityName, options[capacityName]!, 0);
      if (typeof resultByteDeclaration === 'number') {
        try {
          integer(declarationName, resultByteDeclaration, 0);
        } catch (cause) {
          throw new PjsBinaryResultContractError(
            `${declarationName} must be a nonnegative safe integer`,
            { cause },
          );
        }
      } else if (typeof resultByteDeclaration !== 'function')
        throw new TypeError(
          `${declarationName} must be a nonnegative safe integer or function`,
        );
    }
  } catch (error) {
    submission.rejectedOptions();
    if (
      'experimentalResultBytes' in options ||
      'resultBytes' in options ||
      'experimentalMaxResultBytes' in options ||
      'maxResultBytes' in options ||
      'experimentalMaxReservedResultBytes' in options ||
      'maxReservedResultBytes' in options
    )
      submission.rejectedResultBytes();
    const failed = new RangeStream<Output>(1);
    failed.fail(error as Error);
    return failed;
  }
  const stream = new RangeStream<Output>(capacity);
  const lifecycle = submission.start(
    task,
    range,
    createInput,
    options,
    'stream',
    stream as RangeStream<unknown>,
    undefined,
    resultByteDeclaration,
    resultByteCapacity,
    resultByteMode,
  );
  void lifecycle.then(
    () => stream.complete(),
    (error: Error) => stream.fail(error),
  );
  return stream;
}
