import type { RuntimeHost, WorkerThread } from './contracts.js';
import {
  snapshotTransferList,
  validateTransferList,
} from '../tasks/transfer-core.js';
import { browserCapabilities, isWindowHost } from '../browser/capabilities.js';
import { BROWSER_PROTOCOL } from '../browser/protocol.js';
import type {
  BrowserInitialization,
  BrowserReady,
} from '../browser/protocol.js';

export function createBrowserHost(workerURL: URL): RuntimeHost {
  const capability = browserCapabilities();
  if (!isWindowHost() || !capability.workers)
    throw new TypeError(
      'Browser runtime requires a Window host with dedicated module workers',
    );
  const NativeWorker = Worker;
  return {
    kind: 'browser',
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
    worker: {
      kind: 'browser',
      validateTransferList,
      timestampNs: () => {
        throw new Error('Node transport profiling is unavailable in browsers');
      },
      create(data) {
        const thread = new NativeWorker(workerURL, {
          type: 'module',
          name: 'pjs',
        });
        let live = true;
        let detach = () => {};
        return {
          thread: thread as unknown as WorkerThread,
          listen(callbacks) {
            const sharedProbe = capability.sharedMemory
              ? new SharedArrayBuffer(4)
              : undefined;
            const message = (event: MessageEvent<unknown>) => {
              if (!live) return;
              const value = event.data;
              if (
                value &&
                typeof value === 'object' &&
                'type' in value &&
                value.type === 'ready'
              ) {
                const ready = value as BrowserReady;
                if (
                  ready.browserProtocol !== BROWSER_PROTOCOL ||
                  ready.version !== 2 ||
                  ready.sharedMemory !== capability.sharedMemory ||
                  (sharedProbe &&
                    Atomics.load(new Int32Array(sharedProbe), 0) !== 1)
                ) {
                  callbacks.error(
                    new Error(
                      'Incompatible browser worker readiness/capabilities',
                    ),
                  );
                  return;
                }
              }
              callbacks.message(value);
            };
            const error = (event: ErrorEvent) => {
              if (live)
                callbacks.error(
                  new Error(
                    event.message || 'Browser worker failed to load or execute',
                  ),
                );
            };
            const messageError = () => {
              if (live)
                callbacks.messageError(
                  new Error('Browser worker message could not be deserialized'),
                );
            };
            thread.addEventListener('message', message);
            thread.addEventListener('error', error);
            thread.addEventListener('messageerror', messageError);
            detach = () => {
              live = false;
              thread.removeEventListener('message', message);
              thread.removeEventListener('error', error);
              thread.removeEventListener('messageerror', messageError);
            };
            const initialization: BrowserInitialization = {
              type: 'initialize',
              browserProtocol: BROWSER_PROTOCOL,
              data: Object.freeze({
                ...data,
                tasks: Object.freeze(
                  data.tasks.map((task) => Object.freeze({ ...task })),
                ),
              }) as typeof data,
              sharedMemory: capability.sharedMemory,
              ...(sharedProbe ? { sharedProbe } : {}),
            };
            // Let the pool install this endpoint before a synchronous init-post
            // failure enters its fatal cleanup path. No execution is ready yet.
            queueMicrotask(() => {
              if (!live) return;
              try {
                thread.postMessage(initialization);
              } catch (cause) {
                callbacks.error(
                  cause instanceof Error ? cause : new Error(String(cause)),
                );
              }
            });
          },
          detach: () => detach(),
        };
      },
    },
  };
}
