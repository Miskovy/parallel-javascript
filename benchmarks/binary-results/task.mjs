import { move, transferableSymbol, valueSymbol } from 'piscina';
import { transfer } from '@pjavascript/runtime';

export function transformByte(value, index, iterations) {
  let state = (value + index * 17 + 0x9e3779b9) | 0;
  for (let step = 0; step < iterations; step++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
  }
  return state & 0xff;
}

export default function binaryTask({
  partition,
  source,
  bytes,
  iterations = 4,
  kind = 'binary',
  output,
  pjsTransfer = false,
  piscinaTransfer = false,
}) {
  if (kind === 'shared') {
    for (let index = partition.start; index < partition.end; index++)
      output[index] = transformByte(
        source[index % source.length],
        index,
        iterations,
      );
    return;
  }
  if (kind === 'map') {
    const block = new Uint8Array(partition.end - partition.start);
    for (let offset = 0; offset < block.length; offset++) {
      const index = partition.start + offset;
      block[offset] = transformByte(
        source[index % source.length],
        index,
        iterations,
      );
    }
    return block;
  }
  if (kind === 'object') {
    const index = partition.index;
    return {
      index,
      score: transformByte(source[index % source.length], index, iterations),
      category: index % 7,
      tag: `record-${index}`,
    };
  }
  const block = new Uint8Array(bytes);
  const sourceOffset = (partition.index * 131) % source.length;
  for (let index = 0; index < block.length; index++)
    block[index] = transformByte(
      source[(sourceOffset + index) % source.length],
      partition.start + index,
      iterations,
    );
  if (pjsTransfer) return transfer(block, [block.buffer]);
  if (piscinaTransfer)
    return move({
      [transferableSymbol]: [block.buffer],
      [valueSymbol]: block,
    });
  return block;
}
