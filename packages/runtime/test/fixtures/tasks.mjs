import { parentPort, threadId } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';

let executions = 0;
export function echo(input) {
  return { input, threadId, executions: ++executions };
}
export async function wait({ ms = 20, value }) {
  await delay(ms);
  return value;
}
export function fail() {
  throw new RangeError('deliberate task failure');
}
export function strangeError() {
  throw {
    toString() {
      throw new Error('nested');
    },
  };
}
export function crash(code = 23) {
  process.exit(code);
}
export function uncaught() {
  return new Promise(() => {
    setTimeout(() => {
      throw new Error('uncaught worker exception');
    }, 0);
  });
}
export function badOutput() {
  return () => 1;
}
export function badProtocol() {
  parentPort.postMessage({
    type: 'success',
    taskId: 'wrong',
    output: 0,
    executionMs: 0,
  });
  return 1;
}
export function hang() {
  for (;;) {
    /* Used only with explicit terminating shutdown. */
  }
}
export function barrier({ buffer, participants }) {
  const values = new Int32Array(buffer);
  Atomics.add(values, 0, 1);
  Atomics.notify(values, 0);
  const deadline = Date.now() + 5000;
  while (Atomics.load(values, 0) < participants) {
    const observed = Atomics.load(values, 0);
    if (observed >= participants) break;
    if (Date.now() > deadline)
      throw new Error('Workers did not execute concurrently');
    Atomics.wait(values, 0, observed, 100);
  }
  return threadId;
}
export function gate({ buffer, value }) {
  const gate = new Int32Array(buffer);
  Atomics.store(gate, 0, 1);
  Atomics.notify(gate, 0);
  while (Atomics.load(gate, 1) === 0) {
    if (Atomics.wait(gate, 1, 0, 5000) === 'timed-out')
      throw new Error('Gate was never released');
  }
  return { value, threadId };
}
