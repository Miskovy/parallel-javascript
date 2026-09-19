import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const double = registry.register(
  'double',
  new URL('./transfer-task.mjs', import.meta.url),
  'double',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
try {
  await runtime.ready();
  const values = new Float64Array([1, 2, 3, 4]);
  const result = runtime.run(double, values, { transferList: [values.buffer] });
  assert.equal(values.byteLength, 0);
  const output = await result;
  assert.deepEqual([...output], [2, 4, 6, 8]);
  console.log({ senderByteLength: values.byteLength, output: [...output] });
} finally {
  await runtime.shutdown();
}
