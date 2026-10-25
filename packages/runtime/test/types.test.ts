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
  StreamRangeOptions,
  UpperBoundBinaryStreamRangeOptions,
  StreamRangeResult,
  PjsTypedArray,
  TypedMapRangeOptions,
  BinaryStreamRangeOptions,
  PjsBinaryResult,
  PjsRangeStream,
  CountOnlyStreamRangeOptions,
  PjsOwnedTypedArray,
  ResultByteDeclaration,
  RunOptions,
  RecoveryCause,
  RecoveryAttempt,
  TaskContext,
  RetryOptions,
  WorkerResourceLimits,
  RestartPolicy,
  ShutdownOptions,
} from '../dist/index.js';
// @ts-expect-error Internal worker descriptors are not root API types.
import type { TaskDescriptor } from '../dist/index.js';
// @ts-expect-error Composition snapshot access is not a root export.
import { snapshotRegistry } from '../dist/index.js';

declare const internalDescriptor: TaskDescriptor;
void internalDescriptor;
void snapshotRegistry;

const registry = new PjsTaskRegistry();
// @ts-expect-error The unsupported public snapshot method was removed in B3.
registry.snapshot();
const task = registry.register<Uint8Array, Uint8Array<ArrayBuffer>>(
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
  { timeout: 1000, dispatchBatchSize: 4 },
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
  { timeout: 1000, dispatchBatchSize: 8 },
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
    dispatchBatchSize: 4,
    maxBufferedResults: 8,
  },
);
void stream;

const countOptions: CountOnlyStreamRangeOptions = {
  maxBufferedResults: 2,
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
  maxBufferedResults: 4,
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
// All eleven view kinds retain ordinary backing, including offset and empty views.
const ownedViews = [
  new Int8Array(0),
  new Uint8Array(new ArrayBuffer(16), 8, 8),
  new Uint8ClampedArray(1),
  new Int16Array(1),
  new Uint16Array(1),
  new Int32Array(1),
  new Uint32Array(1),
  new Float32Array(1),
  new Float64Array(1),
  new BigInt64Array(1),
  new BigUint64Array(1),
] satisfies PjsOwnedTypedArray[];
const ownedResults = [
  ...ownedViews,
  new ArrayBuffer(0),
  new DataView(new ArrayBuffer(16), 8, 8),
] satisfies PjsBinaryResult[];
for (const value of ownedResults) {
  const ownedTask = registry.register<undefined, typeof value>(
    'owned',
    new URL('./fixture.js', import.meta.url),
  );
  const input = () => ({ input: undefined });
  const exact: PjsRangeStream<typeof value> = runtime.streamRange(
    ownedTask,
    range,
    input,
    binaryOptions,
  );
  const upper: PjsRangeStream<typeof value> = runtime.streamRange(
    ownedTask,
    range,
    input,
    upperOptions,
  );
  const envelope: PjsTransfer<typeof value> = transfer(value, [
    value instanceof ArrayBuffer ? value : value.buffer,
  ]);
  void exact;
  void upper;
  void envelope;
}
const declaration: ResultByteDeclaration = (partition) =>
  partition.end - partition.start;
const constantDeclaration: ResultByteDeclaration = 0;
// @ts-expect-error Byte declaration callbacks cannot be async.
const asyncDeclaration: ResultByteDeclaration = async () => 0;
void declaration;
void constantDeclaration;
void asyncDeclaration;

const sharedViews = [
  new Int8Array(new SharedArrayBuffer(8)),
  new Uint8Array(new SharedArrayBuffer(8)),
  new Uint8ClampedArray(new SharedArrayBuffer(8)),
  new Int16Array(new SharedArrayBuffer(8)),
  new Uint16Array(new SharedArrayBuffer(8)),
  new Int32Array(new SharedArrayBuffer(8)),
  new Uint32Array(new SharedArrayBuffer(8)),
  new Float32Array(new SharedArrayBuffer(8)),
  new Float64Array(new SharedArrayBuffer(8)),
  new BigInt64Array(new SharedArrayBuffer(8)),
  new BigUint64Array(new SharedArrayBuffer(8)),
] as const;
type BinaryEligibility<Values extends readonly unknown[]> = {
  [Index in keyof Values]: Values[Index] extends PjsBinaryResult ? true : false;
};
// Check each tuple entry independently, rather than rejecting only the union.
const sharedEligibility: BinaryEligibility<typeof sharedViews> = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
];
void sharedEligibility;
for (const value of sharedViews) {
  // @ts-expect-error Every explicitly shared-backed typed kind is excluded.
  const owned: PjsOwnedTypedArray = value;
  // @ts-expect-error Strict binary results exclude shared-backed typed views.
  const binary: PjsBinaryResult = value;
  const sharedOutputTask = registry.register<undefined, typeof value>(
    'shared-output',
    new URL('./fixture.js', import.meta.url),
  );
  const input = () => ({ input: undefined });
  // @ts-expect-error No count-only fallback for shared output in exact mode.
  runtime.streamRange(sharedOutputTask, range, input, binaryOptions);
  // @ts-expect-error No count-only fallback for shared output in upper-bound mode.
  runtime.streamRange(sharedOutputTask, range, input, upperOptions);
  const count: PjsRangeStream<typeof value> = runtime.streamRange(
    sharedOutputTask,
    range,
    input,
  );
  const broad: PjsTypedArray = value;
  void owned;
  void binary;
  void count;
  void broad;
}
const sharedMapTask = registry.register<
  Uint8Array<SharedArrayBuffer>,
  Uint8Array<ArrayBuffer>
