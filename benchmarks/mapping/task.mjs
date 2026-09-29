import { move, transferableSymbol, valueSymbol } from 'piscina';
import { transfer } from '@pjs/runtime';

export function transformValue(value, index, iterations) {
  let state = (index + 1) | 0;
  for (let step = 0; step < iterations; step++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
  }
  return value * 1.5 + (state & 255) / 255;
}

export default function mapTask({
  partition,
  source,
  output,
  kind,
  iterations,
  pjsTransfer = false,
  piscinaTransfer = false,
}) {
  const length = partition.end - partition.start;
  if (kind === 'shared') {
    for (let index = partition.start; index < partition.end; index++)
      output[index] = transformValue(source[index], index, iterations);
    return;
  }
  if (kind === 'objects')
    return Array.from({ length }, (_, offset) => {
      const index = partition.start + offset;
      const score = transformValue(source[index], index, iterations);
      return { index, score, category: Math.abs(Math.trunc(score)) % 7 };
    });
  if (kind === 'array')
    return Array.from({ length }, (_, offset) => {
      const index = partition.start + offset;
      return transformValue(source[index], index, iterations);
    });
  const block = new Float64Array(length);
  for (let offset = 0; offset < length; offset++) {
    const index = partition.start + offset;
    block[offset] = transformValue(source[index], index, iterations);
  }
  if (pjsTransfer) return transfer(block, [block.buffer]);
  if (piscinaTransfer)
    return move({
      [transferableSymbol]: [block.buffer],
      [valueSymbol]: block,
    });
  return block;
}
