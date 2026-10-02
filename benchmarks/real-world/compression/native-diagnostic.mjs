import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { bound, codecQualification, corpus, options } from './core.mjs';

const qualification = codecQualification();
assert.equal(qualification.codec.family, 'zlib-ng');
const rows = [];
for (const native of qualification.native.rows.filter(
  (r) => r.windowBits === -15,
)) {
  const selected = bound(native.inputBytes);
  const actual = {};
  for (const kind of ['high', 'moderate', 'poor']) {
    const input = corpus(kind, native.inputBytes);
    const output = deflateRawSync(input, options(native.level));
    assert.ok(output.length <= native.nativeBound);
    assert.deepEqual(new Uint8Array(inflateRawSync(output)), input);
    actual[kind] = output.length;
  }
  assert.equal(selected, native.nativeBound);
  rows.push({
    ...native,
    codec: qualification.codec,
    parameters: options(native.level),
    benchmarkBound: selected,
    difference: selected - native.nativeBound,
    actualCompressedBytes: actual,
    qualificationStatus: 'qualified',
  });
}
await writeFile(
  process.argv[2],
  JSON.stringify(
    {
      milestone: '0.14',
      clientDate: '2026-10-02',
      node: process.version,
      qualification,
      complete: true,
      rows,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  `${rows.length} native raw bounds match; ${rows.length * 3} actual outputs round-trip`,
);
