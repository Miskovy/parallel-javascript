import { numericViewTag } from '../internal/binary-brands.js';

type SharedView =
  | Uint8Array<SharedArrayBuffer>
  | Int32Array<SharedArrayBuffer>
  | Uint32Array<SharedArrayBuffer>
  | Float32Array<SharedArrayBuffer>
  | Float64Array<SharedArrayBuffer>;

/**
 * Copy visible bytes into shared backing storage for read-only reuse.
 * Read-only is a usage contract: native views remain writable. Never mutate
 * published input, even after cancellation while a worker may still read it.
 * The source must not change during construction. GC owns the buffer lifetime.
 */
export function sharedReadonly(
  source: Uint8Array,
): Uint8Array<SharedArrayBuffer>;
export function sharedReadonly(
  source: Int32Array,
): Int32Array<SharedArrayBuffer>;
export function sharedReadonly(
  source: Uint32Array,
): Uint32Array<SharedArrayBuffer>;
export function sharedReadonly(
  source: Float32Array,
): Float32Array<SharedArrayBuffer>;
export function sharedReadonly(
  source: Float64Array,
): Float64Array<SharedArrayBuffer>;
export function sharedReadonly(
  source: Uint8Array | Int32Array | Uint32Array | Float32Array | Float64Array,
):
  | Uint8Array<SharedArrayBuffer>
  | Int32Array<SharedArrayBuffer>
  | Uint32Array<SharedArrayBuffer>
  | Float32Array<SharedArrayBuffer>
  | Float64Array<SharedArrayBuffer> {
  const Constructor:
    (new (buffer: SharedArrayBuffer) => SharedView) | undefined =
    numericViewTag(source) === 'Uint8Array'
      ? Uint8Array
      : numericViewTag(source) === 'Int32Array'
        ? Int32Array
        : numericViewTag(source) === 'Uint32Array'
          ? Uint32Array
          : numericViewTag(source) === 'Float32Array'
            ? Float32Array
            : numericViewTag(source) === 'Float64Array'
              ? Float64Array
              : undefined;
  if (!Constructor)
    throw new TypeError(
      'sharedReadonly requires Uint8Array, Int32Array, Uint32Array, Float32Array or Float64Array',
    );
  // Constructing the source byte view also rejects detached buffers.
  const bytes = new Uint8Array(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  if (typeof SharedArrayBuffer !== 'function')
    throw new TypeError('sharedReadonly requires usable shared memory');
  const buffer = new SharedArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Constructor(buffer);
}
