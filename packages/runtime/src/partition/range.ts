/** @experimental Numeric half-open range with an explicit maximum chunk width. */
export interface PartitionRange {
  start: number;
  end: number;
  grainSize: number;
}

/** @experimental Logical order is independent of worker completion order. */
export interface RangePartition {
  readonly index: number;
  readonly start: number;
  readonly end: number;
}

/** @experimental Built synchronously on the host, only when admission is available. */
export interface PartitionInput<Input> {
  input: Input;
  transferList?: readonly ArrayBuffer[];
}

/** @experimental One deadline and signal for the whole range, not each child. */
export interface PartitionOptions {
  signal?: AbortSignal;
  timeout?: number;
  /**
   * @experimental Group transfer-free logical partitions into one worker turn.
   * This research option may change or be removed before the API is stabilized.
   */
  experimentalDispatchBatchSize?: number;
}

/** @experimental Completion-order stream delivery options. */
export interface StreamRangeOptions extends PartitionOptions {
  /** Logical results retained or reserved in-flight for this stream. */
  experimentalMaxBufferedResults?: number;
}

/** @experimental Direct binary values eligible for strict result-byte contracts. */
export type PjsBinaryResult =
  ArrayBuffer | PjsTypedArray | DataView<ArrayBufferLike>;

export type ResultByteDeclaration =
  number | ((partition: RangePartition) => number);

/** @experimental Exact visible bytes declared before each stream child is admitted. */
export interface BinaryStreamRangeOptions extends PartitionOptions {
  experimentalMaxBufferedResults?: number;
  experimentalResultBytes: ResultByteDeclaration;
  experimentalMaxResultBytes?: never;
  experimentalMaxReservedResultBytes: number;
}

/** @experimental Maximum visible bytes; successful unused credit refunds on arrival. */
export interface UpperBoundBinaryStreamRangeOptions extends PartitionOptions {
  experimentalMaxBufferedResults?: number;
  experimentalMaxResultBytes: ResultByteDeclaration;
  experimentalResultBytes?: never;
  experimentalMaxReservedResultBytes: number;
}

/** @experimental Typed numeric blocks supported by element-range mapping. */
export type PjsTypedArray =
  | Int8Array<ArrayBufferLike>
  | Uint8Array<ArrayBufferLike>
  | Uint8ClampedArray<ArrayBufferLike>
  | Int16Array<ArrayBufferLike>
  | Uint16Array<ArrayBufferLike>
  | Int32Array<ArrayBufferLike>
  | Uint32Array<ArrayBufferLike>
  | Float32Array<ArrayBufferLike>
  | Float64Array<ArrayBufferLike>
  | BigInt64Array<ArrayBufferLike>
  | BigUint64Array<ArrayBufferLike>;

/** @experimental Built-in typed-array constructors accepted by typed map mode. */
export type PjsTypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;

/** @experimental Selects a stable flat typed result, including for empty ranges. */
export interface TypedMapRangeOptions<
  Constructor extends PjsTypedArrayConstructor = PjsTypedArrayConstructor,
> extends PartitionOptions {
  experimentalOutputConstructor: Constructor;
}

export interface RangePlan extends PartitionRange {
  chunkCount: number;
}

/** Validate without materializing any partitions or result slots. */
export function planRange(
  range: PartitionRange,
  maximumChunkCount = 2 ** 32 - 1,
): RangePlan {
  const { start, end, grainSize } = range;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start)
    throw new RangeError(
      'Range endpoints must be safe integers with end >= start',
    );
  const span = end - start;
  if (!Number.isSafeInteger(span))
    throw new RangeError('Range span must be a safe integer');
  if (!Number.isSafeInteger(grainSize) || grainSize < 1)
    throw new RangeError('grainSize must be a positive safe integer');
  const chunkCount =
    Math.floor(span / grainSize) + (span % grainSize === 0 ? 0 : 1);
  if (chunkCount > maximumChunkCount)
    throw new RangeError(
      'Range has more logical partitions than this operation can represent',
    );
  return Object.freeze({ start, end, grainSize, chunkCount });
}

export function partitionAt(plan: RangePlan, index: number): RangePartition {
  const start = plan.start + index * plan.grainSize;
  // Avoid overflowing a safe endpoint by adding a full final grain first.
  const end = start + Math.min(plan.grainSize, plan.end - start);
  return Object.freeze({ index, start, end });
}
