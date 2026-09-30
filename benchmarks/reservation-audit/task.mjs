import { transfer } from '@pjs/runtime';

function mix(value) {
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export default function reservationAuditTask({
  partition,
  bytes = 0,
  iterations = 0,
  move = false,
  kind = 'binary',
  source,
}) {
  if (kind === 'rle') {
    let runs = 0;
    for (let index = partition.start; index < partition.end;) {
      const value = source[index];
      let length = 1;
      while (
        index + length < partition.end &&
        source[index + length] === value &&
        length < 255
      )
        length++;
      runs++;
      index += length;
    }
    const output = new Uint8Array(runs * 2);
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
      output[offset++] = value;
      output[offset++] = length;
      index += length;
    }
    return move ? transfer(output, [output.buffer]) : output;
  }

  const output = new Uint8Array(bytes);
  let state = partition.index + 0x9e3779b9;
  for (let iteration = 0; iteration < iterations; iteration++)
    state = mix(state);
  if (output.length) {
    output[0] = state & 0xff;
    output[output.length - 1] = (state >>> 8) & 0xff;
  }
  return move ? transfer(output, [output.buffer]) : output;
}
