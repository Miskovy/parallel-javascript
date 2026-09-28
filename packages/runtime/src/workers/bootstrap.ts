import { parentPort, workerData } from 'node:worker_threads';
import { PjsSerializationError } from '../errors/index.js';
import { transferOutput } from '../tasks/transfer.js';
import { isHostMessage, serializeError } from './protocol.js';
import type {
  BatchItemResult,
  BootstrapData,
  HostMessage,
  InternalWorkerProfile,
  WorkerMessage,
} from './protocol.js';

if (!parentPort) throw new Error('PJS bootstrap requires a worker thread');
const port = parentPort;
const send = (
  message: WorkerMessage,
  transferList: readonly ArrayBuffer[] = [],
): void => port.postMessage(message, transferList);
type Execute = (input: unknown) => unknown;
const tasks = new Map<string, Execute>();
let state: 'starting' | 'idle' | 'busy' | 'stopped' = 'starting';

try {
  const data = workerData as BootstrapData;
  if (data.version !== 2 || !Array.isArray(data.tasks))
    throw new Error('Unsupported PJS bootstrap data');
  for (const task of data.tasks) {
    const exports = (await import(task.module)) as Record<string, unknown>;
    const execute = exports[task.exportName];
    if (typeof execute !== 'function')
      throw new Error(
        `Task ${task.id}: export ${task.exportName} is not a function in ${task.module}`,
      );
    tasks.set(task.id, execute as Execute);
  }
  state = 'idle';
  port.on('message', (message: unknown) => {
    void handle(message);
  });
  send({ type: 'ready', version: 2 });
} catch (cause) {
  send({ type: 'bootstrapFailure', error: serializeError(cause) });
  port.close();
}

function workerProfile(
  enabled: boolean | undefined,
  workerIngressMs: number,
  outputPreparationMs: number,
): InternalWorkerProfile | undefined {
  return enabled
    ? {
        workerIngressMs,
        outputPreparationMs,
        postedAtNs: process.hrtime.bigint(),
      }
    : undefined;
}

async function handle(value: unknown): Promise<void> {
  if (!isHostMessage(value)) throw new Error('Invalid PJS host message');
  if (value.type === 'shutdown') {
    if (state !== 'idle')
      throw new Error('Shutdown received while worker is not idle');
    state = 'stopped';
    port.close();
    return;
  }
  const receivedAt = value.profile ? performance.now() : 0;
  if (state !== 'idle') throw new Error('Overlapping PJS executions');
  state = 'busy';
  if (value.type === 'executeBatch') {
    await executeBatch(value, receivedAt);
    state = 'idle';
    return;
  }
  send({ type: 'started', taskId: value.taskId });
  const started = performance.now();
  const workerIngressMs = started - receivedAt;
  try {
    const execute = tasks.get(value.taskName);
    if (!execute) throw new Error(`Unknown task ${value.taskName}`);
    const output = await execute(value.input);
    const executionMs = performance.now() - started;
    if (value.completionOnly) {
      send({
        type: 'completed',
        taskId: value.taskId,
        executionMs,
        ...(value.profile
          ? {
              profile: workerProfile(value.profile, workerIngressMs, 0)!,
            }
          : {}),
      });
      return;
    }
    try {
      const preparationStarted = value.profile ? performance.now() : 0;
      const result = transferOutput(output);
      const outputPreparationMs = value.profile
        ? performance.now() - preparationStarted
        : 0;
      if (value.profile)
        send(
          {
            type: 'success',
            taskId: value.taskId,
            output: result.value,
            executionMs,
            profile: workerProfile(
              value.profile,
              workerIngressMs,
              outputPreparationMs,
            )!,
          },
          result.transferList,
        );
      else
        send(
          {
            type: 'success',
            taskId: value.taskId,
            output: result.value,
            executionMs,
          },
          result.transferList,
        );
    } catch (cause) {
      send({
        type: 'failure',
        taskId: value.taskId,
        kind: 'serialization',
        error: serializeError(cause),
        executionMs,
        ...(value.profile
          ? {
              profile: workerProfile(value.profile, workerIngressMs, 0)!,
            }
          : {}),
      });
    }
  } catch (cause) {
    send({
      type: 'failure',
      taskId: value.taskId,
      kind: cause instanceof PjsSerializationError ? 'serialization' : 'task',
      error: serializeError(cause),
      executionMs: performance.now() - started,
      ...(value.profile
        ? {
            profile: workerProfile(value.profile, workerIngressMs, 0)!,
          }
        : {}),
    });
  } finally {
    state = 'idle';
  }
}

async function executeBatch(
  value: Extract<HostMessage, { type: 'executeBatch' }>,
  receivedAt: number,
): Promise<void> {
  send({ type: 'started', taskId: value.batchId });
  const batchStarted = performance.now();
  const workerIngressMs = batchStarted - receivedAt;
  const items: BatchItemResult[] = [];
  const transferList: ArrayBuffer[] = [];
  let outputPreparationMs = 0;
  let next = 0;
  for (; next < value.items.length; next++) {
    const item = value.items[next]!;
    const started = performance.now();
    try {
      const execute = tasks.get(value.taskName);
      if (!execute) throw new Error(`Unknown task ${value.taskName}`);
      const output = await execute(item.input);
      const executionMs = performance.now() - started;
      if (value.completionOnly) {
        items.push({
          type: 'completed',
          taskId: item.taskId,
          executionMs,
        });
        continue;
      }
      try {
        const preparationStarted = performance.now();
        const result = transferOutput(output);
        outputPreparationMs += performance.now() - preparationStarted;
        transferList.push(...result.transferList);
        items.push({
          type: 'success',
          taskId: item.taskId,
          output: result.value,
          executionMs,
        });
      } catch (cause) {
        items.push({
          type: 'failure',
          taskId: item.taskId,
          kind: 'serialization',
          error: serializeError(cause),
          executionMs,
        });
        next++;
        break;
      }
    } catch (cause) {
      items.push({
        type: 'failure',
        taskId: item.taskId,
        kind: cause instanceof PjsSerializationError ? 'serialization' : 'task',
        error: serializeError(cause),
        executionMs: performance.now() - started,
      });
      next++;
      break;
    }
  }
  const skippedTaskIds = value.items.slice(next).map((item) => item.taskId);
  const executionMs = performance.now() - batchStarted;
  try {
    send(
      {
        type: 'batchResult',
        batchId: value.batchId,
        items,
        skippedTaskIds,
        executionMs,
        ...(value.profile
          ? {
              profile: workerProfile(
                value.profile,
                workerIngressMs,
                outputPreparationMs,
              )!,
            }
          : {}),
      },
      transferList,
    );
  } catch (cause) {
    // Combined output serialization cannot reliably identify which value failed.
    // Attribute it to the first logical item and fail the entire parent once.
    send({
      type: 'batchResult',
      batchId: value.batchId,
      items: [
        {
          type: 'failure',
          taskId: value.items[0]!.taskId,
          kind: 'serialization',
          error: serializeError(cause),
          executionMs,
        },
      ],
      skippedTaskIds: value.items.slice(1).map((item) => item.taskId),
      executionMs,
      ...(value.profile
        ? { profile: workerProfile(value.profile, workerIngressMs, 0)! }
        : {}),
    });
  }
}
