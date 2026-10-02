import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { executor } from './executors.mjs';
import { distribution } from './support.mjs';
import { matrix } from './matrix.mjs';

test('empty measurements stay unavailable and percentiles preserve the slow tail', () => {
  assert.equal(distribution([null, undefined, NaN]), null);
  const stats = distribution([1, 2, 3, 4, 100]);
  assert.equal(stats.p50, 3);
  assert.equal(stats.p95, 100);
  assert.equal(stats.count, 5);
  assert.ok(stats.cv > 1);
});

test('matrix has unique cells, required sizes, ownership modes and Argon2 lanes', () => {
  const cases = matrix();
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const size of [1024, 65536, 1048576, 8388608])
    for (const ownership of ['clone', 'shared', 'transfer'])
      assert.ok(
        cases.some(
          (c) =>
            c.kind === 'sha' &&
            c.size === size &&
            c.ownership === ownership &&
            c.model === 'pjs',
        ),
      );
  for (const workers of [1, 2, 4])
    for (const lanes of [1, 2, 4])
      assert.ok(
        cases.some(
          (c) =>
            c.kind === 'argon2' && c.workers === workers && c.lanes === lanes,
        ),
      );
});

for (const model of ['pjs', 'raw'])
  test(`${model} returns transferred input ownership and independently correct SHA`, async () => {
    const pool = await executor({ model, workers: 1 });
    try {
      const data = new Uint8Array([1, 2, 3, 4]);
      const expected = createHash('sha256').update(data).digest('hex');
      const output = await pool.run({
        kind: 'sha',
        algorithm: 'sha256',
        data,
        ownership: 'transfer',
        batch: 1,
      });
      assert.equal(data.byteLength, 0);
      assert.deepEqual([...output.data], [1, 2, 3, 4]);
      assert.deepEqual(output.value, [expected]);
      assert.ok(output.executionMs >= 0);
    } finally {
      await pool.close();
    }
  });
