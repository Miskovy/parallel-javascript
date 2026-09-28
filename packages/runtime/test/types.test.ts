import {
  PjsRuntime,
  PjsTaskRegistry,
  transfer,
  sharedReadonly,
} from '../dist/index.js';
import type {
  PjsTransfer,
  RangePartition,
  PartitionInput,
} from '../dist/index.js';

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

const partitionTask = registry.register<
  { partition: RangePartition; shared: Float64Array<SharedArrayBuffer> },
  number
>('partition', new URL('./fixture.js', import.meta.url));
const range = { start: 0, end: 100, grainSize: 7 };
const ordered: Promise<number[]> = runtime.partitionRange(
  partitionTask,
  range,
  (partition) => ({ input: { partition, shared } }),
  { timeout: 1000, experimentalDispatchBatchSize: 4 },
);
void ordered;
const makeInput = (partition: RangePartition): PartitionInput<Uint8Array> => ({
  input: new Uint8Array(partition.end - partition.start),
  transferList: buffers,
});
void runtime.partitionRange(task, range, makeInput);
// @ts-expect-error Task input typing applies to every generated payload.
runtime.partitionRange(task, range, () => ({ input: 'bad' }));
// @ts-expect-error Payload factories must be synchronous.
runtime.partitionRange(task, range, async () => ({ input: data }));
runtime.partitionRange(task, range, () => ({ input: data }), {
  // @ts-expect-error Transfer lists belong to individual child payloads, not the parent.
  transferList: buffers,
});
runtime.partitionRange(sharedTask, range, () => ({
  input: shared,
  // @ts-expect-error Shared memory cannot enter a child transfer list.
  transferList: [shared.buffer],
}));
runtime.partitionRange(task, range, (partition) => {
  // @ts-expect-error Logical descriptors are immutable.
  partition.start = 10;
  return { input: data };
});
