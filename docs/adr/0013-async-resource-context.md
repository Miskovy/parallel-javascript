# 0013: One AsyncResource per range operation

## Context

Worker message callbacks execute in pool-owned asynchronous contexts. Node
recommends `AsyncResource` for worker pools so diagnostics can relate submitted
work to callback settlement. PJS also invokes lazy input factories after the
public call, potentially from unrelated worker-message or immediate callbacks.
Worker isolates do not automatically share main-thread `AsyncLocalStorage`.

## Decision

Make the shared host range-operation record an `AsyncResource` named
`PjsRangeOperation`. It is created at accepted-operation construction, capturing
the caller's trigger context. Invoke the lazy input factory and final
resolve/reject in its async scope. Emit destroy exactly once during terminal
cleanup.

Use one resource per parent, not per logical partition. Do not serialize an
`AsyncLocalStorage` store into worker payloads. Promise continuations retain
their normal caller context; operation callbacks see the captured host store.

## Consequences

`async_hooks` can observe one logical resource for a collecting or completion
range. Concurrent and nested stores remain isolated in host factories and after
`await`. Worker tasks see only context explicitly included in their input.

The retained 512-item micro-control measured approximately 0.0011 ms median for
one operation resource versus 0.0008 ms without a resource and 0.0248 ms for
512 per-child resources on the v0.6 measurement host. This synthetic result is
not a whole-runtime subtraction, but supports avoiding fine-grained resources.

## Alternatives

Relying only on Promise propagation would preserve many caller continuations but
would not establish a pool-operation diagnostic resource or factory scope.
Per-child resources add finer tracing at a cost proportional to logical work.
Automatic store serialization creates security, ownership, schema, and framework
coupling and was rejected.

## Revisit conditions

Add child resources only for a concrete diagnostics consumer with measured
acceptable overhead. Consider explicit, typed worker context only as a separate
opt-in design.
