import type { TransportProfiling } from '../hosts/contracts.js';
import {
  encodeProgress,
  ProgressReporter,
  MessageProgressReporter,
} from './progress.js';
import type { InvocationProgress } from './progress.js';
import type { TaskContext } from '../types/index.js';
import { PjsSerializationError } from '../errors/index.js';
import type { BinaryResultInspection } from '../partition/binary-core.js';
import { validateBinaryResult, outputFailure } from './result-preparation.js';
import { isHostMessage, serializeError } from './protocol.js';
import type {
  BatchItemResult,
  UpperBoundResultByteContract,
  BootstrapData,
  HostMessage,
  InternalWorkerProfile,
  WorkerMessage,
} from './protocol.js';

export interface InvocationPort {
  send(message: WorkerMessage, transfers?: readonly ArrayBuffer[]): void;
  listen(callback: (value: unknown) => void): void;
  close(): void;
}
export interface InvocationServices {
  readonly commonjs: boolean;
  transferOutput(value: unknown): {
    value: unknown;
    transferList: readonly ArrayBuffer[];
  };
  inspectBinaryResult(value: unknown): BinaryResultInspection;
  readonly profiling?: TransportProfiling;
  fatal?(error: unknown): void;
}

/** The single invocation/batch implementation, initialized once per worker. */
export async function startInvocations(
  data: BootstrapData,
  port: InvocationPort,
  services: InvocationServices,
): Promise<void> {
  const send = (
    message: WorkerMessage,
    transfers: readonly ArrayBuffer[] = [],
  ) => port.send(message, transfers);
  type Execute = (input: unknown, context?: TaskContext) => unknown;
  const tasks = new Map<string, Execute>();
  let state: 'starting' | 'idle' | 'stopped' = 'starting';
  let concurrency = 1;
  const active = new Map<string, boolean>();
  const reporters = new Map<string, InvocationProgress>();

  try {
    if (data.version !== 2 || !Array.isArray(data.tasks)) {
      throw new Error('Unsupported PJS bootstrap data');
    }
    concurrency = data.concurrency ?? 1;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error('Invalid worker concurrency');
    }
    for (const task of data.tasks) {
      const exports = (await import(task.module)) as Record<string, unknown>;
      let execute = exports[task.exportName];
      if (services.commonjs && typeof execute !== 'function') {
        // CommonJS module.exports lives at default; named namespace exports are heuristic.
        const defaults = exports.default;
        if (
          defaults !== null &&
          (typeof defaults === 'object' || typeof defaults === 'function') &&
          Object.hasOwn(defaults, task.exportName)
        ) {
          execute = Reflect.get(defaults, task.exportName);
        }
      }
      if (typeof execute !== 'function') {
        throw new Error(
          `Task ${task.id}: export ${task.exportName} is not a function in ${task.module}`,
        );
      }
      tasks.set(task.id, execute as Execute);
    }
    state = 'idle';
    port.listen((message: unknown) => {
      const invocation = handle(message);
      if (services.fatal) {
        void invocation.catch(services.fatal);
      }
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
    return enabled && services.profiling
      ? {
          workerIngressMs,
          outputPreparationMs,
          postedAtNs: services.profiling.timestampNs(),
        }
      : undefined;
  }

  /** Shared synchronous preparation; single and batch callers retain their own catch scopes. */
  function prepareOutput(
    output: unknown,
    expectedResultBytes: number | undefined,
    contract: UpperBoundResultByteContract | undefined,
  ) {
    const result = services.transferOutput(output);
    if (expectedResultBytes !== undefined) {
      validateBinaryResult(
        services.inspectBinaryResult(result.value),
        expectedResultBytes,
      );
    }
    const actualResultBytes = contract
      ? validateBinaryResult(
          services.inspectBinaryResult(result.value),
          contract.bytes,
          contract.mode,
        )
      : undefined;
    return { result, actualResultBytes };
  }

  // Invocation-local contexts; no ambient task context or shared/reused controller.
  const contexts = new Map<string, AbortController>();
  function cancelled(buffer: SharedArrayBuffer | undefined): boolean {
    return (
      buffer !== undefined && Atomics.load(new Int32Array(buffer), 0) !== 0
    );
  }

  async function invoke(
    execute: Execute,
    input: unknown,
    correlationId: string,
    buffer?: SharedArrayBuffer,
    itemId = correlationId,
  ): Promise<unknown> {
    // Argument count is observable: existing modes must continue passing exactly one.
    const reporter = reporters.get(correlationId);
    if (!buffer && !reporter) {
      return execute(input);
    }
    let open = true;
    let sequence = 0;
    const controller = new AbortController();
    contexts.set(correlationId, controller);
    const context: TaskContext = Object.freeze({
      signal: controller.signal,
      reportProgress(value: unknown) {
        if (!open || !reporter || !reporter.isOpen()) {
          return false;
        }
        const payload = encodeProgress(value);
        if (payload === undefined || !open) {
          return false;
        }
        return reporter.report({
          type: 'progress',
          correlationId,
          taskId: itemId,
          sequence: ++sequence,
          payload,
        });
      },
      throwIfCancelled() {
        if (cancelled(buffer) && !controller.signal.aborted) {
          controller.abort(new DOMException('Task cancelled', 'AbortError'));
        }
        controller.signal.throwIfAborted();
      },
    });
    try {
      context.throwIfCancelled();
      return await execute(input, context);
    } finally {
      open = false;
      contexts.delete(correlationId);
    }
  }

  async function handle(value: unknown): Promise<void> {
    if (!isHostMessage(value)) {
      throw new Error('Invalid PJS host message');
    }
    if (value.type === 'progressAck') {
      reporters.get(value.correlationId)?.wake(value.taskId, value.sequence);
      return;
    }
    if (value.type === 'progressClose') {
      reporters.get(value.correlationId)?.close();
      return;
    }
    if (value.type === 'cancel') {
      contexts
        .get(value.correlationId)
        ?.abort(new DOMException('Task cancelled', 'AbortError'));
      return;
    }
    if (value.type === 'shutdown') {
      if (state !== 'idle' || active.size > 0) {
        throw new Error('Shutdown received while worker is not idle');
      }
      state = 'stopped';
      port.close();
      return;
    }
    if (value.profile && !services.profiling) {
      throw new Error('Worker profiling is unsupported on this host');
    }
    const receivedAt = value.profile ? performance.now() : 0;
    const correlationId =
      value.type === 'executeBatch' ? value.batchId : value.taskId;
    if (
      state !== 'idle' ||
      active.size >= concurrency ||
      active.has(correlationId) ||
      [...active.values()].some(Boolean) ||
      (value.exclusive && active.size > 0)
    ) {
      throw new Error('Incompatible or overlapping PJS execution');
    }
    active.set(correlationId, value.exclusive ?? false);
    if (value.progressMode === 'message') {
      reporters.set(correlationId, new MessageProgressReporter(send));
    } else if (value.progressBuffer) {
      reporters.set(
        correlationId,
        new ProgressReporter(new Int32Array(value.progressBuffer), send),
      );
    }
    try {
      if (value.type === 'executeBatch') {
        await executeBatch(value, receivedAt);
      } else {
        await executeSingle(value, receivedAt);
      }
    } finally {
      reporters.get(correlationId)?.close();
      reporters.delete(correlationId);
      active.delete(correlationId);
    }
  }

  async function executeSingle(
    value: Extract<HostMessage, { type: 'execute' }>,
    receivedAt: number,
  ): Promise<void> {
    send({ type: 'started', taskId: value.taskId });
    const started = performance.now();
    const workerIngressMs = started - receivedAt;
    try {
      const execute = tasks.get(value.taskName);
      if (!execute) {
        throw new Error(`Unknown task ${value.taskName}`);
      }
      const output = await invoke(
        execute,
        value.input,
        value.taskId,
        value.cancellationBuffer,
      );
      if (cancelled(value.cancellationBuffer)) {
        send({
          type: 'cancelled',
          taskId: value.taskId,
          executionMs: performance.now() - started,
        });
        return;
      }
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
        const { result, actualResultBytes } = prepareOutput(
          output,
          value.expectedResultBytes,
          value.resultByteContract,
        );
        const outputPreparationMs = value.profile
          ? performance.now() - preparationStarted
          : 0;
        send(
          {
            type: 'success',
            taskId: value.taskId,
            output: result.value,
            ...(actualResultBytes === undefined ? {} : { actualResultBytes }),
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
          result.transferList,
        );
      } catch (cause) {
        send({
          ...outputFailure(
            cause,
            value.taskId,
            executionMs,
            value.resultByteContract,
          ),
          ...(value.profile
            ? {
                profile: workerProfile(value.profile, workerIngressMs, 0)!,
              }
            : {}),
        });
      }
    } catch (cause) {
      if (cancelled(value.cancellationBuffer)) {
        send({
          type: 'cancelled',
          taskId: value.taskId,
          executionMs: performance.now() - started,
        });
        return;
      }
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
        if (!execute) {
          throw new Error(`Unknown task ${value.taskName}`);
        }
        const output = await invoke(
          execute,
          item.input,
          value.batchId,
          value.cancellationBuffer,
          item.taskId,
        );
        if (cancelled(value.cancellationBuffer)) {
          throw new DOMException('Task cancelled', 'AbortError');
        }
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
          const { result, actualResultBytes } = prepareOutput(
            output,
            item.expectedResultBytes,
            item.resultByteContract,
          );
          outputPreparationMs += performance.now() - preparationStarted;
          transferList.push(...result.transferList);
          items.push({
            type: 'success',
            taskId: item.taskId,
            output: result.value,
            ...(actualResultBytes === undefined ? {} : { actualResultBytes }),
            executionMs,
          });
        } catch (cause) {
          items.push({
            ...outputFailure(
              cause,
              item.taskId,
              executionMs,
              item.resultByteContract,
            ),
          });
          next++;
          break;
        }
      } catch (cause) {
        if (cancelled(value.cancellationBuffer)) {
          items.push({
            type: 'cancelled',
            taskId: item.taskId,
            executionMs: performance.now() - started,
          });
          next++;
          break;
        }
        items.push({
          type: 'failure',
          taskId: item.taskId,
          kind:
            cause instanceof PjsSerializationError ? 'serialization' : 'task',
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
}
