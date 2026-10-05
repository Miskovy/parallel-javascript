import { createHash } from 'node:crypto';
import { transfer } from '@pjavascript/runtime';

export function square(value) {
  return value * value;
}

export function sumRange({ partition, data }) {
  let sum = 0;
  for (let i = partition.start; i < partition.end; i++) sum += data[i];
  return sum;
}

export function mapRange({ partition, data }) {
  return Float64Array.from(
    data.subarray(partition.start, partition.end),
    (value) => value * 2,
  );
}

export function fillShared({ partition, output }) {
  for (let i = partition.start; i < partition.end; i++) output[i] = i * 2;
}

export function exactBytes({ partition, data }) {
  const output = Uint8Array.from(
    data.subarray(partition.start, partition.end),
    (value) => value ^ 255,
  );
  return transfer(output, [output.buffer]);
}

export function filteredBytes({ partition, data }) {
  // Each input byte emits at most one byte: input length is a proven maximum.
  const output = data
    .subarray(partition.start, partition.end)
    .filter((value) => value % 2 === 0);
  return transfer(output, [output.buffer]);
}

export function nativeDigest(bytes) {
  // A synchronous native call in the dedicated compute plane, not libuv work.
  return createHash('sha256').update(bytes).digest('hex');
}

export function gatedTask(gate) {
  Atomics.store(gate, 0, 1);
  Atomics.notify(gate, 0);
  while (Atomics.load(gate, 1) === 0) {
    if (Atomics.wait(gate, 1, 0, 5000) === 'timed-out') {
      throw new Error('Example gate was not released');
    }
  }
  return 42;
}
