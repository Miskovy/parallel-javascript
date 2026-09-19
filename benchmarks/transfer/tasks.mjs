import { transfer } from '@pjs/runtime';
import { multiplyRows } from '../matrix-multiplication/task.mjs';

export function cloneEcho(data) {
  return data;
}
export function transferEcho(data) {
  return transfer(data, [data.buffer]);
}
export function multiplyRowsTransferred(input) {
  const result = multiplyRows(input);
  return transfer(result, [result.output.buffer]);
}
