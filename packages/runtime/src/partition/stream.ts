import type { RangePartition } from './range.js';

export interface StreamRangeResult<Output> {
  readonly partition: RangePartition;
  readonly output: Output;
}

interface StreamCallbacks {
  demand(): void;
  cancel(): void;
  yielded(): void;
}

function observablePayloadBytes(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer)
    return value.byteLength;
  return ArrayBuffer.isView(value) ? value.byteLength : undefined;
}

/** @internal Single-consumer completion-order delivery with bounded buffering. */
export class RangeStream<Output> implements AsyncIterableIterator<
  StreamRangeResult<Output>
> {
  private readonly buffer: StreamRangeResult<Output>[] = [];
  private waiter:
    | {
        resolve: (value: IteratorResult<StreamRangeResult<Output>>) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  private callbacks: StreamCallbacks | undefined;
  private terminalError: Error | undefined;
  private done = false;
  produced = 0;
  yielded = 0;
  peakBuffered = 0;
  knownBufferedPayloadBytes = 0;
  peakKnownBufferedPayloadBytes = 0;
  unknownBufferedResults = 0;
  peakUnknownBufferedResults = 0;

  constructor(readonly capacity: number) {}

  get buffered(): number {
    return this.buffer.length;
  }

  connect(callbacks: StreamCallbacks): void {
    this.callbacks = callbacks;
  }

  push(value: StreamRangeResult<Output>): void {
    if (this.done) return;
    this.produced++;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = undefined;
      this.yielded++;
      this.callbacks?.yielded();
      waiter.resolve({ value, done: false });
      return;
    }
    this.buffer.push(value);
    this.retain(value.output);
    this.peakBuffered = Math.max(this.peakBuffered, this.buffer.length);
  }

  complete(): void {
    if (this.done) return;
    this.done = true;
    this.clearBuffer();
    this.callbacks = undefined;
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.resolve({ value: undefined, done: true });
  }

  fail(error: Error): void {
    if (this.done) return;
    this.done = true;
    this.terminalError = error;
    this.clearBuffer();
    this.callbacks = undefined;
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.reject(error);
  }

  next(): Promise<IteratorResult<StreamRangeResult<Output>>> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
      this.release(value.output);
      this.yielded++;
      this.callbacks?.yielded();
      this.callbacks?.demand();
      return Promise.resolve({ value, done: false });
    }
    if (this.terminalError) return Promise.reject(this.terminalError);
    if (this.done) return Promise.resolve({ value: undefined, done: true });
    if (this.waiter)
      return Promise.reject(
        new Error('Concurrent next() calls are unsupported for a PJS stream'),
      );
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
      this.callbacks?.demand();
    });
  }

  return(): Promise<IteratorResult<StreamRangeResult<Output>>> {
    if (!this.done) {
      this.done = true;
      this.clearBuffer();
      const callbacks = this.callbacks;
      this.callbacks = undefined;
      const waiter = this.waiter;
      this.waiter = undefined;
      waiter?.resolve({ value: undefined, done: true });
      callbacks?.cancel();
    }
    return Promise.resolve({ value: undefined, done: true });
  }

  throw(error?: unknown): Promise<IteratorResult<StreamRangeResult<Output>>> {
    const reason = error instanceof Error ? error : new Error(String(error));
    if (!this.done) {
      this.done = true;
      this.clearBuffer();
      const callbacks = this.callbacks;
      this.callbacks = undefined;
      const waiter = this.waiter;
      this.waiter = undefined;
      waiter?.reject(reason);
      callbacks?.cancel();
    }
    return Promise.reject(reason);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<StreamRangeResult<Output>> {
    return this;
  }

  private retain(output: Output): void {
    const bytes = observablePayloadBytes(output);
    if (bytes === undefined) {
      this.unknownBufferedResults++;
      this.peakUnknownBufferedResults = Math.max(
        this.peakUnknownBufferedResults,
        this.unknownBufferedResults,
      );
      return;
    }
    this.knownBufferedPayloadBytes += bytes;
    this.peakKnownBufferedPayloadBytes = Math.max(
      this.peakKnownBufferedPayloadBytes,
      this.knownBufferedPayloadBytes,
    );
  }

  private release(output: Output): void {
    const bytes = observablePayloadBytes(output);
    if (bytes === undefined) {
      this.unknownBufferedResults--;
      return;
    }
    this.knownBufferedPayloadBytes -= bytes;
  }

  private clearBuffer(): void {
    this.buffer.length = 0;
    this.knownBufferedPayloadBytes = 0;
    this.unknownBufferedResults = 0;
  }
}