>('shared-map', new URL('./fixture.js', import.meta.url));
const sharedMapped: Promise<Uint8Array<ArrayBuffer>> = runtime.parallelMapRange(
  sharedMapTask,
  range,
  () => ({ input: new Uint8Array(new SharedArrayBuffer(8)) }),
  { outputConstructor: Uint8Array },
);
void sharedMapped;
const sharedView = new DataView(new SharedArrayBuffer(8));
// @ts-expect-error DataView must have ordinary backing too.
const rejectedDataView: PjsBinaryResult = sharedView;
// @ts-expect-error Direct shared buffers are excluded.
const rejectedSharedBuffer: PjsBinaryResult = new SharedArrayBuffer(8);
// @ts-expect-error Nested ordinary binary objects are not direct binary results.
const rejectedGraph: PjsBinaryResult = { data: new Uint8Array(8) };
declare const widened: Uint8Array<ArrayBufferLike>;
// @ts-expect-error A widened view does not establish ordinary backing.
const rejectedWidened: PjsBinaryResult = widened;
const copied: PjsBinaryResult = new Uint8Array(widened);
void rejectedDataView;
void rejectedSharedBuffer;
void rejectedGraph;
void rejectedWidened;
void copied;
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
  outputConstructor: Float64Array,
  dispatchBatchSize: 4,
};
const legacyTypedOptions: TypedMapRangeOptions<Float64ArrayConstructor> = {
  experimentalOutputConstructor: Float64Array,
  experimentalDispatchBatchSize: 1,
};
const legacyTypedMapped: Promise<Float64Array<ArrayBuffer>> =
  runtime.parallelMapRange(
    typedMapTask,
    range,
    (partition) => ({ input: { partition } }),
    legacyTypedOptions,
  );
void legacyTypedMapped;
const legacyCount: CountOnlyStreamRangeOptions = {
  experimentalMaxBufferedResults: 1,
  experimentalDispatchBatchSize: 1,
};
void runtime.streamRange(
  partitionTask,
  range,
  (partition) => ({ input: { partition, shared } }),
  legacyCount,
);

const bothBatches = { dispatchBatchSize: 1, experimentalDispatchBatchSize: 1 };
const undefinedBatchAlias = {
  dispatchBatchSize: 1,
  experimentalDispatchBatchSize: undefined,
};
const bothCounts = { maxBufferedResults: 1, experimentalMaxBufferedResults: 1 };
const undefinedCountAlias = {
  maxBufferedResults: 1,
  experimentalMaxBufferedResults: undefined,
};
const bothConstructors = {
  outputConstructor: Float64Array,
  experimentalOutputConstructor: Float64Array,
};
const undefinedConstructorAlias = {
  outputConstructor: Float64Array,
  experimentalOutputConstructor: undefined,
};
// @ts-expect-error Equal batch aliases are mutually exclusive even through a variable.
const invalidBatchPair: PartitionOptions = bothBatches;
// @ts-expect-error Presence of undefined is excluded under exact optional types.
const invalidUndefinedBatch: PartitionOptions = undefinedBatchAlias;
// @ts-expect-error Count aliases are mutually exclusive.
const invalidCountPair: StreamRangeOptions = bothCounts;
// @ts-expect-error Count-only also excludes both count spellings.
const invalidCountOnlyPair: CountOnlyStreamRangeOptions = bothCounts;
// @ts-expect-error Undefined still counts as present.
const invalidUndefinedCount: StreamRangeOptions = undefinedCountAlias;
// @ts-expect-error Constructor aliases are mutually exclusive.
const invalidConstructorPair: TypedMapRangeOptions = bothConstructors;
// @ts-expect-error Required new constructor does not permit an undefined legacy key.
const invalidUndefinedConstructor: TypedMapRangeOptions =
  undefinedConstructorAlias;
