import type { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import type { RangeCoordinator } from '../partition/coordinator.js';
import type { TaskCoordinator } from '../tasks/coordinator.js';
import type { RuntimeState } from '../types/index.js';

/** Read-only compatibility projection over subsystem-owned state. */
export class RuntimeTelemetry {
  constructor(
    private readonly state: () => RuntimeState,
    private readonly dispatcher: ExecutionDispatcher,
    private readonly tasks: TaskCoordinator,
    private readonly ranges: RangeCoordinator,
  ) {}

  snapshot() {
    const workers = this.dispatcher.workerSnapshots();
    const taskSnapshot = this.tasks.snapshot();
    const rangeSnapshot = this.ranges.snapshot();
    return {
      state: this.state(),
      workers: {
        total: workers.length,
        busy: this.dispatcher.busy,
        idle: workers.filter((worker) => worker.status === 'idle').length,
        starting: workers.filter((worker) => worker.status === 'starting')
          .length,
        failures: this.dispatcher.failures,
        restarts: this.dispatcher.restarts,
        details: workers,
      },
      queue: {
        size: this.dispatcher.queueSize,
        capacity: this.dispatcher.queueCapacity,
      },
      tasks: taskSnapshot.metrics,
      timing: taskSnapshot.timing,
      operations: rangeSnapshot.operations,
      streams: rangeSnapshot.streams,
      streamResults: rangeSnapshot.streamResults,
      maps: rangeSnapshot.maps,
      mapResults: rangeSnapshot.mapResults,
      partitions: rangeSnapshot.partitions,
      dispatch: this.dispatcher.snapshot(),
      activeOperations: rangeSnapshot.activeOperations,
      activeTasks: taskSnapshot.active,
    };
  }
}
