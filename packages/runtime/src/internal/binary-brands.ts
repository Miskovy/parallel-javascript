const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;
const sharedBufferLength =
  typeof SharedArrayBuffer === 'function'
    ? Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        'byteLength',
      )!.get!
    : undefined;
const typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get!;

export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  try {
    arrayBufferLength.call(value);
    return true;
  } catch {
    return false;
  }
}
export function isSharedArrayBuffer(
  value: unknown,
): value is SharedArrayBuffer {
  if (!sharedBufferLength) return false;
  try {
    sharedBufferLength.call(value);
    return true;
  } catch {
    return false;
  }
}
export function numericViewTag(value: unknown): string | undefined {
  try {
    return typedArrayTag.call(value);
  } catch {
    return undefined;
  }
}
