import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { diagnosticContracts, errorContracts } from './diagnostics.js';
import type {
  CountOnlyStreamRangeOptions,
  PjsRangeStream,
  StreamRangeResult,
  PjsBinaryResult,
  ResultByteDeclaration,
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
const runtime = new PjsRuntime({ registry, workers: 1 });
try {
  const bytes: ResultByteDeclaration = (partition) =>
    (partition.end - partition.start) * 16;
  for (const move of [false, true]) {
    const binary: PjsRangeStream<PjsBinaryResult> = runtime.streamRange(
      binaryTask,
      { start: 0, end: 1, grainSize: 1 },
      () => ({ input: { move } }),
      {
        experimentalResultBytes: bytes,
        experimentalMaxReservedResultBytes: 16,
      },
    );
    for await (const { output } of binary) {
      assert.ok(output instanceof BigInt64Array);
      assert.equal(output.byteLength, 16);
      assert.equal(output[0], 42n);
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
    experimentalMaxBufferedResults: 1,
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
