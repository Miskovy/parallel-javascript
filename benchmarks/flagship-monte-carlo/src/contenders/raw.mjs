import { Worker } from 'node:worker_threads';

export function createRaw(workers) {
  const slots = [],
    queue = [];
  let ticket = 0,
    failure,
    closed = false;
  function fail(error) {
    failure ??= error;
    for (const slot of slots) {
      slot.active?.reject(error);
      slot.active = null;
      slot.rejectReady?.(error);
    }
    for (const entry of queue.splice(0)) entry.reject(error);
  }
  function dispatch(slot) {
    if (closed || failure || !slot.ready || slot.active || !queue.length)
      return;
    slot.active = queue.shift();
    try {
      slot.worker.postMessage({
        ticket: slot.active.ticket,
        input: slot.active.input,
      });
    } catch (error) {
      fail(error);
    }
  }
  const ready = Promise.all(
    Array.from(
      { length: workers },
      () =>
        new Promise((resolve, reject) => {
          const slot = {
            worker: new Worker(
              new URL('../workers/raw-worker.mjs', import.meta.url),
            ),
            ready: false,
            active: null,
            rejectReady: reject,
          };
          slots.push(slot);
          slot.worker.on('message', (message) => {
            if (message.ready) {
              slot.ready = true;
              slot.rejectReady = null;
              resolve();
              dispatch(slot);
              return;
            }
            const current = slot.active;
            if (!current || message.ticket !== current.ticket) {
              fail(new Error('Raw protocol mismatch'));
              return;
            }
            slot.active = null;
            if (message.error) current.reject(new Error(message.error));
            else current.resolve(message.result);
            dispatch(slot);
          });
          slot.worker.on('error', fail);
          slot.worker.on('exit', (code) => {
            if (!closed) fail(new Error(`Unexpected raw worker exit ${code}`));
          });
        }),
    ),
  );
  return {
    ready: () => ready,
    run(input) {
      if (closed || failure)
        return Promise.reject(failure ?? new Error('Raw pool closed'));
      if (queue.length >= 2 * workers)
        return Promise.reject(new Error('Raw queue full'));
      return new Promise((resolve, reject) => {
        queue.push({ ticket: ticket++, input, resolve, reject });
        for (const slot of slots) dispatch(slot);
      });
    },
    async close() {
      closed = true;
      fail(new Error('Raw pool closed'));
      await Promise.all(slots.map((s) => s.worker.terminate()));
    },
  };
}