// @ts-expect-error Exact mode inherits exclusive batch/count pairs.
const invalidExactPair: BinaryStreamRangeOptions = {
  ...bothCounts,
  experimentalResultBytes: 1,
  experimentalMaxReservedResultBytes: 1,
};
// @ts-expect-error Maximum mode inherits exclusive batch/count pairs.
const invalidMaximumPair: UpperBoundBinaryStreamRangeOptions = {
  ...bothBatches,
  experimentalMaxResultBytes: 1,
  experimentalMaxReservedResultBytes: 1,
};
void [
  invalidBatchPair,
  invalidUndefinedBatch,
  invalidCountPair,
  invalidCountOnlyPair,
  invalidUndefinedCount,
  invalidConstructorPair,
  invalidUndefinedConstructor,
  invalidExactPair,
  invalidMaximumPair,
];
// @ts-expect-error run does not acquire batching support.
runtime.run(task, data, { dispatchBatchSize: 1 });
// @ts-expect-error collect rejects incompatible pairs through non-literal options.
runtime.partitionRange(task, range, makeInput, bothBatches);
// @ts-expect-error completion rejects incompatible batch pairs.
runtime.parallelFor(task, range, makeInput, bothBatches);
const typedInput = (partition: RangePartition) => ({ input: { partition } });
// @ts-expect-error typed overload cannot fall back past incompatible constructors.
runtime.parallelMapRange(typedMapTask, range, typedInput, bothConstructors);
// @ts-expect-error no stream overload accepts both count spellings.
runtime.streamRange(task, range, makeInput, bothCounts);
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
  outputConstructor: Uint32Array,
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
  { outputConstructor: BigInt64Array },
);
void bigints;

// R1 experimental physical containment options.
const c1RunOptions: RunOptions = {
  timeout: 100,
  executionLease: 500,
};
const leasedResult: Promise<Uint8Array> = runtime.run(task, data, c1RunOptions);
void leasedResult;
const c1RestartPolicy: RestartPolicy = { maxRestarts: 3, windowMs: 60_000 };
const rollingRuntime = new PjsRuntime({
  registry,
  restartPolicy: c1RestartPolicy,
});
void rollingRuntime;
const c1ShutdownOptions: ShutdownOptions = {
  drain: true,
  forceAfter: 500,
};
const boundedShutdown: Promise<void> = runtime.shutdown(c1ShutdownOptions);
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
// @ts-expect-error Graceful escalation requires a numeric duration.
const rejectedShutdownDuration: ShutdownOptions = { forceAfter: '500' };
const rejectedRestartBudget: RestartPolicy = {
  // @ts-expect-error Restart decision budgets are numeric, not text.
  maxRestarts: '3',
  windowMs: 1000,
};
const rejectedRestartWindow: RestartPolicy = {
  maxRestarts: 3,
  // @ts-expect-error Restart windows require numeric milliseconds.
  windowMs: '1000',
};
void [rejectedShutdownDuration, rejectedRestartBudget, rejectedRestartWindow];

// B4 contracts mirror the emitted installed diagnostic/error consumer.
import assert from 'node:assert/strict';
import {
  PjsError,
  PjsTaskError,
  PjsWorkerError,
  PjsQueueFullError,
  PjsTimeoutError,
  PjsCancelledError,
  PjsSerializationError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
  PjsMapContractError,
  PjsBinaryResultContractError,
  PjsResultCapacityError,
} from '../dist/index.js';
import type {
  PjsRuntimeStats,
  PjsOutcomeStats,
  PjsContainmentStats,
  PjsWorkerStats,
  PjsQueueStats,
  PjsTimingStats,
  PjsOperationStats,
  PjsStreamResultStats,
  PjsMapResultStats,
  PjsPartitionStats,
  PjsDispatchStats,
  PjsOperationSnapshot,
  PjsOperationStatus,
  PjsRangeResultMode,
  PjsErrorContext,
  PjsBinaryResultErrorContext,
  PjsTaskErrorDetails,
} from '../dist/index.js';

