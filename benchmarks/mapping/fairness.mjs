import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setImmediate as immediate } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register(
  'map-fairness',
  new URL('./task.mjs', import.meta.url),
);
const results = [];
for (const capacity of [1, 4, 8]) {
  for (let trial = 0; trial < 3; trial++) {
    const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 128 });
    await runtime.ready();
    const source = sharedReadonly(
      Float64Array.from({ length: 65_536 }, (_, index) => index / 17),
    );
    const output = new Float64Array(new SharedArrayBuffer(source.byteLength));
    const started = performance.now();
    const completed = {};
    const makeInput = (partition, kind = 'typed') => ({
      input: { partition, source, kind, iterations: 64 },
    });
    const map = runtime
      .parallelMapRange(
        task,
        { start: 0, end: 32_768, grainSize: 512 },
        (partition) => makeInput(partition, 'array'),
        { experimentalDispatchBatchSize: 4 },
      )
      .then((value) => {
        completed.map = performance.now() - started;
        return value.length;
      });
    const stream = (async () => {
      let count = 0;
      for await (const value of runtime.streamRange(
        task,
        { start: 0, end: 16_384, grainSize: 256 },
        (partition) => makeInput(partition),
        {
          experimentalDispatchBatchSize: 4,
          experimentalMaxBufferedResults: capacity,
        },
      )) {
        void value;
        count++;
        await immediate();
      }
      completed.stream = performance.now() - started;
      return count;
    })();
    const completion = runtime
      .parallelFor(
        task,
        { start: 0, end: 32_768, grainSize: 512 },
        (partition) => ({
          input: {
            partition,
            source,
            output,
            kind: 'shared',
            iterations: 64,
          },
        }),
        { experimentalDispatchBatchSize: 4 },
      )
      .then(() => {
        completed.parallel = performance.now() - started;
      });
    const ordinary = runtime
      .run(task, makeInput({ index: 0, start: 0, end: 1 }).input)
      .then(() => {
        completed.ordinary = performance.now() - started;
      });
    const [mapCount, streamCount] = await Promise.all([
      map,
      stream,
      completion,
      ordinary,
    ]);
    results.push({
      capacity,
      trial,
      completed,
      mapCount,
      streamCount,
      wallMs: performance.now() - started,
      starvation: Object.keys(completed).length !== 4,
    });
    await runtime.shutdown();
  }
}
const report = {
  version: '0.8.0',
  timestamp: new Date().toISOString(),
  results,
};
await writeFile(
  new URL('../results/map-fairness-v0.8.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(results);
