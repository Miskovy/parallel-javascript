import type { BrowserWorkerConnection } from '../contracts.js';
import type { BootstrapData } from '../../workers/protocol.js';
import type { BrowserCapabilities } from './capabilities.js';
import { BROWSER_PROTOCOL } from './protocol.js';
import type { BrowserInitialization, BrowserReady } from './protocol.js';

/** Native construction/wiring is separate from pool population and correlations. */
export function createBrowserWorkerConnection(
  workerURL: URL,
  NativeWorker: typeof Worker,
  capability: BrowserCapabilities,
  data: BootstrapData,
): BrowserWorkerConnection {
  const thread = new NativeWorker(workerURL, {
    type: 'module',
    name: 'pjs',
  });
  let live = true;
  let detach = () => {};
  return {
    lifecycle: 'endpoint-revocation',
    thread,
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
            (sharedProbe && Atomics.load(new Int32Array(sharedProbe), 0) !== 1)
          ) {
            callbacks.error(
              new Error('Incompatible browser worker readiness/capabilities'),
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
        }),
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
}
