import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const sum = registry.register(
  'sum',
  new URL('./tasks.mjs', import.meta.url),
  'sumRange',
);
const runtime = new PjsRuntime({ registry, workers: 2 });
const data = sharedReadonly(Float64Array.from({ length: 32769 }, (_, i) => i));

try {
  const sums = await runtime.partitionRange(
    sum,
    { start: 0, end: data.length, grainSize: 4096 },
    (partition) => ({ input: { partition, data } }),
  );
  const total = sums.reduce((a, b) => a + b, 0);
  assert.equal(total, ((data.length - 1) * data.length) / 2);
  assert.equal(data[100], 100); // Shared backing is reusable, immutable by contract.
  console.log('shared-input ok');
} finally {
  await runtime.shutdown();
}
