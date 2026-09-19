# 0003: Central bounded FIFO with explicit removal

## Context

Scheduling must evolve independently of worker transport. Backpressure and cancellation require an actual bounded queue with efficient removal, not an accumulating list of cancelled entries.

## Decision

A scheduler interface exposes enqueue, next(worker snapshot), remove(taskId), size, and capacity. Use an insertion-ordered Map for initial FIFO. The runtime coordinates idle workers and selected tasks; the pool owns no tasks. If the queue is empty, direct admission to an idle slot bypasses waiting capacity.

## Alternatives

- Array shift/splice: simple but increasingly expensive as the queue grows.
- Ring buffer with tombstones: fast FIFO but cancellation can retain dead records without extra compaction.
- Priorities, affinity, work stealing: introduce policy and synchronization before evidence.

## Consequences

Waiting count never exceeds maxQueue. Priority/fair scheduling can preserve transport and lifecycle boundaries. Distributed work stealing additionally needs ownership transfer, global capacity accounting, and atomics; it is not implemented by swapping the FIFO class alone. No public scheduler-injection API is promised in v0.1.
