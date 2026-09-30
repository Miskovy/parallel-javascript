import type { TaskDescriptor } from '../tasks/registry.js';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}
export interface BootstrapData {
  version: 2;
  tasks: TaskDescriptor[];
}
export interface InternalWorkerProfile {
  workerIngressMs: number;
  outputPreparationMs: number;
  postedAtNs: bigint;
}
export interface BatchInput {
  taskId: string;
  input: unknown;
  expectedResultBytes?: number;
}
export type HostMessage =
  | {
      type: 'execute';
      taskId: string;
      taskName: string;
      input: unknown;
      profile?: boolean;
      completionOnly?: boolean;
      expectedResultBytes?: number;
    }
  | {
      type: 'executeBatch';
      batchId: string;
      taskName: string;
      items: BatchInput[];
      profile?: boolean;
      completionOnly?: boolean;
    }
  | { type: 'shutdown' };
export type TaskResultMessage =
  | {
      type: 'success';
      taskId: string;
      output: unknown;
      executionMs: number;
      profile?: InternalWorkerProfile;
    }
  | {
      type: 'completed';
      taskId: string;
      executionMs: number;
      profile?: InternalWorkerProfile;
    }
  | {
      type: 'failure';
      taskId: string;
      error: SerializedError;
      kind: 'task' | 'serialization' | 'binaryContract';
      binaryContract?: BinaryContractFailure;
      executionMs: number;
      profile?: InternalWorkerProfile;
    };
export type BatchItemResult =
  | { type: 'success'; taskId: string; output: unknown; executionMs: number }
  | { type: 'completed'; taskId: string; executionMs: number }
  | {
      type: 'failure';
      taskId: string;
      error: SerializedError;
      kind: 'task' | 'serialization' | 'binaryContract';
      binaryContract?: BinaryContractFailure;
      executionMs: number;
    };
export interface BatchResultMessage {
  type: 'batchResult';
  batchId: string;
  items: BatchItemResult[];
  skippedTaskIds: string[];
  executionMs: number;
  profile?: InternalWorkerProfile;
}
export interface BinaryContractFailure {
  declaredBytes: number;
  actualBytes?: number;
  actualType: string;
}
export type ExecutionResultMessage = TaskResultMessage | BatchResultMessage;
export type WorkerMessage =
  | { type: 'ready'; version: 2 }
  | { type: 'started'; taskId: string }
  | ExecutionResultMessage
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
function profile(value: unknown): value is InternalWorkerProfile | undefined {
  if (value === undefined) return true;
  return (
    record(value) &&
    typeof value.workerIngressMs === 'number' &&
    Number.isFinite(value.workerIngressMs) &&
    value.workerIngressMs >= 0 &&
    typeof value.outputPreparationMs === 'number' &&
    Number.isFinite(value.outputPreparationMs) &&
    value.outputPreparationMs >= 0 &&
    typeof value.postedAtNs === 'bigint'
  );
}
function safeBytes(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function binaryContract(value: unknown): value is BinaryContractFailure {
  return (
    record(value) &&
    safeBytes(value.declaredBytes) &&
    (value.actualBytes === undefined || safeBytes(value.actualBytes)) &&
    typeof value.actualType === 'string'
  );
}
function failureKind(value: Record<string, unknown>): boolean {
  if (value.kind === 'task' || value.kind === 'serialization')
    return value.binaryContract === undefined;
  return (
    value.kind === 'binaryContract' && binaryContract(value.binaryContract)
  );
}
function result(value: unknown): value is BatchItemResult {
  if (!record(value) || typeof value.taskId !== 'string') return false;
  if (
    typeof value.executionMs !== 'number' ||
    !Number.isFinite(value.executionMs) ||
    value.executionMs < 0
  )
    return false;
  return (
    (value.type === 'success' && 'output' in value) ||
    value.type === 'completed' ||
    (value.type === 'failure' && error(value.error) && failureKind(value))
  );
}
export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!record(value)) return false;
  if (value.type === 'ready') return value.version === 2;
  if (value.type === 'bootstrapFailure') return error(value.error);
  if (value.type === 'batchResult') {
    if (
      typeof value.batchId !== 'string' ||
      !Array.isArray(value.items) ||
      !value.items.every(result) ||
      !Array.isArray(value.skippedTaskIds) ||
      !value.skippedTaskIds.every((id) => typeof id === 'string') ||
      typeof value.executionMs !== 'number' ||
      !Number.isFinite(value.executionMs) ||
      value.executionMs < 0 ||
      !profile(value.profile)
    )
      return false;
    const ids = new Set<string>();
    for (const item of value.items) {
      if (ids.has(item.taskId)) return false;
      ids.add(item.taskId);
    }
    for (const taskId of value.skippedTaskIds) {
      if (ids.has(taskId)) return false;
      ids.add(taskId);
    }
    return true;
  }
  if (typeof value.taskId !== 'string') return false;
  if (value.type === 'started') return true;
  if (
    typeof value.executionMs !== 'number' ||
    !Number.isFinite(value.executionMs) ||
    value.executionMs < 0
  )
    return false;
  return (
    (value.type === 'success' && 'output' in value && profile(value.profile)) ||
    (value.type === 'completed' && profile(value.profile)) ||
    (value.type === 'failure' &&
      error(value.error) &&
      profile(value.profile) &&
      failureKind(value))
  );
}
export function isHostMessage(value: unknown): value is HostMessage {
  if (!record(value)) return false;
  if (value.type === 'shutdown') return true;
  const common =
    typeof value.taskName === 'string' &&
    (value.profile === undefined || typeof value.profile === 'boolean') &&
    (value.completionOnly === undefined ||
      typeof value.completionOnly === 'boolean') &&
    (value.expectedResultBytes === undefined ||
      safeBytes(value.expectedResultBytes));
  if (value.type === 'execute')
    return common && typeof value.taskId === 'string' && 'input' in value;
  if (value.type !== 'executeBatch' || !common) return false;
  if (
    typeof value.batchId !== 'string' ||
    !Array.isArray(value.items) ||
    value.items.length < 2
  )
    return false;
  const ids = new Set<string>();
  for (const item of value.items) {
    if (
      !record(item) ||
      typeof item.taskId !== 'string' ||
      !('input' in item) ||
      (item.expectedResultBytes !== undefined &&
        !safeBytes(item.expectedResultBytes)) ||
      ids.has(item.taskId)
    )
      return false;
    ids.add(item.taskId);
  }
  return true;
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
