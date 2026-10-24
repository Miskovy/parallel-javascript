import { resourceLimits, threadId } from 'node:worker_threads';

if (process.env.PJS_CK1_FAIL_BOOTSTRAP === '1')
  throw new Error('Controlled growth bootstrap failure');

export function hang({ state }) {
  Atomics.add(new Int32Array(state), 0, 1);
  while (true) {
    /* Real CPU work, physically contained by the host. */
  }
}

export function gate({ state, partition }) {
  const words = new Int32Array(state);
  Atomics.add(words, 0, 1);
  while (Atomics.load(words, 1) === 0) {
    if (Atomics.wait(words, 1, 0, 5000) === 'timed-out')
      throw new Error('Checkpoint gate was not released');
  }
  return [partition?.start ?? threadId];
}

export function partitionFail(input) {
  if (input.partition.index === 1)
    throw new Error('Controlled partition failure');
  return hang(input);
}

export function describe(value) {
  return { value, threadId, limits: { ...resourceLimits } };
}

export function failOnce(input) {
  const attempt = Atomics.add(new Int32Array(input.state), 0, 1) + 1;
  if (attempt <= (input.failures ?? 1)) {
    if (input.mode === 'oom') {
      const retained = [];
      for (let i = 0; i < 128; i++)
        retained.push(new Array(256 * 1024).fill(i));
      throw new Error(`Worker heap limit did not trigger (${retained.length})`);
    }
    if (input.mode === 'crash') process.exit(37);
    throw new Error('Controlled primary failure');
  }
  return describe(attempt);
}

export function fallback(input) {
  Atomics.add(new Int32Array(input.state), 2, 1);
  return describe('fallback');
}