export function diagnosticContracts(runtime: PjsRuntime): void {
  const stats: PjsRuntimeStats = runtime.stats();
  const outcome: PjsOutcomeStats = stats.tasks;
  const containment: PjsContainmentStats = stats.containment;
  const workers: PjsWorkerStats = stats.workers;
  const queue: PjsQueueStats = stats.queue;
  const timing: PjsTimingStats = stats.timing;
  const operations: PjsOperationStats = stats.operations;
  const streams: PjsStreamResultStats = stats.streamResults;
  const maps: PjsMapResultStats = stats.mapResults;
  const partitions: PjsPartitionStats = stats.partitions;
  const dispatch: PjsDispatchStats = stats.dispatch;
  const operation: PjsOperationSnapshot = {
    id: 'copy',
    taskName: 'task',
    status: 'created',
    resultMode: 'map',
    start: 0,
    end: 1,
    grainSize: 1,
    chunkCount: 1,
    generated: 0,
    admitted: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    typedOutput: undefined,
  };
  const statuses: PjsOperationStatus[] = [
    'created',
    'running',
    'completed',
    'failed',
    'cancelled',
    'timed_out',
  ];
  const modes: PjsRangeResultMode[] = ['collect', 'discard', 'stream', 'map'];
  operation.status = statuses[2]!;
  operation.resultMode = modes[0]!;
  operation.typedOutput = 'Float64Array';
  delete operation.typedOutput;
  const utilization: number | undefined = containment.restartWindowUtilization;
  stats.tasks.completed++;
  workers.details[0]!.completedTasks++;
  workers.details.push({
    id: -1,
    threadId: -1,
    status: 'stopped',
    completedTasks: 0,
    failedTasks: 0,
    totalExecutionTimeMs: 0,
  });
  stats.activeOperations.push(operation);
  assert.notEqual(runtime.stats().tasks.completed, stats.tasks.completed);
  assert.ok(
    runtime.stats().workers.details.every((worker) => worker.id !== -1),
  );
  assert.ok(
    runtime.stats().activeOperations.every((parent) => parent.id !== 'copy'),
  );
  assert.deepEqual(stats.streams, operations.streaming);
  assert.deepEqual(stats.maps, operations.mapping);
  assert.equal(typeof outcome.timedOut, 'number');
  for (const value of [
    queue.capacity,
    timing.queueSamples,
    streams.buffered,
    maps.blocks,
    partitions.generated,
    dispatch.logicalTasks,
  ]) {
    assert.equal(typeof value, 'number');
  }
  void utilization;
}

