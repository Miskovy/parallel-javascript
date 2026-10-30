import assert from 'node:assert/strict';
import { simulate, reduceResults } from './historical/kernel.mjs';
import { createModel } from './historical/model.mjs';
import { mix32 } from './historical/prng.mjs';
import { config } from '../config.mjs';

// All adapters import this module. No library-specific numerical implementations.
export function imagePixel(x, y, channel, seed) {
  return (
    mix32(
      seed ^
        Math.imul(x + 1, 0x85ebca6b) ^
        Math.imul(y + 1, 0x9e3779b1) ^
        channel,
    ) & 255
  );
}

// Integer 3x3 Gaussian RGBA stencil. Each tile owns a one-row halo, so its
// transported input is identical in clone and transfer experiments. Image edges
// are clamped. Alpha is preserved, and the complete output comes back to host.
export function blur({ input, width, rows }) {
  const output = new Uint8Array(width * rows * 4);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        if (c === 3) {
          output[(y * width + x) * 4 + c] =
            input[((y + 1) * width + x) * 4 + c];
          continue;
        }
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            sum +=
              input[
                ((y + 1 + dy) * width +
                  Math.max(0, Math.min(width - 1, x + dx))) *
                  4 +
                  c
              ] *
              (dx === 0 ? 2 : 1) *
              (dy === 0 ? 2 : 1);
        output[(y * width + x) * 4 + c] = (sum + 8) >>> 4;
      }
    }
  return output;
}

export function numerical({ start, end, id, seed }) {
  let sum = 0,
    checksum = 0;
  for (let i = start; i < end; i++) {
    const u = (mix32(seed ^ i) + 0.5) / 4294967296;
    const value =
      Math.sqrt(u + 0.125) * Math.sin(u * 6.283185307179586) + Math.log1p(u);
    sum += value;
    checksum = (checksum + mix32(seed ^ i)) >>> 0;
  }
  return { id, start, end, sum, checksum };
}

export function execute(task) {
  if (task.op === 'identity') return { thread: task.thread, resolution: null };
  if (task.op === 'throw')
    throw new Error('intentional benchmark worker error');
  if (task.family === 'monte') return simulate(task);
  if (task.family === 'image')
    return {
      id: task.id,
      start: task.start,
      rows: task.rows,
      output: blur(task),
    };
  if (task.family === 'numerical')
    return { results: task.parts.map(numerical) };
  throw new Error(`Unknown task ${task.family}`);
}

export function prepare(spec) {
  const tasks = [];
  if (spec.family === 'monte') {
    const model = createModel({ ...config.monte, seed: config.seed });
    for (let start = 0; start < spec.count; start += spec.chunkSize)
      tasks.push({
        family: 'monte',
        model,
        seed: config.seed,
        start,
        end: Math.min(spec.count, start + spec.chunkSize),
        id: tasks.length,
        mode: 'aggregate',
      });
  } else if (spec.family === 'image') {
    const width = spec.edge;
    for (let start = 0; start < width; start += spec.chunkSize) {
      const rows = Math.min(spec.chunkSize, width - start);
      const input = new Uint8Array((rows + 2) * width * 4);
      for (let y = 0; y < rows + 2; y++)
        for (let x = 0; x < width; x++)
          for (let c = 0; c < 4; c++)
            input[(y * width + x) * 4 + c] = imagePixel(
              x,
              Math.max(0, Math.min(width - 1, start + y - 1)),
              c,
              config.seed,
            );
      tasks.push({
        family: 'image',
        id: tasks.length,
        start,
        rows,
        width,
        input,
        mode: spec.mode,
      });
    }
  } else {
    const parts = [];
    for (let start = 0; start < spec.count; start += spec.chunkSize)
      parts.push({
        id: parts.length,
        start,
        end: Math.min(spec.count, start + spec.chunkSize),
        seed: config.seed,
      });
    for (let i = 0; i < parts.length; i += spec.batch)
      tasks.push({
        family: 'numerical',
        parts: parts.slice(i, i + spec.batch),
      });
  }
  return tasks;
}

// Required assembly/reduction belongs inside the timed workload. Validation is
// separate. Serial uses the same task objects, partitions and reduction order.
export function collect(spec, results) {
  if (spec.family === 'monte')
    return reduceResults(results, 'aggregate').summary;
  if (spec.family === 'image') {
    const output = new Uint8Array(spec.count * 4);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      assert.equal(r.id, i);
      assert.equal(r.output.length, r.rows * spec.edge * 4);
      output.set(r.output, r.start * spec.edge * 4);
    }
    return output;
  }
  const parts = results.flatMap((r) => r.results);
  let sum = 0,
    checksum = 0,
    end = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    assert.equal(p.id, i);
    assert.equal(p.start, end);
    end = p.end;
    sum += p.sum;
    checksum = (checksum + p.checksum) >>> 0;
  }
  assert.equal(end, spec.count);
  return { count: end, sum, checksum };
}

export function validate(spec, actual, expected) {
  if (spec.family === 'image') {
    assert.deepEqual(actual, expected);
    return;
  }
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const key of Object.keys(expected)) {
    if (['sum', 'sumSquares', 'mean', 'standardDeviation'].includes(key)) {
      // Same JS operation order on one exact engine should be bit-identical.
      // 1e-12 relative (1e-10 absolute floor) admits only reduction roundoff.
      assert.ok(
        Math.abs(actual[key] - expected[key]) <=
          Math.max(1e-10, Math.abs(expected[key]) * 1e-12),
        `Mismatch ${key}`,
      );
    } else assert.equal(actual[key], expected[key], `Mismatch ${key}`);
  }
}
