import type { WorkerResourceLimits, RecoveryCause } from '../types/index.js';
import type { BootstrapData } from '../workers/protocol.js';

export type LifecycleObservation = 'confirmed-exit' | 'endpoint-revocation';

export interface ExecutionScope {
  runInAsyncScope<T, Args extends unknown[]>(
    callback: (...args: Args) => T,
    receiver: unknown,
    ...args: Args
  ): T;
  emitDestroy(): void;
}
interface WorkerMessages {
  message(value: unknown): void;
  messageError(error: Error): void;
  error(error: Error): void;
}
export interface NodeWorkerMessages extends WorkerMessages {
  exit(code: number): void;
}
export interface NodeWorkerThread {
  readonly threadId: number;
  postMessage(message: unknown, transferList?: ArrayBuffer[]): void;
  terminate(): Promise<number>;
}
export interface BrowserWorkerThread {
  postMessage(message: unknown): void;
  postMessage(message: unknown, transferList: ArrayBuffer[]): void;
  terminate(): void;
}
export type WorkerThread = NodeWorkerThread | BrowserWorkerThread;

/** Native objects stay at the transport boundary; PjsWorker owns correlations. */
export interface NodeWorkerConnection {
  readonly lifecycle: 'confirmed-exit';
  readonly thread: NodeWorkerThread;
  listen(callbacks: NodeWorkerMessages): void;
  detach(): void;
}
export interface BrowserWorkerConnection {
  readonly lifecycle: 'endpoint-revocation';
  readonly thread: BrowserWorkerThread;
  listen(callbacks: WorkerMessages): void;
  detach(): void;
}
export type WorkerConnection = NodeWorkerConnection | BrowserWorkerConnection;
export interface TransportProfiling {
  timestampNs(): bigint;
}
interface TransferValidation {
  validateTransferList(buffers: readonly ArrayBuffer[]): void;
}
export interface NodeWorkerServices extends TransferValidation {
  readonly lifecycle: 'confirmed-exit';
  readonly profiling: TransportProfiling;
  create(
    data: BootstrapData,
    limits?: WorkerResourceLimits,
  ): NodeWorkerConnection;
}
export interface BrowserWorkerServices extends TransferValidation {
  readonly lifecycle: 'endpoint-revocation';
  readonly profiling?: never;
  create(data: BootstrapData): BrowserWorkerConnection;
}
export type WorkerServices = NodeWorkerServices | BrowserWorkerServices;

/** Limited hosts validate supported causes before input work, in legacy read order. */
export type RecoveryPolicy =
  | { readonly mode: 'all' }
  | {
      readonly mode: 'limited';
      readonly causes: readonly RecoveryCause[];
      readonly retryError: string;
      readonly fallbackError: string;
    };
interface Timers {
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}
interface DeferredWork {
  defer(callback: () => void): () => void;
}
export interface TaskServices extends Timers, DeferredWork {
  readonly lifecycle: LifecycleObservation;
  readonly sharedMemory: boolean;
  readonly recovery: RecoveryPolicy;
  id(): string;
  isPromise(value: unknown): value is Promise<unknown>;
  snapshotTransferList(buffers: readonly ArrayBuffer[]): ArrayBuffer[];
}
export interface RangeServices extends Timers, DeferredWork {
  readonly sharedMemory: boolean;
  id(): string;
  isHostThread(): boolean;
  createScope(): ExecutionScope;
}
export interface PoolServices {
  readonly worker: WorkerServices;
  unref(timer: ReturnType<typeof setTimeout>): void;
}
export interface DispatchServices {
  readonly lifecycle: LifecycleObservation;
  readonly sharedMemory: boolean;
  readonly profiling?: true;
  readonly pool: PoolServices;
}
/** One concrete immutable assembly per entry; owners receive narrower views. */
interface HostServices extends TaskServices, RangeServices, PoolServices {
  readonly debugInvariants: boolean;
  readonly moduleProtocols: readonly string[];
  cpuCount(): number;
}
export interface NodeRuntimeHost extends HostServices {
  readonly lifecycle: 'confirmed-exit';
  readonly worker: NodeWorkerServices;
}
export interface BrowserRuntimeHost extends HostServices {
  readonly lifecycle: 'endpoint-revocation';
  readonly worker: BrowserWorkerServices;
}
export type RuntimeHost = NodeRuntimeHost | BrowserRuntimeHost;
