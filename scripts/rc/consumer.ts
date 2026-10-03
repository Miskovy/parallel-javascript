import assert from 'node:assert/strict';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsTaskError,
  PjsError,
  sharedReadonly,
  type PjsTask,
  type StreamRangeResult,
  type RunOptions,
} from '@pjs/runtime';

interface Input {
  value?: number;
  mode?: string;
  data?: Float64Array;
  partition?: { index: number; start: number; end: number };
  bytes?: number;
  fail?: boolean;
}
const registry = new PjsTaskRegistry();
const task: PjsTask<Input, number> = registry.register(
  'value',
  new URL('../tasks.mjs', import.meta.url),
  'work',
);
const binary = registry.register<Input, Uint8Array>(
  'binary',
  new URL('../tasks.mjs', import.meta.url),
  'work',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
const options: RunOptions = {
  signal: new AbortController().signal,
  timeout: 5000,
};
try {
  assert.equal(await runtime.run(task, { value: 42 }, options), 42);
  const shared = sharedReadonly(new Float64Array([1, 2, 3]));
  assert.equal(await runtime.run(task, { mode: 'sum', data: shared }), 6);
  const stream: AsyncIterable<StreamRangeResult<Uint8Array>> =
    runtime.streamRange(
      binary,
      { start: 0, end: 5, grainSize: 2 },
      (partition) => ({ input: { partition, mode: 'binary', bytes: 8 } }),
      { experimentalResultBytes: 8, experimentalMaxReservedResultBytes: 16 },
    );
  let count = 0;
  for await (const { output } of stream) {
    assert.equal(output.byteLength, 8);
    count++;
  }
  assert.equal(count, 3);
  await assert.rejects(
    runtime.run(task, { fail: true }),
    (error) => error instanceof PjsTaskError && error instanceof PjsError,
  );
} finally {
  await runtime.shutdown();
}
console.log(
  JSON.stringify({
    passed: true,
    genericRun: true,
    abortSignal: true,
    shared: true,
    streamType: true,
    errorIdentity: true,
    shutdown: true,
  }),
);
