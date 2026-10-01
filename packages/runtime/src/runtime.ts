import { availableParallelism } from 'node:os';
import { ExecutionDispatcher } from './dispatch/dispatcher.js';
import {
  PjsCancelledError,
  PjsRuntimeStateError,
  PjsWorkerError,
} from './errors/index.js';
import { integer } from './internal/integer.js';
import { RangeCoordinator } from './partition/coordinator.js';
import type {
  BinaryStreamRangeOptions,
  PartitionInput,
  PartitionOptions,
  PartitionRange,
  PjsBinaryResult,
  PjsTypedArray,
  PjsTypedArrayConstructor,
  RangePartition,
  StreamRangeOptions,
  TypedMapRangeOptions,
  UpperBoundBinaryStreamRangeOptions,
} from './partition/range.js';
import type { StreamRangeResult } from './partition/stream.js';
import { ResultCreditManager } from './results/credit.js';
import { TaskCoordinator } from './tasks/coordinator.js';
import { PjsTaskRegistry } from './tasks/registry.js';
import type { PjsTask, TaskDescriptor } from './tasks/registry.js';
import { RuntimeTelemetry } from './telemetry/runtime.js';
import type {
  RunOptions,
  RuntimeState,
  ShutdownOptions,
} from './types/index.js';

type CountOnlyStreamRangeOptions = StreamRangeOptions & {
  experimentalResultBytes?: never;
  experimentalMaxResultBytes?: never;
  experimentalMaxReservedResultBytes?: never;
};

export interface PjsRuntimeOptions {
  registry: PjsTaskRegistry;
  workers?: number;
  minWorkers?: number;
  maxWorkers?: number;
  maxQueue?: number;
  startupTimeout?: number;
  maxRestarts?: number;
}

/** Public facade, composition root, lifecycle authority, and guarded progress loop. */
export class PjsRuntime {
  private state: RuntimeState = 'created';
  private readonly registry: ReadonlyMap<object, TaskDescriptor>;
  private readonly resultCredits = new ResultCreditManager();
  private readonly dispatcher: ExecutionDispatcher;
  private readonly taskCoordinator: TaskCoordinator;
  private readonly rangeCoordinator: RangeCoordinator;
  private readonly telemetry: RuntimeTelemetry;
  private pumping = false;
  private readonly readyPromise: Promise<void>;
  private shutdownPromise: Promise<void> | undefined;
  private drainMode = true;
  private drainResolve: (() => void) | undefined;

