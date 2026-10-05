import { transfer } from '@pjavascript/runtime';
import { threadId } from 'node:worker_threads';

// Synthetic failure-injection fixtures, never production runtime code.
export async function work(input) {
  const {
    partition,
    gate,
    counter,
    fail,
    reject,
    crash,
    mode = 'value',
  } = input;
  if (counter) Atomics.add(new Int32Array(counter), partition?.index ?? 0, 1);
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    const deadline = Date.now() + 30000;
    while (!Atomics.load(control, 1)) {
      if (Date.now() > deadline) throw new Error('RC gate watchdog expired');
      Atomics.wait(control, 1, 0, 100);
    }
  }
  if (crash) process.exit(73); // Deliberate worker exit, never a harness exit.
  if (fail) throw new RangeError('RC controlled task throw');
  if (reject) return Promise.reject(new TypeError('RC controlled rejection'));
  if (mode === 'discard') return () => 'uncloneable output must be discarded';
  if (mode === 'map') {
    return Float64Array.from(
      { length: partition.end - partition.start + (input.lengthDelta ?? 0) },
      (_, i) => (partition.start + i) * 2,
    );
  }
  if (mode === 'range')
    return Array.from(
      { length: partition.end - partition.start },
      (_, i) => partition.start + i,
    );
  if (mode === 'sum') return input.data.reduce((a, b) => a + b, 0);
  if (mode === 'binary') {
    const result = new Uint8Array(input.bytes);
    result.fill((partition?.index ?? 0) & 255);
    return input.move ? transfer(result, [result.buffer]) : result;
  }
  if (mode === 'echo') return transfer(input.data, [input.data.buffer]);
  if (mode === 'cpu') {
    let value = 0;
    for (let i = 0; i < input.iterations; i++) value += Math.sqrt(i % 1000);
    return { value, threadId };
  }
  return input.value;
}
