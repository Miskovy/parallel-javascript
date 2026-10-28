import { Buffer } from 'node:buffer';
import { inspectBinaryResult as inspect } from './binary-core.js';
export type { BinaryResultInspection } from './binary-core.js';
export function inspectBinaryResult(value: unknown) {
  return inspect(value, (item) =>
    Buffer.isBuffer(item) ? 'Buffer' : undefined,
  );
}
