import { writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers';
import { PjsQueueFullError, PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const quick = process.env.PJS_BENCH_QUICK === '1';
const trials = quick ? 1 : 3;
const workers = Math.min(4, availableParallelism());
const registry = new PjsTaskRegistry();
const task = registry.register(
  'completion-fairness',
  new URL('./task.mjs', import.meta.url),
);
const results = [];

for (const batchSize of [1, 4, 8]) {
  for (let trial = 0; trial < trials; trial++) {
    const runtime = new PjsRuntime({ registry, workers, maxQueue: 8 });
    await runtime.ready();
    const progressBuffer = new SharedArrayBuffer(
      3 * Int32Array.BYTES_PER_ELEMENT,
    );
    const progress = new Int32Array(progressBuffer);
    const started = performance.now();
    const firstSeenMs = [null, null, null];
    let expectedAt = started + 1;
    let maxTimerDriftMs = 0;
    const delay = monitorEventLoopDelay({ resolution: 1 });
    delay.enable();
    const timer = setInterval(() => {
      const now = performance.now();
      maxTimerDriftMs = Math.max(maxTimerDriftMs, now - expectedAt);
      expectedAt = now + 1;
      for (let index = 0; index < progress.length; index++)
        if (progress[index] > 0 && firstSeenMs[index] === null)
          firstSeenMs[index] = now - started;
    }, 1);
    const makeInput = (progressIndex) => (partition) => ({
      input: {
        kind: 'cpu',
        partition,
        iterations: 200_000,
        progress: progressBuffer,
        progressIndex,
      },
    });
    const completion = runtime.parallelFor(
      task,
      { start: 0, end: 128, grainSize: 1 },
      makeInput(0),
      { experimentalDispatchBatchSize: batchSize },
    );
    const collecting = runtime.partitionRange(
      task,
      { start: 0, end: 128, grainSize: 1 },
      makeInput(1),
      { experimentalDispatchBatchSize: batchSize },
    );
    const runWhenAdmitted = async (input) => {
      for (;;) {
        try {
          return await runtime.run(task, input);
        } catch (error) {
          if (!(error instanceof PjsQueueFullError)) throw error;
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    };
    const ordinary = Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let index = 0; index < 32; index++)
          await runWhenAdmitted({
            kind: 'cpu',
            partition: { index, start: index, end: index + 1 },
            iterations: 200_000,
            progress: progressBuffer,
            progressIndex: 2,
          });
      }),
    );
    const terminalMs = {};
    await Promise.all([
      completion.then(() => {
        terminalMs.completion = performance.now() - started;
      }),
      collecting.then(() => {
        terminalMs.collecting = performance.now() - started;
      }),
      ordinary.then(() => {
        terminalMs.ordinary = performance.now() - started;
      }),
    ]);
    clearInterval(timer);
    delay.disable();
    for (let index = 0; index < progress.length; index++)
      if (firstSeenMs[index] === null && progress[index] > 0)
        firstSeenMs[index] = performance.now() - started;
    results.push({
      batchSize,
      trial,
      firstSeenMs,
      terminalMs,
      completed: [...progress],
      starvation: firstSeenMs.some((value) => value === null),
      maxTimerDriftMs,
      eventLoopDelayMeanMs: Number.isFinite(delay.mean)
        ? delay.mean / 1e6
        : null,
      eventLoopDelayMaxMs: delay.max / 1e6,
    });
    await runtime.shutdown();
  }
}

await writeFile(
  new URL('../results/completion-fairness-v0.6.json', import.meta.url),
  JSON.stringify(
    {
      version: '0.6.0',
      timestamp: new Date().toISOString(),
      methodology: {
        workers,
        maxQueue: 8,
        logicalPartitionsPerParent: 128,
        ordinaryTasks: 128,
        trialsPerBatch: trials,
        timerIntervalMs: 1,
      },
      results,
    },
    null,
    2,
  ) + '\n',
);
console.table(
  results.map((result) => ({
    batch: result.batchSize,
    trial: result.trial,
    firstCompletion: result.firstSeenMs[0],
    firstCollecting: result.firstSeenMs[1],
    firstOrdinary: result.firstSeenMs[2],
    tailCompletion: result.terminalMs.completion,
    tailCollecting: result.terminalMs.collecting,
    tailOrdinary: result.terminalMs.ordinary,
    starvation: result.starvation,
    delayMax: result.eventLoopDelayMaxMs,
  })),
);
