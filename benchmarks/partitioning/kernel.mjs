import { performance } from 'node:perf_hooks';
import { threadId } from 'node:worker_threads';
import { multiplyRows } from '../matrix-multiplication/task.mjs';

export function execute(input) {
  if (input.kind === 'probe') {
    const barrier = new Int32Array(input.barrier);
    Atomics.add(barrier, 0, 1);
    Atomics.notify(barrier, 0);
    const deadline = performance.now() + 10_000;
    while (Atomics.load(barrier, 0) < input.workers) {
      if (performance.now() > deadline)
        throw new Error('Probe barrier timeout');
      const count = Atomics.load(barrier, 0);
      if (count < input.workers) Atomics.wait(barrier, 0, count, 100);
    }
    return { threadId };
  }
  const startNs = process.hrtime.bigint();
  const { partition, kind } = input;
  let sum = 0,
    output;
  if (kind === 'matrix') {
    output = multiplyRows({
      ...input,
      rows: partition.end - partition.start,
    }).output;
  } else if (kind === 'range') {
    for (let i = partition.start; i < partition.end; i++)
      sum += input.data[i - input.offset];
  } else if (kind === 'skew') {
    for (let i = partition.start; i < partition.end; i++) {
      const steps = (i + 1) * 16;
      for (let j = 0; j < steps; j++) sum += j & 255;
    }
  }
  const endNs = process.hrtime.bigint();
  return {
    partition,
    sum,
    output,
    threadId,
    shared:
      kind === 'matrix'
        ? input.b.buffer instanceof SharedArrayBuffer
        : kind === 'range' && input.data.buffer instanceof SharedArrayBuffer,
    kernelMs: Number(endNs - startNs) / 1e6,
    dispatchToKernelMs: Number(startNs - input.submittedNs) / 1e6,
  };
}

// Closed-form per-index oracle; no simulation of the timed inner loop.
export function skewOracle(start, end) {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const steps = (i + 1) * 16,
      remainder = steps % 256;
    sum += Math.floor(steps / 256) * 32640 + (remainder * (remainder - 1)) / 2;
  }
  return sum;
}
