import { parentPort } from 'node:worker_threads';

export function pulse({ shared }) {
  const state = new Int32Array(shared);
  while (true) {
    Atomics.add(state, 0, 1);
    const command = Atomics.exchange(state, 1, 0);
    if (command === 1)
      parentPort.postMessage({ type: 'invalid-physical-boundary-message' });
    if (command === 2) process.exit(23);
  }
}

export function binary({ fail = false } = {}) {
  if (fail) throw new Error('ordinary task exception');
  return new Uint8Array(8);
}

export function echo(input) {
  return input;
}
