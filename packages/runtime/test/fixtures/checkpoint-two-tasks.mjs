import { threadId } from 'node:worker_threads';
import { transfer } from '../../dist/index.js';
export function attempt(input) {
  const index = input.partition?.index ?? 0;
  const count = Atomics.add(new Int32Array(input.state), index, 1) + 1;
  if (input.crashAt === index && count <= (input.failures ?? 1))
    process.exit(39);
  if ((input.failAt ?? -1) === index && count <= (input.failures ?? 1))
    throw new Error('primary failure');
  return { index, count, bytes: input.bytes ? [...input.bytes] : [], threadId };
}
export function alternative(input) {
  return {
    ...attempt({ ...input, crashAt: -1, failAt: -1 }),
    alternative: true,
  };
}
export function block(input) {
  attempt(input);
  if (input.invalid) return [];
  return Array.from(
    { length: input.partition.end - input.partition.start },
    (_, i) => input.partition.start + i,
  );
}
export function binary(input) {
  attempt(input);
  const bytes = new Uint8Array(input.bytesOut ?? 4);
  return transfer(bytes, [bytes.buffer]);
}
export function invalid(input) {
  attempt({ ...input, failAt: -1, crashAt: -1 });
  return [];
}
export function badSerialization(input) {
  attempt(input);
  return () => 1;
}
export function convention(input, ...rest) {
  return {
    length: arguments.length,
    rest: rest.length,
    context: Boolean(rest[0]?.signal),
    threadId,
  };
}
export function cpu(input, context) {
  Atomics.store(new Int32Array(input.state), 0, 1);
  try {
    while (true) context.throwIfCancelled();
  } finally {
    Atomics.store(new Int32Array(input.state), 1, 1);
  }
}
export async function asyncCleanup(input, context) {
  Atomics.store(new Int32Array(input.state), 0, 1);
  try {
    await new Promise((resolve) => {
      if (context.signal.aborted) resolve();
      else context.signal.addEventListener('abort', resolve, { once: true });
    });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 20));
    Atomics.store(new Int32Array(input.state), 1, 1);
  }
}
export function hold(input) {
  const words = new Int32Array(input.state);
  Atomics.store(words, 0, 1);
  while (Atomics.load(words, 1) === 0) Atomics.wait(words, 1, 0, 100);
  return input;
}
export async function ignore(input) {
  Atomics.store(new Int32Array(input.state), 0, 1);
  await new Promise(() => {});
}
export function typedBlock(input) {
  return new Float64Array(block(input));
}
export function binaryAlternative(input) {
  return binary({ ...input, failAt: -1, crashAt: -1 });
}
export function cooperativeSibling(input, context) {
  if (input.partition.index === 1) throw new Error('sibling failure');
  return cpu(input, context);
}
export function gatedAttempt(input) {
  if (input.partition.index === 0) hold({ state: input.gate });
  return attempt(input);
}
