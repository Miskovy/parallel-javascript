import type { TaskDescriptor } from '../tasks/registry.js';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}
export interface BootstrapData {
  version: 1;
  tasks: TaskDescriptor[];
}
export type HostMessage =
  | { type: 'execute'; taskId: string; taskName: string; input: unknown }
  | { type: 'shutdown' };
export type TaskResultMessage =
  | { type: 'success'; taskId: string; output: unknown; executionMs: number }
  | {
      type: 'failure';
      taskId: string;
      error: SerializedError;
      kind: 'task' | 'serialization';
      executionMs: number;
    };
export type WorkerMessage =
  | { type: 'ready'; version: 1 }
  | { type: 'started'; taskId: string }
  | TaskResultMessage
  | { type: 'bootstrapFailure'; error: SerializedError };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function error(value: unknown): value is SerializedError {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string')
  );
}
export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!record(value)) return false;
  if (value.type === 'ready') return value.version === 1;
  if (value.type === 'bootstrapFailure') return error(value.error);
  if (typeof value.taskId !== 'string') return false;
  if (value.type === 'started') return true;
  if (
    typeof value.executionMs !== 'number' ||
    !Number.isFinite(value.executionMs) ||
    value.executionMs < 0
  )
    return false;
  return (
    (value.type === 'success' && 'output' in value) ||
    (value.type === 'failure' &&
      error(value.error) &&
      (value.kind === 'task' || value.kind === 'serialization'))
  );
}
export function isHostMessage(value: unknown): value is HostMessage {
  return (
    record(value) &&
    (value.type === 'shutdown' ||
      (value.type === 'execute' &&
        typeof value.taskId === 'string' &&
        typeof value.taskName === 'string' &&
        'input' in value))
  );
}
export function serializeError(value: unknown): SerializedError {
  // User code can throw any value, including objects with throwing accessors.
  try {
    if (value instanceof Error) {
      return {
        name: String(value.name),
        message: String(value.message),
        ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
      };
    }
    return { name: 'Error', message: String(value) };
  } catch {
    return {
      name: 'Error',
      message: 'Task threw an error that could not be inspected',
    };
  }
}
