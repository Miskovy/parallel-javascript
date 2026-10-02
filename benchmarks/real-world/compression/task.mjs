import { performance } from 'node:perf_hooks';
import { transfer } from '@pjs/runtime';
import { compute } from './core.mjs';

export function body(input) {
  if (input.gate) {
    Atomics.store(input.gate, 0, 1);
    Atomics.notify(input.gate, 0);
    Atomics.wait(input.gate, 1, 0);
  }
  if (input.crash) process.exit(17);
  const start = performance.now();
  const output = compute(input);
  if (input.timings) {
    input.timings[2 * input.index] = start - input.submitted;
    input.timings[2 * input.index + 1] = performance.now() - start;
  }
  return output;
}
export function task(input) {
  const output = body(input);
  return transfer(output, [output.buffer]);
}
