import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setImmediate as immediate } from 'node:timers/promises';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';

const KiB = 2 ** 10;
const registry = new PjsTaskRegistry();
const task = registry.register(
  'binary-fairness',
  new URL('./task.mjs', import.meta.url),
);
const results = [];
for (const largeCapacity of [256 * KiB, 1024 * KiB]) {
  for (let trial = 0; trial < 3; trial++) {
    const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 128 });
    await runtime.ready();
    const source = sharedReadonly(
      Uint8Array.from({ length: 256 * KiB }, (_, index) => index & 0xff),
    );
    const sharedOutput = new Uint8Array(new SharedArrayBuffer(32_768));
    const started = performance.now();
    const completed = {};
    const stream = async (name, count, bytes, capacity) => {
      let received = 0;
      for await (const value of runtime.streamRange(
        task,
        { start: 0, end: count, grainSize: 1 },
        (partition) => ({
          input: {
            partition,
            source,
            bytes,
            iterations: 2,
            pjsTransfer: true,
          },
        }),
        {
          experimentalMaxBufferedResults: 8,
          experimentalResultBytes: bytes,
          experimentalMaxReservedResultBytes: capacity,
        },
      )) {
        void value;
        received++;
        await immediate();
      }
      completed[name] = performance.now() - started;
      return received;
    };
    const large = stream('largeStream', 32, 256 * KiB, largeCapacity);
    const small = stream('smallStream', 64, 4 * KiB, 32 * KiB);
    const completion = runtime
      .parallelFor(
        task,
        { start: 0, end: sharedOutput.length, grainSize: 512 },
        (partition) => ({
          input: {
            partition,
            source,
            output: sharedOutput,
            kind: 'shared',
            iterations: 2,
          },
        }),
        { experimentalDispatchBatchSize: 4 },
      )
      .then(() => {
        completed.parallel = performance.now() - started;
      });
    const map = runtime
      .parallelMapRange(
        task,
        { start: 0, end: 32_768, grainSize: 512 },
        (partition) => ({
          input: { partition, source, kind: 'map', iterations: 2 },
        }),
        {
          experimentalOutputConstructor: Uint8Array,
          experimentalDispatchBatchSize: 4,
        },
      )
      .then((value) => {
        completed.map = performance.now() - started;
        return value.length;
      });
    const ordinary = runtime
      .run(task, {
        partition: { index: 0, start: 0, end: 1 },
        source,
        bytes: 1024,
        iterations: 2,
      })
      .then(() => {
        completed.ordinary = performance.now() - started;
      });
    const [largeCount, smallCount, , mapCount] = await Promise.all([
      large,
      small,
      completion,
      map,
      ordinary,
    ]);
    const stats = runtime.stats();
    results.push({
      largeCapacity,
      trial,
      completed,
      largeCount,
      smallCount,
      mapCount,
      wallMs: performance.now() - started,
      peakReservedResultBytes: stats.streamResults.peakReservedResultBytes,
      currentReservedResultBytes:
        stats.streamResults.currentReservedResultBytes,
      starvation: Object.keys(completed).length !== 5,
    });
    await runtime.shutdown();
  }
}
const report = {
  version: '0.9.0',
  timestamp: new Date().toISOString(),
  results,
};
await writeFile(
  new URL('../results/binary-fairness-v0.9.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(results);
