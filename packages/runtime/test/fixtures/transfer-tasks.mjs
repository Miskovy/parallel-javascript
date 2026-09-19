import { transfer } from '../../dist/index.js';
import { gate } from './tasks.mjs';

let lastBuffer;
export function crashWithInput(data) {
  if (data.byteLength !== 8) throw new Error('Transferred input was missing');
  process.exit(23);
}
export function clone(value) {
  lastBuffer = value?.buffer;
  return value;
}
export function move(value) {
  lastBuffer = value.buffer;
  return transfer(value, [value.buffer]);
}
export function outputDetached() {
  try {
    new Uint8Array(lastBuffer, 0, 0);
    return false;
  } catch {
    return true;
  }
}
export function outputOnly({ bytes }) {
  const data = new Uint8Array(bytes);
  data.fill(37);
  lastBuffer = data.buffer;
  return transfer({ data }, [data.buffer]);
}
export function gatedMove({ gate: buffer, data }) {
  gate({ buffer });
  return move(data);
}
export function invalidOutput() {
  return transfer(new Uint8Array(1), [new SharedArrayBuffer(1)]);
}
export function uncloneableOutput() {
  const data = new Uint8Array(8);
  return transfer({ data, fn() {} }, [data.buffer]);
}
export function changedOutput() {
  const data = new Uint8Array(8);
  const result = transfer(data, [data.buffer]);
  structuredClone(data, { transfer: [data.buffer] });
  return result;
}
export function snapshotOutput() {
  const data = new Uint8Array([3, 4]);
  const list = [data.buffer];
  const result = transfer(data, list);
  list.push(data.buffer);
  lastBuffer = data.buffer;
  return result;
}
