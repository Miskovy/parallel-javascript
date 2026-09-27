import { threadId } from 'node:worker_threads';
import { multiplyRows } from '../matrix-multiplication/task.mjs';
import { countPrimes } from '../prime-search/task.mjs';

export function execute(input) {
  if (input.kind === 'matrix') return multiplyRows(input);
  if (input.kind === 'cpu') return countPrimes(input);
  let sum = 0;
  for (let i = input.from; i < input.to; i++) sum += input.data[i];
  return {
    sum,
    threadId,
    shared: input.data.buffer instanceof SharedArrayBuffer,
  };
}

// Independent arithmetic-series oracle for repeating integers 0..250.
export function prefixSum(length) {
  const cycles = Math.floor(length / 251),
    remainder = length % 251;
  return cycles * ((250 * 251) / 2) + (remainder * (remainder - 1)) / 2;
}
