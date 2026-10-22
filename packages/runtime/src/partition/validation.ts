import { integer } from '../internal/integer.js';
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
export function validateRangeRequest(
  range: PartitionRange,
  createInput: unknown,
  options: PartitionOptions,
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
  const dispatchBatchSize = integer(
    'experimentalDispatchBatchSize',
    options.experimentalDispatchBatchSize ?? 1,
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
      'experimentalOutputConstructor must be a built-in typed-array constructor',
    );
  return { plan, timeout, signal, dispatchBatchSize };
}
