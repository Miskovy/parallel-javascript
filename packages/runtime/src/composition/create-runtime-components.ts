import type { StreamRangeSubmission } from '../api/range/contracts.js';
import { normalizeRuntimeOptions } from '../configuration/runtime-options.js';
import type { PjsRuntimeOptions } from '../configuration/runtime-options.js';
import { ExecutionDispatcher } from '../dispatch/dispatcher.js';
import { RuntimeController } from '../lifecycle/runtime-controller.js';
import { RangeCoordinator } from '../partition/coordinator.js';
import { ResultCreditManager } from '../results/credit.js';
import { TaskCoordinator } from '../tasks/coordinator.js';
import { RuntimeTelemetry } from '../telemetry/runtime.js';
import { snapshotRegistry } from '../tasks/registry.js';

/** Passive constructors store callbacks; operational callbacks begin only at start. */
export function createRuntimeComponents(options: PjsRuntimeOptions) {
  const resultCredits = new ResultCreditManager();
  const { workers, startupTimeout, maxRestarts, restartPolicy } =
    normalizeRuntimeOptions(options);
  const registry = snapshotRegistry(options.registry);
  const dispatcher: ExecutionDispatcher = new ExecutionDispatcher(
    {
      workers,
      maxQueue: options.maxQueue ?? 1024,
      startupTimeout,
      maxRestarts,
      ...(restartPolicy ? { restartPolicy } : {}),
    },
    [...registry.values()],
    resultCredits,
    {
      ready: () => controller.pump(),
      prepareDispatch: (task) => taskCoordinator.prepareDispatch(task),
      scheduled: (worker, task, scheduledAt, queueMs) =>
        taskCoordinator.scheduled(worker, task, scheduledAt, queueMs),
      dispatched: (task) => taskCoordinator.dispatched(task),
      started: (worker, taskId) => taskCoordinator.started(worker, taskId),
      result: (worker, message) => taskCoordinator.result(worker, message),
      failed: (error, reason) => taskCoordinator.failTask(error, reason),
      exited: (correlationId) => {
        if (correlationId) taskCoordinator.exited(correlationId);
        controller.pump();
      },
      dispatchFailed: (task, error) =>
        taskCoordinator.dispatchFailed(task, error),
      fatal: (error) => controller.fail(error),
    },
  );
  const taskCoordinator: TaskCoordinator = new TaskCoordinator(
    registry,
    dispatcher,
    resultCredits,
    {
      state: () => controller.currentState,
      canAccept: (child) => controller.canAccept(child),
      dispatchAllowed: () => controller.dispatchAllowed(),
      requestPump: () => controller.pump(),
    },
    {
      canSubmit: (child) => rangeCoordinator.canSubmit(child),
      context: (child) => rangeCoordinator.context(child),
      rejected: (child, error) => rangeCoordinator.rejected(child, error),
      admitted: (child, taskId) => rangeCoordinator.admitted(child, taskId),
      settled: (task, status, error, output) =>
        rangeCoordinator.settled(task, status, error, output),
    },
  );
  const rangeCoordinator: RangeCoordinator = new RangeCoordinator(
    registry,
    workers,
    Math.min(Number.MAX_SAFE_INTEGER, workers + dispatcher.queueCapacity),
    dispatcher,
    taskCoordinator,
    resultCredits,
    {
      state: () => controller.currentState,
      dispatchAllowed: () => controller.dispatchAllowed(),
      requestPump: () => controller.pump(),
    },
  );
  const controller: RuntimeController = new RuntimeController(
    dispatcher,
    taskCoordinator,
    rangeCoordinator,
    resultCredits,
  );
  const telemetry = new RuntimeTelemetry(
    () => controller.currentState,
    dispatcher,
    taskCoordinator,
    rangeCoordinator,
    () => controller.escalations,
  );

  const streamRange: StreamRangeSubmission = {
    workerCount: workers,
    start: rangeCoordinator.start.bind(rangeCoordinator),
    rejectedOptions: () => rangeCoordinator.rejectStreamOptions(),
    rejectedResultBytes: () => resultCredits.recordRejected(),
  };
  controller.start();
  return {
    registry,
    dispatcher,
    taskCoordinator,
    rangeCoordinator,
    resultCredits,
    controller,
    telemetry,
    streamRange,
  };
}
