import {
  isArrayBuffer,
  isSharedArrayBuffer,
} from '../internal/binary-brands.js';

export interface BinaryResultInspection {
  bytes?: number;
  actualType: string;
  problem?: 'detached' | 'shared' | 'unsupported';
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  try {
    const tag = Object.prototype.toString.call(value);
    return tag.slice(8, -1) || typeof value;
  } catch {
    return typeof value;
  }
}

function liveArrayBuffer(buffer: ArrayBuffer): boolean {
  try {
    new Uint8Array(buffer, 0, 0);
    return true;
  } catch {
    return false;
  }
}

/** @internal Inspect one direct result without traversing an object graph. */
export function inspectBinaryResult(
  value: unknown,
  name?: (value: unknown) => string | undefined,
): BinaryResultInspection {
  const actualType = name?.(value) ?? valueType(value);
  if (isSharedArrayBuffer(value)) return { actualType, problem: 'shared' };
  if (isArrayBuffer(value)) {
    if (!liveArrayBuffer(value)) return { actualType, problem: 'detached' };
    return { actualType, bytes: value.byteLength };
  }
  if (!ArrayBuffer.isView(value)) return { actualType, problem: 'unsupported' };
  const backing = value.buffer;
  if (isSharedArrayBuffer(backing)) return { actualType, problem: 'shared' };
  if (!isArrayBuffer(backing)) return { actualType, problem: 'unsupported' };
  if (!liveArrayBuffer(backing)) return { actualType, problem: 'detached' };
  try {
    return { actualType, bytes: value.byteLength };
  } catch {
    return { actualType, problem: 'detached' };
  }
}
