# 0009: Bounded parent records and ordinary child task accounting

## Context

A lazy partitioner can still hide unbounded work if it admits unlimited parent
producers or waits with a payload/Promise for every chunk. Parent acceptance
must also have a defined meaning during saturation and shutdown.

## Decision

Bound active parent records to min(MAX_SAFE_INTEGER, workers + maxQueue), with
no additional configurable queue or unbounded admission waiters. Overflow is
PjsQueueFullError with operationId. Accepted parents may wait for startup or
task capacity, including maxQueue=0, without generating child payloads.

Parents consume no worker or FIFO slot. Actual children enter the same bounded
FIFO as ordinary tasks. At most worker-count children per parent are unsettled;
globally waiting task count <= maxQueue and occupied executions <= workers.
Cancellation does not release occupied execution slots. Parent records bound
logical producers, not their potential range lengths or collected output bytes.

Reserve one actual admission credit before running a synchronous factory and
hold it through transfer-list validation/submission. Reentrant run() calls must
respect that credit. Recheck state after application callbacks; a cancelled
factory result is discarded without a second call or premature transfer.
Guard the pump against recursive generation. Bound each production batch to
worker count and use a single immediate continuation if more capacity remains.

Existing tasks.* counts **ordinary tasks plus admitted partition children**;
existing timing means retain their definitions. Parents count only under
operations.* (accepted/rejected/completed/failed/cancelled/timedOut/pending and
capacity). partitions.* counts generated descriptors, admitted children and
completed/failed/cancelled child callers. Generation can exceed admission after
factory failure/cancellation. Parent timeout increments operations.timedOut;
its cancelled children increment tasks.cancelled and partitions.cancelled.

Active task snapshots include parent/partition context. Active operation
snapshots expose range/total/generated/admitted/terminal-child counts and derive
queued/running counts from live child records (scheduled counts as running).
Terminal parents have no retained history; outstanding cancelled executions
remain visible through worker occupancy and existing late-execution statistics.

## Alternatives

Counting a parent as an ordinary accepted task would silently change existing
task timing/occupancy meanings. Hiding child counters would omit real executions.
Reserving a FIFO slot per parent complicates maxQueue=0 and can block children
behind their own parents. Unlimited producer records merely move the queue.
A new maxOperations option may be useful later; a documented derived bound is
sufficient for this experimental milestone.

## Consequences

One accepted parent commits graceful shutdown to its full logical range, while
task admission remains incremental and bounded. Ordinary run() retains immediate
overflow rejection. Producer rotation is not a fairness guarantee against
continuous external saturation. No byte accounting or exact worker-idle metric
is invented; benchmark occupancy proxies are labeled separately.

## Revisit conditions

Revisit producer/window bounds if concurrent-operation benchmarks demonstrate
starvation, excess memory or poor utilization. Streaming output and explicit
operation handles would change retention/inspection contracts and require new
design evidence before stabilization.
