import {
  PjsRuntime,
  PjsTaskRegistry,
  transfer,
  sharedReadonly,
} from '../dist/index.js';
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
const shared: Float64Array<SharedArrayBuffer> = sharedReadonly(
  new Float64Array([1, 2]),
);
const sharedTask = registry.register<Float64Array<SharedArrayBuffer>, number>(
  'sum',
  new URL('./fixture.js', import.meta.url),
);
const sum: Promise<number> = runtime.run(sharedTask, shared);
void sum;
// @ts-expect-error Shared backing cannot be transferred.
runtime.run(sharedTask, shared, { transferList: [shared.buffer] });
// @ts-expect-error Object graphs are not shared by the construction helper.
sharedReadonly({ values: [1, 2] });
// @ts-expect-error DataView is outside the conservative helper surface.
sharedReadonly(new DataView(new ArrayBuffer(8)));
