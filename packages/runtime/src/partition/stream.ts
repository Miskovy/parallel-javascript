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
    this.peakBuffered = Math.max(this.peakBuffered, this.buffer.length);
  }

  complete(): void {
    if (this.done) return;
    this.done = true;
    this.callbacks = undefined;
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.resolve({ value: undefined, done: true });
  }

  fail(error: Error): void {
    if (this.done) return;
    this.done = true;
    this.terminalError = error;
    this.buffer.length = 0;
    this.callbacks = undefined;
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.reject(error);
  }

  next(): Promise<IteratorResult<StreamRangeResult<Output>>> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
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
      this.buffer.length = 0;
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
      this.buffer.length = 0;
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
}
