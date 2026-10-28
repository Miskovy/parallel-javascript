import type {
  BrowserRuntimeHost,
  BrowserWorkerServices,
} from '../contracts.js';
import {
  snapshotTransferList,
  validateTransferList,
} from '../../tasks/transfer-core.js';
import { browserCapabilities, isWindowHost } from './capabilities.js';
import { createBrowserWorkerConnection } from './worker-connection.js';

export function createBrowserHost(workerURL: URL): BrowserRuntimeHost {
  const capability = browserCapabilities();
  if (!isWindowHost() || !capability.workers)
    throw new TypeError(
      'Browser runtime requires a Window host with dedicated module workers',
    );
  const NativeWorker = Worker;
  const host: BrowserRuntimeHost = {
    lifecycle: 'endpoint-revocation',
    moduleProtocols: Object.freeze(['http:', 'https:']),
    recovery: Object.freeze({
      mode: 'limited',
      causes: Object.freeze(['task-error'] as const),
      retryError: 'Browser recovery supports validated task-error only',
      fallbackError: 'Browser fallback supports validated task-error only',
    }),
    sharedMemory: capability.sharedMemory,
    debugInvariants: false,
    cpuCount: () =>
      Math.max(1, Math.min(4, Math.floor(navigator.hardwareConcurrency || 1))),
    id: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
    },
    isHostThread: isWindowHost,
    isPromise(value): value is Promise<unknown> {
      if (
        value === null ||
        (typeof value !== 'object' && typeof value !== 'function')
      )
        return false;
      try {
        // Native promise brand check, including foreign realms; observe rejection too.
        Promise.prototype.then.call(
          value,
          () => {},
          () => {},
        );
        return true;
      } catch {
        return false;
      }
    },
    createScope: () => ({
      runInAsyncScope: (callback, receiver, ...args) =>
        Reflect.apply(callback, receiver, args),
      emitDestroy() {},
    }),
    snapshotTransferList,
    defer(callback) {
      const timer = setTimeout(callback, 0);
      return () => clearTimeout(timer);
    },
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
    unref() {},
    worker: Object.freeze<BrowserWorkerServices>({
      lifecycle: 'endpoint-revocation',
      validateTransferList,
      create: (data) =>
        createBrowserWorkerConnection(
          workerURL,
          NativeWorker,
          capability,
          data,
        ),
    }),
  };
  return Object.freeze(host);
}
