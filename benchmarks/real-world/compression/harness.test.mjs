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
import {
  compressionBound,
  fixedParameters,
  identifyCodec,
  qualifyCodec,
  fedoraBuild,
} from './codec.mjs';

const stock = qualifyCodec({ version: '1.3.1' });
const ng = qualifyCodec({
  version: '1.3.1.zlib-ng',
  implementationVersion: '2.3.3',
  build: fedoraBuild,
});

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
  assert.equal(bound(0, stock), 7);
  assert.equal(bound(4096, stock), 4104);
  assert.equal(bound(4 * MiB, stock), 4 * MiB + 1024 + 256 + 7);
  assert.equal(bound(2 ** 32, stock), 2 ** 32 + 2 ** 20 + 2 ** 18 + 128 + 7);
  for (const n of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER])
    assert.throws(() => bound(n, stock));
});
test('codec identification separates stock, Motley, zlib-ng and unknown identifiers', () => {
  assert.equal(identifyCodec('1.3.1').family, 'stock-zlib');
  assert.equal(identifyCodec('1.3.2.1-motley-8002e91').family, 'stock-zlib');
  assert.equal(identifyCodec('1.3.1.zlib-ng').family, 'zlib-ng');
  assert.equal(identifyCodec('1.3.1.unresearched').family, 'unknown');
  assert.equal(identifyCodec(undefined).family, 'unknown');
});
test('qualification rejects unknown versions and zlib-ng without exact build provenance', () => {
  for (const version of [
    undefined,
    '1.3.2',
    '1.3.1.evil',
    '1.3.2.1-motley-future',
    '1.3.2.zlib-ng',
  ])
    assert.throws(() => qualifyCodec({ version }), /Unqualified/);
  assert.throws(
    () => qualifyCodec({ version: '1.3.1.zlib-ng' }),
    /Unqualified/,
  );
  assert.throws(
    () => qualifyCodec({ ...ng, implementationVersion: '2.3.4' }),
    /Unqualified/,
  );
  assert.throws(
    () => qualifyCodec({ ...ng, build: 'quick-enabled' }),
    /Unqualified/,
  );
});
test('zlib-ng suffix can never select the stock reservation contract', () => {
  assert.equal(bound(MiB, stock), 1048903);
  assert.equal(
    bound(MiB, qualifyCodec({ version: '1.3.2.1-motley-8002e91' })),
    1048903,
  );
  assert.equal(bound(MiB, ng), 1114119);
  assert.throws(() => bound(MiB, { ...stock, version: '1.3.1.zlib-ng' }));
  assert.throws(() => bound(MiB, { ...ng, family: 'stock-zlib' }));
});
test('zlib-ng bound handles small division boundaries and all supported levels', () => {
  for (const n of [
    0, 1, 2, 3, 7, 15, 16, 17, 63, 64, 65, 127, 128, 255, 256, 4095, 4096, 4097,
  ]) {
    assert.equal(bound(n, ng), n + Math.floor(n / 16) + 7);
    for (const level of [1, 6, 9])
      assert.equal(
        compressionBound({
          codec: ng,
          inputBytes: n,
          parameters: { ...fixedParameters, level },
        }),
        bound(n, ng),
      );
  }
});
test('codec formulas check exact safe-integer overflow without allocating input', () => {
  for (const codec of [stock, ng]) {
    for (const n of [-1, 1.5, NaN, Infinity, 2 ** 53, Number.MAX_SAFE_INTEGER])
      assert.throws(() => bound(n, codec), RangeError);
    let low = 0,
      high = Number.MAX_SAFE_INTEGER;
    while (low < high) {
      const mid = low + Math.ceil((high - low) / 2);
      try {
        bound(mid, codec);
        low = mid;
      } catch {
        high = mid - 1;
      }
    }
    assert.ok(Number.isSafeInteger(bound(low, codec)));
    assert.throws(() => bound(low + 1, codec), /overflow/);
  }
});
test('bound contracts reject unsupported wrappers, parameters, dictionaries and flushes', () => {
  for (const codec of [stock, ng]) {
    for (const mode of ['zlib', 'gzip', 'unknown'])
      assert.throws(
        () => compressionBound({ codec, inputBytes: 1, mode }),
        /wrapper/,
      );
    for (const change of [
      { windowBits: 14 },
      { memLevel: 9 },
      { strategy: 1 },
      { flush: 2 },
      { finishFlush: 0 },
      { dictionary: new Uint8Array() },
      { level: 0 },
      { level: 2 },
      { extra: true },
    ])
      assert.throws(
        () =>
          compressionBound({
            codec,
            inputBytes: 1,
            parameters: { ...fixedParameters, ...change },
          }),
        /parameters/,
      );
  }
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
    for (const c of cells)
      assert.ok(preflight(c, 4, stock).estimateBytes > c.bytes);
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
