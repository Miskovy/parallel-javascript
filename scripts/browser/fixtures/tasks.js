import {
  transfer,
  browserCapabilities,
  PjsRuntime,
  PjsTaskRegistry,
} from '/app/vendor/pjs/browser/index.js';

const calls = new Map();
export function info() {
  let nestedRejected = false;
  try {
    new PjsRuntime({ registry: new PjsTaskRegistry(), workers: 1 });
  } catch {
    nestedRejected = true;
  }
  return {
    dedicated:
      typeof globalThis.DedicatedWorkerGlobalScope === 'function' &&
      globalThis instanceof globalThis.DedicatedWorkerGlobalScope,
    windowHost: browserCapabilities().windowHost,
    sharedMemory: browserCapabilities().sharedMemory,
    nestedRejected,
    process: typeof globalThis.process,
  };
}
export const echo = (value) => value;
export const arity = function () {
  return arguments.length;
};
export async function wait({ ms, value }) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}
export function cpu({ ms }, context) {
  context?.reportProgress({ started: true });
  const until = performance.now() + ms;
  let count = 0;
  while (performance.now() < until) count++;
  return count > 0;
}
export function hang(_input, context) {
  context?.reportProgress({ started: true });
  while (true) {
    /* Deliberate containment target. */
  }
}
export function hardFailure() {
  setTimeout(() => {
    throw new Error('browser hard failure');
  }, 0);
  return new Promise(() => {});
}
export function silentClose() {
  globalThis.close();
  return new Promise(() => {});
}
export function generic({ start, end }) {
  return Array.from({ length: end - start }, (_, n) => (start + n) * 2);
}
export function typed(partition) {
  return new Float64Array(generic(partition));
}
export function owned({ bytes, move = false, ms = 0 }) {
  const output = new Uint8Array(new ArrayBuffer(bytes + 4), 2, bytes);
  output.fill(7);
  const finish = () => (move ? transfer(output, [output.buffer]) : output);
  return ms
    ? new Promise((resolve) => setTimeout(() => resolve(finish()), ms))
    : finish();
}
export function recover({ index, attempt = 1, fail = 'once' }) {
  calls.set(index, (calls.get(index) ?? 0) + 1);
  if (index === 1 && (fail === 'always' || (fail === 'once' && attempt === 1)))
    throw new Error('eligible partition failure');
  return { index, attempt, fallback: false };
}
export function fallback({ index, attempt }) {
  return { index, attempt, fallback: true };
}
export function callCounts() {
  return [...calls];
}
export function serialization({ index }) {
  calls.set(index, (calls.get(index) ?? 0) + 1);
  return index === 1 ? () => {} : index;
}
export function rebuild({ bytes, attempt = 1 }) {
  if (attempt === 1) throw new Error('rebuild needed');
  return transfer(bytes, [bytes.buffer]);
}
export function invalidMap() {
  return ['wrong cardinality'];
}
export function taskError() {
  throw new Error('eligible task error');
}
export function invalidProgress(_input, context) {
  const recursive = {};
  recursive.self = recursive;
  return [
    context.reportProgress('x'.repeat(20000)),
    context.reportProgress(recursive),
    context.reportProgress({ invalid: () => {} }),
  ];
}
export function shared(values) {
  return Array.from(values);
}
export function cooperativeCPU(sharedState, context) {
  const state = new Int32Array(sharedState);
  Atomics.store(state, 0, 1);
  try {
    while (true) context.throwIfCancelled();
  } finally {
    Atomics.store(state, 0, 2);
  }
}
export async function cooperativeAsync(sharedState, context) {
  const state = new Int32Array(sharedState);
  Atomics.store(state, 0, 1);
  try {
    await new Promise((resolve) =>
      context.signal.addEventListener('abort', resolve, { once: true }),
    );
  } finally {
    Atomics.store(state, 0, 2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    Atomics.store(state, 0, 3);
  }
}
export async function progress({ count, async }, context) {
  let accepted = 0;
  for (let i = 0; i < count; i++) {
    if (context.reportProgress({ done: i, total: count })) accepted++;
    if (async && i % 100 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return accepted;
}
