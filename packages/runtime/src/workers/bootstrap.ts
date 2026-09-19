import { parentPort, workerData } from 'node:worker_threads';
import { PjsSerializationError } from '../errors/index.js';
import { transferOutput } from '../tasks/transfer.js';
import { isHostMessage, serializeError } from './protocol.js';
import type { BootstrapData, WorkerMessage } from './protocol.js';

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
  if (data.version !== 1 || !Array.isArray(data.tasks))
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
  send({ type: 'ready', version: 1 });
} catch (cause) {
  send({ type: 'bootstrapFailure', error: serializeError(cause) });
  port.close();
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
  if (state !== 'idle') throw new Error('Overlapping PJS executions');
  state = 'busy';
  send({ type: 'started', taskId: value.taskId });
  const started = performance.now();
  try {
    const execute = tasks.get(value.taskName);
    if (!execute) throw new Error(`Unknown task ${value.taskName}`);
    const output = await execute(value.input);
    const executionMs = performance.now() - started;
    try {
      const result = transferOutput(output);
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
      });
    }
  } catch (cause) {
    send({
      type: 'failure',
      taskId: value.taskId,
      kind: cause instanceof PjsSerializationError ? 'serialization' : 'task',
      error: serializeError(cause),
      executionMs: performance.now() - started,
    });
  } finally {
    state = 'idle';
  }
}
