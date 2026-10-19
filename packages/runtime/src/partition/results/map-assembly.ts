import { PjsMapContractError } from '../../errors/index.js';
import type {
  PjsTypedArray,
  PjsTypedArrayConstructor,
  RangePartition,
} from '../range.js';

/** Validates and copies one block; the caller owns target, metrics and settlement. */
export function assembleMapBlock(
  target: unknown[] | PjsTypedArray,
  rangeStart: number,
  operationId: string,
  partition: RangePartition,
  output: unknown,
  outputConstructor?: PjsTypedArrayConstructor,
): number {
  const expected = partition.end - partition.start;
  const offset = partition.start - rangeStart;
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

    const setter = target as unknown as {
      set(values: ArrayLike<number> | ArrayLike<bigint>, offset?: number): void;
    };
    setter.set(
      block as unknown as ArrayLike<number> | ArrayLike<bigint>,
      offset,
    );
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

    for (let index = 0; index < output.length; index++)
      (target as unknown[])[offset + index] = output[index];
  }
  return expected;
}
