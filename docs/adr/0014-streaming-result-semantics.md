# 0014: Bounded completion-order range streams

## Context

Collected partition output retains every successful value until parent success.
Completion-only work avoids values entirely, but some pipelines need results and
can consume them incrementally. An unbounded async iterator would only relocate
the retention problem.

## Decision

Add experimental `streamRange()` returning an `AsyncIterable` of
`{ partition, output }` in completion order. `experimentalMaxBufferedResults`
counts logical completed plus reserved in-flight results independently of
`maxQueue`. When credits are exhausted, stream production pauses; completed
workers remain free for other operations.

Iterator `return()` cancels remaining work. Producer failure preserves already
yielded values, discards buffered values, and rejects future iteration. One
deadline includes consumer waiting. Graceful shutdown includes result delivery
and can wait indefinitely for an abandoned iterator that was not closed.

Output transfers retain existing ownership: the host buffer owns a value until
yield, then drops its reference. Shared views remain shared. Only completion
order is supported; ordered streaming can accumulate arbitrarily many later
results behind one slow partition.

## Consequences

Memory is bounded by logical result count, not bytes. Item count cannot predict
arbitrary structured-clone graph size. Partial successful output is observable
and cannot be rolled back. Batch admission consumes one result credit per item.
Slow consumers may leave pool capacity idle, improving memory bounds rather than
occupying workers after computation.

`partitionRange()` remains the ordered collected-chunk API. No map API is added:
PJS produces one result per partition, and naming that element map would be
misleading.

## Revisit conditions

Consider ordered delivery only if measured consumers accept its head-of-line
memory cost. Consider element map only with an explicit block-flattening/shared
output contract. Byte-based bounds require a reliable measurable definition.
