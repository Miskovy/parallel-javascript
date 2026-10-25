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
import type { PendingTask, TaskRecovery } from '../tasks/task.js';
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
import { partitionAt } from './range.js';
import { validateRangeRequest } from './validation.js';
import { assembleMapBlock, validateMapBlock } from './results/map-assembly.js';
import type {
  BinaryStreamRangeOptions,
  PartitionInput,
  PartitionOptions,
  PjsTypedArray,
  PjsTypedArrayConstructor,
  RangePartition,
} from './range.js';
import type { RangeStream } from './stream.js';

type OperationKind = 'collecting' | 'completion' | 'streaming' | 'mapping';
type TerminalOperationStatus = Exclude<OperationStatus, 'created' | 'running'>;

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
    options: PartitionOptions<Input, unknown>,
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
    let cancellation: 'settle' | 'cooperative' | 'terminate' | undefined;
    let recovery: TaskRecovery | undefined;
    let rebuildInput: RangeOperation['rebuildInput'];
    let outputs: unknown[] | PjsTypedArray | undefined;
    try {
      ({ plan, timeout, signal, cancellation, dispatchBatchSize } =
        validateRangeRequest(
          range,
          createInput,
          options,
          resultMode,
          mapOutputConstructor,
        ));
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
      const rebuild = options.rebuildInput;
      if (rebuild !== undefined && typeof rebuild !== 'function')
        throw new TypeError('rebuildInput must be a function');
      recovery = this.tasks.createRecovery(
        task,
        options.retry,
        options.fallback,
        options.repeatable,
        undefined,
        { operationId: id },
      );
      if (rebuild !== undefined && !recovery)
        throw new TypeError('rebuildInput requires retry or fallback');
      rebuildInput = rebuild;
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

    // Policy getters may abort, shut down or submit another parent reentrantly.
    if (signal?.aborted)
      return reject(
        new PjsCancelledError(
          'Partition operation was aborted during validation',
          { operationId: id, cause: signal.reason },
        ),
      );
    if (
      this.runtime.state() !== 'starting' &&
      this.runtime.state() !== 'running'
    )
      return reject(
        new PjsRuntimeStateError(`Runtime is ${this.runtime.state()}`, {
          operationId: id,
        }),
      );
    if (this.operations.size >= this.operationLimit)
      return reject(
        new PjsQueueFullError(
          `Partition operation capacity ${this.operationLimit} exhausted`,
          { operationId: id },
        ),
      );

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
      if (recovery) operation.recovery = recovery;
      if (rebuildInput) operation.rebuildInput = rebuildInput;
      operation.cancellation = cancellation ?? 'settle';
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

  /** API adaptation failed before an accepted parent exists. */
  rejectStreamOptions(): void {
    this.operationMetrics.rejected++;
    this.operationTypeMetrics.streaming.rejected++;
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
          const block = validateMapBlock(
            operation.id,
            child.partition,
            output,
            operation.mapOutputConstructor,
          );
          // Validation getters can synchronously abort and clear operation.outputs.
          // Read the coordinator-owned target after validation, as before extraction.
          const elements = assembleMapBlock(
            operation.outputs!,
            operation.plan.start,
            child.partition,
            block,
            operation.mapOutputConstructor,
          );
          this.mapResultMetrics.blocks++;
          this.mapResultMetrics.elements += elements;
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
      const continuing = this.readyContinuation(operation);
      if (continuing) {
        const claim = this.dispatcher.claimProduction(1);
        if (!claim) break;
        continuing.snapshot.status = 'queued';
        delete continuing.recovery!.ready;
        this.dispatcher.finishProductionClaim(claim, [continuing]);
        continue;
      }
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
    const terminations = new Set<string>();
    for (const id of operation.children.keys()) {
      const task = this.tasks.get(id);
      if (task && operation.cancellation !== 'settle' && status !== 'completed')
        terminations.add(task.batchLeaderId ?? task.executionId ?? task.id);
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
    for (const correlationId of terminations) {
      if (operation.cancellation === 'cooperative')
        this.dispatcher.cooperateExecution(correlationId);
      else this.dispatcher.terminateExecution(correlationId);
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

  private readyContinuation(
    operation: RangeOperation,
  ): PendingTask | undefined {
    for (const id of operation.children.keys()) {
      const task = this.tasks.get(id);
      if (task?.recovery?.ready) return task;
    }
    return undefined;
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
      if (this.readyContinuation(operation)) return operation;
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
