import { parentPort, workerData } from 'node:worker_threads';
import { startInvocations } from './invocations.js';
import { inspectBinaryResult } from '../partition/binary.js';
import { transferOutput } from '../tasks/transfer.js';
import type { BootstrapData } from './protocol.js';

if (!parentPort) throw new Error('PJS bootstrap requires a worker thread');
const port = parentPort;
await startInvocations(
  workerData as BootstrapData,
  {
    send: (message, transfers = []) => port.postMessage(message, transfers),
    listen: (callback) => {
      port.on('message', callback);
    },
    close: () => port.close(),
  },
  {
    commonjs: true,
    transferOutput,
    inspectBinaryResult,
    profiling: { timestampNs: () => process.hrtime.bigint() },
  },
);
