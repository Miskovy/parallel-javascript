# ADR 0022: Separate runtime API adaptation, composition and lifecycle

## Status

Accepted for S1. Supersedes only the facade/composition/lifecycle/pump colocation
decision and rejection of this targeted functional extraction in
[ADR 0018](0018-runtime-core-decomposition.md). All other ownership, construction,
reentrancy and physical completion guarantees remain in force, including
[ADR 0021](0021-physical-execution-containment.md).

## Context

The public facade still mixed option normalization, graph wiring, API adaptation
and runtime lifecycle algorithms. Stream normalization lived beside accepted
parent operations. Changes to an individual API therefore required navigating
unrelated construction and lifecycle decisions. The approved scope separates
these reasons for change while preserving the current public contract.

## Decision

`PjsRuntime` retains prototype methods, explicit public signatures and overloads,
and direct synchronous delegation. It stores one private component reference,
with no duplicated state or compatibility fields. `ready()` and `shutdown()`
return the controller's original shared promises, without async wrappers.

| Boundary                                          | Responsibility                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `configuration/runtime-options.ts`                | Scalar constructor validation and defaults                                                                |
| `composition/create-runtime-components.ts`        | Registry snapshot, complete graph construction and callback wiring                                        |
| `lifecycle/runtime-controller.ts`                 | Runtime state, ready/shutdown promises, pump guard, drain waiter, escalation timer and fatal coordination |
| `api/run.ts`                                      | Ordinary submission through a small typed capability                                                      |
| `api/range/partition-range.ts`, `parallel-for.ts` | Collecting/completion mode adaptation                                                                     |
| `api/range/parallel-map-range.ts`                 | Map overloads, constructor selection and typed forwarding                                                 |
| `api/range/stream-range.ts`                       | Stream overloads, count/byte normalization and stream construction                                        |
| `api/range/contracts.ts`                          | Range submission and stream accounting capabilities                                                       |
| `partition/validation.ts`                         | Stateless shared request validation                                                                       |
| `partition/results/map-assembly.ts`               | Block validation and copying into the caller-owned target                                                 |

The run capability lives beside its adapter rather than in range contracts,
because ordinary submission has no range dependency. No new module becomes a
package entrypoint or supported inspection API.

The builder alone constructs the full graph. Constructors remain passive and
store narrow callbacks; those callbacks refer to their actual owners. After all
owners, telemetry and stream capabilities exist, the builder starts workers in
the same constructor turn. No microtask defers startup. Scalar option reads,
registry snapshot and queue getter order remain unchanged. Options and factories
may execute application code, so validation is not moved across admission,
runtime-state checks or accounting transitions.

One controller owns all runtime lifecycle state and timers. Its guarded pump
still dispatches queued work, produces a bounded range window, dispatches newly
queued work, and checks draining. Range continuation scheduling remains with
`RangeCoordinator`; there is no second pump or scheduler.

API adapters accept typed submission/accounting capabilities, never the facade
or a general runtime context. Calls remain synchronous. Stream rejection
accounting remains in the coordinator and credit owner, including the original
order relative to reentrant property checks. Map assembly accepts only the
operation identity, partition, block and constructor for validation, and the
target/range offset for copying. Validation returns the existing block without
allocating a wrapper. The coordinator reads its target only after validation:
a result constructor getter can synchronously abort the parent and clear that
target. Capturing it earlier changes assembly counters after cancellation.
The helpers do not own counters, parent records or resource release. The
coordinator records assembly time and successful block counts and settles failures.

## Retained invariants

`RangeCoordinator` owns accepted parent records, AsyncResource scope, bounded
lazy production, child relations and terminal settlement. Parent state becomes
terminal before sibling cancellation. `TaskCoordinator` owns logical tasks;
`ExecutionDispatcher` owns admission and posting claims; the scheduler owns FIFO
ordering; `ResultCreditManager` owns credit transitions. Pool, worker and stream
ownership remain unchanged.

Logical cancellation or timeout does not free physical occupancy. Only a validated
final response or confirmed exit ends a correlation. Replacement waits for old
exit, no task is replayed, abnormal completion creates no refund, and termination
rejection cannot release physical credit or report successful shutdown. Clone,
transfer and shared input semantics are unchanged.

## Verification and consequences

Existing exact private observations move through a test-side inspection adapter
to the real owners. Shutdown clock patches target the controller. The independent
R2 model, generator, histories, negative detection, real-worker cases and watchdogs
are unchanged. R3 instrumentation binds actual coordinators and retains numeric
sampling without caching retired workers. Focused tests cover construction/read
ordering, API mode adaptation, promise identity and assembly. Installed-package
qualification still checks ESM, worker URLs and unrelated working directories.

No generic bus, DI container, class hierarchy, new scheduling layer or per-task
graph closure is introduced. Validation adds a short-lived normalized request
record per parent; no payload is included. Stream capabilities are created once
per runtime. No optimization or speedup is claimed.

Public API correction and feature promotion remain separate work: the stream's
AsyncIterable typing, shared-backed binary typing, registry snapshot declaration
leak and named statistics interface are deliberately preserved. Versions,
dependencies, protocol and frozen RC4 evidence remain unchanged. Qualification
and limitations are recorded in the [S1 engineering report](../research/s1-runtime-api-boundaries.md).
