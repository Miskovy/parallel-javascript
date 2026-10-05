import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const primes = registry.register(
  'primes',
  new URL('../benchmarks/prime-search/task.mjs', import.meta.url),
  'countPrimes',
);
const runtime = new PjsRuntime({ registry, workers: 2, maxQueue: 16 });
try {
  await runtime.ready();
  const results = await Promise.all([
    runtime.run(primes, { from: 2, to: 500_000 }),
    runtime.run(primes, { from: 500_000, to: 1_000_000 }),
  ]);
  console.log({
    primeCount: results.reduce((sum, result) => sum + result.count, 0),
    threadIds: results.map((result) => result.threadId),
  });
  console.log(runtime.stats());
} finally {
  await runtime.shutdown();
}
