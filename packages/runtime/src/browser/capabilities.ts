export interface BrowserCapabilities {
  /** Constructor availability only; module loading/CSP/URLs are validated at startup. */
  readonly workers: boolean;
  readonly windowHost: boolean;
  readonly sharedMemory: boolean;
  readonly termination: 'revocation';
  readonly workerExitConfirmation: false;
}

export function isWindowHost(): boolean {
  return (
    (globalThis as typeof globalThis & { window?: unknown }).window ===
    globalThis
  );
}

/** A local probe, not a promise that deployment headers or worker URLs are correct. */
export function browserCapabilities(): BrowserCapabilities {
  let sharedMemory = false;
  if (
    globalThis.crossOriginIsolated === true &&
    typeof SharedArrayBuffer === 'function' &&
    typeof Atomics === 'object'
  ) {
    try {
      const probe = new Int32Array(new SharedArrayBuffer(4));
      Atomics.store(probe, 0, 1);
      sharedMemory = Atomics.load(probe, 0) === 1;
    } catch {
      /* Capability remains unavailable. */
    }
  }
  return Object.freeze({
    workers: typeof Worker === 'function',
    windowHost: isWindowHost(),
    sharedMemory,
    termination: 'revocation',
    workerExitConfirmation: false,
  });
}
