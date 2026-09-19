# 0002: Fixed persistent population and one execution per worker

## Context

CPU tasks benefit from amortized isolate startup. Concurrent async invocations on one worker obscure CPU capacity and cancellation semantics. Crashes must not create an unlimited respawn loop.

## Decision

Select a fixed population within min/max bounds, defaulting to availableParallelism. Keep workers alive. A worker has exactly one execution slot. A failed thread exits before a replacement is created. Fatal bootstrap errors and a lifetime restart budget bound recovery. Never retry an interrupted task automatically.

## Alternatives

- Spawn per task: startup dominates small tasks and makes resource bounds harder.
- Elastic population: defer until idle/startup measurements justify lifecycle complexity.
- Multiple concurrent tasks per worker: useful for some I/O mixes, contrary to this CPU milestone.
- Unlimited restart/retry: risks crash loops and duplicate side effects.

## Consequences

Startup and steady-state are measurable separately. Logical CPU count can overestimate useful parallelism; callers can configure fewer workers. Cancellation does not free an active slot until execution ends. Queued work survives recoverable crashes; exhaustion fails the runtime. Resource limits and per-worker initialization hooks remain future work.
