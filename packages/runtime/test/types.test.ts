import { PjsRuntime, PjsTaskRegistry, transfer } from '../dist/index.js';
import type { PjsTransfer } from '../dist/index.js';

const registry = new PjsTaskRegistry();
const task = registry.register<Uint8Array, Uint8Array>(
  'bytes',
  new URL('./fixture.js', import.meta.url),
);
declare const runtime: PjsRuntime;
const data = new Uint8Array(16);
const buffers: readonly ArrayBuffer[] = [data.buffer];
const result: Promise<Uint8Array> = runtime.run(task, data, {
  transferList: buffers,
});
const output: PjsTransfer<Uint8Array> = transfer(data, buffers);
void result;
void output;
// @ts-expect-error A view is not a transferable backing buffer.
runtime.run(task, data, { transferList: [data] });
// @ts-expect-error Shared memory does not have transferable ownership.
transfer(data, [new SharedArrayBuffer(16)]);
// @ts-expect-error Task input typing survives the transfer option.
runtime.run(task, 'wrong input', { transferList: buffers });
// @ts-expect-error The caller receives the payload, not a transfer envelope.
const wrapped: Promise<PjsTransfer<Uint8Array>> = runtime.run(task, data);
void wrapped;
