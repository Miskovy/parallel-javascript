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
  StreamRangeResult,
  PjsTypedArray,
  TypedMapRangeOptions,
  BinaryStreamRangeOptions,
  PjsBinaryResult,
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

const completion: Promise<void> = runtime.parallelFor(
  partitionTask,
  range,
  (partition) => ({ input: { partition, shared } }),
  { timeout: 1000, experimentalDispatchBatchSize: 8 },
);
void completion;
// Existing value-returning registered tasks are reusable; their values are discarded.
const discardValue: Promise<void> = runtime.parallelFor(task, range, () => ({
  input: data,
}));
void discardValue;
// @ts-expect-error Task input typing applies to completion factories.
runtime.parallelFor(task, range, () => ({ input: 'bad' }));
// @ts-expect-error Completion payload factories must be synchronous.
runtime.parallelFor(task, range, async () => ({ input: data }));
runtime.parallelFor(sharedTask, range, () => ({
  input: shared,
  // @ts-expect-error Shared memory cannot enter a completion child transfer list.
  transferList: [shared.buffer],
}));

const stream: AsyncIterable<StreamRangeResult<number>> = runtime.streamRange(
  partitionTask,
  range,
  (partition) => ({ input: { partition, shared } }),
  {
    timeout: 1000,
    experimentalDispatchBatchSize: 4,
    experimentalMaxBufferedResults: 8,
  },
);
void stream;
// @ts-expect-error Stream task input typing applies to every payload.
runtime.streamRange(task, range, () => ({ input: 'bad' }));

const binaryOptions: BinaryStreamRangeOptions = {
  experimentalResultBytes: (partition) => partition.end - partition.start,
  experimentalMaxReservedResultBytes: 1024,
  experimentalMaxBufferedResults: 4,
};
const binaryStream: AsyncIterable<StreamRangeResult<Uint8Array>> =
  runtime.streamRange(task, range, () => ({ input: data }), binaryOptions);
void binaryStream;
const binaryValue: PjsBinaryResult = new DataView(new ArrayBuffer(8));
const upperOptions = {
  experimentalMaxResultBytes: (partition: RangePartition) =>
    partition.end - partition.start,
  experimentalMaxReservedResultBytes: 1024,
};
const upperStream: AsyncIterable<StreamRangeResult<Uint8Array>> =
  runtime.streamRange(task, range, () => ({ input: data }), upperOptions);
void upperStream;
runtime.streamRange(
  partitionTask,
  range,
  (partition) => ({ input: { partition, shared } }),
  // @ts-expect-error Upper-bound streams require direct binary task results.
  upperOptions,
);
runtime.streamRange(task, range, () => ({ input: data }), {
  // @ts-expect-error Exact and upper-bound declarations cannot coexist.
  experimentalResultBytes: 16,
  // @ts-expect-error Mutually exclusive declarations fail every overload.
  experimentalMaxResultBytes: 32,
  // @ts-expect-error Count-only fallback excludes byte capacity.
  experimentalMaxReservedResultBytes: 64,
});
runtime.streamRange(task, range, () => ({ input: data }), {
  // @ts-expect-error A maximum needs a byte capacity.
  experimentalMaxResultBytes: 32,
});
runtime.streamRange(task, range, () => ({ input: data }), {
  // @ts-expect-error Declaration callbacks must be synchronous.
  experimentalMaxResultBytes: async () => 32,
  // @ts-expect-error Count-only fallback excludes byte capacity.
  experimentalMaxReservedResultBytes: 64,
});
void binaryValue;
runtime.streamRange(
  partitionTask,
  range,
  (partition) => ({
    input: { partition, shared },
  }),
  // @ts-expect-error Strict binary options require a direct binary task result.
  binaryOptions,
);
runtime.streamRange(task, range, () => ({ input: data }), {
  // @ts-expect-error Both strict binary options are required together.
  experimentalResultBytes: 16,
});

const arrayMapTask = registry.register<{ partition: RangePartition }, number[]>(
  'array-map',
  new URL('./fixture.js', import.meta.url),
  'arrayMap',
);
const mapped: Promise<number[]> = runtime.parallelMapRange(
  arrayMapTask,
  range,
  (partition) => ({ input: { partition } }),
);
void mapped;

const typedMapTask = registry.register<
  { partition: RangePartition },
  Float64Array<ArrayBuffer>
>('typed-map', new URL('./fixture.js', import.meta.url), 'typedMap');
const typedOptions: TypedMapRangeOptions<Float64ArrayConstructor> = {
  experimentalOutputConstructor: Float64Array,
  experimentalDispatchBatchSize: 4,
};
const typedMapped: Promise<Float64Array<ArrayBuffer>> =
  runtime.parallelMapRange(
    typedMapTask,
    range,
    (partition) => ({ input: { partition } }),
    typedOptions,
  );
void typedMapped;
const typedUnion: PjsTypedArray = new Uint32Array(1);
void typedUnion;
const wrongTypedOptions: TypedMapRangeOptions<Uint32ArrayConstructor> = {
  experimentalOutputConstructor: Uint32Array,
};
runtime.parallelMapRange(
  // @ts-expect-error Typed task output must match the selected constructor.
  typedMapTask,
  range,
  (partition) => ({ input: { partition } }),
  wrongTypedOptions,
);

// v0.15: common consumer options and missing negative combinations.
const abort = new AbortController();
const deadlineResult: Promise<Uint8Array> = runtime.run(task, data, {
  signal: abort.signal,
  timeout: 1000,
});
void deadlineResult;
// @ts-expect-error AbortController is not an AbortSignal.
runtime.run(task, data, { signal: abort });
// @ts-expect-error Module registration requires a URL, not a path string.
registry.register('path', './fixture.js');
// @ts-expect-error Registration's output type is retained by run.
const badResult: Promise<string> = runtime.run(task, data);
void badResult;
const stats: ReturnType<PjsRuntime['stats']> = runtime.stats();
const queueSize: number = stats.queue.size;
void queueSize;
const shutdown: Promise<void> = runtime.shutdown({ drain: false });
void shutdown;
// @ts-expect-error Shutdown policy is a boolean.
runtime.shutdown({ drain: 'false' });

runtime.streamRange(task, range, () => ({ input: data }), {
  // @ts-expect-error Capacity without either declaration cannot select byte mode.
  experimentalMaxReservedResultBytes: 64,
});
// @ts-expect-error Explicit undefined does not mean omission for byte mode.
runtime.streamRange(task, range, () => ({ input: data }), {
  experimentalResultBytes: undefined,
});
const exactCallback: BinaryStreamRangeOptions = {
  // @ts-expect-error An exact declaration must be synchronous too.
  experimentalResultBytes: async () => 16,
  experimentalMaxReservedResultBytes: 64,
};
void exactCallback;
const typedEmpty: Promise<Float64Array<ArrayBuffer>> = runtime.parallelMapRange(
  typedMapTask,
  { start: 0, end: 0, grainSize: 1 },
  (partition) => ({ input: { partition } }),
  typedOptions,
);
void typedEmpty;
const bigintTask = registry.register<
  { partition: RangePartition },
  BigInt64Array<ArrayBuffer>
>('bigint-map', new URL('./fixture.js', import.meta.url));
const bigints: Promise<BigInt64Array<ArrayBuffer>> = runtime.parallelMapRange(
  bigintTask,
  range,
  (partition) => ({ input: { partition } }),
  { experimentalOutputConstructor: BigInt64Array },
);
void bigints;
