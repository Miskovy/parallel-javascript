import { parentPort } from 'node:worker_threads';
import { body } from './task.mjs';
parentPort.on('message', ({ id, input }) => {
  try {
    const output = body(input);
    parentPort.postMessage({ id, output }, [output.buffer]);
  } catch (error) {
    parentPort.postMessage({ id, error: String(error.stack ?? error) });
  }
});
parentPort.postMessage({ ready: true });
