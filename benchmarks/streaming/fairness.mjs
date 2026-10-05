import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsQueueFullError,
  PjsRuntime,
  PjsTaskRegistry,
} from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register(
  'stream-fairness',
  new URL('../completion-only/task.mjs', import.meta.url),
);
const results = [];
for (const capacity of [1, 4, 8]) {
  for (let trial = 0; trial < 3; trial++) {
    const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 8 });
    await runtime.ready();
    const started = performance.now();
    const first = {};
    const make = (index) => ({
      input: {
        kind: 'cpu',
        partition: { index, start: index, end: index + 1 },
        iterations: 100_000,
        outputType: 'scalar',
      },
    });
    const consume = async (name, slow = false) => {
      let count = 0;
      for await (const value of runtime.streamRange(
        task,
        { start: 0, end: 64, grainSize: 1 },
        make,
        {
          experimentalDispatchBatchSize: 4,
          experimentalMaxBufferedResults: capacity,
        },
      )) {
        void value;
        first[name] ??= performance.now() - started;
        count++;
        if (slow) await delay(2);
      }
      return count;
    };
    const slow = consume('slow', true);
    const fast = consume('fast');
    const parallel = runtime
      .parallelFor(task, { start: 0, end: 64, grainSize: 1 }, make, {
        experimentalDispatchBatchSize: 4,
      })
      .then(() => {
        first.parallel ??= performance.now() - started;
      });
    const ordinary = (async () => {
      for (let index = 0; index < 64; index++) {
        for (;;) {
          try {
            await runtime.run(task, make(index).input);
            first.ordinary ??= performance.now() - started;
            break;
          } catch (error) {
            if (!(error instanceof PjsQueueFullError)) throw error;
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }
    })();
    const [slowCount, fastCount] = await Promise.all([
      slow,
      fast,
      parallel,
      ordinary,
    ]);
    results.push({
      capacity,
      trial,
      first,
      slowCount,
      fastCount,
      wallMs: performance.now() - started,
      starvation: Object.keys(first).length !== 4,
    });
    await runtime.shutdown();
  }
}
await writeFile(
  new URL('../results/stream-fairness-v0.7.json', import.meta.url),
  JSON.stringify(
    { version: '0.7.0', timestamp: new Date().toISOString(), results },
    null,
    2,
  ) + '\n',
);
console.table(results);
