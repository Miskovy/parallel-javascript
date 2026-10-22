import { transfer } from '@pjavascript/runtime';
import type { PjsOwnedTypedArray, PjsTransfer } from '@pjavascript/runtime';

export function double(value: number): number {
  return value * 2;
}

export function containmentHang(shared: SharedArrayBuffer): never {
  const control = new Int32Array(shared);
  Atomics.add(control, 2, 1);
  Atomics.store(control, 0, 1);
  while (true) {
    /* Deliberate installed TypeScript CPU loop. */
  }
}

export function containmentCrash(): never {
  process.exit(31);
}

export function ownedBinary({
  move,
}: {
  move: boolean;
}): PjsOwnedTypedArray | PjsTransfer<PjsOwnedTypedArray> {
  const output = new BigInt64Array([42n, 7n]);
  return move ? transfer(output, [output.buffer]) : output;
}
