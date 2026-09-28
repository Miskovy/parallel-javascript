import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers';
import { PjsQueueFullError, PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register(
  'fairness',
  new URL('./pjs-task.mjs', import.meta.url),
);
const results = [];

for (const batchSize of [1, 4, 8]) {
  for (let trial = 0; trial < 5; trial++) {
    const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 8 });
    await runtime.ready();
    const progressBuffer = new SharedArrayBuffer(
      3 * Int32Array.BYTES_PER_ELEMENT,
    );
    const progress = new Int32Array(progressBuffer);
    const started = performance.now();
    const firstSeenMs = [null, null, null];
    const history = [];
    let expectedAt = performance.now() + 1;
    let maxTimerDriftMs = 0;
    const delay = monitorEventLoopDelay({ resolution: 1 });
    delay.enable();
    const timer = setInterval(() => {
      const now = performance.now();
      maxTimerDriftMs = Math.max(maxTimerDriftMs, now - expectedAt);
      expectedAt = now + 1;
      const snapshot = [...progress];
      for (let index = 0; index < snapshot.length; index++)
        if (snapshot[index] > 0 && firstSeenMs[index] === null)
          firstSeenMs[index] = now - started;
      history.push({ atMs: now - started, progress: snapshot });
    }, 1);
    const operation = (progressIndex) =>
      runtime.partitionRange(
        task,
        { start: 0, end: 128, grainSize: 1 },
        (partition) => ({
          input: {
            kind: 'cpu',
            partition,
            iterations: 200_000,
            progress: progressBuffer,
            progressIndex,
          },
        }),
        { experimentalDispatchBatchSize: batchSize },
      );
    const a = operation(0);
    const b = operation(1);
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
            iterations: 200_000,
            progress: progressBuffer,
            progressIndex: 2,
          });
      }),
    );
    const terminalMs = {};
    await Promise.all([
      a.then(() => {
        terminalMs.a = performance.now() - started;
      }),
      b.then(() => {
        terminalMs.b = performance.now() - started;
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
      history,
    });
    await runtime.shutdown();
  }
}

await writeFile(
  new URL('../results/dispatch-fairness-v0.5.json', import.meta.url),
  JSON.stringify(
    {
      version: '0.5.0',
      timestamp: new Date().toISOString(),
      methodology: {
        workers: 4,
        maxQueue: 8,
        parents: 2,
        logicalPartitionsPerParent: 128,
        ordinaryTasks: 128,
        trialsPerBatch: 5,
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
    firstA: result.firstSeenMs[0],
    firstB: result.firstSeenMs[1],
    firstOrdinary: result.firstSeenMs[2],
    tailA: result.terminalMs.a,
    tailB: result.terminalMs.b,
    tailOrdinary: result.terminalMs.ordinary,
    starvation: result.starvation,
    delayMax: result.eventLoopDelayMaxMs,
  })),
);