  constructor(options: PjsRuntimeOptions) {
    const minimum = integer('minWorkers', options.minWorkers ?? 1, 1);
    const maximum = integer(
      'maxWorkers',
      options.maxWorkers ??
        Math.max(minimum, options.workers ?? availableParallelism()),
      minimum,
    );
    const workers = integer(
      'workers',
      options.workers ??
        Math.max(minimum, Math.min(maximum, availableParallelism())),
      minimum,
      maximum,
    );
    const startupTimeout = integer(
      'startupTimeout',
      options.startupTimeout ?? 30_000,
      1,
      2 ** 31 - 1,
    );
    const maxRestarts = integer(
      'maxRestarts',
      options.maxRestarts ?? workers * 4,
      0,
    );
    this.registry = options.registry.snapshot();
    this.dispatcher = new ExecutionDispatcher(
      {
        workers,
        maxQueue: options.maxQueue ?? 1024,
        startupTimeout,
        maxRestarts,
      },
      [...this.registry.values()],
      this.resultCredits,
      {
        ready: () => this.pump(),
        scheduled: (worker, task, scheduledAt, queueMs) =>
          this.taskCoordinator.scheduled(worker, task, scheduledAt, queueMs),
        dispatched: (task) => this.taskCoordinator.dispatched(task),
        started: (worker, taskId) =>
          this.taskCoordinator.started(worker, taskId),
        result: (worker, message) =>
          this.taskCoordinator.result(worker, message),
        failed: (error) => this.taskCoordinator.failTask(error),
        dispatchFailed: (task, error) =>
          this.taskCoordinator.settle(task, 'failed', error),
        fatal: (error) => this.fail(error),
      },
    );
    this.taskCoordinator = new TaskCoordinator(
      this.registry,
      this.dispatcher,
      this.resultCredits,
      {
        state: () => this.state,
        canAccept: (child) =>
          this.state === 'starting' ||
          this.state === 'running' ||
          (child && this.state === 'stopping' && this.drainMode),
        dispatchAllowed: () => this.dispatchAllowed(),
        requestPump: () => this.pump(),
      },
      {
        canSubmit: (child) => this.rangeCoordinator.canSubmit(child),
        context: (child) => this.rangeCoordinator.context(child),
        rejected: (child, error) =>
          this.rangeCoordinator.rejected(child, error),
        admitted: (child, taskId) =>
          this.rangeCoordinator.admitted(child, taskId),
        settled: (task, status, error, output) =>
          this.rangeCoordinator.settled(task, status, error, output),
      },
    );
    this.rangeCoordinator = new RangeCoordinator(
      this.registry,
      workers,
      Math.min(
        Number.MAX_SAFE_INTEGER,
        workers + this.dispatcher.queueCapacity,
      ),
      this.dispatcher,
      this.taskCoordinator,
      this.resultCredits,
      {
        state: () => this.state,
        dispatchAllowed: () => this.dispatchAllowed(),
        requestPump: () => this.pump(),
      },
    );
    this.telemetry = new RuntimeTelemetry(
      () => this.state,
      this.dispatcher,
      this.taskCoordinator,
      this.rangeCoordinator,
    );
    this.state = 'starting';
    this.readyPromise = this.dispatcher
      .start()
      .then(() => {
        if (this.state === 'starting') this.state = 'running';
        if (
          this.state === 'failed' ||
          this.state === 'stopped' ||
          (this.state === 'stopping' && !this.drainMode)
        )
          throw new PjsRuntimeStateError('Runtime stopped during startup');
        this.pump();
      })
      .catch((cause: unknown) => {
        const error =
          cause instanceof Error ? cause : new PjsWorkerError(String(cause));
        if (this.state !== 'stopping' && this.state !== 'stopped')
          this.fail(error);
        throw error;
      });
    void this.readyPromise.catch(() => {});
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * @experimental Host-coordinated numeric ranges; this API is not yet stable.
   * The synchronous factory runs lazily on the main thread with reserved admission.
   * Results are collected by partition index. maxQueue does not bound result bytes.
   */
  partitionRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions = {},
  ): Promise<Output[]> {
    return this.rangeCoordinator.start(
      task,
      range,
      createInput,
      options,
      'collect',
    ) as Promise<Output[]>;
  }

  /**
   * @experimental Completion-only CPU work over a numeric range.
   * Worker return values are ignored before result serialization.
   */
  parallelFor<Input>(
    task: PjsTask<Input, unknown>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions = {},
  ): Promise<void> {
    return this.rangeCoordinator.start(
      task,
      range,
      createInput,
      options,
      'discard',
    ) as Promise<void>;
  }

  /** @experimental Ordered element map assembled from validated typed blocks. */
  parallelMapRange<Input, Constructor extends PjsTypedArrayConstructor>(
    task: PjsTask<Input, InstanceType<Constructor>>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: TypedMapRangeOptions<Constructor>,
  ): Promise<InstanceType<Constructor>>;
  /** @experimental Ordered element map assembled from validated array blocks. */
  parallelMapRange<Input, Output>(
    task: PjsTask<Input, readonly Output[]>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options?: PartitionOptions,
  ): Promise<Output[]>;
  parallelMapRange<Input>(
    task: PjsTask<Input, readonly unknown[] | PjsTypedArray>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions | TypedMapRangeOptions = {},
  ): Promise<unknown[] | PjsTypedArray> {
    const outputConstructor =
      'experimentalOutputConstructor' in options
        ? options.experimentalOutputConstructor
        : undefined;
    return this.rangeCoordinator.start(
      task,
      range,
      createInput,
      options,
      'map',
      undefined,
      outputConstructor,
    ) as Promise<unknown[] | PjsTypedArray>;
  }

