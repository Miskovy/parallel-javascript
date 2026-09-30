import { types } from 'node:util';

export interface BinaryResultInspection {
  bytes?: number;
  actualType: string;
  problem?: 'detached' | 'shared' | 'unsupported';
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return 'Buffer';
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
export function inspectBinaryResult(value: unknown): BinaryResultInspection {
  const actualType = valueType(value);
  if (types.isSharedArrayBuffer(value))
    return { actualType, problem: 'shared' };
  if (types.isArrayBuffer(value)) {
    if (!liveArrayBuffer(value)) return { actualType, problem: 'detached' };
    return { actualType, bytes: value.byteLength };
  }
  if (!ArrayBuffer.isView(value)) return { actualType, problem: 'unsupported' };
  const backing = value.buffer;
  if (types.isSharedArrayBuffer(backing))
    return { actualType, problem: 'shared' };
  if (!types.isArrayBuffer(backing))
    return { actualType, problem: 'unsupported' };
  if (!liveArrayBuffer(backing)) return { actualType, problem: 'detached' };
  try {
    return { actualType, bytes: value.byteLength };
  } catch {
    return { actualType, problem: 'detached' };
  }
}
