import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import { Tinypool } from 'tinypool';
import workerpool from 'workerpool';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { execute } from './kernels.mjs';
import { identities } from './identity.mjs';
import { createRaw } from './raw.mjs';

export function createPool(name, workers) {
  assert.ok(Number.isInteger(workers) && workers > 0);
  if (name === 'serial')
    return {
      ready: async () => {},
      run(input) {
        if (input.op === 'identity')
          return { identities: identities(), isMainThread: true, threadId: 0 };
        // Simulate the same exclusive buffer ownership at both endpoints. Serial
        // has no transport; this does not manufacture a clone cost on its baseline.
        const moved = input.family === 'image' && input.mode === 'transfer';
        const owned = moved
          ? structuredClone(input, { transfer: [input.input.buffer] })
          : input;
        const result = execute(owned);
        return moved
          ? structuredClone(result, { transfer: [result.output.buffer] })
          : result;
      },
      close: async () => {},
    };
  if (name === 'raw') return createRaw(workers);
  if (name === 'pjs') {
    const registry = new PjsTaskRegistry();
    const handle = registry.register(
      'publication-task',
      new URL('./pjs-task.mjs', import.meta.url),
    );
    const pool = new PjsRuntime({ registry, workers, maxQueue: 2 * workers });
    return {
      ready: () => pool.ready(),
      run: (input, transferList = []) =>
        pool.run(handle, input, { transferList }),
      close: () => pool.shutdown({ drain: false }),
    };
  }
  if (name === 'piscina' || name === 'tinypool') {
    const options = {
      filename: fileURLToPath(new URL(`./${name}-task.mjs`, import.meta.url)),
      minThreads: workers,
      maxThreads: workers,
      maxQueue: 2 * workers,
      concurrentTasksPerWorker: 1,
    };
    const pool =
      name === 'piscina'
        ? new Piscina(options)
        : new Tinypool({ ...options, runtime: 'worker_threads' });
    return {
      ready: async () => {},
      run: (input, transferList = []) => pool.run(input, { transferList }),
      close: () => pool.destroy(),
    };
  }
  if (name === 'workerpool') {
    const pool = workerpool.pool(
      fileURLToPath(new URL('./workerpool-task.mjs', import.meta.url)),
      {
        minWorkers: workers,
        maxWorkers: workers,
        workerType: 'thread',
        maxQueueSize: 2 * workers,
      },
    );
    // Registered method name; no per-submission function stringification.
    return {
      ready: async () => {},
      run: (input, transfer = []) =>
        pool.exec('task', [input], { transfer }).then((x) => x),
      close: () => pool.terminate(true),
    };
  }
  throw new Error(`Unknown contender ${name}`);
}

export async function dispatch(pool, tasks, inFlight, onFirst = () => {}) {
  const results = new Array(tasks.length);
  let cursor = 0,
    completed = 0;
  await Promise.all(
    Array.from({ length: Math.min(inFlight, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const id = cursor++;
        const task = tasks[id];
        const transferList =
          task.family === 'image' && task.mode === 'transfer'
            ? [task.input.buffer]
            : [];
        results[id] = await pool.run(task, transferList);
        if (completed++ === 0) onFirst();
      }
    }),
  );
  return results;
}
