import { threadId } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';

export async function work(input, context) {
  const index = input.index ?? input.partition?.index ?? 0;
  const state = new Int32Array(input.state);
  const attempt = Atomics.add(state, index, 1) + 1;
  context?.reportProgress({ index, attempt, phase: 'started' });
  try {
    while (Atomics.load(state, 32 + index) < (input.perAttempt ? attempt : 1)) {
      context?.throwIfCancelled();
      await delay(2);
    }
    if (input.crash && attempt <= (input.failures ?? 1)) process.exit(38);
    if (input.fail && attempt <= (input.failures ?? 1))
      throw new Error('retryable work failure');
    return {
      index,
      attempt,
      threadId,
      arity: arguments.length,
      context: Boolean(context),
    };
  } finally {
    if (context?.signal.aborted) await delay(10);
    Atomics.add(state, 64 + index, 1);
  }
}
export async function alternative(input, context) {
  return {
    ...(await work({ ...input, fail: false, crash: false }, context)),
    fallback: true,
  };
}
export async function block(input, context) {
  await work(input, context);
  return Array.from(
    { length: input.partition.end - input.partition.start },
    (_, n) => input.partition.start + n,
  );
}
export async function typed(input, context) {
  return new Float64Array(await block(input, context));
}
export async function binary(input, context) {
  await work(input, context);
  return new Uint8Array(4);
}
export function cpu(input, context) {
  const words = new Int32Array(input.state);
  Atomics.add(words, input.index ?? 0, 1);
  try {
    while (true) context?.throwIfCancelled();
  } finally {
    Atomics.add(words, 64 + (input.index ?? 0), 1);
  }
}
export function flood(input, context) {
  let accepted = 0;
  for (let n = 0; n < input.count; n++) {
    if (context.reportProgress({ done: n, text: 'progress' })) accepted++;
  }
  return accepted;
}
export function invalidProgress(_input, context) {
  let accessed = 0;
  const cycle = {};
  cycle.self = cycle;
  const deep = {};
  let next = deep;
  for (let n = 0; n < 20; n++) {
    next.child = {};
    next = next.child;
  }
  const values = [
    () => 1,
    undefined,
    Infinity,
    NaN,
    1n,
    cycle,
    deep,
    new Uint8Array(8),
    new Date(),
    'x'.repeat(1_000_000),
    {
      get value() {
        accessed++;
        return 1;
      },
    },
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('inspection');
        },
      },
    ),
  ];
  return {
    results: values.map((value) => context.reportProgress(value)),
    accessed,
  };
}
export async function late(input, context) {
  setTimeout(
    () =>
      Atomics.store(
        new Int32Array(input.state),
        80,
        context.reportProgress({ late: true }) ? 1 : 2,
      ),
    30,
  );
  return true;
}
export function echo(input) {
  return { input, threadId, arity: arguments.length };
}
export async function burstWait(input, context) {
  context.reportProgress({ done: 1 });
  context.reportProgress({ done: 2 });
  while (!Atomics.load(new Int32Array(input.state), 32)) await delay(2);
  return true;
}
