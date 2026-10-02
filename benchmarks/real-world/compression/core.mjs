import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { constants, deflateRawSync, inflateRawSync } from 'node:zlib';
import { freemem, totalmem } from 'node:os';
import { compressionBound, qualifyCodec } from './codec.mjs';
import { probeInstalledCodec } from './native-bound.mjs';

export const MiB = 1024 ** 2;
export const seed = 0x5eed1234;
export function bound(n, codec = checkZlib()) {
  return compressionBound({ codec, inputBytes: n });
}
export function options(level = 6) {
  return {
    level,
    windowBits: 15,
    memLevel: 8,
    strategy: constants.Z_DEFAULT_STRATEGY,
    flush: constants.Z_NO_FLUSH,
    finishFlush: constants.Z_FINISH,
  };
}
export function corpus(kind, bytes, initialSeed = seed) {
  const result = new Uint8Array(bytes);
  let state = initialSeed >>> 0;
  if (!state) throw new RangeError('zero PRNG seed');
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  if (kind === 'poor') {
    for (let i = 0; i < bytes; i += 4) {
      const value = next();
      for (let j = 0; j < 4 && i + j < bytes; j++)
        result[i + j] = (value >>> (8 * j)) & 255;
    }
  } else if (kind === 'high') {
    const record = Buffer.from(
      '2026-10-02 INFO service=payments status=accepted route=/checkout region=synthetic\n',
    );
    for (let i = 0; i < bytes; i += record.length)
      result.set(record.subarray(0, Math.min(record.length, bytes - i)), i);
  } else if (kind === 'moderate') {
    let i = 0,
      index = 0;
    while (i < bytes) {
      const record = Buffer.from(
        JSON.stringify({
          id: index++,
          account: next(),
          route: `r${next() % 32}`,
          value: next(),
          status: ['ok', 'wait', 'retry'][next() % 3],
          token: next().toString(16),
        }) + '\n',
      );
      result.set(record.subarray(0, Math.min(record.length, bytes - i)), i);
      i += record.length;
    }
  } else throw new RangeError('unknown corpus');
  return result;
}
export function view(data, start = 0, end = data.byteLength) {
  return Buffer.from(data.buffer, data.byteOffset + start, end - start);
}
export function compact(bytes) {
  return Uint8Array.from(bytes);
}
export function compute(input) {
  const bytes = view(
    input.data,
    input.start ?? 0,
    input.end ?? input.data.byteLength,
  );
  return compact(
    input.direction === 'inflate'
      ? inflateRawSync(bytes)
      : deflateRawSync(bytes, options(input.level)),
  );
}
export function blocks(data, grain, level) {
  const result = [];
  for (let start = 0, index = 0; start < data.length; start += grain, index++) {
    const end = Math.min(data.length, start + grain);
    const payload = compact(
      deflateRawSync(view(data, start, end), options(level)),
    );
    result.push({
      index,
      originalBytes: end - start,
      compressedBytes: payload.length,
      payload,
    });
  }
  return result;
}
export function reconstruct(records, bytes) {
  const result = new Uint8Array(bytes),
    seen = new Set();
  for (const record of records) {
    assert.ok(!seen.has(record.index), 'duplicate block');
    seen.add(record.index);
    assert.equal(record.payload.length, record.compressedBytes);
    const output = inflateRawSync(record.payload);
    assert.equal(output.length, record.originalBytes);
    assert.ok(record.start >= 0 && record.start + output.length <= bytes);
    result.set(output, record.start);
  }
  const ranges = records
    .map((r) => [r.start, r.start + r.originalBytes])
    .sort((a, b) => a[0] - b[0]);
  let end = 0;
  for (const range of ranges) {
    assert.equal(range[0], end, 'gap/overlap');
    end = range[1];
  }
  assert.equal(end, bytes);
  return result;
}
export function preflight(config, repetitions = 4, codec = checkZlib()) {
  const estimate =
    3 * config.bytes +
    repetitions * bound(config.bytes, codec) +
    config.workers * (40 * MiB + 2 * config.grain + MiB);
  const limit = Math.min(freemem() / 2, totalmem() / 4);
  return { estimateBytes: estimate, limitBytes: limit, safe: estimate < limit };
}
let qualification;
export function checkZlib() {
  if (!qualification) {
    if (process.versions.zlib === '1.3.1.zlib-ng')
      qualification = probeInstalledCodec();
    else
      qualification = {
        codec: qualifyCodec({ version: process.versions.zlib }),
      };
  }
  return qualification.codec;
}
export function codecQualification() {
  checkZlib();
  return qualification;
}
