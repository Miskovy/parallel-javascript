import { startInvocations } from '../workers/invocations.js';
import { isSharedArrayBuffer } from '../internal/binary-brands.js';
import { inspectBinaryResult } from '../partition/binary-core.js';
import { transferOutput } from '../tasks/transfer-core.js';
import { serializeError } from '../workers/protocol.js';
import type { WorkerMessage } from '../workers/protocol.js';
import { browserCapabilities } from './capabilities.js';
import { BROWSER_PROTOCOL, validateInitialization } from './protocol.js';

const worker = globalThis as typeof globalThis & {
  postMessage(message: unknown, transfers?: ArrayBuffer[]): void;
};
let initialized = false;
let failed = false;
let handler: ((value: unknown) => void) | undefined;
const send = (message: WorkerMessage, transfers: readonly ArrayBuffer[] = []) =>
  worker.postMessage(message, [...transfers]);
const fatal = (cause: unknown) => {
  if (failed) return;
  failed = true;
  send({ type: 'workerFailure', error: serializeError(cause) });
};
worker.addEventListener('error', (event) => {
  event.preventDefault();
  fatal(event.error ?? new Error(event.message));
});
worker.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  fatal(event.reason);
});
worker.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (failed) return;
  const value = event.data;
  if (initialized) {
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'initialize'
    )
      fatal(new Error('Duplicate browser initialization'));
    else if (!handler) fatal(new Error('Execution before browser readiness'));
    else handler(value);
    return;
  }
  initialized = true;
  try {
    const initialization = validateInitialization(value);
    const shared = initialization.sharedMemory;
    if (shared) {
      if (
        !browserCapabilities().sharedMemory ||
        !isSharedArrayBuffer(initialization.sharedProbe) ||
        initialization.sharedProbe.byteLength !== 4
      )
        throw new Error('Worker shared-memory capability mismatch');
      Atomics.store(new Int32Array(initialization.sharedProbe), 0, 1);
    } else if (initialization.sharedProbe !== undefined)
      throw new Error('Unexpected shared-memory probe');
    void startInvocations(
      initialization.data,
      {
        send(message, transfers = []) {
          if (message.type === 'ready')
            worker.postMessage({
              ...message,
              browserProtocol: BROWSER_PROTOCOL,
              sharedMemory: shared,
            });
          else send(message, transfers);
        },
        listen: (callback) => {
          handler = callback;
        },
        close: () => {
          handler = undefined;
        },
      },
      { commonjs: false, transferOutput, inspectBinaryResult, fatal },
    );
  } catch (cause) {
    failed = true;
    send({ type: 'bootstrapFailure', error: serializeError(cause) });
  }
});
