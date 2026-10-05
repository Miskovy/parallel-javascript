import assert from 'node:assert/strict';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const module = new URL('./tasks.mjs', import.meta.url);
const exact = registry.register('exact', module, 'exactBytes');
const filtered = registry.register('filtered', module, 'filteredBytes');
const runtime = new PjsRuntime({ registry, workers: 2 });
const data = sharedReadonly(
  Uint8Array.from({ length: 32769 }, (_, i) => i % 256),
);
const range = { start: 0, end: data.length, grainSize: 4096 };
const factory = (partition) => ({ input: { partition, data } });

try {
  // Consumer-owned reconstruction memory is outside PJS result credits.
  const reconstructed = new Uint8Array(data.length);
  for await (const { partition, output } of runtime.streamRange(
    exact,
    range,
    factory,
    {
      experimentalMaxBufferedResults: 4,
      experimentalResultBytes: (partition) => partition.end - partition.start,
      experimentalMaxReservedResultBytes: 16384,
    },
  )) {
    reconstructed.set(output, partition.start);
  }
  assert.deepEqual(
    reconstructed,
    data.map((value) => value ^ 255),
  );

  const blocks = [];
  for await (const { partition, output } of runtime.streamRange(
    filtered,
    range,
    factory,
    {
      experimentalMaxBufferedResults: 4,
      experimentalMaxResultBytes: (partition) =>
        partition.end - partition.start,
      experimentalMaxReservedResultBytes: 16384,
    },
  )) {
    // Restore logical order explicitly; this finite example retains all blocks.
    blocks[partition.index] = output;
  }
  assert.deepEqual(
    Uint8Array.from(blocks.flatMap((block) => [...block])),
    data.filter((value) => value % 2 === 0),
  );
  assert.ok(runtime.stats().streamResults.refundedResultBytes > 0);
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
  console.log('streaming-binary ok');
} finally {
  await runtime.shutdown();
}