export function errorContracts(): void {
  const cause: unknown = { application: true };
  const context: PjsErrorContext = {
    taskId: 'task',
    workerId: 7,
    operationId: 'parent',
    partitionIndex: 2,
    rangeStart: 4,
    rangeEnd: 6,
    cause,
  };
  const binary: PjsBinaryResultErrorContext = {
    ...context,
    declaredBytes: 8,
    actualBytes: 4,
    actualType: 'Uint8Array',
    resultByteCapacity: 16,
  };
  const details: PjsTaskErrorDetails = {
    name: 'RemoteRangeError',
    message: '',
    stack: 'remote trace',
  };
  const errors: PjsError[] = [
    new PjsError('', context),
    new PjsTaskError(details, context),
    new PjsWorkerError('', context),
    new PjsExecutionLeaseError('', context),
    new PjsQueueFullError('', context),
    new PjsTimeoutError('', context),
    new PjsCancelledError('', context),
    new PjsSerializationError('', context),
    new PjsRuntimeStateError('', context),
    new PjsTaskRegistrationError('', context),
    new PjsMapContractError('', context),
    new PjsBinaryResultContractError('', binary),
    new PjsResultCapacityError('', binary),
  ];
  for (const error of errors) {
    assert.ok(error instanceof Error);
    assert.ok(error instanceof PjsError);
    assert.equal(error.name, error.constructor.name);
    assert.equal(error.message, '');
    assert.equal(error.cause, cause);
    assert.equal(error.taskId, context.taskId);
    assert.equal(error.workerId, context.workerId);
    assert.equal(error.operationId, context.operationId);
    assert.equal(error.partitionIndex, context.partitionIndex);
    assert.equal(error.rangeStart, context.rangeStart);
    assert.equal(error.rangeEnd, context.rangeEnd);
    const unknownCause: unknown = error.cause;
    if (unknownCause instanceof Error)
      assert.equal(typeof unknownCause.message, 'string');
    const stack: string | undefined = error.stack;
    void stack;
  }
  const taskError = new PjsTaskError(details, context);
  assert.equal(taskError.remoteName, details.name);
  assert.equal(taskError.remoteStack, details.stack);
  assert.ok(
    taskError.stack?.includes('Worker stack (RemoteRangeError):\nremote trace'),
  );
  assert.equal(
    new PjsTaskError({ name: 'Empty', message: '', stack: '' }, {}).remoteStack,
    '',
  );
  assert.ok(new PjsExecutionLeaseError('') instanceof PjsWorkerError);
  assert.equal(new PjsBinaryResultContractError('', binary).actualBytes, 4);
  assert.equal(new PjsResultCapacityError('', binary).resultByteCapacity, 16);
  assert.equal(
    'resultByteCapacity' in new PjsBinaryResultContractError('', binary),
    false,
  );
  assert.equal('actualBytes' in new PjsResultCapacityError('', binary), false);
  assert.equal(new PjsError('').taskId, undefined);
}

// Compile-only failures also run under both locked installed consumers.
function negativeContracts(stats: PjsRuntimeStats, error: PjsError): void {
  // @ts-expect-error Required property may contain undefined but cannot be omitted.
  const missing: PjsContainmentStats = {
    leaseExpirations: 0,
    leaseTerminationRequests: 0,
    confirmedLeaseExits: 0,
    workerReplacements: 0,
    restartBudgetExhaustions: 0,
    shutdownEscalations: 0,
  };
  // @ts-expect-error Partition outcomes have no timedOut counter.
  void stats.partitions.timedOut;
  // @ts-expect-error Optional mode field cannot be treated as a required number.
  const buffered: number = stats.activeOperations[0]!.bufferedResults;
  // @ts-expect-error Required possibly undefined is not an unconditional number.
  const utilization: number = stats.containment.restartWindowUtilization;
  // @ts-expect-error Diagnostic status is the reviewed vocabulary.
  const status: PjsOperationStatus = 'queued';
  // @ts-expect-error Mode is not an arbitrary string.
  const mode: PjsRangeResultMode = 'binary';
  // @ts-expect-error Six instance context fields remain readonly.
  error.taskId = 'changed';
  // @ts-expect-error Worker context remains readonly.
  error.workerId = 1;
  // @ts-expect-error Parent context remains readonly.
  error.operationId = 'changed';
  // @ts-expect-error Partition context remains readonly.
  error.partitionIndex = 1;
  // @ts-expect-error Range start remains readonly.
  error.rangeStart = 0;
  // @ts-expect-error Range end remains readonly.
  error.rangeEnd = 1;
  // @ts-expect-error Required possibly undefined fields cannot be deleted.
  delete stats.containment.restartWindowUtilization;
  // @ts-expect-error Unknown cause requires narrowing.
  void error.cause.message;
  // @ts-expect-error Task error context remains required.
  new PjsTaskError({ name: 'Error', message: '' });
  // @ts-expect-error Remote error details require a name.
  new PjsTaskError({ message: '' }, {});
  // @ts-expect-error Error context is typed, not arbitrary metadata.
  new PjsError('', { workerId: 'worker' });
  // @ts-expect-error Byte fields remain readonly on instances.
  new PjsResultCapacityError('').declaredBytes = 0;
  void [missing, buffered, utilization, status, mode];
}
void negativeContracts;

const c3BadValue0 = {
  resultBytes: 8,
  experimentalResultBytes: 8,
  maxReservedResultBytes: 8,
};
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad0: BinaryStreamRangeOptions = c3BadValue0;
void c3Bad0;

