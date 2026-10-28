import type { WorkerResourceLimits } from '../types/index.js';
import type { BootstrapData } from '../workers/protocol.js';

export interface ExecutionScope {
  runInAsyncScope<T, Args extends unknown[]>(
    callback: (...args: Args) => T,
    receiver: unknown,
    ...args: Args
  ): T;
  emitDestroy(): void;
}

/** Native objects remain transport details; execution ownership lives in PjsWorker. */
export interface WorkerThread {
  readonly threadId?: number;
  postMessage(message: unknown, transferList?: readonly ArrayBuffer[]): void;
  terminate(): unknown;
}
export interface WorkerConnection {
  readonly thread: WorkerThread;
  listen(callbacks: {
    message(value: unknown): void;
    messageError(error: Error): void;
    error(error: Error): void;
    exit(code: number): void;
  }): void;
  detach(): void;
}
export interface WorkerServices {
  readonly kind: 'node' | 'browser';
  create(data: BootstrapData, limits?: WorkerResourceLimits): WorkerConnection;
  validateTransferList(buffers: readonly ArrayBuffer[]): void;
  timestampNs(): bigint;
}

/** Concrete services bound by the two entries, never a mutable global host switch. */
export interface RuntimeHost {
  readonly kind: 'node' | 'browser';
  readonly sharedMemory: boolean;
  readonly debugInvariants: boolean;
  readonly worker: WorkerServices;
  cpuCount(): number;
  id(): string;
  isHostThread(): boolean;
  isPromise(value: unknown): value is Promise<unknown>;
  createScope(): ExecutionScope;
  snapshotTransferList(buffers: readonly ArrayBuffer[]): ArrayBuffer[];
  defer(callback: () => void): () => void;
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  unref(timer: ReturnType<typeof setTimeout>): void;
}
