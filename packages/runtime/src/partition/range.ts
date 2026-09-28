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
}

export interface RangePlan extends PartitionRange {
  chunkCount: number;
}

/** Validate without materializing any partitions or result slots. */
export function planRange(range: PartitionRange): RangePlan {
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
  if (chunkCount > 2 ** 32 - 1)
    throw new RangeError(
      'Partition results exceed the maximum JavaScript array length',
    );
  return Object.freeze({ start, end, grainSize, chunkCount });
}

export function partitionAt(plan: RangePlan, index: number): RangePartition {
  const start = plan.start + index * plan.grainSize;
  // Avoid overflowing a safe endpoint by adding a full final grain first.
  const end = start + Math.min(plan.grainSize, plan.end - start);
  return Object.freeze({ index, start, end });
}
