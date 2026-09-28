import { performance } from 'node:perf_hooks';
import { threadId } from 'node:worker_threads';

function stableStep(state) {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state | 0;
}

export function stableSkew(start, end, scale = 64) {
  let checksum = 0;
  for (let i = start; i < end; i++) {
    let state = (i + 1) | 0;
    const iterations = (i + 1) * scale;
    for (let j = 0; j < iterations; j++) {
      state = stableStep(state);
      checksum = (checksum + Math.imul(state, 31)) | 0;
    }
  }
  return checksum;
}

export function originalSkew(start, end, scale = 16) {
  let sum = 0;
  for (let i = start; i < end; i++)
    for (let j = 0; j < (i + 1) * scale; j++) sum += j & 255;
  return sum;
}

export function execute(input) {
  if (input.kind === 'probe') {
    const barrier = new Int32Array(input.barrier);
    Atomics.add(barrier, 0, 1);
    Atomics.notify(barrier, 0);
    const deadline = performance.now() + 10_000;
    while (Atomics.load(barrier, 0) < input.workers) {
      if (performance.now() > deadline) throw new Error('Probe timeout');
      const count = Atomics.load(barrier, 0);
      if (count < input.workers) Atomics.wait(barrier, 0, count, 100);
    }
    return { threadId };
  }

  const started = performance.now();
  const { partition } = input;
  let value = 0;
  if (input.kind === 'shared') {
    for (let i = partition.start; i < partition.end; i++)
      value += input.data[i];
  } else if (input.kind === 'skew') {
    value = originalSkew(partition.start, partition.end, input.scale);
  } else if (input.kind === 'stable-skew') {
    value = stableSkew(partition.start, partition.end, input.scale);
  } else if (input.kind === 'cpu') {
    let state = 0x12345678;
    for (let i = 0; i < input.iterations; i++) state = stableStep(state);
    value = state;
  } else if (input.kind === 'matrix') {
    const rows = partition.end - partition.start;
    const output = new Float64Array(rows * input.dimension);
    for (let local = 0; local < rows; local++)
      for (let k = 0; k < input.dimension; k++) {
        const left = input.a[local * input.dimension + k];
        for (let column = 0; column < input.dimension; column++)
          output[local * input.dimension + column] +=
            left * input.b[k * input.dimension + column];
      }
    return {
      index: partition.index,
      output,
      kernelMs: performance.now() - started,
      threadId,
    };
  }
  const kernelMs = performance.now() - started;

  if (input.progress)
    Atomics.add(new Int32Array(input.progress), input.progressIndex, 1);
  if (input.kind !== 'noop')
    return { index: partition?.index, value, kernelMs, threadId };
  switch (input.outputType) {
    case 'undefined':
      return undefined;
    case 'scalar':
      return partition.index;
    case 'object':
      return { index: partition.index, value: partition.start };
    case 'typed':
      return Uint32Array.of(partition.index, partition.start, partition.end);
    case 'large':
      return new Uint8Array(input.outputBytes).fill(partition.index & 255);
    default:
      throw new Error(`Unknown output type ${input.outputType}`);
  }
}
