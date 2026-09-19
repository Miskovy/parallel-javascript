import { types } from 'node:util';
import { isMarkedAsUntransferable } from 'node:worker_threads';
import { PjsSerializationError } from '../errors/index.js';

const transferBrand: unique symbol = Symbol('PjsTransfer');
const envelopes = new WeakMap<object, readonly ArrayBuffer[]>();
// Shared across runtimes importing this module in one isolate. Weak keys do not retain buffers.
const reservations = new WeakMap<ArrayBuffer, string>();

export interface PjsTransfer<Output> {
  readonly value: Output;
  readonly [transferBrand]: true;
}

/** Return from a worker task to move selected buffers back to its caller. */
export function transfer<Output>(
  value: Output,
  transferList: readonly ArrayBuffer[],
): PjsTransfer<Output> {
  const buffers = snapshotTransferList(transferList);
  const envelope: PjsTransfer<Output> = Object.freeze({
    value,
    [transferBrand]: true as const,
  });
  envelopes.set(envelope, buffers);
  return envelope;
}

/** @internal Capture ownership intent without cloning payload bytes. */
export function snapshotTransferList(
  value: readonly ArrayBuffer[],
): ArrayBuffer[] {
  if (!Array.isArray(value))
    throw new PjsSerializationError(
      'transferList must be an array of ArrayBuffers',
    );
  const buffers: ArrayBuffer[] = Array.from(value);
  validateTransferList(buffers);
  return buffers;
}

/** @internal Revalidate immediately before posting: queued buffers may have changed. */
export function validateTransferList(buffers: readonly ArrayBuffer[]): void {
  const seen = new Set<ArrayBuffer>();
  for (const buffer of buffers) {
    if (!types.isArrayBuffer(buffer))
      throw new PjsSerializationError(
        'transferList entries must be ArrayBuffers, not views, shared buffers, or ports',
      );
    if (seen.has(buffer))
      throw new PjsSerializationError(
        'transferList contains the same ArrayBuffer more than once',
      );
    seen.add(buffer);
    if (isMarkedAsUntransferable(buffer))
      throw new PjsSerializationError(
        'ArrayBuffer is marked as untransferable; use a dedicated ArrayBuffer',
      );
    try {
      // A zero-length live buffer is valid; byteLength alone cannot detect detachment.
      new Uint8Array(buffer, 0, 0);
    } catch (cause) {
      throw new PjsSerializationError('ArrayBuffer is detached', { cause });
    }
  }
}

/** @internal All checks precede writes, so failed reservations cannot leak partial claims. */
export function reserveTransfers(
  buffers: readonly ArrayBuffer[],
  taskId: string,
): () => void {
  for (const buffer of buffers) {
    if (reservations.has(buffer))
      throw new PjsSerializationError(
        'ArrayBuffer is already reserved by another pending transfer',
        { taskId },
      );
  }
  for (const buffer of buffers) reservations.set(buffer, taskId);
  return () => {
    for (const buffer of buffers)
      if (reservations.get(buffer) === taskId) reservations.delete(buffer);
  };
}

/** @internal Only helpers created in this isolate are envelopes; ordinary objects stay intact. */
export function transferOutput(output: unknown): {
  value: unknown;
  transferList: readonly ArrayBuffer[];
} {
  const transferList =
    typeof output === 'object' && output !== null
      ? envelopes.get(output)
      : undefined;
  if (!transferList) return { value: output, transferList: [] };
  validateTransferList(transferList);
  return { value: (output as PjsTransfer<unknown>).value, transferList };
}
