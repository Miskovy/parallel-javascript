import { parentPort, threadId } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { PjsRuntime, PjsTaskRegistry, transfer } from '../../dist/index.js';

export async function range({
  partition,
  gate,
  ms = 0,
  fail = false,
  crash = false,
  shared,
  data,
  move = false,
  counter,
  badProtocol = false,
  badOutput = false,
}) {
  if (counter) Atomics.add(new Int32Array(counter), partition.index, 1);
  if (badProtocol)
    parentPort.postMessage({
      type: 'batchResult',
      batchId: 'incorrect-batch',
      items: [],
      skippedTaskIds: [],
      executionMs: 0,
    });
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    Atomics.notify(control, 0);
    const deadline = Date.now() + 5000;
    while (!Atomics.load(control, 1)) {
      if (Date.now() > deadline)
        throw new Error('Test gate was never released');
      Atomics.wait(control, 1, 0, 100);
    }
  }
  if (ms) await delay(ms);
  if (crash) process.exit(23);
  if (fail) throw new RangeError('partition deliberately failed');
  const indices = [];
  for (let i = partition.start; i < partition.end; i++) indices.push(i);
  const values = data ?? new Float64Array(indices);
  const result = {
    partition,
    indices,
    threadId,
    values,
    shared: shared?.buffer instanceof SharedArrayBuffer,
    sum: shared ? shared.reduce((a, b) => a + b, 0) : undefined,
  };
  if (badOutput) result.invalid = () => {};
  return move ? transfer(result, [values.buffer]) : result;
}

export async function nested() {
  const registry = new PjsTaskRegistry();
  const task = registry.register('range', new URL(import.meta.url), 'range');
  const runtime = new PjsRuntime({ registry, workers: 1 });
  try {
    await runtime.partitionRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => ({ input: { partition } }),
    );
  } finally {
    await runtime.shutdown({ drain: false });
  }
}
