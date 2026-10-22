import { transfer } from '@pjavascript/runtime';
import type { PjsOwnedTypedArray, PjsTransfer } from '@pjavascript/runtime';

export function double(value: number): number {
  return value * 2;
}

export function ownedBinary({
  move,
}: {
  move: boolean;
}): PjsOwnedTypedArray | PjsTransfer<PjsOwnedTypedArray> {
  const output = new BigInt64Array([42n, 7n]);
  return move ? transfer(output, [output.buffer]) : output;
}
