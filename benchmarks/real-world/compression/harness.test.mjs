import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { distribution } from '../crypto/support.mjs';
import {
  bound,
  blocks,
  corpus,
  MiB,
  options,
  preflight,
  reconstruct,
  view,
} from './core.mjs';
import { matrix } from './matrix.mjs';
import { validateReport } from './report.mjs';

test('deterministic corpus, nontrivial entropy ordering and shared view', () => {
  const sizes = [];
  for (const kind of ['high', 'moderate', 'poor']) {
    const data = corpus(kind, 64 * 1024);
    assert.deepEqual(data, corpus(kind, data.length));
    sizes.push(deflateRawSync(data, options()).length);
  }
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2]);
  assert.notDeepEqual(corpus('poor', 1024, 1), corpus('poor', 1024, 2));
  const sab = new SharedArrayBuffer(16),
    bytes = new Uint8Array(sab);
  const buffer = view(bytes, 3, 8);
  assert.equal(buffer.buffer, sab);
  bytes[3] = 19;
  assert.equal(buffer[0], 19);
  assert.equal(buffer.length, 5);
  assert.throws(() => corpus('poor', 8, 0));
});
test('safe bound arithmetic handles boundaries and rejects overflow', () => {
  assert.equal(bound(0), 7);
  assert.equal(bound(4096), 4104);
  assert.equal(bound(4 * MiB), 4 * MiB + 1024 + 256 + 7);
  assert.equal(bound(2 ** 32), 2 ** 32 + 2 ** 20 + 2 ** 18 + 128 + 7);
  for (const n of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER])
    assert.throws(() => bound(n));
});
test('independent shuffled blocks reconstruct exactly; reject gaps/duplicates/metadata', () => {
  const data = corpus('moderate', 100003);
  const records = blocks(data, 16384, 6).map((b) => ({
    ...b,
    start: b.index * 16384,
  }));
  assert.deepEqual(reconstruct([...records].reverse(), data.length), data);
  assert.throws(() => reconstruct(records.slice(1), data.length));
  assert.throws(() => reconstruct([...records, records[0]], data.length));
  assert.throws(() =>
    reconstruct([{ ...records[0], compressedBytes: 1 }], data.length),
  );
  for (const b of records)
    assert.ok(
      Buffer.from(data.subarray(b.start, b.start + b.originalBytes)).equals(
        inflateRawSync(b.payload),
      ),
    );
});
test('sample aggregation keeps slow observations and uses sample CV', () => {
  const d = distribution([1, 2, 3, 100]);
  assert.equal(d.count, 4);
  assert.equal(d.p50, 2);
  assert.equal(d.max, 100);
  assert.equal(d.p99, 100);
  assert.equal(d.mean, 26.5);
  assert.ok(d.cv > 1);
  assert.equal(distribution([]), null);
});
test('matrix unique, fair primary models, natural exact inflate and safe preflight', () => {
  for (const profile of ['smoke', 'full', 'reproduce', 'memory']) {
    const cells = matrix(profile);
    assert.equal(new Set(cells.map((c) => c.id)).size, cells.length);
    for (const c of cells.filter((c) => c.group === 'primary'))
      assert.equal(
        cells.filter(
          (d) =>
            d.group === 'primary' &&
            c.corpus === d.corpus &&
            c.level === d.level &&
            c.grain === d.grain,
        ).length,
        4,
      );
    for (const c of cells.filter((c) => c.direction === 'inflate'))
      assert.equal(c.credit, 'exact');
    for (const c of cells) assert.ok(preflight(c).estimateBytes > c.bytes);
  }
  assert.throws(() => matrix('typo'));
});

test('report refuses partial, failed or missing-trial campaigns', () => {
  const sample = {
    complete: true,
    failure: null,
    profile: 'full',
    runtimeBefore: {},
    runtimeAfter: {},
    harnessBefore: {},
    harnessAfter: {},
    cells: [
      {
        config: { id: 'test' },
        warmups: Array.from({ length: 2 }, () => ({
          correctness: true,
          wallMs: 1,
        })),
        trials: Array.from({ length: 6 }, () => ({
          correctness: true,
          wallMs: 1,
          terminal: { reservedBytes: 0 },
        })),
      },
    ],
  };
  validateReport(sample);
  assert.throws(() => validateReport({ ...sample, complete: false }));
  assert.throws(() => validateReport({ ...sample, failure: 'corrupt' }));
  assert.throws(() =>
    validateReport({
      ...sample,
      cells: [{ ...sample.cells[0], trials: sample.cells[0].trials.slice(1) }],
    }),
  );
});