const c3BadValue1 = {
  maxResultBytes: 8,
  experimentalMaxResultBytes: 8,
  maxReservedResultBytes: 8,
};
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad1: UpperBoundBinaryStreamRangeOptions = c3BadValue1;
void c3Bad1;

const c3BadValue2 = {
  resultBytes: 8,
  maxReservedResultBytes: 8,
  experimentalMaxReservedResultBytes: 8,
};
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad2: BinaryStreamRangeOptions = c3BadValue2;
void c3Bad2;

const c3BadValue3 = {
  resultBytes: 8,
  maxResultBytes: 8,
  maxReservedResultBytes: 8,
};
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad3: BinaryStreamRangeOptions = c3BadValue3;
void c3Bad3;

const c3BadValue4 = {
  experimentalResultBytes: 8,
  maxResultBytes: 8,
  maxReservedResultBytes: 8,
};
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad4: UpperBoundBinaryStreamRangeOptions = c3BadValue4;
void c3Bad4;

const c3BadValue5 = { resultBytes: 8 };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad5: BinaryStreamRangeOptions = c3BadValue5;
void c3Bad5;

const c3BadValue6 = { maxReservedResultBytes: 8 };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad6: UpperBoundBinaryStreamRangeOptions = c3BadValue6;
void c3Bad6;

const c3BadValue7 = {
  resultBytes: 8,
  experimentalResultBytes: undefined,
  maxReservedResultBytes: 8,
};
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad7: BinaryStreamRangeOptions = c3BadValue7;
void c3Bad7;

const c3BadValue8 = { resultBytes: undefined };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad8: CountOnlyStreamRangeOptions = c3BadValue8;
void c3Bad8;

const c3BadValue9 = { maxResultBytes: undefined };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad9: CountOnlyStreamRangeOptions = c3BadValue9;
void c3Bad9;

const c3BadValue10 = { maxReservedResultBytes: undefined };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad10: CountOnlyStreamRangeOptions = c3BadValue10;
void c3Bad10;

const c3BadValue11 = { experimentalResultBytes: undefined };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad11: CountOnlyStreamRangeOptions = c3BadValue11;
void c3Bad11;

const c3BadValue12 = { experimentalMaxResultBytes: undefined };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad12: CountOnlyStreamRangeOptions = c3BadValue12;
void c3Bad12;

const c3BadValue13 = { experimentalMaxReservedResultBytes: undefined };
// @ts-expect-error C3 exclusive presence/mode/required-field contract.
const c3Bad13: CountOnlyStreamRangeOptions = c3BadValue13;
void c3Bad13;

const resilienceCause: RecoveryCause = 'worker-crash';
const resilienceRetry: RetryOptions = {
  maxAttempts: 3,
  backoffMs: 100,
  on: [resilienceCause, 'execution-lease'],
};
const alternativeBytes = registry.register<Uint8Array, Uint8Array<ArrayBuffer>>(
  'alternative-bytes',
  new URL('./fixture.js', import.meta.url),
);
const resilienceOptions: RunOptions<Uint8Array, Uint8Array<ArrayBuffer>> = {
  repeatable: true,
  cancellation: 'terminate',
  retry: resilienceRetry,
  fallback: { task: alternativeBytes, on: ['task-error'] },
};
const resilientBytes: Promise<Uint8Array<ArrayBuffer>> = runtime.run(
  task,
  data,
  resilienceOptions,
);
// Existing non-generic options and interface extensions remain accepted.
interface LegacyRunOptions extends RunOptions {
  applicationLabel?: string;
}
const legacyOptions: LegacyRunOptions = {
  timeout: 1000,
  cancellation: 'settle',
};
void runtime.run(task, data, legacyOptions);
void resilientBytes;
const wrongFallbackInput = registry.register<string, Uint8Array<ArrayBuffer>>(
  'wrong-fallback-input',
  new URL('./fixture.js', import.meta.url),
);
const wrongFallbackOutput = registry.register<Uint8Array, string>(
  'wrong-fallback-output',
  new URL('./fixture.js', import.meta.url),
);
runtime.run(task, data, {
  repeatable: true,
  // @ts-expect-error Fallback cannot widen the primary input schema.
  fallback: { task: wrongFallbackInput },
});
runtime.run(task, data, {
  repeatable: true,
  // @ts-expect-error Fallback cannot widen the primary output schema.
  fallback: { task: wrongFallbackOutput },
});
runtime.run(task, data, {
  repeatable: true,
  // @ts-expect-error Host functions are not registered fallback handles.
  fallback: { task: async () => data },
});
runtime.run(task, data, {
  // @ts-expect-error Cancellation is an explicit closed policy.
  cancellation: 'cooperate',
});
runtime.run(task, data, {
  repeatable: true,
  // @ts-expect-error Serialization failures are never recovery causes.
  retry: { maxAttempts: 2, on: ['serialization'] },
});
runtime.partitionRange(task, range, () => ({ input: data }), {
  repeatable: true,
  retry: resilienceRetry,
});
runtime.parallelFor(task, range, () => ({ input: data }), {
  cancellation: 'terminate',
});

