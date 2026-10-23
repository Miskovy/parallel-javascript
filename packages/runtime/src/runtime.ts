import { run as adaptRun } from './api/run.js';
import { streamRange as adaptStreamRange } from './api/range/stream-range.js';
import { parallelMapRange as adaptParallelMapRange } from './api/range/parallel-map-range.js';
import { parallelFor as adaptParallelFor } from './api/range/parallel-for.js';
import { partitionRange as adaptPartitionRange } from './api/range/partition-range.js';
import { createRuntimeComponents } from './composition/create-runtime-components.js';
import type { PjsRuntimeOptions } from './configuration/runtime-options.js';
export type { PjsRuntimeOptions } from './configuration/runtime-options.js';
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
export class PjsRuntime {
  private readonly components: ReturnType<typeof createRuntimeComponents>;
  constructor(options: PjsRuntimeOptions) {
    this.components = createRuntimeComponents(options);
  }
  ready(): Promise<void> {
    return this.components.controller.ready();
  }

  /**
   * Host-coordinated numeric ranges with ordered retained results.
   * The synchronous factory runs lazily on the main thread with reserved admission.
   * Results are collected by partition index. maxQueue does not bound result bytes.
   */
  partitionRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions = {},
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
  parallelFor<Input>(
    task: PjsTask<Input, unknown>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: PartitionOptions = {},
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
  parallelMapRange<Input, Constructor extends PjsTypedArrayConstructor>(
    task: PjsTask<Input, InstanceType<Constructor>>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: TypedMapRangeOptions<Constructor>,
  ): Promise<InstanceType<Constructor>>;
  /** Ordered element map assembled from validated array blocks. */
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
    return adaptParallelMapRange(
      this.components.rangeCoordinator,
      task,
      range,
      createInput,
      options,
    );
  }

  /** Bounded completion-order delivery of partition results. */
  streamRange<Input, Output extends PjsBinaryResult>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options: BinaryStreamRangeOptions | UpperBoundBinaryStreamRangeOptions,
  ): PjsRangeStream<Output>;
  streamRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options?: CountOnlyStreamRangeOptions,
  ): PjsRangeStream<Output>;
  streamRange<Input, Output>(
    task: PjsTask<Input, Output>,
    range: PartitionRange,
    createInput: (partition: RangePartition) => PartitionInput<Input>,
    options:
      | StreamRangeOptions
      | BinaryStreamRangeOptions
      | UpperBoundBinaryStreamRangeOptions = {},
  ): PjsRangeStream<Output> {
    return adaptStreamRange(
      this.components.streamRange,
      task,
      range,
      createInput,
      options,
    );
  }

  run<Input, Output>(
    task: PjsTask<Input, Output>,
    input: Input,
    options: RunOptions = {},
  ): Promise<Output> {
    return adaptRun(this.components.taskCoordinator, task, input, options);
  }

  stats(): PjsRuntimeStats {
    return this.components.telemetry.snapshot();
  }

  shutdown(options: ShutdownOptions = {}): Promise<void> {
    return this.components.controller.shutdown(options);
  }
}
