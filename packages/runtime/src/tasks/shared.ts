import { types } from 'node:util';

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
    types.isUint8Array(source)
      ? Uint8Array
      : types.isInt32Array(source)
        ? Int32Array
        : types.isUint32Array(source)
          ? Uint32Array
          : types.isFloat32Array(source)
            ? Float32Array
            : types.isFloat64Array(source)
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
  const buffer = new SharedArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Constructor(buffer);
}
