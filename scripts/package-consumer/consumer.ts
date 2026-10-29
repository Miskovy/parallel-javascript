import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { diagnosticContracts, errorContracts } from './diagnostics.js';
import { containmentContracts } from './containment.js';
import type {
  CountOnlyStreamRangeOptions,
  PjsRangeStream,
  StreamRangeResult,
  PjsBinaryResult,
  ResultByteDeclaration,
  RangePartition,
  PartitionOptions,
  TypedMapRangeOptions,
  BinaryStreamRangeOptions,
  UpperBoundBinaryStreamRangeOptions,
} from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register<number, number>(
  'double',
  new URL('./task.js', import.meta.url),
  'double',
);
const binaryTask = registry.register<{ move: boolean }, PjsBinaryResult>(
  'owned',
  new URL('./task.js', import.meta.url),
  'ownedBinary',
);
const arrayTask = registry.register<RangePartition, number[]>(
  'array',
  new URL('./task.js', import.meta.url),
  'arrayBlock',
);
const typedTask = registry.register<RangePartition, Float64Array<ArrayBuffer>>(
  'typed',
  new URL('./task.js', import.meta.url),
  'typedBlock',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
try {
  const range = { start: 0, end: 5, grainSize: 2 };
  const batchOptions: PartitionOptions[] = [
    { dispatchBatchSize: 16 },
    { dispatchBatchSize: 1 },
  ];
  for (const option of batchOptions) {
    const collected: number[][] = await runtime.partitionRange(
      arrayTask,
      range,
      (partition) => ({ input: partition }),
      option,
    );
    assert.deepEqual(collected.flat(), [0, 2, 4, 6, 8]);
    const completed: void = await runtime.parallelFor(
      arrayTask,
      range,
      (partition) => ({ input: partition }),
      option,
    );
    assert.equal(completed, undefined);
    const mapped: number[] = await runtime.parallelMapRange(
      arrayTask,
      range,
      (partition) => ({ input: partition }),
      option,
    );
    assert.deepEqual(mapped, [0, 2, 4, 6, 8]);
  }
  const constructors: TypedMapRangeOptions<Float64ArrayConstructor>[] = [
    { outputConstructor: Float64Array, dispatchBatchSize: 2 },
    {
      outputConstructor: Float64Array,
      dispatchBatchSize: 2,
    },
  ];
  for (const option of constructors) {
    const mapped: Float64Array<ArrayBuffer> = await runtime.parallelMapRange(
      typedTask,
      range,
      (partition) => ({ input: partition }),
      option,
    );
    assert.deepEqual(mapped, new Float64Array([0, 2, 4, 6, 8]));
  }
  const bytes: ResultByteDeclaration = (partition) =>
    (partition.end - partition.start) * 16;
  for (const move of [false, true]) {
    const binaryOptions:
      BinaryStreamRangeOptions | UpperBoundBinaryStreamRangeOptions = move
      ? {
          maxResultBytes: bytes,
          maxReservedResultBytes: 16,
          dispatchBatchSize: 2,
          maxBufferedResults: 1,
        }
      : {
          resultBytes: bytes,
          maxReservedResultBytes: 16,
          dispatchBatchSize: 1,
          maxBufferedResults: 1,
        };
    const binary: PjsRangeStream<PjsBinaryResult> = runtime.streamRange(
      binaryTask,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { move } }),
      binaryOptions,
    );
    for await (const { output } of binary) {
      assert.ok(output instanceof BigInt64Array);
      assert.equal(output.byteLength, 16);
      assert.equal(output[0], 42n);
    }
  }
  const migrated: (
    BinaryStreamRangeOptions | UpperBoundBinaryStreamRangeOptions
  )[] = [
    {
      resultBytes: 16,
      maxReservedResultBytes: 16,
      dispatchBatchSize: 2,
      maxBufferedResults: 1,
    },
    {
      maxResultBytes: 16,
      maxReservedResultBytes: 16,
      dispatchBatchSize: 2,
      maxBufferedResults: 1,
    },
  ];
  for (const option of migrated) {
    const stream: PjsRangeStream<PjsBinaryResult> = runtime.streamRange(
      binaryTask,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { move: false } }),
      option,
    );
    try {
      for await (const { output } of stream)
        assert.equal(output.byteLength, 16);
    } finally {
      await stream.return();
    }
  }
  const result: number = await runtime.run(task, 21, {
    signal: new AbortController().signal,
    timeout: 5000,
  });
  assert.equal(result, 42);
  diagnosticContracts(runtime);
  errorContracts();
  const options: CountOnlyStreamRangeOptions = {
    maxBufferedResults: 1,
  };
  const stream: PjsRangeStream<number> = runtime.streamRange(
    task,
    { start: 0, end: 3, grainSize: 1 },
    (partition) => ({ input: partition.index }),
    options,
  );
  const compatible: AsyncIterable<StreamRangeResult<number>> = stream;
  assert.equal(stream[Symbol.asyncIterator](), stream);
  try {
    for await (const item of compatible) {
      const output: number = item.output;
      assert.equal(output, 0);
      break;
    }
  } finally {
    await stream.return();
  }
  const completion = await stream.next();
  assert.equal(completion.done, true);
  if (completion.done) {
    const value: undefined = completion.value;
    assert.equal(value, undefined);
  }
  const closedBeforeRead = runtime.streamRange(
    task,
    { start: 0, end: 2, grainSize: 1 },
    (partition) => ({ input: partition.index }),
  );
  await closedBeforeRead.return();
  const thrown = runtime.streamRange(
    task,
    { start: 0, end: 2, grainSize: 1 },
    (partition) => ({ input: partition.index }),
  );
  const reason = new Error('installed TypeScript close');
  await assert.rejects(thrown.throw(reason), (error) => error === reason);
  assert.deepEqual(await thrown.next(), { done: true, value: undefined });
} finally {
  await runtime.shutdown();
}
console.log(
  JSON.stringify({
    c2TypeConsumer: true,
    methods: [
      'partitionRange',
      'parallelFor',
      'streamRange',
      'parallelMapRange',
    ],
    overloads: ['count', 'exact', 'upper-bound', 'array', 'typed'],
    aliasesRetained: false,
  }),
);
await containmentContracts();
