import { threadId } from 'node:worker_threads';
import { transfer } from '../../dist/index.js';

function wait(buffer) {
  if (!buffer) return;
  const view = new Int32Array(buffer);
  Atomics.add(view, 0, 1);
  while (Atomics.load(view, 1) === 0) Atomics.wait(view, 1, 0, 100);
}
export function echo(value) {
  return value;
}
export function inspect({ data, gate, fail = false, marker }) {
  wait(gate);
  if (marker) Atomics.add(new Int32Array(marker), 0, 1);
  if (fail) throw new Error('controlled task failure');
  const bytes =
    data instanceof ArrayBuffer || data instanceof SharedArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return {
    visible: bytes.byteLength,
    backing: bytes.buffer.byteLength,
    first: bytes[0],
    last: bytes.at(-1),
    shared: bytes.buffer instanceof SharedArrayBuffer,
  };
}
export function move(data) {
  return transfer(data, [data.buffer ?? data]);
}
export function binary({
  bytes = 8,
  backing = bytes,
  gate,
  crash = false,
  move = false,
  fail = false,
}) {
  wait(gate);
  if (crash) process.exit(31);
  if (fail) throw new Error('controlled binary failure');
  const result = new Uint8Array(new ArrayBuffer(backing), 0, bytes);
  result.fill(7);
  return move ? transfer(result, [result.buffer]) : result;
}
export function crash({ data, marker } = {}) {
  if (data && !((data.buffer ?? data) instanceof SharedArrayBuffer))
    new Uint8Array(data.buffer ?? data)[0] = 7;
  if (marker) Atomics.add(new Int32Array(marker), 0, 1);
  process.exit(31);
}
export function hang({ gate, data, marker } = {}) {
  if (data && !((data.buffer ?? data) instanceof SharedArrayBuffer))
    new Uint8Array(data.buffer ?? data)[0] = 7;
  if (marker) Atomics.add(new Int32Array(marker), 0, 1);
  if (gate) Atomics.add(new Int32Array(gate), 0, 1);
  while (true) {
    /* Contained by lease or bounded child watchdog. */
  }
}
export function memory() {
  return { source: 'worker isolate', threadId, memory: process.memoryUsage() };
}
