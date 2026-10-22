import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsExecutionLeaseError,
  transfer,
  sharedReadonly,
} from '../dist/index.js';
import type {
  PjsTransfer,
  RangePartition,
  PartitionInput,
  PartitionOptions,
  StreamRangeResult,
  PjsTypedArray,
  TypedMapRangeOptions,
  BinaryStreamRangeOptions,
  PjsBinaryResult,
  PjsRangeStream,
  CountOnlyStreamRangeOptions,
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

const countOptions: CountOnlyStreamRangeOptions = {
  experimentalMaxBufferedResults: 2,
};
const directStream: PjsRangeStream<number> = runtime.streamRange(
  partitionTask,
  range,
  (partition) => ({ input: { partition, shared } }),
  countOptions,
);
const iterableCompatibility: AsyncIterable<StreamRangeResult<number>> =
  directStream;
const selfStream: PjsRangeStream<number> = directStream[Symbol.asyncIterator]();
void iterableCompatibility;
void selfStream;
async function closeableConsumer(value: PjsRangeStream<number>) {
  const item = await value.next();
  if (item.done) {
    const completionValue: undefined = item.value;
    // @ts-expect-error Completed iterators cannot leak any into a number.
    const badCompletion: number = item.value;
    void completionValue;
    void badCompletion;
  } else {
    const output: number = item.value.output;
    const partition: RangePartition = item.value.partition;
    // @ts-expect-error Output stays the task output, not another result wrapper.
    const nested: StreamRangeResult<number> = item.value.output;
    void output;
    void partition;
    void nested;
  }
  const closed = await value.return();
  if (closed.done) {
    const returned: undefined = closed.value;
    void returned;
  }
  await value.throw(new Error('close'));
}
void closeableConsumer;
type CompletionValue = Extract<
  Awaited<ReturnType<PjsRangeStream<number>['next']>>,
  { done: true }
>['value'];
type IsAny<T> = 0 extends 1 & T ? true : false;
const completionIsNotAny: IsAny<CompletionValue> = false;
void completionIsNotAny;
// @ts-expect-error Count-only options exclude exact byte declarations.
const countExact: CountOnlyStreamRangeOptions = { experimentalResultBytes: 8 };
const countMaximum: CountOnlyStreamRangeOptions = {
  // @ts-expect-error Count-only options exclude maximum byte declarations.
  experimentalMaxResultBytes: 8,
};
// @ts-expect-error Count-only options exclude byte capacity, including explicit undefined.
const countCapacity: CountOnlyStreamRangeOptions = {
  experimentalMaxReservedResultBytes: undefined,
};
void countExact;
void countMaximum;
void countCapacity;
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
const directExact: PjsRangeStream<Uint8Array> = runtime.streamRange(
  task,
  range,
  () => ({ input: data }),
  binaryOptions,
);
void directExact.return();
const binaryValue: PjsBinaryResult = new DataView(new ArrayBuffer(8));
const upperOptions = {
  experimentalMaxResultBytes: (partition: RangePartition) =>
    partition.end - partition.start,
  experimentalMaxReservedResultBytes: 1024,
};
const upperStream: AsyncIterable<StreamRangeResult<Uint8Array>> =
  runtime.streamRange(task, range, () => ({ input: data }), upperOptions);
void upperStream;
const directUpper: PjsRangeStream<Uint8Array> = runtime.streamRange(
  task,
  range,
  () => ({ input: data }),
  upperOptions,
);
void directUpper.throw();
// B1 deliberately preserves B2's broad shared-backed binary typing gap.
const sharedBinaryStillAssignable: PjsBinaryResult = new Uint8Array(
  new SharedArrayBuffer(8),
);
void sharedBinaryStillAssignable;
const numberInput = (partition: RangePartition) => ({
  input: { partition, shared },
});
const byteInput = () => ({ input: data });
// @ts-expect-error Upper-bound streams require direct binary task results.
runtime.streamRange(partitionTask, range, numberInput, upperOptions);
const conflictingByteOptions = {
  experimentalResultBytes: 16,
  experimentalMaxResultBytes: 32,
  experimentalMaxReservedResultBytes: 64,
};
// @ts-expect-error Exact and upper-bound declarations cannot coexist or use count-only fallback.
runtime.streamRange(task, range, byteInput, conflictingByteOptions);
const missingMaximumCapacity = { experimentalMaxResultBytes: 32 };
// @ts-expect-error A maximum needs a byte capacity.
runtime.streamRange(task, range, byteInput, missingMaximumCapacity);
const asyncMaximumOptions = {
  experimentalMaxResultBytes: async () => 32,
  experimentalMaxReservedResultBytes: 64,
};
// @ts-expect-error Declaration callbacks must be synchronous; no count-only fallback.
runtime.streamRange(task, range, byteInput, asyncMaximumOptions);
void binaryValue;
// @ts-expect-error Strict binary options require a direct binary task result.
runtime.streamRange(partitionTask, range, numberInput, binaryOptions);
const missingExactCapacity = { experimentalResultBytes: 16 };
// @ts-expect-error Both strict binary options are required together.
runtime.streamRange(task, range, byteInput, missingExactCapacity);

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

const capacityWithoutDeclaration = { experimentalMaxReservedResultBytes: 64 };
// @ts-expect-error Capacity without either declaration cannot select byte mode.
runtime.streamRange(task, range, byteInput, capacityWithoutDeclaration);
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

// R1 experimental physical containment options.
const leasedResult: Promise<Uint8Array> = runtime.run(task, data, {
  timeout: 100,
  executionLease: 500,
});
void leasedResult;
const rollingRuntime = new PjsRuntime({
  registry,
  restartPolicy: { maxRestarts: 3, windowMs: 60_000 },
});
void rollingRuntime;
const boundedShutdown: Promise<void> = runtime.shutdown({
  drain: true,
  forceAfter: 500,
});
void boundedShutdown;
const leaseError: PjsExecutionLeaseError = new PjsExecutionLeaseError(
  'expired',
  { taskId: 'a', workerId: 1 },
);
void leaseError;
// @ts-expect-error Lease duration is milliseconds.
runtime.run(task, data, { executionLease: '500' });
runtime.partitionRange(task, range, () => ({ input: data }), {
  // @ts-expect-error Physical leases are unsupported for ranges.
  executionLease: 500,
});
// @ts-expect-error Explicit undefined cannot request a range lease either.
const rejectedRangeLease: PartitionOptions = {
  executionLease: undefined,
};
void rejectedRangeLease;
