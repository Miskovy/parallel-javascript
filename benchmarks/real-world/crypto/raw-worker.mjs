import { parentPort } from 'node:worker_threads';
import { compute } from './task.mjs';

parentPort.on('message', ({ id, input }) => {
  try {
    const result = compute(input);
    parentPort.postMessage(
      { id, result },
      input.ownership === 'transfer' ? [result.data.buffer] : [],
    );
  } catch (error) {
    parentPort.postMessage({ id, error: error.stack });
  }
});
parentPort.postMessage({ ready: true });
