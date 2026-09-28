# 0012: Completion-only range operations discard results in workers

## Context

`partitionRange()` retains one successful value per logical partition and every
worker success crosses the isolate boundary. Many CPU workloads instead expose
their result through disjoint shared output or an intentional side effect. A
host-side map-and-discard wrapper would still pay output allocation, clone,
transport, and range-wide retention costs.

## Decision

Add experimental `PjsRuntime.parallelFor()` with the same range, input factory,
options, bounded producer, weighted batches, failures, cancellation, deadline,
and shutdown semantics as `partitionRange()`. It returns `Promise<void>`.

Use one internal range-operation record with `collect` and `discard` result
policies. Only collecting operations allocate an indexed output array.
Completion execute messages are explicitly marked; workers await the registered
task but do not inspect or serialize its return value. They return a compact
`completed` result carrying identity and timing. Protocol version remains 2
because runtime and bootstrap are same-build internal components and the new
variant is unambiguous.

Existing task handles are reusable. Values are allowed and discarded. A
completion task should return `void`, but a new public registration/type family
does not provide meaningful runtime enforcement and would expand the API.
Returning a transfer envelope does not transfer its output buffers.

Shared mutable output is an application contract. Disjoint regions are the
recommended pattern. PJS supplies no synchronization or rollback, and completed
side effects survive later failure or cancellation.

## Consequences

Successful values never enter a worker result message or host output array.
Worker-local allocation performed by user code can still occur. Logical task and
partition metrics remain unchanged; parent operation metrics gain collecting and
completion breakdowns. Batch size and grain remain explicit.

Cancellation remains non-preemptive after posting. A batch failure can leave
effects from earlier items. Worker crashes are not retried because the host
cannot know which effects occurred.

## Alternatives

Host map-and-discard was rejected because it preserves the costs this milestone
targets. A separate `PjsForTask` was rejected as surface without enforceable
runtime safety. `parallel.for()` was deferred because one experimental method
does not justify a namespace. Protocol v3 was rejected because no compatibility
negotiation exists between same-build internal peers.

## Revisit conditions

Reconsider a completion-specific registration contract if accidental returned
allocations are common, or a `parallel` namespace when multiple mature
algorithms exist. Worker context propagation, cooperative cancellation, output
streaming, automatic batching, map, and reduce remain separate decisions.
