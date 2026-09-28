# 0008: Main-thread range operations over the existing FIFO

## Context

v0.3 applications divide ranges and assemble Promise lists themselves. Shared
inputs solve backing-store reuse, not range ownership, ordered collection or
parent/child cancellation. The [proposal](../proposal-v0.4.md) defines the
execution contract before the experimental API.

## Decision

Provide experimental `partitionRange(task, range, createInput, options)` for
safe-integer half-open ranges and explicit positive grainSize. The main isolate
owns the parent and generates immutable index/start/end descriptors lazily.
A synchronous host factory prepares each task payload and optional transfer
list only when capacity is available. No factory closure is sent to a worker.
Children execute ordinary registered tasks on the unchanged central FIFO.

Each operation maintains a window of at most worker-count unsettled children,
also constrained by global admission. Eligible producers rotate round-robin;
already queued tasks preserve FIFO dispatch order. The parent occupies no
worker. Worker-created operations are rejected, avoiding nested pool starvation
without attempting general nested structured parallelism.

Return outputs by logical partition index, not completion order. Empty ranges
return an empty array without invoking the factory. The result array grows as
children complete; neither descriptors nor child Promises are preallocated for
the whole range. Reject more than 2^32-1 results, the JavaScript array limit.
Collected result bytes are not bounded by maxQueue.

The first observed child/factory failure stops production, cancels sibling
callers and rejects the parent once. Running workers keep their slots and late
outputs are discarded. Existing worker errors keep their classes and gain
operation/partition context; local factory errors preserve their cause.
There are no retries or failure-driven worker terminations.

One signal and end-to-end deadline cover startup, production, queueing and
execution. Timers and elapsed-time checks at production/settlement boundaries
enforce that budget; synchronous factories cannot be preempted. Graceful
shutdown finishes the entire accepted range, including ungenerated chunks.
Non-draining shutdown cancels parents before terminating workers. Terminal
operations release factories, collected outputs on failure, timers and listeners.

## Alternatives

- Eager Promise.all: loses bounded production and creates hidden waiting work.
- Parent worker awaiting children: can exhaust all execution slots and deadlock.
- Stable parallel.for/map/reduce: premature API and aggregation commitments.
- Requested chunk count: adds rounding semantics; callers can derive a grain.
- Adaptive splitting/work stealing: would confound the static-grain experiment.
- Shared resource registry: native SAB references already serve every chunk.

## Consequences

Applications retain control of payload layout while PJS owns division, admission,
ordering and lifecycle. Mix shared common input, compact owned transfers and
cloned metadata intentionally. Payload factories should be short, synchronous
and side-effect-conscious. A factory may run before a child ultimately cancels;
already transferred ownership cannot be rolled back. See [admission and metric
semantics](0009-partition-admission-and-metrics.md).

## Revisit conditions

Use uniform/skewed grain studies to evaluate window size and future public APIs.
Investigate batching or guided redistribution only if measurements justify it.
Streaming collection, reduction and nested scope ownership require separate
contracts, especially when outputs or execution dependencies are large.
