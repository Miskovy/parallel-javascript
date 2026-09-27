import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '../dist/index.js';
import {
  matrices,
  multiplyRows,
  referenceMultiply,
} from '../../../benchmarks/matrix-multiplication/task.mjs';

test('matrix kernel agrees with independent reference on unequal signed entries', () => {
  for (const size of [1, 2, 7, 17])
    assert.deepEqual(
      multiplyRows(matrices(size)).output,
      referenceMultiply(matrices(size)),
    );
  assert.deepEqual(
    multiplyRows({
      a: new Float64Array([1, 2, 3, 4]),
      b: new Float64Array([5, 6, 7, 8]),
      size: 2,
    }).output,
    new Float64Array([19, 22, 43, 50]),
  );
});

for (const mode of ['clone', 'shared'])
  test(`uneven matrix row partitions execute correctly across multiple workers (${mode})`, async (t) => {
    const registry = new PjsTaskRegistry();
    const task = registry.register(
      'matrix',
      new URL(
        '../../../benchmarks/matrix-multiplication/task.mjs',
        import.meta.url,
      ),
      'multiplyRows',
    );
    const runtime = new PjsRuntime({ registry, workers: 4 });
    t.after(() => runtime.shutdown({ drain: false }));
    await runtime.ready();
    const input = matrices(17);
    if (mode === 'shared') input.b = sharedReadonly(input.b);
    const rows = await Promise.all(
      Array.from({ length: 4 }, (_, i) => {
        const from = Math.floor((17 * i) / 4),
          to = Math.floor((17 * (i + 1)) / 4);
        return runtime.run(task, {
          ...input,
          a: input.a.slice(from * 17, to * 17),
          rows: to - from,
        });
      }),
    );
    const output = new Float64Array(17 * 17);
    rows.forEach((row, i) =>
      output.set(row.output, Math.floor((17 * i) / 4) * 17),
    );
    assert.deepEqual(output, referenceMultiply(input));
    assert.equal(new Set(rows.map((row) => row.threadId)).size, 4);
  });
