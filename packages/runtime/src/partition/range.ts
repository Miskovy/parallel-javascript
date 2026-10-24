/** Numeric half-open range with an explicit maximum chunk width. */
export interface PartitionRange {
  start: number;
  end: number;
  grainSize: number;
}

/** Logical order is independent of worker completion order. */
export interface RangePartition {
  readonly index: number;
  readonly start: number;
  readonly end: number;
}

/** Built synchronously on the host, only when admission is available. */
export interface PartitionInput<Input> {
  input: Input;
  transferList?: readonly ArrayBuffer[];
}

/** One deadline and signal for the whole range, not each child. */
export type PartitionOptions = {
  /** Physical execution leases are unsupported for range and batch operations. */
  executionLease?: never;
  /** Default settle; terminate stops active batches on parent abort/timeout/cleanup. */
  cancellation?: 'settle' | 'terminate';
  repeatable?: never;
  retry?: never;
  fallback?: never;
  signal?: AbortSignal;
  timeout?: number;
} & (
  | {
      /** Group transfer-free partitions; integer 1–16, default 1. */
      dispatchBatchSize?: number;
      /** @deprecated Use dispatchBatchSize. Both spellings together reject. */
      experimentalDispatchBatchSize?: never;
    }
  | {
      dispatchBatchSize?: never;
      /** @deprecated Use dispatchBatchSize. Both spellings together reject. */
      experimentalDispatchBatchSize?: number;
    }
);

/** Completion-order stream delivery options. */
export type StreamRangeOptions = PartitionOptions &
  (
    | {
        /** Logical retained/in-flight results; defaults to workers. */
        maxBufferedResults?: number;
        /** @deprecated Use maxBufferedResults. Both spellings together reject. */
        experimentalMaxBufferedResults?: never;
      }
    | {
        maxBufferedResults?: never;
        /** @deprecated Use maxBufferedResults. Both spellings together reject. */
        experimentalMaxBufferedResults?: number;
      }
  );

/** Count-only delivery excludes every strict byte-mode property. */
export type CountOnlyStreamRangeOptions = StreamRangeOptions & {
  resultBytes?: never;
  maxResultBytes?: never;
  maxReservedResultBytes?: never;
  experimentalResultBytes?: never;
  experimentalMaxResultBytes?: never;
  experimentalMaxReservedResultBytes?: never;
};

/**
 * Ordinary-backed views eligible for strict result-byte contracts.
 * Ownership here does not prove unique references or transferability.
 */
export type PjsOwnedTypedArray =
  | Int8Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Uint8ClampedArray<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int32Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Float32Array<ArrayBuffer>
  | Float64Array<ArrayBuffer>
  | BigInt64Array<ArrayBuffer>
  | BigUint64Array<ArrayBuffer>;

/** Direct ordinary-backed values; worker validation still applies. */
export type PjsBinaryResult =
  ArrayBuffer | PjsOwnedTypedArray | DataView<ArrayBuffer>;

/** Synchronous visible-byte declaration for one logical partition. */
export type ResultByteDeclaration =
  number | ((partition: RangePartition) => number);

/** Exact visible bytes declared before each stream child is admitted. */
export type BinaryStreamRangeOptions = StreamRangeOptions &
  (
    | {
        resultBytes: ResultByteDeclaration;
        /** @deprecated Use resultBytes. Both spellings reject together. */ experimentalResultBytes?: never;
      }
    | {
        resultBytes?: never;
        /** @deprecated Use resultBytes. Both spellings reject together. */ experimentalResultBytes: ResultByteDeclaration;
      }
  ) &
  (
    | {
        maxReservedResultBytes: number;
        /** @deprecated Use maxReservedResultBytes. Both spellings reject together. */ experimentalMaxReservedResultBytes?: never;
      }
    | {
        maxReservedResultBytes?: never;
        /** @deprecated Use maxReservedResultBytes. Both spellings reject together. */ experimentalMaxReservedResultBytes: number;
      }
  ) & { maxResultBytes?: never; experimentalMaxResultBytes?: never };

/** Maximum visible bytes; successful unused credit refunds on arrival. */
export type UpperBoundBinaryStreamRangeOptions = StreamRangeOptions &
  (
    | {
        maxResultBytes: ResultByteDeclaration;
        /** @deprecated Use maxResultBytes. Both spellings reject together. */ experimentalMaxResultBytes?: never;
      }
    | {
        maxResultBytes?: never;
        /** @deprecated Use maxResultBytes. Both spellings reject together. */ experimentalMaxResultBytes: ResultByteDeclaration;
      }
  ) &
  (
    | {
        maxReservedResultBytes: number;
        /** @deprecated Use maxReservedResultBytes. Both spellings reject together. */ experimentalMaxReservedResultBytes?: never;
      }
    | {
        maxReservedResultBytes?: never;
        /** @deprecated Use maxReservedResultBytes. Both spellings reject together. */ experimentalMaxReservedResultBytes: number;
      }
  ) & { resultBytes?: never; experimentalResultBytes?: never };

/** Typed numeric blocks supported by element-range mapping. */
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

/** Built-in typed-array constructors accepted by typed map mode. */
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

/** Selects a stable flat typed result, including for empty ranges. */
export type TypedMapRangeOptions<
  Constructor extends PjsTypedArrayConstructor = PjsTypedArrayConstructor,
> = PartitionOptions &
  (
    | {
        /** Built-in typed-array constructor for the flat result. */
        outputConstructor: Constructor;
        /** @deprecated Use outputConstructor. Both spellings together reject. */
        experimentalOutputConstructor?: never;
      }
    | {
        outputConstructor?: never;
        /** @deprecated Use outputConstructor. Both spellings together reject. */
        experimentalOutputConstructor: Constructor;
      }
  );

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
