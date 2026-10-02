import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const module = new URL('./tasks.mjs', import.meta.url);
const map = registry.register('map', module, 'mapRange');
const fill = registry.register('fill', module, 'fillShared');
const native = registry.register('native', module, 'nativeDigest');
const runtime = new PjsRuntime({ registry, workers: 2 });
const data = sharedReadonly(Float64Array.from({ length: 16385 }, (_, i) => i));
const range = { start: 0, end: data.length, grainSize: 4096 };

try {
  const mapped = await runtime.parallelMapRange(
    map,
    range,
    (partition) => ({ input: { partition, data } }),
    { experimentalOutputConstructor: Float64Array },
  );
  const output = new Float64Array(new SharedArrayBuffer(data.byteLength));
  await runtime.parallelFor(fill, range, (partition) => ({
    input: { partition, output }, // Each child writes a disjoint interval.
  }));
  assert.deepEqual(mapped, output);
  assert.equal(mapped.at(-1), 32768);

  // Generic dedicated-native-compute recipe; this is a correctness example.
  const bytes = new Uint8Array(128 * 1024).fill(7);
  assert.equal(
    await runtime.run(native, bytes),
    createHash('sha256').update(bytes).digest('hex'),
  );
  console.log('range-work ok');
} finally {
  await runtime.shutdown();
}
