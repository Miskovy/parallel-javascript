import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { config, cases, balancedOrder } from './config.mjs';
import {
  prepare,
  execute,
  collect,
  validate,
  imagePixel,
} from './src/kernels.mjs';
import { startMetrics } from './src/metrics.mjs';

test('preserved historical helpers are byte-identical', () => {
  for (const name of ['kernel', 'model', 'prng', 'stats'])
    assert.deepEqual(
      readFileSync(new URL(`./src/historical/${name}.mjs`, import.meta.url)),
      readFileSync(
        new URL(`../flagship-monte-carlo/src/${name}.mjs`, import.meta.url),
      ),
    );
});
test('primary boundaries do not depend on worker count, positions are balanced', () => {
  const a = cases(4, 'publication');
  const counts = Object.fromEntries(
    config.contenders.map((x) => [x, Array(6).fill(0)]),
  );
  for (let trial = 0; trial < 10; trial++)
    balancedOrder(config.contenders, trial, config.orderSeed).forEach(
      (c, i) => counts[c][i]++,
    );
  for (const values of Object.values(counts))
    assert.ok(values.every((x) => x === 1 || x === 2));
  assert.equal(a.cases.length, 13);
  const primary = a.cases.find((c) => c.id === 'monte-medium');
  for (const c of a.cases.filter((c) => c.study === 'scaling'))
    assert.equal(c.chunkSize, primary.chunkSize);
  assert.equal(cases(1, 'publication').cases.length, 11);
});
test('image tiles and halos match independent full-image weighted oracle', () => {
  const spec = {
    family: 'image',
    edge: 17,
    count: 17 * 17,
    chunkSize: 5,
    mode: 'clone',
  };
  const actual = collect(spec, prepare(spec).map(execute));
  const expected = new Uint8Array(actual.length);
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 0; y < 17; y++)
    for (let x = 0; x < 17; x++)
      for (let c = 0; c < 4; c++) {
        if (c === 3) {
          expected[(y * 17 + x) * 4 + c] = imagePixel(x, y, c, config.seed);
          continue;
        }
        let sum = 0,
          k = 0;
        for (let yy = y - 1; yy <= y + 1; yy++)
          for (let xx = x - 1; xx <= x + 1; xx++)
            sum +=
              weights[k++] *
              imagePixel(
                Math.max(0, Math.min(16, xx)),
                Math.max(0, Math.min(16, yy)),
                c,
                config.seed,
              );
        expected[(y * 17 + x) * 4 + c] = Math.floor((sum + 8) / 16);
      }
  validate(spec, actual, expected);
  actual[0] ^= 1;
  assert.throws(() => validate(spec, actual, expected));
});
test('uneven numerical batching preserves every logical chunk and result', () => {
  const spec = { family: 'numerical', count: 257, chunkSize: 4, batch: 1 };
  const plain = collect(spec, prepare(spec).map(execute));
  const batched = collect(
    { ...spec, batch: 8 },
    prepare({ ...spec, batch: 8 }).map(execute),
  );
  assert.deepEqual(plain, batched);
  assert.equal(plain.count, 257);
});
test('Monte Carlo coverage and path-bit checksum agree across chunk boundaries', () => {
  const spec = { family: 'monte', count: 37, chunkSize: 5 };
  const a = collect(spec, prepare(spec).map(execute));
  const b = collect(
    { ...spec, chunkSize: 37 },
    prepare({ ...spec, chunkSize: 37 }).map(execute),
  );
  validate(spec, a, b);
  assert.equal(a.count, 37);
});
test('armed timer captures synchronous blocking after flush', async () => {
  const finish = await startMetrics();
  const start = performance.now();
  while (performance.now() - start < 80) {
    /* Intentional serial CPU block. */
  }
  const metrics = await finish();
  assert.ok(metrics.timer.n > 0);
  assert.ok(metrics.timer.maxMs >= 50, JSON.stringify(metrics.timer));
  assert.ok(Number.isFinite(metrics.timer.p95Ms));
});
