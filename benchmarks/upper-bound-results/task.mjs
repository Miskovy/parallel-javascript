import { transfer } from '@pjs/runtime';

export function rleSize(source, start, end) {
  let runs = 0;
  for (let index = start; index < end;) {
    const value = source[index];
    let length = 1;
    while (
      index + length < end &&
      source[index + length] === value &&
      length < 255
    )
      length++;
    runs++;
    index += length;
  }
  return runs * 2;
}

export function encode({ partition, source, move }) {
  // One data-dependent encoding pass. The scratch worst case is structural:
  // at most one value/count pair per input byte, count limited to 255.
  const scratch = new Uint8Array(2 * (partition.end - partition.start));
  let offset = 0;
  for (let index = partition.start; index < partition.end;) {
    const value = source[index];
    let length = 1;
    while (
      index + length < partition.end &&
      source[index + length] === value &&
      length < 255
    )
      length++;
    scratch[offset++] = value;
    scratch[offset++] = length;
    index += length;
  }
  const output = scratch.slice(0, offset);
  return move ? transfer(output, [output.buffer]) : output;
}

export function binary({ bytes, move }) {
  const output = new Uint8Array(bytes);
  output.fill(17);
  return move ? transfer(output, [output.buffer]) : output;
}
