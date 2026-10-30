import assert from 'node:assert/strict';
import {
  PjsError,
  PjsTaskError,
  PjsWorkerError,
  PjsExecutionLeaseError,
  PjsQueueFullError,
  PjsTimeoutError,
  PjsCancelledError,
  PjsSerializationError,
  PjsRuntimeStateError,
  PjsTaskRegistrationError,
  PjsMapContractError,
  PjsBinaryResultContractError,
  PjsResultCapacityError,
} from '@pjavascript/runtime';
import type {
  PjsRuntime,
  PjsRuntimeStats,
  PjsOutcomeStats,
  PjsContainmentStats,
  PjsWorkerStats,
  PjsQueueStats,
  PjsTimingStats,
  PjsOperationStats,
  PjsStreamResultStats,
  PjsMapResultStats,
  PjsPartitionStats,
  PjsDispatchStats,
  PjsOperationSnapshot,
  PjsOperationStatus,
  PjsRangeResultMode,
  PjsErrorContext,
  PjsBinaryResultErrorContext,
  PjsTaskErrorDetails,
} from '@pjavascript/runtime';

export function diagnosticContracts(runtime: PjsRuntime): void {
  const stats: PjsRuntimeStats = runtime.stats();
  const outcome: PjsOutcomeStats = stats.tasks;
  const containment: PjsContainmentStats = stats.containment;
  const workers: PjsWorkerStats = stats.workers;
  const queue: PjsQueueStats = stats.queue;
  const timing: PjsTimingStats = stats.timing;
  const operations: PjsOperationStats = stats.operations;
  const streams: PjsStreamResultStats = stats.streamResults;
  const maps: PjsMapResultStats = stats.mapResults;
  const partitions: PjsPartitionStats = stats.partitions;
  const dispatch: PjsDispatchStats = stats.dispatch;
  const operation: PjsOperationSnapshot = {
    id: 'copy',
    taskName: 'task',
    status: 'created',
    resultMode: 'map',
    start: 0,
    end: 1,
    grainSize: 1,
    chunkCount: 1,
    generated: 0,
    admitted: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    typedOutput: undefined,
  };
  const statuses: PjsOperationStatus[] = [
    'created',
    'running',
    'completed',
    'failed',
    'cancelled',
    'timed_out',
  ];
  const modes: PjsRangeResultMode[] = ['collect', 'discard', 'stream', 'map'];
  operation.status = statuses[2]!;
  operation.resultMode = modes[0]!;
  operation.typedOutput = 'Float64Array';
  delete operation.typedOutput;
  const utilization: number | undefined = containment.restartWindowUtilization;
  stats.tasks.completed++;
  workers.details[0]!.completedTasks++;
  workers.details.push({
    id: -1,
    threadId: -1,
    status: 'stopped',
    completedTasks: 0,
    failedTasks: 0,
    totalExecutionTimeMs: 0,
  });
  stats.activeOperations.push(operation);
  assert.notEqual(runtime.stats().tasks.completed, stats.tasks.completed);
  assert.ok(
    runtime.stats().workers.details.every((worker) => worker.id !== -1),
  );
  assert.ok(
    runtime.stats().activeOperations.every((parent) => parent.id !== 'copy'),
  );
  assert.deepEqual(stats.streams, operations.streaming);
  assert.deepEqual(stats.maps, operations.mapping);
  assert.equal(typeof outcome.timedOut, 'number');
  for (const value of [
    queue.capacity,
    timing.queueSamples,
    streams.buffered,
    maps.blocks,
    partitions.generated,
    dispatch.logicalTasks,
  ]) {
    assert.equal(typeof value, 'number');
  }
  void utilization;
}

