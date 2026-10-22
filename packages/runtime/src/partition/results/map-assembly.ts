import { PjsMapContractError } from '../../errors/index.js';
import type {
  PjsTypedArray,
  PjsTypedArrayConstructor,
  RangePartition,
} from '../range.js';

/** Validate before the caller reads its target: getters can terminate the parent. */
export function validateMapBlock(
  operationId: string,
  partition: RangePartition,
  output: unknown,
  outputConstructor?: PjsTypedArrayConstructor,
): unknown[] | PjsTypedArray {
  const expected = partition.end - partition.start;
  const context = {
    operationId,
    partitionIndex: partition.index,
    rangeStart: partition.start,
    rangeEnd: partition.end,
  };
  if (outputConstructor) {
    if (
      !ArrayBuffer.isView(output) ||
      output instanceof DataView ||
      output.constructor !== outputConstructor
    )
      throw new PjsMapContractError(
        `Map partition ${partition.index} must return ${outputConstructor.name}`,
        context,
      );
    const block = output as PjsTypedArray;
    if (block.length !== expected)
      throw new PjsMapContractError(
        `Map partition ${partition.index} returned ${block.length} elements; expected ${expected}`,
        context,
      );

    return block;
  } else {
    if (!Array.isArray(output))
      throw new PjsMapContractError(
        `Map partition ${partition.index} must return an Array`,
        context,
      );
    if (output.length !== expected)
      throw new PjsMapContractError(
        `Map partition ${partition.index} returned ${output.length} elements; expected ${expected}`,
        context,
      );

    return output;
  }
}

/** Copy a validated block; the caller owns the target, counters and settlement. */
export function assembleMapBlock(
  target: unknown[] | PjsTypedArray,
  rangeStart: number,
  partition: RangePartition,
  block: unknown[] | PjsTypedArray,
  outputConstructor?: PjsTypedArrayConstructor,
): number {
  const offset = partition.start - rangeStart;
  if (outputConstructor) {
    const setter = target as unknown as {
      set(values: ArrayLike<number> | ArrayLike<bigint>, offset?: number): void;
    };
    setter.set(
      block as unknown as ArrayLike<number> | ArrayLike<bigint>,
      offset,
    );
  } else {
    for (let index = 0; index < block.length; index++)
      (target as unknown[])[offset + index] = block[index];
  }
  return partition.end - partition.start;
}
