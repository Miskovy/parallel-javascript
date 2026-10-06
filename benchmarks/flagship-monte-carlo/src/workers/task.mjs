import { performance } from 'node:perf_hooks';
import { simulate } from '../kernel.mjs';

export default function task(input) {
  const workerStart = performance.timeOrigin + performance.now();
  const result = simulate(input);
  return {
    ...result,
    workerStart,
    workerEnd: performance.timeOrigin + performance.now(),
  };
}
