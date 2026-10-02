import { Worker } from 'node:worker_threads';
import { promisify } from 'node:util';
import { deflateRaw, inflateRaw } from 'node:zlib';
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';
import { body } from './task.mjs';
import { compact, options, view } from './core.mjs';
const deflate = promisify(deflateRaw),
  inflate = promisify(inflateRaw);

export async function executor(config) {
  if (config.model === 'serial') return { run: body, close: async () => {} };
  if (config.model === 'native')
    return {
      run: async (input) =>
        compact(
          await (input.direction === 'inflate'
            ? inflate(view(input.data, input.start, input.end))
            : deflate(
                view(input.data, input.start, input.end),
                options(input.level),
              )),
        ),
      close: async () => {},
    };
  if (config.model === 'pjs') {
    const registry = new PjsTaskRegistry();
    const task = registry.register(
      'compression-research',
      new URL('./task.mjs', import.meta.url),
      'task',
    );
    const runtime = new PjsRuntime({
      registry,
      workers: config.workers,
      maxQueue: 128,
    });
    await runtime.ready();
    if (config.credit === 'held') runtime.resultCredits.reconcile = () => {};
    return {
      runtime,
      task,
      run: (input) =>
        runtime.run(
          task,
          input,
          config.ownership === 'transfer'
            ? { transferList: [input.data.buffer] }
            : {},
        ),
      close: () => runtime.shutdown({ drain: false }),
    };
  }
  const slots = [],
    queue = [],
    pending = new Map();
  let nextId = 0;
  const fail = (error) => {
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    queue.length = 0;
  };
  function dispatch() {
    for (const slot of slots)
      if (!slot.busy && queue.length) {
        const job = queue.shift();
        slot.busy = true;
        slot.worker.postMessage(
          job,
          config.ownership === 'transfer' ? [job.input.data.buffer] : [],
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
            fail(error);
          });
          worker.on('exit', (code) => {
            if (pending.size) fail(new Error(`raw exit ${code}`));
          });
          worker.on('message', (message) => {
            if (message.ready) return resolve();
            const job = pending.get(message.id);
            pending.delete(message.id);
            slot.busy = false;
            if (message.error) job.reject(new Error(message.error));
            else job.resolve(message.output);
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
    close: () => Promise.all(slots.map((slot) => slot.worker.terminate())),
  };
}
