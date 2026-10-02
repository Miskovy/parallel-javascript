# Statistics and terminology

`runtime.stats()` returns copies with current state and cumulative counters.
It is a supported diagnostic surface; the full nested layout is not frozen for
1.x. It has no completed-task history, histograms, p50/p95/p99 or observer hooks.
Do not derive unavailable quantiles from averages.

| Fields                                                                | Meaning                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| state                                                                 | Runtime lifecycle state                                                                                                                                                                                                    |
| workers.total/busy/idle/starting                                      | Current population / physical occupancy; starting can include replacements                                                                                                                                                 |
| workers.failures/restarts                                             | Lifetime worker failures and replacement attempts; duplicate error/exit does not double-count a failure                                                                                                                    |
| workers.details[]                                                     | id, threadId, status, currentTaskId, completedTasks, failedTasks, totalExecutionTimeMs; logical outcomes including late results; crashed duration is not invented                                                          |
| queue.size/capacity                                                   | Waiting logical task weight / configured maxQueue, excluding executing work                                                                                                                                                |
| tasks.accepted/rejected/pending/completed/failed/cancelled/timedOut   | Logical ordinary tasks plus range children; pending is caller bookkeeping, not physical occupancy                                                                                                                          |
| timing.averageQueueMs/queueSamples                                    | Monotonic accepted-to-dispatch mean, including startup; per logical item even in a batch                                                                                                                                   |
| timing.averageExecutionMs/executionSamples                            | Worker-measured logical invocation duration, excluding successful output posting; includes received late outcomes                                                                                                          |
| timing.averageTotalMs/settledSamples                                  | Accepted-to-caller-settlement mean; includes cancelled/timed-out accepted tasks                                                                                                                                            |
| operations                                                            | Parent accepted/rejected/pending/completed/failed/cancelled/timedOut; capacity; collecting/completion/streaming/mapping breakdown with the same outcome fields                                                             |
| streams / maps                                                        | Copies of streaming/mapping parent outcome counters                                                                                                                                                                        |
| partitions.generated/admitted/completed/failed/cancelled              | Logical range child progression; parent timeouts cancel children rather than timing each child out                                                                                                                         |
| dispatch.executeMessages/resultMessages/batchedExecuteMessages        | Physical host execute and received result messages; logical counts differ from messages                                                                                                                                    |
| dispatch.logicalTasks/logicalPartitions/averageLogicalTasksPerExecute | Logical items posted, partition subset, and items per execute message                                                                                                                                                      |
| mapResults.blocks/elements/assemblyMs                                 | Successfully assembled blocks/elements and cumulative host assembly time (including timed failed assembly attempts)                                                                                                        |
| streamResults.produced/yielded/buffered/peakBuffered                  | Successful stream outputs, delivered outputs, aggregate current/peak buffered count                                                                                                                                        |
| streamResults.knownBufferedPayloadBytes/peakKnownBufferedPayloadBytes | Visible byteLength of direct buffers/views in buffers; subviews/aliases can misrepresent backing, no graph traversal                                                                                                       |
| streamResults.unknownBufferedResults/peakUnknownBufferedResults       | Buffered scalars/objects/arrays/nested graphs with unknown bytes; not zero-byte results                                                                                                                                    |
| streamResults.currentReservedResultBytes/peakReservedResultBytes      | Aggregate occupied binary credit: exact declarations + unreconciled maxima + reconciled actual bytes, including physically active cancelled owners                                                                         |
| streamResults.resultByteReservationWaits                              | Next-declaration capacity stalls counted once per pending declaration, not elapsed time or scheduler queue latency                                                                                                         |
| streamResults.resultByteReservationRejected                           | Invalid or impossible declaration/capacity setup attempts                                                                                                                                                                  |
| streamResults.binaryResultContractFailures/upperBoundContractFailures | Worker/host result contract failures, with upper-bound subset; invalid declarations are tracked as reservation rejection                                                                                                   |
| streamResults.upperBoundResultsReconciled                             | Deliverable upper-bound successes reconciled, including equal and zero actual sizes                                                                                                                                        |
| streamResults.resultByteRefunds/refundedResultBytes                   | Positive successful slack-refund events / cumulative bytes; release is not a refund                                                                                                                                        |
| activeTasks[]                                                         | id/taskName/status, optional workerId, createdAt/queuedAt/scheduledAt/startedAt/completedAt and optional operationId/partitionIndex/rangeStart/rangeEnd; timestamps are epoch milliseconds, not monotonic duration samples |
| activeOperations[]                                                    | id/taskName/status/resultMode, start/end/grainSize/chunkCount, generated/admitted/queued/running/completed/failed/cancelled                                                                                                |
| Active stream fields                                                  | bufferedResults/resultBufferCapacity/producedResults/yieldedResults/knownBufferedPayloadBytes/unknownBufferedResults; strict streams also reservedResultBytes/bufferedKnownPayloadBytes/resultByteCapacity                 |
| Active map fields                                                     | mappedElements (planned output length), assembledBlocks, assemblyMs, typedOutput (constructor name or undefined)                                                                                                           |

Empty means are zero with zero samples. Counter lifetimes differ: task settlement
can precede physical completion; parent timeouts appear in operations.timedOut and
children's tasks.cancelled. Worker crash/replacement changes current worker details
while preserving lifetime failure totals. Aggregate peaks across concurrent streams
are not one stream's configured cap. There is no public reconciled-versus-unreconciled
credit split; internal research diagnostics must not be presented as exported stats.

## Glossary

| Term                        | Meaning                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Task                        | One accepted invocation of a registered module export; logical work                    |
| Operation                   | Parent coordinating children over one numeric range                                    |
| Worker                      | Persistent Node isolate/thread with one physical execution at a time                   |
| Queue                       | FIFO waiting logical work, bounded by maxQueue                                         |
| Range / partition           | Half-open numeric interval / one identified chunk of it                                |
| Batch                       | Several transfer-free input partitions posted/executed sequentially in one worker turn |
| Caller settlement           | Promise/parent success, error, cancellation or timeout observed by the caller          |
| Physical execution          | Posted work still occupying a worker, possibly after caller settlement                 |
| Result credit / reservation | Admission budget for declared visible binary output, not memory allocation             |
| Reconciliation / refund     | Validate successful actual bytes and return unused upper-bound slack                   |
| Yield / release             | Hand value to consumer / end PJS credit ownership; consumer retention is separate      |

One AsyncResource associates each range's host factory and settlement with the
caller's async context. Worker AsyncLocalStorage is not implicitly inherited;
pass explicit task input. See [architecture](../architecture.md) for internal
ownership and composition rules.