  /** @experimental Bounded completion-order delivery of partition results. */
  streamRange<Input, Output extends PjsBinaryResult>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: BinaryStreamRangeOptions | UpperBoundBinaryStreamRangeOptions,
  ): AsyncIterable<StreamRangeResult<Output>>;
  streamRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options?: CountOnlyStreamRangeOptions,
  ): AsyncIterable<StreamRangeResult<Output>>;
  streamRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options:
      | StreamRangeOptions
      | BinaryStreamRangeOptions
      | UpperBoundBinaryStreamRangeOptions = {},
  ): AsyncIterable<StreamRangeResult<Output>> {
    return this.rangeCoordinator.stream(task, range, createInput, options);
  }

  run<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions = {},
  ): Promise<Output> {
    return this.taskCoordinator.submit(task, input, options);
  }

  stats() {
    return this.telemetry.snapshot();
  }

  shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.drainMode = options.drain ?? true;
    const failed = this.state === 'failed';
    if (!failed) this.state = 'stopping';
    // Defer the body so the idempotent promise is installed before any cleanup occurs.
    this.shutdownPromise = Promise.resolve().then(async () => {
      if (!failed && this.drainMode) {
        await this.readyPromise.catch(() => {});
        await new Promise<void>((resolve) => {
          this.drainResolve = resolve;
          this.pump();
          this.checkDrained();
        });
      } else {
        this.rangeCoordinator.finishAll(
          'cancelled',
          (operation) =>
            new PjsCancelledError(
              'Runtime shutdown cancelled partition operation',
              { operationId: operation.id },
            ),
        );
        for (const task of this.taskCoordinator.values())
          this.taskCoordinator.settle(
            task,
            'cancelled',
            new PjsCancelledError('Runtime shutdown cancelled task', {
              taskId: task.id,
              ...(task.snapshot.workerId !== undefined
                ? { workerId: task.snapshot.workerId }
                : {}),
            }),
          );
      }
      await this.dispatcher.stop();
      this.resultCredits.releaseAll();
      this.rangeCoordinator.stopProduction();
      this.state = 'stopped';
    });
    return this.shutdownPromise;
  }

  private dispatchAllowed(): boolean {
    return (
      this.state === 'running' || (this.state === 'stopping' && this.drainMode)
    );
  }

  private pump(): void {
    if (this.pumping) return;
    if (!this.dispatchAllowed()) {
      this.checkDrained();
      return;
    }
    this.pumping = true;
    try {
      this.dispatcher.dispatchQueued(() => this.dispatchAllowed());
      if (this.rangeCoordinator.size > 0) {
        this.rangeCoordinator.produce();
        this.dispatcher.dispatchQueued(() => this.dispatchAllowed());
      }
    } finally {
      this.pumping = false;
    }
    this.checkDrained();
  }

  private checkDrained(): void {
    if (
      this.taskCoordinator.size === 0 &&
      this.rangeCoordinator.size === 0 &&
      this.dispatcher.busy === 0
    ) {
      this.drainResolve?.();
      this.drainResolve = undefined;
    }
  }

  private fail(error: Error): void {
    if (this.state === 'failed' || this.state === 'stopped') return;
    this.state = 'failed';
    this.rangeCoordinator.finishAll(
      'failed',
      (operation) =>
        new PjsWorkerError(error.message, {
          operationId: operation.id,
          cause: error,
        }),
    );
    for (const task of this.taskCoordinator.values())
      this.taskCoordinator.settle(
        task,
        'failed',
        new PjsWorkerError(error.message, {
          taskId: task.id,
          ...(task.snapshot.workerId !== undefined
            ? { workerId: task.snapshot.workerId }
            : {}),
          cause: error,
        }),
      );
    void this.dispatcher.stop().then(() => {
      this.resultCredits.releaseAll();
      this.checkDrained();
    });
  }
}
