import { Worker } from 'node:worker_threads';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { compute, nativeAsync } from './task.mjs';

export async function executor(config, maxQueue = 256) {
  if (config.model === 'serial' || config.model === 'native')
    return {
      run: config.model === 'serial' ? compute : nativeAsync,
      close: async () => {},
    };
  if (config.model === 'pjs') {
    const registry = new PjsTaskRegistry();
    const task = registry.register(
      'crypto-research',
      new URL('./task.mjs', import.meta.url),
      'task',
    );
    const runtime = new PjsRuntime({
      registry,
      workers: config.workers,
      maxQueue,
    });
    await runtime.ready();
    return {
      run: (input) =>
        runtime.run(
          task,
          input,
          input.ownership === 'transfer'
            ? { transferList: [input.data.buffer] }
            : {},
        ),
      stats: () => runtime.stats(),
      close: () => runtime.shutdown(),
    };
  }
  const pending = new Map();
  const queue = [];
  let nextId = 0;
  const slots = [];
  function dispatch() {
    for (const slot of slots) {
      if (slot.busy || !queue.length) continue;
      const job = queue.shift();
      slot.busy = true;
      slot.worker.postMessage(
        job,
        job.input.ownership === 'transfer' ? [job.input.data.buffer] : [],
      );
    }
  }
  await Promise.all(
    Array.from(
      { length: config.workers },
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(
            new URL('./raw-worker.mjs', import.meta.url),
          );
          const slot = { worker, busy: false };
          slots.push(slot);
          worker.on('error', (error) => {
            reject(error);
            for (const job of pending.values()) job.reject(error);
            pending.clear();
          });
          worker.on('message', (message) => {
            if (message.ready) return resolve();
            const job = pending.get(message.id);
            pending.delete(message.id);
            slot.busy = false;
            if (message.error) job.reject(new Error(message.error));
            else job.resolve(message.result);
            dispatch();
          });
        }),
    ),
  );
  return {
    run: (input) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        queue.push({ id, input });
        dispatch();
      }),
    close: () => Promise.all(slots.map(({ worker }) => worker.terminate())),
  };
}
