import { parentPort } from 'node:worker_threads';
import task from './task.mjs';

parentPort.on('message', ({ ticket, input }) => {
  try {
    parentPort.postMessage({ ticket, result: task(input) });
  } catch (error) {
    parentPort.postMessage({ ticket, error: error.stack });
  }
});
parentPort.postMessage({ ready: true });
