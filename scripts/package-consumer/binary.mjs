import assert from 'node:assert/strict';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsBinaryResultContractError,
} from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register(
  'binary-contract',
  new URL('./tasks.mjs', import.meta.url),
  'binaryContract',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
const range = { start: 0, end: 1, grainSize: 1 };
const kinds = [
  'ArrayBuffer',
  'DataView',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
];
function stream(input, mode, declared) {
  return runtime.streamRange(task, range, () => ({ input }), {
    [mode === 'exact'
      ? 'experimentalResultBytes'
      : 'experimentalMaxResultBytes']: declared,
    experimentalMaxReservedResultBytes: declared,
  });
}
try {
  await runtime.ready();
  for (const mode of ['exact', 'upper-bound']) {
    for (const move of [false, true]) {
      for (const kind of kinds) {
        for (const bytes of [0, 16]) {
          const before = runtime.stats().streamResults;
          let count = 0;
          // Views have an offset and a larger backing store. Credit counts visible bytes.
          for await (const { output } of stream(
            { kind, bytes, move },
            mode,
            bytes + (mode === 'upper-bound' ? 8 : 0),
          )) {
            count++;
            assert.equal(output.byteLength, bytes);
            assert.ok(
              (ArrayBuffer.isView(output) ? output.buffer : output) instanceof
                ArrayBuffer,
            );
            if (kind !== 'ArrayBuffer') {
              assert.equal(output.constructor.name, kind);
              assert.equal(output.byteOffset, 8);
              assert.equal(output.buffer.byteLength, bytes + 16);
            }
            const visible =
              output instanceof ArrayBuffer
                ? new Uint8Array(output)
                : new Uint8Array(
                    output.buffer,
                    output.byteOffset,
                    output.byteLength,
                  );
            assert.ok(visible.every((value) => value === 37));
          }
          assert.equal(count, 1);
          const after = runtime.stats().streamResults;
          assert.equal(after.currentReservedResultBytes, 0);
          assert.equal(
            after.refundedResultBytes - before.refundedResultBytes,
            mode === 'upper-bound' ? 8 : 0,
          );
        }
      }
    }
    const invalid = [
      ...['SharedArrayBuffer', 'shared-typed', 'shared-view', 'object'].flatMap(
        (kind) => [false, true].map((move) => ({ kind, bytes: 8, move })),
      ),
      ...['ArrayBuffer', 'DataView', 'Uint8Array'].map((kind) => ({
        kind,
        bytes: 8,
        detached: true,
      })),
      { kind: 'ArrayBuffer', bytes: 0, detached: true },
      { kind: 'Uint8Array', bytes: 16 },
      { kind: 'Uint8Array', bytes: 16, move: true },
      ...(mode === 'exact' ? [{ kind: 'Uint8Array', bytes: 4 }] : []),
    ];
    for (const input of invalid) {
      const before = runtime.stats().streamResults;
      await assert.rejects(
        async () => {
          for await (const item of stream(input, mode, 8)) void item;
        },
        (error) => {
          assert.ok(error instanceof PjsBinaryResultContractError);
          assert.equal(error.declaredBytes, 8);
          assert.equal(error.partitionIndex, 0);
          return true;
        },
      );
      const after = runtime.stats().streamResults;
      assert.equal(after.produced, before.produced);
      assert.equal(after.currentReservedResultBytes, 0);
      assert.equal(
        after.binaryResultContractFailures,
        before.binaryResultContractFailures + 1,
      );
    }
  }
  // Count-only and mapping retain their shared-capable runtime behavior.
  for await (const { output } of runtime.streamRange(task, range, () => ({
    input: { kind: 'shared-typed', bytes: 8 },
  })))
    assert.ok(output.buffer instanceof SharedArrayBuffer);
  const mapped = await runtime.parallelMapRange(
    task,
    { start: 0, end: 8, grainSize: 8 },
    () => ({ input: { kind: 'shared-typed', bytes: 8 } }),
    { experimentalOutputConstructor: Uint8Array },
  );
  assert.ok(mapped.buffer instanceof ArrayBuffer);
  assert.equal(mapped.length, 8);
} finally {
  await runtime.shutdown({ drain: false });
}
