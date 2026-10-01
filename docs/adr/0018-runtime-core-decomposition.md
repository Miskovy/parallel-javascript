# 0018: Decompose the runtime core by mutable state ownership

## Status

Accepted for v0.11.

## Context

By v0.10, `PjsRuntime` implemented runtime lifecycle, logical task lifecycle,
range production and settlement, physical dispatch and batching, binary result
reservations, and the complete stats projection. The behavior was deliberate
and covered by 154 tests, stress, soak, and reservation invariants, but every
new scheduling, memory, or algorithm feature would have required reasoning
through one 2,037-line object.

The problem was architectural concentration, not missing functionality. v0.11
therefore permits no new public algorithm, scheduler policy, result semantic,
memory contract, protocol revision, or public API redesign.

## Problems observed

- Reservation correctness required simultaneous reasoning over two runtime
  maps, mutable operation fields, and aggregate metrics.
- Range policy directly selected idle workers and manipulated queue-credit
  reservations.
- Task timers, abort listeners, transfer ownership, result translation, and
  parent notification lived beside unrelated range and shutdown logic.
- Physical batching and FIFO policy were adjacent enough to be accidentally
  conflated even though ADR 0003 keeps them independent.
- `stats()` knew every private representation and encouraged correctness state
  to remain centralized.
- Reentrant transitions were correct but difficult to identify as a coherent
  model.

## State machines

The affected state machines are runtime lifecycle, worker lifecycle, logical
task lifecycle, parent range lifecycle, exact result reservation lifecycle,
transfer ownership, and stream delivery. Their complete transition maps and
ownership matrix are recorded in [the v0.11 proposal](../proposal-v0.11.md).

## Decision

Keep `PjsRuntime` as facade, composition root, runtime-lifecycle authority, and
owner of the guarded progress loop. Extract components only where independent
mutable state, transitions, and invariants exist:

- `ResultCreditManager` owns result reservations and correlations.
- `RangeCoordinator` owns parent operations and range/result policy.
- `TaskCoordinator` owns accepted logical tasks and caller settlement.
- `ExecutionDispatcher` owns admission mechanics and physical posting.
- `RuntimeTelemetry` projects compatible snapshots without correctness state.

`PjsScheduler`, `PjsPool`, `PjsWorker`, and `RangeStream` retain their existing
state ownership.

## New component boundaries

`RangeCoordinator` decides which logical partitions may be produced. It submits
children through `TaskCoordinator` and asks `ExecutionDispatcher` for bounded
physical admission claims; it never accesses worker internals.

`TaskCoordinator` validates and accepts logical tasks, owns timers/listeners and
transfer claims, translates worker results, and settles callers once. A narrow
`TaskParentPort` synchronously reports child transitions without granting task
code arbitrary range mutation.

`ExecutionDispatcher` owns idle-worker selection, reserved idle slots, queued
credit claims, weighted enqueue/dequeue, single/batch posting, and physical
metrics. `PjsScheduler` alone owns FIFO ordering policy.

`ResultCreditManager` exposes behavioral transitions rather than mutable maps.
It owns logical records, physical correlations, partition lookup, per-operation
totals, current/peak totals, and debug invariant validation.

## State ownership

```text
runtime state                 -> PjsRuntime
range operation state         -> RangeCoordinator
logical task state            -> TaskCoordinator
physical admission/dispatch   -> ExecutionDispatcher
FIFO queue state              -> PjsScheduler
result reservations           -> ResultCreditManager
stream buffer                 -> RangeStream
worker population             -> PjsPool
physical worker slot          -> PjsWorker
telemetry projection          -> RuntimeTelemetry (read-only)
```

There are zero direct reservation-map mutations outside
`ResultCreditManager`. `RangeOperation` no longer contains reservation totals
or partition reservation mappings. Task-map mutation is confined to
`TaskCoordinator`; operation-map mutation is confined to `RangeCoordinator`.

## Dependency direction

```text
PjsRuntime
  -> RangeCoordinator -> TaskCoordinator
                      -> ResultCreditManager
                      -> RangeStream
  -> TaskCoordinator  -> ExecutionDispatcher
                      -> ResultCreditManager
  -> ExecutionDispatcher -> PjsScheduler
                         -> PjsPool -> PjsWorker
                         -> ResultCreditManager
  -> RuntimeTelemetry (read-only component snapshots)
```

No component receives `PjsRuntime`. Composition-root closures route pool events
and the narrow parent port. There is no service locator or generic event bus.

## Reentrancy model

The facade retains the existing guarded pump: dispatch queued work, produce a
bounded range window, dispatch newly queued work, then check draining. Nested
pump requests return immediately. One range-owned immediate continues
production after the synchronous budget.

Factories may call `runtime.run()`. Abort may occur inside transfer-list or
structured-clone getters. Task settlement may finish a parent synchronously;
parent settlement may cancel siblings synchronously. Stream callbacks and pool
callbacks may request progress. No extraction inserts Promise or event-loop
layers, so AsyncResource, AbortSignal, timer, and stack timing remain unchanged.

## Alternatives rejected

- Splitting methods into utility files: no improvement in mutation authority.
- Passing the runtime facade or a `RuntimeContext`: preserves the god object
  through indirection.
- Generic event emitter/pub-sub: hides transition order and reentrancy.
- Generic operation manager or per-result strategy classes: abstractions without
  independent mutable state.
- Merging FIFO into dispatch: erases scheduler policy separation from ADR 0003.
- Making range operations own workers: combines logical policy and physical
  execution mechanism.
- Replacing references with IDs everywhere: adds lookups and missing-record
  states without improving current lifetimes.

## Performance implications

The decomposition retains direct synchronous calls, existing Promise counts,
mutable data-oriented records, protocol v2, and zero runtime dependencies. It
adds no transition/event object per lifecycle step. Component calls add ordinary
method dispatch only. v0.11 retains before/after raw benchmark samples and uses
a five-percent investigation threshold for meaningful medium/large workloads;
small no-op variance is reported rather than normalized.

## Consequences

`runtime.ts` falls from 2,037 to about 400 lines and its mutable fields represent
only composition/runtime lifecycle/pump state. The range coordinator is still a
substantial concrete engine because its four result policies share one parent
lifecycle; splitting it by line count would reduce locality. Internal tests can
exercise reservation transitions directly. Public APIs, public types, error
classes/context, cancellation, worker occupancy, transfer, streaming, mapping,
binary reservation, shutdown, and stats semantics remain unchanged.

## Future extension points

- Upper-bound/refund result declarations primarily change
  `ResultCreditManager`, with narrow range and worker-validation hooks.
- Adaptive grain sizing changes range planning/production.
- Work stealing changes scheduler and dispatch ownership.
- Cooperative cancellation changes task execution protocol, workers, and task
  coordination.

None of these features is implemented by this decision.

## Revisit conditions

Revisit the boundaries if a component no longer owns an independent invariant,
if a new backend requires a typed execution port, or if measured call/lookup
cost creates a causal regression. Do not merge or split components solely to
hit a line-count target.
