# 0010: Measure logical lifecycle and physical dispatch separately

## Context

v0.4's no-op and fine-grain results showed tiny queue/kernel durations while
operation wall time increased with child count. Archived-v0.3 manual comparisons
also included version differences. Optimizing descriptor layout or replacing the
FIFO without isolating the current candidate's costs would be speculation.

## Decision

Keep logical task, operation, and partition metrics unchanged. Add experimental
physical dispatch counters for successful host execute messages, worker result
messages, batched execute messages, logical tasks transported, and logical
partition children transported. `averageLogicalTasksPerExecute` is derived.
Started acknowledgements are part of protocol traffic but are not labeled result
messages. Crashes can leave execute/result counts unequal.

Use disabled-by-default internal benchmark timing hooks for descriptor creation,
factory time, child admission, host postMessage call, worker ingress, output
preparation/result transit, main settlement, parent collection and settlement.
These timings overlap: child admission can contain direct dispatch/postMessage,
and simultaneous worker transit intervals overlap in wall time. They are stage
estimates, not additive public telemetry.

Compare timing-enabled and disabled executions. Retain uninstrumented wall time
for performance conclusions. Use current-build bounded manual production as the
coordinator control. Keep archived v0.3 results as historical context only.

Profile host CPU and run focused microbenchmarks for suspected allocations, but
require integrated evidence before changing a public contract. In particular,
keep immutable frozen public descriptors unless their small measured contribution
becomes material.

## Alternatives

Expose every timing through `stats()`: rejected because instrumentation and API
surface would become part of ordinary runtime cost before definitions mature.
Infer dispatch cost by subtracting worker kernel from wall: rejected because
transport, host work, overlap, contention, event-loop delay and JIT do not form
cleanly separable terms. Treat queue latency as total dispatch cost: rejected
because it ends before input serialization and message transport.

## Consequences

PJS can state logical work and physical messages independently. Benchmark reports
must label timing boundaries and probe overhead. The physical counters add a few
integer updates to successful dispatch/result paths; ordinary-run regression
controls must check that this and batch plumbing do not cause an unexplained
slowdown.

Node recommends AsyncResource for worker-pool diagnostics and context association.
That remains a separate future feature: adding it now would alter the measured
hot path and requires AsyncLocalStorage propagation semantics, lifecycle tests,
and its own overhead control.

## Revisit conditions

Promote selected timings only after stable user-facing definitions and negligible
disabled cost are demonstrated. Consider AsyncResource when tracing/request
context becomes a milestone, rather than coupling it to batching.
