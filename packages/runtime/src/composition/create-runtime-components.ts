import { PjsTaskRegistrationError } from '../errors/index.js';
import type { RuntimeHost } from '../hosts/contracts.js';
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
export function createRuntimeComponents(
  options: PjsRuntimeOptions,
  host: RuntimeHost,
) {
  const resultCredits = new ResultCreditManager(
    host.debugInvariants,
    host.lifecycle === 'endpoint-revocation',
  );
  const {
    workers,
    concurrency,
    scheduling,
    minimum,
    maximum,
    idleTimeout,
    resourceLimits,
    startupTimeout,
    maxRestarts,
    restartPolicy,
  } = normalizeRuntimeOptions(options, host.cpuCount);
  const registry = snapshotRegistry(options.registry);
  for (const descriptor of registry.values()) {
    const protocol = new URL(descriptor.module).protocol;
    if (!host.moduleProtocols.includes(protocol))
      throw new PjsTaskRegistrationError(
        'Registry module URLs do not match the runtime host',
      );
  }
  const dispatcher: ExecutionDispatcher = new ExecutionDispatcher(
    {
      workers,
      concurrency,
      ...(scheduling ? { scheduling } : {}),
      maxQueue: options.maxQueue ?? 1024,
      startupTimeout,
      maxRestarts,
      ...(idleTimeout === undefined
        ? {}
        : { idleTimeout, minWorkers: minimum, maxWorkers: maximum }),
      ...(resourceLimits ? { resourceLimits } : {}),
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
      progress: (worker, message, value, acknowledge) =>
        taskCoordinator.progress(worker, message, value, acknowledge),
      result: (worker, message) => taskCoordinator.result(worker, message),
      failed: (error, reason) => taskCoordinator.failTask(error, reason),
      exited: (correlationIds) => {
        for (const correlationId of correlationIds)
          taskCoordinator.exited(correlationId);
        controller.pump();
      },
      revoked: (correlations) => {
        for (const id of correlations) taskCoordinator.revoked(id);
        controller.pump();
      },
      dispatchFailed: (task, error) =>
        taskCoordinator.dispatchFailed(task, error),
      fatal: (error) => controller.fail(error),
    },
    Object.freeze({
      lifecycle: host.lifecycle,
      sharedMemory: host.sharedMemory,
      ...(host.worker.profiling ? { profiling: true as const } : {}),
      pool: Object.freeze({ worker: host.worker, unref: host.unref }),
    }),
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
    Object.freeze({
      lifecycle: host.lifecycle,
      sharedMemory: host.sharedMemory,
      recovery: host.recovery,
      id: host.id,
      isPromise: host.isPromise,
      snapshotTransferList: host.snapshotTransferList,
      defer: host.defer,
      setTimer: host.setTimer,
      clearTimer: host.clearTimer,
    }),
  );
  const rangeCoordinator: RangeCoordinator = new RangeCoordinator(
    registry,
    idleTimeout === undefined ? workers : maximum,
    Math.min(
      Number.MAX_SAFE_INTEGER,
      (idleTimeout === undefined ? workers : maximum) +
        dispatcher.queueCapacity,
    ),
    dispatcher,
    taskCoordinator,
    resultCredits,
    {
      state: () => controller.currentState,
      dispatchAllowed: () => controller.dispatchAllowed(),
      requestPump: () => controller.pump(),
    },
    concurrency,
    Object.freeze({
      sharedMemory: host.sharedMemory,
      id: host.id,
      isHostThread: host.isHostThread,
      createScope: host.createScope,
      defer: host.defer,
      setTimer: host.setTimer,
      clearTimer: host.clearTimer,
    }),
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
    workerCount: idleTimeout === undefined ? workers : maximum,
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
