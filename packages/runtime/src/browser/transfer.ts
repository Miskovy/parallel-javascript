import { transfer as wrap } from '../tasks/transfer-core.js';
import type { PjsTransfer } from '../tasks/transfer-core.js';
export type { PjsTransfer } from '../tasks/transfer-core.js';
export function transfer<Output>(
  value: Output,
  buffers: readonly ArrayBuffer[],
): PjsTransfer<Output> {
  return wrap(value, buffers);
}
