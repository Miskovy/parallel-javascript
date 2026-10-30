import { parentPort, threadId, isMainThread } from 'node:worker_threads';
import { execute } from './kernels.mjs';
import { identities } from './identity.mjs';
parentPort.on('message', ({ ticket, input }) => {
  try {
    const result =
      input.op === 'identity'
        ? { identities: identities(), threadId, isMainThread }
        : execute(input);
    parentPort.postMessage(
      { ticket, result },
      input.family === 'image' && input.mode === 'transfer'
        ? [result.output.buffer]
        : [],
    );
  } catch (error) {
    parentPort.postMessage({
      ticket,
      error: { message: error.message, stack: error.stack },
    });
  }
});
parentPort.postMessage({ ready: true });
