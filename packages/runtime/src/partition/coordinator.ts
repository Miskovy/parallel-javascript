import { randomUUID } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';
import type { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import {
  PjsBinaryResultContractError,
  PjsCancelledError,
  PjsError,
  PjsMapContractError,
  PjsQueueFullError,
  PjsResultCapacityError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
  PjsTimeoutError,
} from '../errors/index.js';
import { integer } from '../internal/integer.js';
import type { ResultByteMode, ResultCreditManager } from '../results/credit.js';
import type { PjsTask } from '../tasks/registry.js';
import type {
  TaskCoordinator,
  TaskParentPort,
  TaskTerminalStatus,
} from '../tasks/coordinator.js';
import type { PendingTask } from '../tasks/task.js';
import {
  internalProfilingEnabled,
  recordInternalProfile,
} from '../telemetry/profile.js';
import type { RuntimeState } from '../types/index.js';
import { serializeError } from '../workers/protocol.js';
import { RangeOperation } from './operation.js';
import type {
  OperationStatus,
  PartitionChild,
  RangeResultMode,
} from './operation.js';
import { partitionAt, planRange } from './range.js';
import type {
  BinaryStreamRangeOptions,
  PartitionInput,
  PartitionOptions,
  PjsTypedArray,
  PjsTypedArrayConstructor,
  RangePartition,
  StreamRangeOptions,
  UpperBoundBinaryStreamRangeOptions,
} from './range.js';
import { RangeStream } from './stream.js';
import type { StreamRangeResult } from './stream.js';

type OperationKind = 'collecting' | 'completion' | 'streaming' | 'mapping';
type TerminalOperationStatus = Exclude<OperationStatus, 'created' | 'running'>;

const typedArrayConstructors = new Set<PjsTypedArrayConstructor>([
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
]);

function operationKind(resultMode: RangeResultMode): OperationKind {
  return resultMode === 'collect'
    ? 'collecting'
    : resultMode === 'discard'
      ? 'completion'
      : resultMode === 'stream'
        ? 'streaming'
        : 'mapping';
}

function outcomeCounters() {
  return {
    accepted: 0,
    rejected: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    timedOut: 0,
  };
}

export interface RangeRuntimePort {
  state(): RuntimeState;
  dispatchAllowed(): boolean;
  requestPump(): void;
}

/** Owns parent range state, lazy production, result policy, and settlement. */
export class RangeCoordinator implements TaskParentPort {
  private readonly operations = new Map<string, RangeOperation>();
  private readonly operationMetrics = outcomeCounters();
  private readonly operationTypeMetrics = {
    collecting: outcomeCounters(),
    completion: outcomeCounters(),
    streaming: outcomeCounters(),
    mapping: outcomeCounters(),
  };
  private readonly streamResultMetrics = {
    produced: 0,
    yielded: 0,
    peakBuffered: 0,
    peakKnownBufferedPayloadBytes: 0,
    peakUnknownBufferedResults: 0,
  };
  private readonly mapResultMetrics = {
    blocks: 0,
    elements: 0,
    assemblyMs: 0,
  };
  private readonly partitionMetrics = {
    generated: 0,
    admitted: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  private productionTick: ReturnType<typeof setImmediate> | undefined;

  constructor(
    private readonly registry: ReadonlyMap<object, unknown>,
    private readonly workerCount: number,
    private readonly operationLimit: number,
    private readonly dispatcher: ExecutionDispatcher,
    private readonly tasks: TaskCoordinator,
    private readonly resultCredits: ResultCreditManager,
    private readonly runtime: RangeRuntimePort,
  ) {}

  get size(): number {
    return this.operations.size;
  }

  start<Input>(
    task: PjsTask<Input, unknown>,
    range: { start: number; end: number; grainSize: number },
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions,
    resultMode: RangeResultMode,
    stream?: RangeStream<unknown>,
    mapOutputConstructor?: PjsTypedArrayConstructor,
    resultByteDeclaration?: BinaryStreamRangeOptions['experimentalResultBytes'],
    resultByteCapacity?: number,
    resultByteMode: ResultByteMode = 'exact',
  ): Promise<unknown[] | PjsTypedArray | void> {
    const id = randomUUID();
    const acceptedAt = performance.now();
    const kind = operationKind(resultMode);
    const reject = (error: Error): Promise<never> => {
      this.operationMetrics.rejected++;
      this.operationTypeMetrics[kind].rejected++;
      return Promise.reject(error);
    };
    if (!isMainThread)
      return reject(
        new PjsRuntimeStateError(
          'Partition operations require the main thread; nested worker partitioning is unsupported',
          { operationId: id },
        ),
      );
    let plan;
    let timeout: number | undefined;
    let signal: AbortSignal | undefined;
    let dispatchBatchSize: number;
    let outputs: unknown[] | PjsTypedArray | undefined;
    try {
      if ('executionLease' in options)
        throw new TypeError(
          'executionLease is unsupported for range and batch operations',
        );
      plan = planRange(
        range,
        resultMode === 'collect' || resultMode === 'map'
          ? 2 ** 32 - 1
          : Number.MAX_SAFE_INTEGER,
      );
      if (typeof createInput !== 'function')
        throw new TypeError('createInput must be a synchronous function');
      timeout = options.timeout;
      signal = options.signal;
      dispatchBatchSize = integer(
        'experimentalDispatchBatchSize',
        options.experimentalDispatchBatchSize ?? 1,
        1,
        16,
      );
      if (timeout !== undefined) integer('timeout', timeout, 1, 2 ** 31 - 1);
      if (
        resultMode === 'map' &&
        mapOutputConstructor !== undefined &&
        !typedArrayConstructors.has(mapOutputConstructor)
      )
        throw new TypeError(
          'experimentalOutputConstructor must be a built-in typed-array constructor',
        );
    } catch (error) {
      return reject(error as Error);
    }
    const state = this.runtime.state();
    if (state !== 'starting' && state !== 'running')
      return reject(
        new PjsRuntimeStateError(`Runtime is ${state}`, { operationId: id }),
      );
    if (!this.registry.has(task))
      return reject(
        new PjsTaskRegistrationError(
          'Task does not belong to this runtime registry snapshot',
          { operationId: id },
        ),
      );
    if (signal?.aborted)
      return reject(
        new PjsCancelledError('Partition operation was already aborted', {
          operationId: id,
          cause: signal.reason,
        }),
      );
    if (this.operations.size >= this.operationLimit)
      return reject(
        new PjsQueueFullError(
          `Partition operation capacity ${this.operationLimit} exhausted`,
          { operationId: id },
        ),
      );

    try {
      if (resultMode === 'collect') outputs = [];
      else if (resultMode === 'map') {
        const length = plan.end - plan.start;
        if (length > 2 ** 32 - 1)
          throw new RangeError(
            'Map output has more elements than a JavaScript array can represent',
          );
        outputs = mapOutputConstructor
          ? (new mapOutputConstructor(length) as PjsTypedArray)
          : new Array(length);
      }
    } catch (error) {
      return reject(error as Error);
    }

    return new Promise<unknown[] | PjsTypedArray | void>((resolve, reject) => {
      const operation = new RangeOperation(
        id,
        task as PjsTask<unknown, unknown>,
        plan,
        dispatchBatchSize,
        resultMode,
        stream,
        mapOutputConstructor,
        resultByteDeclaration,
        resultByteCapacity,
        resultByteMode,
        outputs,
        createInput,
        timeout === undefined ? undefined : acceptedAt + timeout,
        resolve,
        reject,
      );
      operation.status = 'running';
      this.operations.set(id, operation);
      this.operationMetrics.accepted++;
      this.operationTypeMetrics[kind].accepted++;
      stream?.connect({
        demand: () => {
          if (operation.status !== 'running') return;
          this.finishDeliveredStream(operation);
          this.runtime.requestPump();
        },
        cancel: () => {
          this.finishOperation(
            operation,
            'cancelled',
            new PjsCancelledError(
              'Range stream was closed by its consumer; active executions may still finish',
              { operationId: operation.id },
            ),
          );
          this.runtime.requestPump();
        },
        yielded: (partition) => {
          this.streamResultMetrics.yielded++;
          this.resultCredits.releaseForPartition(operation, partition.index);
        },
      });
      const abort = () => {
        this.finishOperation(
          operation,
          'cancelled',
          new PjsCancelledError(
            'Partition operation cancelled; active executions may still finish',
            { operationId: id, cause: signal?.reason },
          ),
        );
        this.runtime.requestPump();
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      operation.cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (timeout !== undefined) {
        const onDeadline = () => {
          if (
            !this.expireOperation(operation) &&
            operation.status === 'running'
          )
            timer = setTimeout(
              onDeadline,
              Math.max(1, Math.ceil(operation.deadline! - performance.now())),
            );
          this.runtime.requestPump();
        };
        timer = setTimeout(
          onDeadline,
          Math.max(1, Math.ceil(timeout - (performance.now() - acceptedAt))),
        );
      }
      if (!this.expireOperation(operation)) {
        if (plan.chunkCount === 0) this.finishOperation(operation, 'completed');
        else this.runtime.requestPump();
      }
    });
  }

  stream<Input, Output>(
    task: PjsTask<Input, Output>,
    range: { start: number; end: number; grainSize: number },
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options:
      | StreamRangeOptions
      | BinaryStreamRangeOptions
      | UpperBoundBinaryStreamRangeOptions = {},
  ): AsyncIterable<StreamRangeResult<Output>> {
    let capacity: number;
    let resultByteDeclaration:
      BinaryStreamRangeOptions['experimentalResultBytes'] | undefined;
    let resultByteCapacity: number | undefined;
    let resultByteMode: ResultByteMode = 'exact';
    try {
      capacity = integer(
        'experimentalMaxBufferedResults',
        options.experimentalMaxBufferedResults ?? this.workerCount,
        1,
      );
      const hasExact = 'experimentalResultBytes' in options;
      const hasMaximum = 'experimentalMaxResultBytes' in options;
      if (hasExact && hasMaximum)
        throw new TypeError(
          'Exact and upper-bound result declarations are mutually exclusive',
        );
      const hasDeclaration = hasExact || hasMaximum;
      const hasByteCapacity = 'experimentalMaxReservedResultBytes' in options;
      if (hasDeclaration !== hasByteCapacity)
        throw new TypeError(
          'One result-byte declaration and experimentalMaxReservedResultBytes must be provided together',
        );
      if (hasDeclaration && hasByteCapacity) {
        resultByteMode = hasMaximum ? 'upper-bound' : 'exact';
        const declarationName = hasMaximum
          ? 'experimentalMaxResultBytes'
          : 'experimentalResultBytes';
        resultByteDeclaration = hasMaximum
          ? (options as UpperBoundBinaryStreamRangeOptions)
              .experimentalMaxResultBytes
          : (options as BinaryStreamRangeOptions).experimentalResultBytes;
        resultByteCapacity = integer(
          'experimentalMaxReservedResultBytes',
          options.experimentalMaxReservedResultBytes,
          0,
        );
        if (typeof resultByteDeclaration === 'number') {
          try {
            integer(declarationName, resultByteDeclaration, 0);
          } catch (cause) {
            throw new PjsBinaryResultContractError(
              `${declarationName} must be a nonnegative safe integer`,
              { cause },
            );
          }
        } else if (typeof resultByteDeclaration !== 'function')
          throw new TypeError(
            `${declarationName} must be a nonnegative safe integer or function`,
          );
      }
    } catch (error) {
      this.operationMetrics.rejected++;
      this.operationTypeMetrics.streaming.rejected++;
      if (
        'experimentalResultBytes' in options ||
        'experimentalMaxResultBytes' in options ||
        'experimentalMaxReservedResultBytes' in options
      )
        this.resultCredits.recordRejected();
      const failed = new RangeStream<Output>(1);
      failed.fail(error as Error);
      return failed;
    }
    const stream = new RangeStream<Output>(capacity);
    const lifecycle = this.start(
      task,
      range,
      createInput,
      options,
      'stream',
      stream as RangeStream<unknown>,
      undefined,
      resultByteDeclaration,
      resultByteCapacity,
      resultByteMode,
    );
    void lifecycle.then(
      () => stream.complete(),
      (error: Error) => stream.fail(error),
    );
    return stream;
  }

  canSubmit(child: PartitionChild): boolean {
    return (
      child.operation.status === 'running' &&
      !this.expireOperation(child.operation)
    );
  }

  context(child: PartitionChild) {
    return {
      operationId: child.operation.id,
      partitionIndex: child.partition.index,
      rangeStart: child.partition.start,
      rangeEnd: child.partition.end,
    };
  }

  rejected(child: PartitionChild, error: Error): void {
    this.finishOperation(
      child.operation,
      'failed',
      this.childError(error, child),
    );
  }

  admitted(child: PartitionChild, taskId: string): void {
    child.operation.children.set(taskId, child.partition);
    child.operation.admitted++;
    this.partitionMetrics.admitted++;
  }

  settled(
    task: PendingTask,
    status: TaskTerminalStatus,
    error?: Error,
    output?: unknown,
  ): void {
    const profileStarted = internalProfilingEnabled() ? performance.now() : 0;
    const child = task.child!;
    const operation = child.operation;
    operation.children.delete(task.id);
    const counter = status === 'timed_out' ? 'cancelled' : status;
    operation[counter]++;
    this.partitionMetrics[counter]++;
    if (operation.status !== 'running') return;
    if (error) {
      this.finishOperation(operation, 'failed', this.childError(error, child));
    } else if (!this.expireOperation(operation)) {
      if (operation.stream) {
        operation.stream.push({ partition: child.partition, output });
        this.streamResultMetrics.produced++;
        this.updateStreamPeaks();
      } else if (operation.resultMode === 'map') {
        const assemblyStarted = performance.now();
        try {
          this.assembleMapBlock(operation, child.partition, output);
        } catch (cause) {
          const mapError =
            cause instanceof PjsMapContractError
              ? cause
              : new PjsMapContractError('Map block assembly failed', {
                  ...this.context(child),
                  cause,
                });
          this.finishOperation(operation, 'failed', mapError);
        } finally {
          const elapsed = performance.now() - assemblyStarted;
          operation.mapAssemblyMs += elapsed;
          this.mapResultMetrics.assemblyMs += elapsed;
        }
      } else if (operation.outputs)
        operation.outputs[child.partition.index] = output;
      if (
        operation.status === 'running' &&
        operation.completed === operation.plan.chunkCount &&
        operation.resultMode !== 'stream'
      )
        this.finishOperation(operation, 'completed');
      else this.finishDeliveredStream(operation);
    }
    if (profileStarted)
      recordInternalProfile(
        'parentCollection',
        performance.now() - profileStarted,
      );
  }

  produce(): void {
    // Bound synchronous factory work to worker-count physical batches per turn.
    for (let produced = 0; produced < this.workerCount; produced++) {
      if (!this.runtime.dispatchAllowed()) break;
      const operation = this.nextProducer();
      if (!operation) break;
      this.operations.delete(operation.id);
      this.operations.set(operation.id, operation);
      if (this.expireOperation(operation)) continue;
      let maximum = Math.min(
        operation.dispatchBatchSize,
        operation.plan.chunkCount - operation.generated,
        this.workerCount * operation.dispatchBatchSize -
          operation.children.size,
      );
      if (operation.stream)
        maximum = Math.min(
          maximum,
          operation.stream.capacity -
            operation.stream.buffered -
            operation.children.size,
        );
      const claim = this.dispatcher.claimProduction(maximum);
      if (!claim) break;
      const staged: PendingTask[] = [];
      try {
        for (let index = 0; index < claim.capacity; index++) {
          if (
            operation.status !== 'running' ||
            !this.runtime.dispatchAllowed() ||
            this.expireOperation(operation)
          )
            break;
          const descriptorStarted = internalProfilingEnabled()
            ? performance.now()
            : 0;
          let partition: RangePartition;
          let expectedResultBytes: number | undefined;
          if (operation.resultByteDeclaration !== undefined) {
            const declaration = this.prepareResultDeclaration(operation);
            if (!declaration || operation.status !== 'running') break;
            if (!this.resultCredits.canReserve(operation, declaration.bytes)) {
              if (!declaration.waited) {
                declaration.waited = true;
                this.resultCredits.recordWait();
              }
              break;
            }
            partition = declaration.partition;
            expectedResultBytes = declaration.bytes;
            operation.pendingResultDeclaration = undefined;
            operation.generated++;
          } else {
            partition = partitionAt(operation.plan, operation.generated++);
          }
          if (descriptorStarted)
            recordInternalProfile(
              'descriptorCreation',
              performance.now() - descriptorStarted,
            );
          this.partitionMetrics.generated++;
          const child: PartitionChild = {
            operation,
            partition,
            ...(expectedResultBytes === undefined
              ? {}
              : operation.resultByteMode === 'upper-bound'
                ? {
                    resultByteContract: {
                      mode: 'upper-bound',
                      bytes: expectedResultBytes,
                    },
                  }
                : { expectedResultBytes }),
          };
          try {
            const factoryStarted = internalProfilingEnabled()
              ? performance.now()
              : 0;
            const prepared = operation.runInAsyncScope(
              operation.createInput!,
              undefined,
              partition,
            );
            if (factoryStarted)
              recordInternalProfile(
                'factory',
                performance.now() - factoryStarted,
              );
            if (
              operation.status !== 'running' ||
              !this.runtime.dispatchAllowed() ||
              this.expireOperation(operation)
            )
              break;
            if (
              prepared === null ||
              typeof prepared !== 'object' ||
              !('input' in prepared)
            )
              throw new TypeError(
                'createInput must synchronously return { input, transferList? }',
              );
            const input = prepared.input;
            const transferList = prepared.transferList;
            if (
              operation.status !== 'running' ||
              !this.runtime.dispatchAllowed() ||
              this.expireOperation(operation)
            )
              break;
            const admissionStarted = internalProfilingEnabled()
              ? performance.now()
              : 0;
            const submitted = this.tasks.submit(
              operation.task,
              input,
              transferList === undefined ? {} : { transferList },
              child,
              staged,
            );
            if (admissionStarted)
              recordInternalProfile(
                'childAdmission',
                performance.now() - admissionStarted,
              );
            void submitted.catch(() => {});
          } catch (cause) {
            this.finishOperation(
              operation,
              'failed',
              new PjsError(
                `Partition input factory failed: ${serializeError(cause).message}`,
                { ...this.context(child), cause },
              ),
            );
            break;
          }
        }
        const live = staged.filter((task) => this.tasks.has(task.id));
        this.dispatcher.finishProductionClaim(claim, live);
      } finally {
        this.dispatcher.releaseProductionClaim(claim);
      }
    }
    if (
      this.runtime.dispatchAllowed() &&
      this.dispatcher.availableAdmission(true) > 0 &&
      this.nextProducer() &&
      !this.productionTick
    ) {
      this.productionTick = setImmediate(() => {
        this.productionTick = undefined;
        this.runtime.requestPump();
      });
    }
  }

  finishAll(
    status: Extract<TerminalOperationStatus, 'failed' | 'cancelled'>,
    errorFor: (operation: RangeOperation) => Error,
  ): void {
    for (const operation of this.operations.values())
      this.finishOperation(operation, status, errorFor(operation));
  }

  stopProduction(): void {
    if (this.productionTick) clearImmediate(this.productionTick);
    this.productionTick = undefined;
  }

  snapshot() {
    const active = [...this.operations.values()];
    const pending = (mode: RangeResultMode) =>
      active.filter((operation) => operation.resultMode === mode).length;
    return {
      operations: {
        ...this.operationMetrics,
        pending: this.operations.size,
        capacity: this.operationLimit,
        collecting: {
          ...this.operationTypeMetrics.collecting,
          pending: pending('collect'),
        },
        completion: {
          ...this.operationTypeMetrics.completion,
          pending: pending('discard'),
        },
        streaming: {
          ...this.operationTypeMetrics.streaming,
          pending: pending('stream'),
        },
        mapping: {
          ...this.operationTypeMetrics.mapping,
          pending: pending('map'),
        },
      },
      streams: {
        ...this.operationTypeMetrics.streaming,
        pending: pending('stream'),
      },
      streamResults: {
        ...this.streamResultMetrics,
        ...this.resultCredits.snapshot(),
        buffered: active.reduce(
          (count, operation) => count + (operation.stream?.buffered ?? 0),
          0,
        ),
        knownBufferedPayloadBytes: active.reduce(
          (bytes, operation) =>
            bytes + (operation.stream?.knownBufferedPayloadBytes ?? 0),
          0,
        ),
        unknownBufferedResults: active.reduce(
          (count, operation) =>
            count + (operation.stream?.unknownBufferedResults ?? 0),
          0,
        ),
      },
      maps: {
        ...this.operationTypeMetrics.mapping,
        pending: pending('map'),
      },
      mapResults: { ...this.mapResultMetrics },
      partitions: { ...this.partitionMetrics },
      activeOperations: active.map((operation) =>
        this.operationSnapshot(operation),
      ),
    };
  }

  private childError(error: Error, child: PartitionChild): Error {
    // These are runtime-created child errors, not application-owned factory errors.
    return Object.assign(error, this.context(child));
  }

  private expireOperation(operation: RangeOperation): boolean {
    if (operation.status !== 'running') return true;
    if (
      operation.deadline === undefined ||
      performance.now() < operation.deadline
    )
      return false;
    this.finishOperation(
      operation,
      'timed_out',
      new PjsTimeoutError(
        'Partition operation deadline exceeded; active executions may still finish',
        { operationId: operation.id },
      ),
    );
    return true;
  }

  private finishOperation(
    operation: RangeOperation,
    status: TerminalOperationStatus,
    error?: Error,
  ): void {
    const profileStarted = internalProfilingEnabled() ? performance.now() : 0;
    if (operation.status !== 'running') return;
    operation.status = status;
    this.operations.delete(operation.id);
    operation.cleanup();
    operation.cleanup = () => {};
    operation.createInput = undefined;
    const kind = operationKind(operation.resultMode);
    if (status === 'timed_out') {
      this.operationMetrics.timedOut++;
      this.operationTypeMetrics[kind].timedOut++;
    } else {
      this.operationMetrics[status]++;
      this.operationTypeMetrics[kind][status]++;
    }
    // Set terminal state before cancelling siblings; their settlement is reentrant.
    for (const id of operation.children.keys()) {
      const task = this.tasks.get(id);
      if (task)
        this.tasks.settle(
          task,
          'cancelled',
          new PjsCancelledError(
            'Partition sibling cancelled after parent settlement',
            {
              taskId: id,
              operationId: operation.id,
              cause: error,
              ...(task.snapshot.workerId === undefined
                ? {}
                : { workerId: task.snapshot.workerId }),
            },
          ),
        );
    }
    operation.pendingResultDeclaration = undefined;
    this.resultCredits.cancelOperation(operation);
    const outputs = operation.outputs;
    operation.outputs = undefined;
    if (error) operation.stream?.fail(error);
    else operation.stream?.complete();
    if (error) operation.runInAsyncScope(operation.reject, undefined, error);
    else operation.runInAsyncScope(operation.resolve, undefined, outputs);
    operation.emitDestroy();
    if (profileStarted)
      recordInternalProfile(
        'parentSettlement',
        performance.now() - profileStarted,
      );
  }

  private assembleMapBlock(
    operation: RangeOperation,
    partition: RangePartition,
    output: unknown,
  ): void {
    const expected = partition.end - partition.start;
    const offset = partition.start - operation.plan.start;
    const context = {
      operationId: operation.id,
      partitionIndex: partition.index,
      rangeStart: partition.start,
      rangeEnd: partition.end,
    };
    if (operation.mapOutputConstructor) {
      if (
        !ArrayBuffer.isView(output) ||
        output instanceof DataView ||
        output.constructor !== operation.mapOutputConstructor
      )
        throw new PjsMapContractError(
          `Map partition ${partition.index} must return ${operation.mapOutputConstructor.name}`,
          context,
        );
      const block = output as PjsTypedArray;
      if (block.length !== expected)
        throw new PjsMapContractError(
          `Map partition ${partition.index} returned ${block.length} elements; expected ${expected}`,
          context,
        );
      const target = operation.outputs as PjsTypedArray;
      const setter = target as unknown as {
        set(
          values: ArrayLike<number> | ArrayLike<bigint>,
          offset?: number,
        ): void;
      };
      setter.set(
        block as unknown as ArrayLike<number> | ArrayLike<bigint>,
        offset,
      );
    } else {
      if (!Array.isArray(output))
        throw new PjsMapContractError(
          `Map partition ${partition.index} must return an Array`,
          context,
        );
      if (output.length !== expected)
        throw new PjsMapContractError(
          `Map partition ${partition.index} returned ${output.length} elements; expected ${expected}`,
          context,
        );
      const target = operation.outputs as unknown[];
      for (let index = 0; index < output.length; index++)
        target[offset + index] = output[index];
    }
    this.mapResultMetrics.blocks++;
    this.mapResultMetrics.elements += expected;
  }

  private finishDeliveredStream(operation: RangeOperation): boolean {
    const stream = operation.stream;
    if (
      operation.status === 'running' &&
      stream &&
      operation.completed === operation.plan.chunkCount &&
      stream.yielded === operation.plan.chunkCount
    ) {
      this.finishOperation(operation, 'completed');
      return true;
    }
    return false;
  }

  private prepareResultDeclaration(
    operation: RangeOperation,
  ): { partition: RangePartition; bytes: number; waited: boolean } | undefined {
    if (operation.resultByteDeclaration === undefined) return undefined;
    if (operation.pendingResultDeclaration)
      return operation.pendingResultDeclaration;
    const partition = partitionAt(operation.plan, operation.generated);
    let bytes: number;
    try {
      const declaration = operation.resultByteDeclaration;
      bytes =
        typeof declaration === 'function'
          ? operation.runInAsyncScope(declaration, undefined, partition)
          : declaration;
      integer('declared result bytes', bytes, 0);
    } catch (cause) {
      this.resultCredits.recordRejected();
      this.finishOperation(
        operation,
        'failed',
        new PjsBinaryResultContractError(
          `Invalid binary result declaration for partition ${partition.index}`,
          { ...this.context({ operation, partition }), cause },
        ),
      );
      return undefined;
    }
    if (bytes > operation.resultByteCapacity!) {
      this.resultCredits.recordRejected();
      this.finishOperation(
        operation,
        'failed',
        new PjsResultCapacityError(
          `Partition ${partition.index} declares ${bytes} result bytes, exceeding capacity ${operation.resultByteCapacity}`,
          {
            ...this.context({ operation, partition }),
            declaredBytes: bytes,
            resultByteCapacity: operation.resultByteCapacity!,
          },
        ),
      );
      return undefined;
    }
    operation.pendingResultDeclaration = {
      partition,
      bytes,
      waited: false,
    };
    return operation.pendingResultDeclaration;
  }

  private operationHasCountCredit(operation: RangeOperation): boolean {
    return (
      operation.generated < operation.plan.chunkCount &&
      operation.children.size <
        this.workerCount * operation.dispatchBatchSize &&
      (!operation.stream ||
        operation.stream.capacity -
          operation.stream.buffered -
          operation.children.size >
          0)
    );
  }

  private nextProducer(): RangeOperation | undefined {
    for (const operation of [...this.operations.values()]) {
      if (!this.operationHasCountCredit(operation)) continue;
      if (operation.resultByteDeclaration !== undefined) {
        const declaration = this.prepareResultDeclaration(operation);
        if (!declaration || operation.status !== 'running') continue;
        if (!this.resultCredits.canReserve(operation, declaration.bytes)) {
          if (!declaration.waited) {
            declaration.waited = true;
            this.resultCredits.recordWait();
          }
          continue;
        }
      }
      return operation;
    }
    return undefined;
  }

  private updateStreamPeaks(): void {
    const active = [...this.operations.values()];
    this.streamResultMetrics.peakBuffered = Math.max(
      this.streamResultMetrics.peakBuffered,
      active.reduce(
        (count, operation) => count + (operation.stream?.buffered ?? 0),
        0,
      ),
    );
    this.streamResultMetrics.peakKnownBufferedPayloadBytes = Math.max(
      this.streamResultMetrics.peakKnownBufferedPayloadBytes,
      active.reduce(
        (bytes, operation) =>
          bytes + (operation.stream?.knownBufferedPayloadBytes ?? 0),
        0,
      ),
    );
    this.streamResultMetrics.peakUnknownBufferedResults = Math.max(
      this.streamResultMetrics.peakUnknownBufferedResults,
      active.reduce(
        (count, operation) =>
          count + (operation.stream?.unknownBufferedResults ?? 0),
        0,
      ),
    );
  }

  private operationSnapshot(operation: RangeOperation) {
    let queued = 0;
    let running = 0;
    for (const id of operation.children.keys()) {
      const status = this.tasks.get(id)?.snapshot.status;
      if (status === 'queued') queued++;
      else if (status === 'scheduled' || status === 'running') running++;
    }
    return {
      id: operation.id,
      taskName: operation.task.id,
      status: operation.status,
      resultMode: operation.resultMode,
      ...operation.plan,
      generated: operation.generated,
      admitted: operation.admitted,
      queued,
      running,
      completed: operation.completed,
      failed: operation.failed,
      cancelled: operation.cancelled,
      ...(operation.stream
        ? {
            bufferedResults: operation.stream.buffered,
            resultBufferCapacity: operation.stream.capacity,
            producedResults: operation.stream.produced,
            yieldedResults: operation.stream.yielded,
            knownBufferedPayloadBytes:
              operation.stream.knownBufferedPayloadBytes,
            unknownBufferedResults: operation.stream.unknownBufferedResults,
            ...(operation.resultByteCapacity === undefined
              ? {}
              : {
                  reservedResultBytes: this.resultCredits.reserved(operation),
                  bufferedKnownPayloadBytes:
                    operation.stream.knownBufferedPayloadBytes,
                  resultByteCapacity: operation.resultByteCapacity,
                }),
          }
        : {}),
      ...(operation.resultMode === 'map'
        ? {
            mappedElements: operation.plan.end - operation.plan.start,
            assembledBlocks: operation.completed,
            assemblyMs: operation.mapAssemblyMs,
            typedOutput: operation.mapOutputConstructor?.name,
          }
        : {}),
    };
  }
}
