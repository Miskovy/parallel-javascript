# 0011: Experimental transfer-free bounded partition batches

## Context

Every v0.4 logical partition uses an independent host execute, worker started,
and worker result round trip. Fine no-op work is dominated by lifecycle/transport,
while medium-grain FIFO scheduling already balances the tested skew. Several
logical partitions can share a physical worker turn without changing their range
boundaries, but batching affects admission, ownership, failure and cancellation.

## Decision

Add experimental `PartitionOptions.experimentalDispatchBatchSize`, restricted to
safe integers 1..16. Size 1 uses the ordinary v0.4 execute protocol. Sizes above
one group only children of the same parent operation and registered task. Items
run sequentially inside one worker. Ordinary `run()` never batches, grain stays
explicit, and the option is not a stable scheduling promise.

The protocol gains validated batch execute/result variants. One physical batch
ID owns a worker; every logical item retains its task ID and host-side operation,
partition index and range. Successful results settle by task ID and enter the
same ordered parent collector. Only registered exports execute; no closure or
source serialization is introduced.

## Logical vs physical work

`tasks.*`, `operations.*`, `partitions.*`, timing samples and active task records
remain logical. Experimental `dispatch.*` counts physical execute/result messages
and logical tasks/partitions transported. Worker completed/failed task counts use
the logical item results reported by a batch. A crash is one unknown physical
failure followed by logical parent failure/cancellation.

## Admission semantics

The FIFO's size and capacity count logical admission weight. A queued N-item
batch consumes N of `maxQueue`; the scheduler still has one physical Map entry.
An idle worker can own at most one batch, so running logical work is bounded by
`workers * batchSize`. Active parent records remain bounded by
`workers + maxQueue`, and each parent has at most `workers * batchSize` unsettled
children. No range-wide descriptor, task, Promise, or batch list is generated.

Before invoking factories, the producer reserves either one concrete idle worker
or enough logical queue credits for the bounded batch. Reentrant ordinary work
cannot steal this capacity. Existing queued work dispatches first; eligible
parents rotate once per physical batch. `maxQueue=8` means eight queued logical
items, never eight arbitrarily large batches.

## Failure semantics

Items execute in logical order within a batch. The first task/serialization
failure stops the batch. Earlier items report completion; later items do not
execute and settle cancelled. Parent first-failure behavior then cancels all
other siblings, discards outputs and rejects exactly once. No task is retried and
ordinary task failure does not terminate the worker.

A worker crash exposes no reliable per-item progress because results are combined.
The parent fails under the no-retry rule, with the first unresolved batch item as
the documented attribution rather than a claim about the exact crash source.
Replacement uses the existing bounded restart policy. Combined output-clone
failure is likewise attributed to the first item because the offending value may
not be knowable after one postMessage failure.

## Cancellation semantics

Cancellation before dispatch removes the weighted FIFO entry and leaves inputs
host-owned. Once posted, the entire batch is one non-preemptive worker execution.
Parent cancellation/timeout settles every logical caller but the worker continues
all remaining items unless one fails. Late results are ignored and the worker
slot is unavailable until the combined result or crash. This can multiply
worst-case occupancy by batch size and must remain visible in docs/benchmarks.
No cooperative cancellation flag is added.

Graceful shutdown completes all logical items, including ungenerated batches.
Non-draining shutdown cancels parents and terminates workers under existing rules.

## Transfer ownership implications

Input transfer lists are rejected before admission/detachment whenever configured
batch size exceeds one. A single post would otherwise detach buffers for later
items that might never execute. Batch size one preserves v0.4 transfer semantics.
Shared backing and cloned metadata are supported batching targets.

Worker-owned output transfers may be combined in one result message. If a later
item fails, earlier successfully prepared output is discarded with the failed
parent. Output ownership cannot affect caller input guarantees. Matrix benchmarks
using transferred A rows remain batch size one unless a separately labeled clone
layout is tested.

## Metrics

`dispatch.executeMessages` counts successful execute/executeBatch posts;
`resultMessages` counts received success/failure/batch result messages;
`batchedExecuteMessages` counts posts containing multiple logical items;
`logicalTasks` and `logicalPartitions` count dispatched contents. The average is
logical tasks divided by execute messages. Started messages are not included in
these two directional counters. Malformed correlation fails the worker safely.

## Alternatives

Increasing grain changes logical boundaries and load balance, so it does not
answer the message-cost question. Batching transferred inputs with a documented
eager-detachment rule remains possible but is too complex for the first experiment.
Worker-side range reconstruction would bypass factories and application payload
semantics. A specialized worker loop per algorithm would abandon registered task
uniformity. Work stealing addresses a different, unsupported bottleneck.

## Consequences

Shared/no-op fine grains can use fewer messages while retaining logical identity,
ordering and accounting. Host child Promise/UUID/Map costs still occur per item,
so speedup is bounded. Larger batches reduce dynamic distribution, increase
cancellation occupancy and may hurt fairness/skew. Applications must opt in and
cannot combine the experiment with input transfer lists.

## Revisit conditions

Remove batching if multi-session results do not beat batch size one or if fairness,
skew, event-loop or ordinary-run costs outweigh gains. Revisit transfer batching
only with a compelling workload and explicit eager-ownership contract. Any
automatic batch policy requires a later evidence-based cost model.
