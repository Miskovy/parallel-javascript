# 0019: Upper-bound binary result reservations and credit refunds

## Context

Exact streams require host sizing before admission. Data-dependent encoding can
duplicate a worker scan on the main thread. v0.11 assigned credit ownership to
ResultCreditManager so evolution would remain localized.

## Decision

Add explicit experimental `experimentalMaxResultBytes` to binary `streamRange`
options, mutually exclusive with exact `experimentalResultBytes`. Reserve the
declared maximum before admission. Validate live direct owned binary output and
actual <= maximum in the worker before successful transport. Report actual
visible bytes and reconcile deliverable successes in ResultCreditManager before
stream push. Refund positive slack immediately; retain actual credit until yield.
Equal-size successes reconcile without a refund. Zero-size successes still
consume count credit. Strict shared-backed and nested results remain excluded.

Keep internal protocol v2 and its exact `expectedResultBytes` field. Add an
exclusive upper-bound contract object and optional success actual-size field.
Mixed package builds are unsupported. Physical execution ends before logical
response processing, preserving cancellation cleanup. Cancelled late successes
release at termination and never reconcile. Logical batch items reconcile in
response order; request the guarded pump after complete response settlement.

Queued cancellation releases full credit. Running cancellation, timeout, crash,
failure, skipped batch items, and shutdown keep their existing terminal ownership
paths; unsuccessful termination is release, never refund. Count and byte capacity
remain independent and per stream. No algorithms or scheduler policies change.

## Consequences

Current reserved bytes mean currently occupied credit, not the historical sum of
maxima. Refund event/byte counters and upper-bound reconciliation/failure counters
are owned by ResultCreditManager. Declaration selection belongs to RangeCoordinator;
TaskCoordinator only invokes a narrow reconciliation call. PjsRuntime changes
only its public types/overloads. No dependency direction reverses.

Conservative bounds can limit initial concurrency even when eventual output is
small. Applications must choose defensible bounds and explicit capacities.
The contract governs successful visible payload; it cannot prevent temporary
worker allocations, bound RSS or full backing allocation, or account for values
already owned by the consumer. The v0.12 benchmark report records the adoption
gate and performance limits; no automatic estimation or sizing is introduced.
