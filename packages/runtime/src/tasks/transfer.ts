import { isMarkedAsUntransferable } from 'node:worker_threads';
import { PjsSerializationError } from '../errors/index.js';
import * as core from './transfer-core.js';
import type { PjsTransfer } from './transfer-core.js';
export type { PjsTransfer } from './transfer-core.js';
export { reserveTransfers } from './transfer-core.js';
const check = (buffer: ArrayBuffer) => {
  if (isMarkedAsUntransferable(buffer))
    throw new PjsSerializationError(
      'ArrayBuffer is marked as untransferable; use a dedicated ArrayBuffer',
    );
};
export function transfer<Output>(
  value: Output,
  buffers: readonly ArrayBuffer[],
): PjsTransfer<Output> {
  return core.transfer(value, buffers, check);
}
export function snapshotTransferList(
  buffers: readonly ArrayBuffer[],
): ArrayBuffer[] {
  return core.snapshotTransferList(buffers, check);
}
export function validateTransferList(buffers: readonly ArrayBuffer[]): void {
  core.validateTransferList(buffers, check);
}
export function transferOutput(output: unknown) {
  return core.transferOutput(output, check);
}
