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
} from '../../partition/range.js';
import type { ResultByteMode } from '../../results/credit.js';
export function streamRange<Input, Output extends PjsBinaryResult>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: BinaryStreamRangeOptions | UpperBoundBinaryStreamRangeOptions,
): PjsRangeStream<Output>;
export function streamRange<Input, Output>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: CountOnlyStreamRangeOptions,
): PjsRangeStream<Output>;
export function streamRange<Input, Output>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options:
    | StreamRangeOptions
    | BinaryStreamRangeOptions
    | UpperBoundBinaryStreamRangeOptions,
): PjsRangeStream<Output>;
export function streamRange<Input, Output>(
  submission: StreamRangeSubmission,
  task: PjsTask<Input, Output>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options:
    | StreamRangeOptions
    | BinaryStreamRangeOptions
    | UpperBoundBinaryStreamRangeOptions = {},
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
    const hasExact = 'experimentalResultBytes' in options;
    const hasMaximum = 'experimentalMaxResultBytes' in options;
    if (hasExact && hasMaximum)
      throw new TypeError(
        'Exact and upper-bound result declarations are mutually exclusive',
      );
    const hasDeclaration = hasExact || hasMaximum;
    const hasByteCapacity = 'experimentalMaxReservedResultBytes' in options;
    if (hasDeclaration !== hasByteCapacity)
      throw new TypeError(
        'One result-byte declaration and experimentalMaxReservedResultBytes must be provided together',
      );
    if (hasDeclaration && hasByteCapacity) {
      resultByteMode = hasMaximum ? 'upper-bound' : 'exact';
      const declarationName = hasMaximum
        ? 'experimentalMaxResultBytes'
        : 'experimentalResultBytes';
      resultByteDeclaration = hasMaximum
        ? (options as UpperBoundBinaryStreamRangeOptions)
            .experimentalMaxResultBytes
        : (options as BinaryStreamRangeOptions).experimentalResultBytes;
      resultByteCapacity = integer(
        'experimentalMaxReservedResultBytes',
        options.experimentalMaxReservedResultBytes,
        0,
      );
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
      'experimentalMaxResultBytes' in options ||
      'experimentalMaxReservedResultBytes' in options
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
