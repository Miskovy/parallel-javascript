import type { ProgressValue } from './types/index.js';
import { run as adaptRun } from './api/run.js';
import { streamRange as adaptStreamRange } from './api/range/stream-range.js';
import { parallelMapRange as adaptParallelMapRange } from './api/range/parallel-map-range.js';
import { parallelFor as adaptParallelFor } from './api/range/parallel-for.js';
import { partitionRange as adaptPartitionRange } from './api/range/partition-range.js';
import type { createRuntimeComponents } from './composition/create-runtime-components.js';
import type {
  BinaryStreamRangeOptions,
  CountOnlyStreamRangeOptions,
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
import type { PjsRangeStream } from './partition/stream.js';
import type { PjsTask } from './tasks/registry.js';
import type { RunOptions, ShutdownOptions } from './types/index.js';
import type { PjsRuntimeStats } from './diagnostics.js';

/** Public facade. API policy and runtime lifecycle live with their internal owners. */
export class RuntimeFacade<Stats = PjsRuntimeStats> {
  private readonly components: ReturnType<typeof createRuntimeComponents>;
  constructor(
    components: ReturnType<typeof createRuntimeComponents>,
    private readonly project: (stats: PjsRuntimeStats) => Stats,
  ) {
    this.components = components;
  }
  ready(): Promise<void> {
    return this.components.controller.ready();
  }

  /**
   * Host-coordinated numeric ranges with ordered retained results.
   * The synchronous factory runs lazily on the main thread with reserved admission.
   * Results are collected by partition index. maxQueue does not bound result bytes.
   */
  partitionRange<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions<
      NoInfer<Input>,
      NoInfer<Output>,
      NoInfer<Progress>
    > = {},
  ): Promise<Output[]> {
    return adaptPartitionRange(
      this.components.rangeCoordinator,
      task,
      range,
      createInput,
      options,
    );
  }

  /**
   * Completion-only CPU work over a numeric range.
   * Worker return values are ignored before result serialization.
   */
  parallelFor<Input, Progress = ProgressValue>(
    task: PjsTask<Input, unknown, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions<NoInfer<Input>, unknown, NoInfer<Progress>> = {},
  ): Promise<void> {
    return adaptParallelFor(
      this.components.rangeCoordinator,
      task,
      range,
      createInput,
      options,
    );
  }

  /** Ordered element map assembled from validated typed blocks. */
  parallelMapRange<
    Input,
    Constructor extends PjsTypedArrayConstructor,
    Progress = ProgressValue,
  >(
    task: PjsTask<Input, InstanceType<Constructor>, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: TypedMapRangeOptions<
      Constructor,
      NoInfer<Input>,
      NoInfer<Progress>
    >,
  ): Promise<InstanceType<Constructor>>;
  /** Ordered element map assembled from validated array blocks. */
  parallelMapRange<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, readonly Output[], Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options?: PartitionOptions<
      NoInfer<Input>,
      readonly NoInfer<Output>[],
      NoInfer<Progress>
    >,
  ): Promise<Output[]>;
  parallelMapRange<Input, Progress = ProgressValue>(
    task: PjsTask<Input, readonly unknown[] | PjsTypedArray, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options:
      | PartitionOptions<Input, readonly unknown[] | PjsTypedArray, Progress>
      | TypedMapRangeOptions<PjsTypedArrayConstructor, Input, Progress> = {},
  ): Promise<unknown[] | PjsTypedArray> {
    return adaptParallelMapRange(
      this.components.rangeCoordinator,
      task,
      range,
      createInput,
      options,
    );
  }

  /** Bounded completion-order delivery of partition results. */
  streamRange<Input, Output extends PjsBinaryResult, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options:
      | BinaryStreamRangeOptions<
          NoInfer<Input>,
          NoInfer<Output>,
          NoInfer<Progress>
        >
      | UpperBoundBinaryStreamRangeOptions<
          NoInfer<Input>,
          NoInfer<Output>,
          NoInfer<Progress>
        >,
  ): PjsRangeStream<Output>;
  streamRange<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options?: CountOnlyStreamRangeOptions<
      NoInfer<Input>,
      NoInfer<Output>,
      NoInfer<Progress>
    >,
  ): PjsRangeStream<Output>;
  streamRange<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options:
      | StreamRangeOptions<Input, Output, Progress>
      | BinaryStreamRangeOptions<Input, Output, Progress>
      | UpperBoundBinaryStreamRangeOptions<Input, Output, Progress> = {},
  ): PjsRangeStream<Output> {
    return adaptStreamRange(
      this.components.streamRange,
      task,
      range,
      createInput,
      options,
    );
  }

  run<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    input: NoInfer<Input>,
    options:
      | RunOptions<NoInfer<Input>, NoInfer<Output>, NoInfer<Progress>>
      | RunOptions<unknown, never, NoInfer<Progress>> = {},
  ): Promise<Output> {
    return adaptRun(this.components.taskCoordinator, task, input, options);
  }

  stats(): Stats {
    return this.project(this.components.telemetry.snapshot());
  }

  shutdown(options: ShutdownOptions = {}): Promise<void> {
    return this.components.controller.shutdown(options);
  }
}
