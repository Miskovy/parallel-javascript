import { transfer } from '@pjavascript/runtime';
import { countPrimes } from '../prime-search/task.mjs';
import { multiplyRows } from '../matrix-multiplication/task.mjs';
import { execute as partitionKernel } from '../partitioning/kernel.mjs';
import { compute as compress } from '../real-world/compression/core.mjs';
import { compute as crypto } from '../real-world/crypto/task.mjs';
import { simulate } from '../flagship-monte-carlo/src/kernel.mjs';

export const packageResolution = () =>
  import.meta.resolve('@pjavascript/runtime');
export const echo = (input) => input;
let lastMoved;
export function moveReceipt(input) {
  if (input === null) {
    try {
      new Uint8Array(lastMoved);
      return false;
    } catch {
      return true;
    }
  }
  lastMoved = new ArrayBuffer(input);
  return transfer(new Uint8Array(lastMoved).fill(23), [lastMoved]);
}
export function execute(input) {
  const { partition } = input;
  switch (input.kind) {
    case 'cpu':
      return countPrimes(input).count;
    case 'matrix':
      return multiplyRows(input).output;
    case 'scan': {
      let sum = 0;
      for (const value of input.data) sum += value;
      return { sum, shared: input.data.buffer instanceof SharedArrayBuffer };
    }
    case 'skew':
      return partitionKernel({ ...input, submittedNs: process.hrtime.bigint() })
        .sum;
    case 'completion':
      return () => 'discarded before serialization';
    case 'shared-output':
      for (let i = partition.start; i < partition.end; i++)
        input.output[i] = i % 251;
      return undefined;
    case 'generic-map':
      return Array.from(
        { length: partition.end - partition.start },
        (_, i) => ({ value: partition.start + i }),
      );
    case 'typed-map':
      return Float64Array.from(
        { length: partition.end - partition.start },
        (_, i) => 2 * (partition.start + i) + 1,
      );
    case 'binary': {
      const output = new Uint8Array(input.bytes).fill(partition.index % 251);
      return input.move ? transfer(output, [output.buffer]) : output;
    }
    case 'compression':
      return compress(input);
    case 'crypto':
      return crypto(input.job).value;
    case 'monte-carlo':
      return simulate(input);
    default:
      return input.value ?? partition.index;
  }
}
