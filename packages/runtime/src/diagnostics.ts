import type { RuntimeState, TaskSnapshot, WorkerState } from './types/index.js';

/** Logical caller/parent outcomes; pending excludes physically owned settled work. */
export interface PjsOutcomeStats {
  accepted: number;
  rejected: number;
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
  timedOut: number;
}

export interface PjsContainmentStats {
  leaseExpirations: number;
  leaseTerminationRequests: number;
  confirmedLeaseExits: number;
  workerReplacements: number;
  /** Current rolling-window restart count; undefined without a rolling policy. */
  restartWindowUtilization: number | undefined;
  restartBudgetExhaustions: number;
  shutdownEscalations: number;
}

export interface PjsWorkerStats {
  total: number;
  busy: number;
  idle: number;
  starting: number;
  failures: number;
  restarts: number;
  /** Current workers only; per-worker totals restart with replacement. */
  details: WorkerState[];
}

export interface PjsQueueStats {
  size: number;
  capacity: number;
}

/** Millisecond means, each zero until its own sample count is nonzero. */
export interface PjsTimingStats {
  averageQueueMs: number;
  averageExecutionMs: number;
  averageTotalMs: number;
  queueSamples: number;
  executionSamples: number;
  settledSamples: number;
}

export interface PjsOperationStats extends PjsOutcomeStats {
  capacity: number;
  collecting: PjsOutcomeStats;
  completion: PjsOutcomeStats;
  streaming: PjsOutcomeStats;
  mapping: PjsOutcomeStats;
}

/** Runtime totals/peaks and current active-stream gauges; byte units are visible payload. */
export interface PjsStreamResultStats {
  produced: number;
  yielded: number;
  peakBuffered: number;
  peakKnownBufferedPayloadBytes: number;
  peakUnknownBufferedResults: number;
  currentReservedResultBytes: number;
  peakReservedResultBytes: number;
  resultByteReservationWaits: number;
  resultByteReservationRejected: number;
  binaryResultContractFailures: number;
  upperBoundContractFailures: number;
  upperBoundResultsReconciled: number;
  resultByteRefunds: number;
  refundedResultBytes: number;
  buffered: number;
  knownBufferedPayloadBytes: number;
  unknownBufferedResults: number;
}

/** Validated, copied map blocks/elements and cumulative host assembly milliseconds. */
export interface PjsMapResultStats {
  blocks: number;
  elements: number;
  assemblyMs: number;
}

export interface PjsPartitionStats {
  generated: number;
  admitted: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface PjsDispatchStats {
  executeMessages: number;
  resultMessages: number;
  batchedExecuteMessages: number;
  logicalTasks: number;
  logicalPartitions: number;
  averageLogicalTasksPerExecute: number;
}

export type PjsOperationStatus =
  'created' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
export type PjsRangeResultMode = 'collect' | 'discard' | 'stream' | 'map';

/** Active parent copy, not terminal history. Mode-specific properties remain optional. */
export interface PjsOperationSnapshot {
  id: string;
  taskName: string;
  status: PjsOperationStatus;
  resultMode: PjsRangeResultMode;
  start: number;
  end: number;
  grainSize: number;
  chunkCount: number;
  generated: number;
  admitted: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  bufferedResults?: number;
  resultBufferCapacity?: number;
  producedResults?: number;
  yieldedResults?: number;
  knownBufferedPayloadBytes?: number;
  unknownBufferedResults?: number;
  reservedResultBytes?: number;
  /** Compatibility alias of knownBufferedPayloadBytes. */
  bufferedKnownPayloadBytes?: number;
  resultByteCapacity?: number;
  mappedElements?: number;
  assembledBlocks?: number;
  assemblyMs?: number;
  typedOutput?: string | undefined;
}

/** Writable defensive copies. Counters do not imply physical execution has ended. */
export interface PjsRuntimeStats {
  state: RuntimeState;
  containment: PjsContainmentStats;
  workers: PjsWorkerStats;
  queue: PjsQueueStats;
  tasks: PjsOutcomeStats;
  timing: PjsTimingStats;
  operations: PjsOperationStats;
  streams: PjsOutcomeStats;
  streamResults: PjsStreamResultStats;
  maps: PjsOutcomeStats;
  mapResults: PjsMapResultStats;
  partitions: PjsPartitionStats;
  dispatch: PjsDispatchStats;
  activeTasks: TaskSnapshot[];
  activeOperations: PjsOperationSnapshot[];
}
