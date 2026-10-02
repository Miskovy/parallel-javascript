import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { bound, checkZlib, corpus, MiB, options } from './core.mjs';
import { sourceHashes } from '../crypto/support.mjs';
checkZlib();
const results = [];
const sizes = [
  0,
  1,
  2,
  3,
  7,
  127,
  128,
  255,
  256,
  1023,
  1024,
  4095,
  4096,
  16383,
  16384,
  65535,
  65536,
  256 * 1024,
  MiB,
  4 * MiB,
];
for (const bytes of sizes)
  for (const level of [1, 6, 9])
    for (const kind of ['high', 'moderate', 'poor'])
      for (const seed of kind === 'poor'
        ? [1, 0x5eed1234, 0xffffffff]
        : [0x5eed1234]) {
        const input = corpus(kind, bytes, seed),
          output = deflateRawSync(input, options(level));
        assert.ok(output.length <= bound(bytes));
        assert.deepEqual(new Uint8Array(inflateRawSync(output)), input);
        results.push({
          bytes,
          level,
          kind,
          seed,
          actual: output.length,
          maximum: bound(bytes),
        });
      }
// Alternating literals/runs and byte ramps supplement deterministic PRNG fixtures.
for (const bytes of [1024, 65536, MiB, 4 * MiB])
  for (const level of [1, 6, 9])
    for (const pattern of ['ramp', 'alternating']) {
      const input = Uint8Array.from({ length: bytes }, (_, i) =>
        pattern === 'ramp' ? i % 256 : i % 257 === 0 ? (i >>> 8) % 256 : 255,
      );
      const output = deflateRawSync(input, options(level));
      assert.ok(output.length <= bound(bytes));
      assert.deepEqual(new Uint8Array(inflateRawSync(output)), input);
      results.push({
        bytes,
        level,
        pattern,
        actual: output.length,
        maximum: bound(bytes),
      });
    }
await writeFile(
  process.argv[2],
  JSON.stringify(
    {
      clientDate: '2026-10-02',
      node: process.version,
      zlib: process.versions.zlib,
      options: options(),
      harness: sourceHashes('benchmarks/real-world/compression'),
      complete: true,
      results,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(`${results.length} bound and round-trip fixtures passed`);
