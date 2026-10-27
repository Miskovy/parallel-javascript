import type { BootstrapData, SerializedError } from '../workers/protocol.js';
export const BROWSER_PROTOCOL = 1;

export interface BrowserInitialization {
  type: 'initialize';
  browserProtocol: 1;
  data: BootstrapData;
  sharedMemory: boolean;
  sharedProbe?: SharedArrayBuffer;
}
export interface BrowserReady {
  type: 'ready';
  version: 2;
  browserProtocol: 1;
  sharedMemory: boolean;
}
export interface BrowserFailure {
  type: 'bootstrapFailure' | 'workerFailure';
  error: SerializedError;
}

export function validateInitialization(value: unknown): BrowserInitialization {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid browser initialization');
  const message = value as Partial<BrowserInitialization>;
  const data = message.data;
  if (
    message.type !== 'initialize' ||
    message.browserProtocol !== BROWSER_PROTOCOL ||
    typeof message.sharedMemory !== 'boolean' ||
    !data ||
    data.version !== 2 ||
    !Array.isArray(data.tasks) ||
    !Number.isSafeInteger(data.concurrency ?? 1) ||
    (data.concurrency ?? 1) < 1
  )
    throw new Error('Incompatible browser worker initialization');
  const ids = new Set<string>();
  for (const task of data.tasks) {
    if (
      !task ||
      typeof task.id !== 'string' ||
      !task.id ||
      ids.has(task.id) ||
      typeof task.module !== 'string' ||
      typeof task.exportName !== 'string' ||
      !task.exportName ||
      !['http:', 'https:'].includes(new URL(task.module).protocol)
    )
      throw new Error('Invalid browser task descriptor');
    ids.add(task.id);
  }
  return message as BrowserInitialization;
}
