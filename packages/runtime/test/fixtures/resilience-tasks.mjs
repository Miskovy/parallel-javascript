import { parentPort, threadId } from 'node:worker_threads';
import { transfer } from '../../dist/index.js';

export function work(input) {
  const state = new Int32Array(input.state);
  const attempt = Atomics.add(state, 0, 1) + 1;
  const mode = input.sequence?.[attempt - 1] ?? input.mode;
  if (mode === 'gate' || mode === 'gate-error') {
    Atomics.store(state, 2, 1);
    while (!Atomics.load(state, 3)) {
      if (Atomics.wait(state, 3, 0, 5000) === 'timed-out')
        throw new Error('Test gate was not released');
    }
  }
  if (attempt <= (input.failures ?? 0)) {
    if (mode === 'worker-crash') process.exit(31);
    if (mode === 'uncaught')
      return new Promise(() => {
        setTimeout(() => {
          throw new Error('Uncaught test failure');
        }, 0);
      });
    if (mode === 'execution-lease')
      while (true) {
        /* Deliberately uncooperative. */
      }
    throw new Error('Primary test failure');
  }
  if (mode === 'serialization') return () => 1;
  if (mode === 'protocol') {
    parentPort.postMessage({ type: 'invalid' });
    return new Promise(() => {});
  }
  return { value: input.value, attempt, threadId };
}

export function fallback(input) {
  Atomics.add(new Int32Array(input.state), 1, 1);
  if (input.hangFallback)
    while (true) {
      /* Cancel the fallback's distinct correlation. */
    }
  if (input.fallbackFails) throw new Error('Fallback test failure');
  if (input.transferredOutput) {
    const output = new Uint8Array([4, 2]);
    return transfer(output, [output.buffer]);
  }
  return { value: input.value, implementation: 'fallback', threadId };
}

export function hang(input) {
  Atomics.add(new Int32Array(input.state), 0, 1);
  while (true) {
    /* Physical cancellation must stop CPU work. */
  }
}

export function echo(value) {
  return value;
}
