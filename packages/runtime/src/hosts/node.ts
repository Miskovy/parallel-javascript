import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { types } from 'node:util';
import { isMainThread, Worker } from 'node:worker_threads';
import {
  snapshotTransferList,
  validateTransferList,
} from '../tasks/transfer.js';
import type { NodeRuntimeHost, NodeWorkerServices } from './contracts.js';

export const nodeHost: NodeRuntimeHost = Object.freeze<NodeRuntimeHost>({
  lifecycle: 'confirmed-exit',
  moduleProtocols: Object.freeze(['file:']),
  recovery: Object.freeze({ mode: 'all' }),
  sharedMemory: true,
  debugInvariants: process.env.PJS_DEBUG_RESERVATION_INVARIANTS === '1',
  cpuCount: availableParallelism,
  id: randomUUID,
  isHostThread: () => isMainThread,
  isPromise: types.isPromise,
  createScope: () =>
    new AsyncResource('PjsRangeOperation', { requireManualDestroy: true }),
  snapshotTransferList,
  defer(callback) {
    const timer = setImmediate(callback);
    return () => clearImmediate(timer);
  },
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
  unref: (timer) => timer.unref(),
  worker: Object.freeze<NodeWorkerServices>({
    lifecycle: 'confirmed-exit',
    validateTransferList,
    profiling: Object.freeze({ timestampNs: () => process.hrtime.bigint() }),
    create(data, limits) {
      const thread = new Worker(
        new URL('../workers/bootstrap.js', import.meta.url),
        {
          workerData: data,
          ...(limits ? { resourceLimits: { ...limits } } : {}),
        },
      );
      return {
        lifecycle: 'confirmed-exit',
        thread,
        listen(callbacks) {
          thread.on('message', callbacks.message);
          thread.on('messageerror', callbacks.messageError);
          thread.on('error', callbacks.error);
          thread.on('exit', callbacks.exit);
        },
        detach: () => thread.removeAllListeners(),
      };
    },
  }),
});
