import { Worker } from 'node:worker_threads';

export function createRaw(count) {
  const slots = [],
    queue = [];
  let nextTicket = 0,
    failure,
    closed = false;
  function fail(error) {
    failure ??= error;
    for (const slot of slots) {
      slot.rejectReady?.(error);
      slot.rejectReady = null;
      slot.active?.reject(error);
      slot.active = null;
    }
    for (const item of queue.splice(0)) item.reject(error);
  }
  function dispatch(slot) {
    if (closed || failure || !slot.ready || slot.active || !queue.length)
      return;
    const item = (slot.active = queue.shift());
    try {
      slot.worker.postMessage(
        { ticket: item.ticket, input: item.input },
        item.transferList,
      );
    } catch (error) {
      fail(error);
    }
  }
  const readiness = Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise((resolve, reject) => {
          const slot = {
            worker: new Worker(new URL('./raw-worker.mjs', import.meta.url)),
            ready: false,
            active: null,
            rejectReady: reject,
          };
          slots.push(slot);
          slot.worker.on('message', (message) => {
            if (message.ready) {
              if (slot.ready) {
                fail(new Error('Duplicate ready'));
                return;
              }
              slot.ready = true;
              slot.rejectReady = null;
              resolve();
              dispatch(slot);
              return;
            }
            const current = slot.active;
            if (!current || message.ticket !== current.ticket) {
              fail(new Error('Raw correlation mismatch'));
              return;
            }
            slot.active = null;
            if (message.error)
              current.reject(
                Object.assign(new Error(message.error.message), {
                  stack: message.error.stack,
                }),
              );
            else current.resolve(message.result);
            dispatch(slot);
          });
          slot.worker.on('error', fail);
          slot.worker.on('exit', (code) => {
            if (!closed) fail(new Error(`Unexpected worker exit ${code}`));
          });
        }),
    ),
  );
  // A caller may submit before calling ready; never leave an unhandled rejection.
  readiness.catch(() => {});
  return {
    ready: () => readiness,
    run(input, transferList = []) {
      if (closed || failure)
        return Promise.reject(failure ?? new Error('Raw pool closed'));
      if (queue.length >= 2 * count)
        return Promise.reject(new Error('Raw queue full'));
      return new Promise((resolve, reject) => {
        queue.push({
          ticket: nextTicket++,
          input,
          transferList,
          resolve,
          reject,
        });
        for (const slot of slots) dispatch(slot);
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      fail(new Error('Raw pool closed'));
      await Promise.all(slots.map((slot) => slot.worker.terminate()));
    },
  };
}