const checkpointLimits: WorkerResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 8,
  codeRangeSizeMb: 16,
  stackSizeMb: 2,
};
void new PjsRuntime({
  registry,
  minWorkers: 1,
  maxWorkers: 4,
  idleTimeout: 1000,
  resourceLimits: checkpointLimits,
});
void runtime.partitionRange(task, range, () => ({ input: data }), {
  cancellation: 'terminate',
});
void runtime.parallelMapRange(task, range, () => ({ input: data }), {
  outputConstructor: Uint8Array,
  cancellation: 'terminate',
});
void runtime.streamRange(task, range, () => ({ input: data }), {
  cancellation: 'terminate',
  resultBytes: 8,
  maxReservedResultBytes: 32,
});
void new PjsRuntime({
  registry,
  // @ts-expect-error Idle timeout uses integer milliseconds, not a string policy.
  idleTimeout: '1s',
});
void new PjsRuntime({
  registry,
  resourceLimits: {
    // @ts-expect-error Resource limits do not expose a total RSS cap.
    rss: 128,
  },
});
void new PjsRuntime({
  registry,
  resourceLimits: {
    // @ts-expect-error Node engine limits use numbers in MiB.
    stackSizeMb: '2MB',
  },
});
void runtime.parallelFor(task, range, () => ({ input: data }), {
  repeatable: true,
  retry: resilienceRetry,
});

// Checkpoint 2: infer reconstruction and fallback from the registered task schema.
const rebuildOptions: RunOptions<
  Uint8Array<ArrayBufferLike>,
  Uint8Array<ArrayBuffer>
> = {
  repeatable: true,
  retry: { maxAttempts: 2 },
  rebuildInput: (next: RecoveryAttempt) => {
    const implementation: 'primary' | 'fallback' = next.implementation;
    void implementation;
    return { input: data, transferList: [new ArrayBuffer(8)] };
  },
};
runtime.run(task, data, rebuildOptions);
runtime.run(task, data, {
  repeatable: true,
  retry: { maxAttempts: 2 },
  // @ts-expect-error Reconstruction must return the original input schema.
  rebuildInput: () => ({ input: 'wrong' }),
});
runtime.run(task, data, {
  repeatable: true,
  retry: { maxAttempts: 2 },
  // @ts-expect-error Reconstruction is synchronous.
  rebuildInput: async () => ({ input: data }),
});
runtime.partitionRange(task, range, () => ({ input: data }), {
  repeatable: true,
  retry: { maxAttempts: 2 },
  fallback: { task },
  rebuildInput: (partition, next) => {
    const index: number = partition.index;
    const attempt: number = next.attempt;
    void index;
    void attempt;
    return { input: data };
  },
});
runtime.partitionRange(task, range, () => ({ input: data }), {
  repeatable: true,
  // @ts-expect-error A range fallback cannot widen the primary output.
  fallback: { task: wrongFallbackOutput },
});
// @ts-expect-error Typed mapping fallback must return the same block kind.
runtime.parallelMapRange(task, range, () => ({ input: data }), {
  outputConstructor: Uint8Array,
  repeatable: true,
  fallback: { task: wrongFallbackOutput },
});
runtime.streamRange(task, range, () => ({ input: data }), {
  resultBytes: 8,
  maxReservedResultBytes: 32,
  repeatable: true,
  fallback: { task },
  rebuildInput: () => ({ input: data }),
});
const contextFunction = (input: number, context: TaskContext): number => {
  context.throwIfCancelled();
  const signal: AbortSignal = context.signal;
  void signal;
  return input;
};
void contextFunction;
