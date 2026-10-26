import type { ProgressMessage } from './protocol.js';

export const MAX_PROGRESS_BYTES = 16 * 1024;
const invalid = Symbol('invalid progress');

/** Incremental JSON encoding: never stringify/copy an entire application payload first. */
export function encodeProgress(value: unknown): string | undefined {
  const chunks: string[] = [];
  const path = new Set<object>();
  let bytes = 0;
  const append = (text: string, length = text.length) => {
    if (bytes + length > MAX_PROGRESS_BYTES) throw invalid;
    bytes += length;
    chunks.push(text);
  };
  const string = (text: string) => {
    if (text.length > MAX_PROGRESS_BYTES) throw invalid;
    append('"');
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 34) append('\\"');
      else if (code === 92) append('\\\\');
      else if (code < 32) append('\\u' + code.toString(16).padStart(4, '0'));
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        i + 1 < text.length &&
        text.charCodeAt(i + 1) >= 0xdc00 &&
        text.charCodeAt(i + 1) <= 0xdfff
      ) {
        append(text.slice(i, i + 2), 4);
        i++;
      } else if (code >= 0xd800 && code <= 0xdfff)
        append('\\u' + code.toString(16));
      else append(text[i]!, code < 128 ? 1 : code < 2048 ? 2 : 3);
    }
    append('"');
  };
  const visit = (current: unknown, depth: number): void => {
    if (depth > 16) throw invalid;
    if (current === null) {
      append('null');
      return;
    }
    if (typeof current === 'string') {
      string(current);
      return;
    }
    if (typeof current === 'boolean') {
      append(String(current));
      return;
    }
    if (typeof current === 'number' && Number.isFinite(current)) {
      append(String(current));
      return;
    }
    if (typeof current !== 'object' || current === null || path.has(current))
      throw invalid;
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw invalid;
    path.add(current);
    if (array) {
      const length = Object.getOwnPropertyDescriptor(current, 'length')?.value;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_PROGRESS_BYTES / 2
      )
        throw invalid;
      append('[');
      for (let i = 0; i < length; i++) {
        if (i) append(',');
        const item = Object.getOwnPropertyDescriptor(current, String(i));
        if (!item || !('value' in item)) throw invalid;
        visit(item.value, depth + 1);
      }
      append(']');
    } else {
      append('{');
      let first = true;
      for (const key in current) {
        const item = Object.getOwnPropertyDescriptor(current, key);
        if (!item || !item.enumerable) continue;
        if (!('value' in item)) throw invalid;
        if (!first) append(',');
        first = false;
        string(key);
        append(':');
        visit(item.value, depth + 1);
      }
      append('}');
    }
    path.delete(current);
  };
  try {
    visit(value, 0);
    return chunks.join('');
  } catch {
    return undefined;
  }
}

/** One physical execution owns one frame window, even when it contains a batch. */
export class ProgressReporter {
  private pending: ProgressMessage | undefined;
  constructor(
    readonly flag: Int32Array<SharedArrayBuffer>,
    private readonly send: (message: ProgressMessage) => void,
  ) {}
  report(message: ProgressMessage): boolean {
    if (Atomics.load(this.flag, 0) < 0) return false;
    this.pending = message;
    this.flush();
    return Atomics.load(this.flag, 0) >= 0;
  }
  wake(): void {
    Atomics.store(this.flag, 1, 0);
    this.flush();
  }
  private flush(): void {
    if (!this.pending || Atomics.compareExchange(this.flag, 0, 1, 0) !== 1)
      return;
    const message = this.pending;
    this.pending = undefined;
    try {
      this.send(message);
    } catch {
      this.close();
    }
  }
  close(): void {
    Atomics.store(this.flag, 0, -1);
    this.pending = undefined;
  }
}
