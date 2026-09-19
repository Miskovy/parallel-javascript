import { threadId } from 'node:worker_threads';

/** Row-major i-k-j kernel; serial and workers execute exactly the same arithmetic. */
export function multiplyRows({ a, b, size, rows = size }) {
  const output = new Float64Array(rows * size);
  for (let i = 0; i < rows; i++) {
    const row = i * size;
    for (let k = 0; k < size; k++) {
      const aik = a[row + k];
      const bRow = k * size;
      for (let j = 0; j < size; j++) output[row + j] += aik * b[bRow + j];
    }
  }
  return { output, threadId };
}

export function matrices(size) {
  const a = new Float64Array(size * size);
  const b = new Float64Array(size * size);
  // Small signed integers keep every tested dot product exact in Float64.
  for (let i = 0; i < a.length; i++) {
    a[i] = ((i * 17 + 3) % 19) - 9;
    b[i] = ((i * 13 + 5) % 23) - 11;
  }
  return { a, b, size };
}

/** Deliberately different loop order for a small independent correctness oracle. */
export function referenceMultiply({ a, b, size }) {
  const output = new Float64Array(size * size);
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++)
      for (let k = 0; k < size; k++)
        output[i * size + j] += a[i * size + k] * b[k * size + j];
  return output;
}