export function errorContracts(): void {
  const cause: unknown = { application: true };
  const context: PjsErrorContext = {
    taskId: 'task',
    workerId: 7,
    operationId: 'parent',
    partitionIndex: 2,
    rangeStart: 4,
    rangeEnd: 6,
    cause,
  };
  const binary: PjsBinaryResultErrorContext = {
    ...context,
    declaredBytes: 8,
    actualBytes: 4,
    actualType: 'Uint8Array',
    resultByteCapacity: 16,
  };
  const details: PjsTaskErrorDetails = {
    name: 'RemoteRangeError',
    message: '',
    stack: 'remote trace',
  };
  const errors: PjsError[] = [
    new PjsError('', context),
    new PjsTaskError(details, context),
    new PjsWorkerError('', context),
    new PjsExecutionLeaseError('', context),
    new PjsQueueFullError('', context),
    new PjsTimeoutError('', context),
    new PjsCancelledError('', context),
    new PjsSerializationError('', context),
    new PjsRuntimeStateError('', context),
    new PjsTaskRegistrationError('', context),
    new PjsMapContractError('', context),
    new PjsBinaryResultContractError('', binary),
    new PjsResultCapacityError('', binary),
  ];
  for (const error of errors) {
    assert.ok(error instanceof Error);
    assert.ok(error instanceof PjsError);
    assert.equal(error.name, error.constructor.name);
    assert.equal(error.message, '');
    assert.equal(error.cause, cause);
    assert.equal(error.taskId, context.taskId);
    assert.equal(error.workerId, context.workerId);
    assert.equal(error.operationId, context.operationId);
    assert.equal(error.partitionIndex, context.partitionIndex);
    assert.equal(error.rangeStart, context.rangeStart);
    assert.equal(error.rangeEnd, context.rangeEnd);
    const unknownCause: unknown = error.cause;
    if (unknownCause instanceof Error)
      assert.equal(typeof unknownCause.message, 'string');
    const stack: string | undefined = error.stack;
    void stack;
  }
  const taskError = new PjsTaskError(details, context);
  assert.equal(taskError.remoteName, details.name);
  assert.equal(taskError.remoteStack, details.stack);
  assert.ok(
    taskError.stack?.includes('Worker stack (RemoteRangeError):\nremote trace'),
  );
  assert.equal(
    new PjsTaskError({ name: 'Empty', message: '', stack: '' }, {}).remoteStack,
    '',
  );
  assert.ok(new PjsExecutionLeaseError('') instanceof PjsWorkerError);
  assert.equal(new PjsBinaryResultContractError('', binary).actualBytes, 4);
  assert.equal(new PjsResultCapacityError('', binary).resultByteCapacity, 16);
  assert.equal(
    'resultByteCapacity' in new PjsBinaryResultContractError('', binary),
    false,
  );
  assert.equal('actualBytes' in new PjsResultCapacityError('', binary), false);
  assert.equal(new PjsError('').taskId, undefined);
}

// Compile-only failures also run under both locked installed consumers.
function negativeContracts(stats: PjsRuntimeStats, error: PjsError): void {
  // @ts-expect-error Required property may contain undefined but cannot be omitted.
  const missing: PjsContainmentStats = {
    leaseExpirations: 0,
    leaseTerminationRequests: 0,
    confirmedLeaseExits: 0,
    workerReplacements: 0,
    restartBudgetExhaustions: 0,
    shutdownEscalations: 0,
  };
  // @ts-expect-error Partition outcomes have no timedOut counter.
  void stats.partitions.timedOut;
  // @ts-expect-error Optional mode field cannot be treated as a required number.
  const buffered: number = stats.activeOperations[0]!.bufferedResults;
  // @ts-expect-error Required possibly undefined is not an unconditional number.
  const utilization: number = stats.containment.restartWindowUtilization;
  // @ts-expect-error Diagnostic status is the reviewed vocabulary.
  const status: PjsOperationStatus = 'queued';
  // @ts-expect-error Mode is not an arbitrary string.
  const mode: PjsRangeResultMode = 'binary';
  // @ts-expect-error Six instance context fields remain readonly.
  error.taskId = 'changed';
  // @ts-expect-error Worker context remains readonly.
  error.workerId = 1;
  // @ts-expect-error Parent context remains readonly.
  error.operationId = 'changed';
  // @ts-expect-error Partition context remains readonly.
  error.partitionIndex = 1;
  // @ts-expect-error Range start remains readonly.
  error.rangeStart = 0;
  // @ts-expect-error Range end remains readonly.
  error.rangeEnd = 1;
  // @ts-expect-error Required possibly undefined fields cannot be deleted.
  delete stats.containment.restartWindowUtilization;
  // @ts-expect-error Unknown cause requires narrowing.
  void error.cause.message;
  // @ts-expect-error Task error context remains required.
  new PjsTaskError({ name: 'Error', message: '' });
  // @ts-expect-error Remote error details require a name.
  new PjsTaskError({ message: '' }, {});
  // @ts-expect-error Error context is typed, not arbitrary metadata.
  new PjsError('', { workerId: 'worker' });
  // @ts-expect-error Byte fields remain readonly on instances.
  new PjsResultCapacityError('').declaredBytes = 0;
  void [missing, buffered, utilization, status, mode];
}
void negativeContracts;
