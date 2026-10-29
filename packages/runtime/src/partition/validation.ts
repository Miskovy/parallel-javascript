import type { ProgressValue } from '../types/index.js';
import { integer } from '../internal/integer.js';
import { optionSpelling } from '../internal/option-spelling.js';
import type { RangeResultMode } from './operation.js';
import { planRange } from './range.js';
import type {
  PartitionRange,
  PartitionOptions,
  PjsTypedArrayConstructor,
} from './range.js';

const typedArrayConstructors = new Set<PjsTypedArrayConstructor>([
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
]);

/** Preserves option access order without creating accepted-operation state. */
export function validateRangeRequest<Input, Output, Progress = ProgressValue>(
  range: PartitionRange,
  createInput: unknown,
  options: PartitionOptions<Input, Output, Progress>,
  resultMode: RangeResultMode,
  mapOutputConstructor?: PjsTypedArrayConstructor,
) {
  if ('executionLease' in options)
    throw new TypeError(
      'executionLease is unsupported for range and batch operations',
    );
  const plan = planRange(
    range,
    resultMode === 'collect' || resultMode === 'map'
      ? 2 ** 32 - 1
      : Number.MAX_SAFE_INTEGER,
  );
  if (typeof createInput !== 'function')
    throw new TypeError('createInput must be a synchronous function');
  const timeout = options.timeout;
  const signal = options.signal;
  const cancellation = options.cancellation;
  if (
    cancellation !== undefined &&
    cancellation !== 'settle' &&
    cancellation !== 'cooperative' &&
    cancellation !== 'terminate'
  )
    throw new TypeError(
      'cancellation must be settle, cooperative or terminate',
    );
  const batchName = optionSpelling(
    options,
    'dispatchBatchSize',
    'experimentalDispatchBatchSize',
  );
  const dispatchBatchSize = integer(
    batchName ?? 'dispatchBatchSize',
    (batchName === undefined ? undefined : options[batchName]) ?? 1,
    1,
    16,
  );
  if (timeout !== undefined) integer('timeout', timeout, 1, 2 ** 31 - 1);
  if (
    resultMode === 'map' &&
    mapOutputConstructor !== undefined &&
    !typedArrayConstructors.has(mapOutputConstructor)
  )
    throw new TypeError(
      'outputConstructor must be a built-in typed-array constructor',
    );
  const priority = integer(
    'priority',
    'priority' in options ? (options.priority ?? 0) : 0,
    -(2 ** 31),
    2 ** 31 - 1,
  );
  const onProgress = 'onProgress' in options ? options.onProgress : undefined;
  if (onProgress !== undefined && typeof onProgress !== 'function')
    throw new TypeError('onProgress must be a function');
  return {
    plan,
    timeout,
    signal,
    cancellation,
    dispatchBatchSize,
    priority,
    onProgress,
  };
}
