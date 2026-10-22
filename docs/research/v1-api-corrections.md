# Stage B: proposed API corrections

**Specification for review, not an implemented API.** Selected source and current
contracts are in the [canonical inventory](v1-api-contract-inventory.md). These
four units follow approval of [ADR 0023](../adr/0023-v1-api-stability-decisions.md)
and integration of S1. Each needs its own review, committed candidate identity,
contract results and installed-package JS/TS evidence. No version is selected here.

## Verified gaps and evidence

Stage A built the selected S1 source with locked TypeScript 7.0.2 and inspected
declarations with locked TypeScript 6.0.3. Focused probes under both compilers
confirmed: direct `stream.return()` produces TS2339; assigning an explicitly
`SharedArrayBuffer`-backed Uint8Array to current `PjsBinaryResult` compiles; and
`registry.snapshot()` compiles. A real worker returning that shared-backed view
in strict exact-byte stream mode fails with `PjsBinaryResultContractError`.
Proposed ordinary-backed unions accept positive owned views and reject explicit
shared-backed views under both compilers. The proposed B1 interface and direct
cleanup/iteration consumers also compile under both locked compilers. These ignored probes substantiate the
gaps and type design; they are not installed-package acceptance for unimplemented B.

## B1: closeable stream contract — implement first

Propose the following **new, unavailable until B1** root type; both existing
`streamRange` overloads return `PjsRangeStream<Output>`. Their parameters, overload
order, eager execution and adapter delegation remain unchanged.

```ts
export interface PjsRangeStream<Output> extends AsyncIterableIterator<
  StreamRangeResult<Output>,
  undefined,
  void
> {
  next(): Promise<IteratorResult<StreamRangeResult<Output>, undefined>>;
  return(): Promise<IteratorResult<StreamRangeResult<Output>, undefined>>;
  throw(
    error?: unknown,
  ): Promise<IteratorResult<StreamRangeResult<Output>, undefined>>;
  [Symbol.asyncIterator](): PjsRangeStream<Output>;
}
```

Make `RangeStream` implement this interface and narrow its self-iterator return
annotation. Do not export the implementation class, introduce an async facade,
defer startup until first read, or add an extra parent state owner. The generic
parameter describes output, not a nested iterator result. Root-export
`CountOnlyStreamRangeOptions` intentionally, preserving its current exclusions.

| Action / condition                        | Required behavior, matching current implementation                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation                                  | Eager submission/production, even before first `next()`. Empty range is a valid completed stream. Invalid request is normally a failed iterator rather than a synchronous throw; arbitrary application getters retain the inventory's caveats                                      |
| `next()`                                  | Completion-order delivery of `{ partition, output }`; buffered result consumed first. One pending waiter when no buffered result is available                                                                                                                                      |
| Concurrent reads                          | Reject a second read that would install another waiter with ordinary Error; first waiter remains valid. Buffered reads may each complete immediately. No new fairness, multicast or reader identity detection                                                                      |
| Self-iteration                            | `[Symbol.asyncIterator]()` returns this same object. One consumer by contract; two sequential iterator acquisitions cannot be reliably identified as different consumers                                                                                                           |
| Full consumption                          | Natural completion returns `{ value: undefined, done: true }`. Delivery acknowledgement releases delivery-owned credit; consumer-retained values are outside credit accounting                                                                                                     |
| `break` / explicit `return()`             | `for await` invokes required cleanup on break. Before terminal state, mark closed, discard buffer, clear callback/waiter references, resolve pending read as done, cancel parent synchronously. Return promise fulfills done without waiting for physical workers                  |
| Repeated `return()`                       | Fulfill done every time; no repeated cancellation. Promise identity is not shared. Ignored JavaScript arguments are not meaningful return values                                                                                                                                   |
| Producer failure, cancellation or timeout | Clear buffer and references; pending and future reads reject the original terminal Error. Error identity preserved. `return()` after failure fulfills done but does not erase that sticky error: later `next()` still rejects it                                                   |
| `throw(error?)` before terminal state     | Required public method. Normalize non-Error as `new Error(String(error))`, clear buffer/references, reject pending read with that reason, cancel parent, reject the `throw()` promise with same reason. Future `next()` is done; supplied reason is not stored as producer failure |
| `throw()` after terminal state            | Reject with this call's normalized reason, without another cancellation. Existing producer failure remains sticky for `next()`. Repeated throw calls need not share reasons or promises. A throwing `String` conversion can still synchronously throw                              |
| Abandonment                               | Dropping the reference does not cancel. Use `try/finally` with explicit `return()` if not fully consuming. Graceful shutdown can wait indefinitely for abandoned delivery unless escalation is configured                                                                          |

Close/cancel can settle a parent while posted children still occupy workers and
hold byte reservations. Only validated final responses or confirmed exit release
physical ownership; `await stream.return()` is not that barrier. `shutdown()` is
the runtime cleanup barrier and can reject if confirmed termination fails.
Preserve range AsyncResource scope and ordinary Promise continuation context.

Affected code: root exports, facade/stream adapter annotations, stream type and
implementation self annotation, consumer fixtures/docs. Required acceptance:

- Installed JS and both locked TS consumers directly call required `return()`
  and `throw()` without non-null assertions or casts; `for await` still works.
- Real-worker full consumption, break, explicit close before first read, close
  with pending read, external abort/deadline, producer failure then return/read,
  repeated return/throw, and concurrent pending reads assert the table above.
- Close leaves no buffered payload/factory/listener references; physically held
  credits remain until response/exit. Existing physical-boundary, stream, memory
  lifecycle and async-context assertions pass; no unconditional GC timing test.
- Existing callers assigning to `AsyncIterable` remain assignable. Public method
  prototype/receiver and eager start tests pass. No changed error or cleanup order.

This adds usable type information without a behavioral change. A cleaner throw
protocol is a bounded alternative, but would change current pending-read/failure
semantics; reject that alternative for B1 and review it separately if requested.

## B2: ordinary-backed strict binary outputs

Keep `PjsTypedArray` and `PjsTypedArrayConstructor` shared-capable for inputs and
mapping. Strict binary result validation already forbids shared backing. Propose
new root `PjsOwnedTypedArray` and narrow existing `PjsBinaryResult` as follows:

```ts
export type PjsOwnedTypedArray =
  | Int8Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Uint8ClampedArray<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int32Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Float32Array<ArrayBuffer>
  | Float64Array<ArrayBuffer>
  | BigInt64Array<ArrayBuffer>
  | BigUint64Array<ArrayBuffer>;
export type PjsBinaryResult =
  ArrayBuffer | PjsOwnedTypedArray | DataView<ArrayBuffer>;
```

"Owned" here means ordinary backing permitted by the output contract. It does
not prove unique references or transferability. Clone remains default; an
ordinary-backed output view may cover a larger backing store than visible bytes.
No automatic output transfer is added. `transfer()` retains its separate live,
unique, transferable-buffer checks. Buffer or widened generic view types are
accepted only when their ordinary backing is established; do not promise every
Node Buffer's generic declaration or backing to satisfy this constraint.

Root-export existing `ResultByteDeclaration` intentionally; keep
`number | ((partition: RangePartition) => number)`. No async callback or per-task
context wrapper. Both strict stream option shapes, worker validation, exact and
upper-bound reconciliation, per-stream capacity and error classes remain intact.
Unknown/JavaScript payloads retain all runtime kind/backing/liveness/visible-size
checks. No TypeScript cast can bypass a runtime check. Count-only streams still
allow generic cloned outputs, including shared-capable views.

This is a deliberate pre-v1 type narrowing. A consumer with `Uint8Array` widened
to `ArrayBufferLike` may need an inferred `new Uint8Array(...)`, an explicit
`Uint8Array<ArrayBuffer>` output schema, or a copy to ordinary backing. Shared
output consumers must copy, use count-only mode without byte guarantees, or stay
on the earlier prerelease. Do not narrow shared-readonly input or mapping types.

Affected code: range output types/root exports, strict overload consumers,
installed TS fixtures, ownership/binary docs. Acceptance under both compilers:

- Positive ArrayBuffer, all eleven ordinary-backed typed views, offset subviews,
  DataView, zero-byte outputs and ordinary transfer envelopes at actual worker
  boundaries. BigInt arrays are included. Validate worker direct/transfer paths.
- Negative explicitly SAB-backed typed arrays and DataView, direct SAB, object
  graphs and async declaration callbacks using targeted `@ts-expect-error`.
  Ordinary/shared-capable mapping and sharedReadonly inputs still typecheck.
- Installed JS bypassing TS is rejected for direct and wrapped shared-backed
  outputs, wrong sizes/kinds, detached invalid values and maximum overrun. Validate
  exact equality, upper-bound refund, zero capacity, callback reentrancy,
  cancellation during reconciliation and physical retention after failure/exit.
- Existing binary-result, upper-bound-result, result-credit, transfer and
  physical-boundary suites pass. No accounting, validation-timing or byte-unit change.

## B3: remove the registry composition leak

Recommend module-private WeakMap storage keyed by actual registry instance.
`register()` and an internal module-exported function
`snapshotRegistry(registry: PjsTaskRegistry): ReadonlyMap<object, TaskDescriptor>`
share that storage; only composition imports the function. Initialize storage in
the registry constructor. The internal accessor rejects an instance absent from
the WeakMap with TypeError; test that guard in B3. Forged/borrowed registration
receivers remain unsupported and must fail without exposing storage. Do not add a public symbol.
Retain public registration validation timing and error identities.

Remove public prototype `snapshot()` and its declaration. Preserve identical
frozen task handles as map keys, distinct copied maps/descriptors per snapshot,
and constructor-time snapshot isolation from later registrations. Keep the
descriptor an internal registry/composition/worker concern. Preserve constructor
normalization → snapshot → queue getter → full graph → synchronous start order.

This is an explicit unsupported pre-v1 JS and TS removal. Existing unsupported
introspection callers must keep their own registration metadata; provide no alias
that leaves the leak public. A package export map alone cannot hide a class
method. No global `stripInternal`: it could erase types still reachable from
supported signatures. The internal helper may appear in its module declaration
and packed JS; it must not be root-exported or root-reachable. Absolute-path
inspection is technically possible and remains unsupported, not secure isolation.

Acceptance: installed TS rejects `registry.snapshot()` and root TaskDescriptor
imports; installed JS verifies `typeof registry.snapshot === 'undefined'` and
supported root keys exclude helper/storage. Register-before/after-construction,
duplicate/invalid modules, same-ID handles from different registries, copied
descriptor mutation, replacement bootstrap and S1 reentrant constructor order all
retain behavior. Internal tests may import the helper by repository-relative
path. Registry registration JS/TS consumers still work. Review the intentional
prototype/declaration removal explicitly in the API diff.

## B4: explicit diagnostic and error contracts

Retain every `STAT.*` field with the types, optionality, units, owner and lifetime
in the inventory; retain streams/maps and buffered-byte aliases. Do not narrow
active statuses, make copies readonly, replace optional mode fields with a new
discriminated union, or promise terminal history. Explicitly declare these new
root interfaces/types in a focused public contract module (not the projection
implementation), with imports flowing toward it:

| Proposed name                                        | Exact shape rule                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PjsRuntimeStats`                                    | state: RuntimeState; containment: PjsContainmentStats; workers: PjsWorkerStats; queue: PjsQueueStats; tasks: PjsOutcomeStats; timing: PjsTimingStats; operations: PjsOperationStats; streams/maps: PjsOutcomeStats; streamResults: PjsStreamResultStats; mapResults: PjsMapResultStats; partitions: PjsPartitionStats; dispatch: PjsDispatchStats; activeTasks: TaskSnapshot[]; activeOperations: PjsOperationSnapshot[] |
| `PjsOutcomeStats`                                    | accepted, rejected, pending, completed, failed, cancelled, timedOut: number; logical caller/parent meanings by container                                                                                                                                                                                                                                                                                                 |
| `PjsContainmentStats`                                | Seven exact `containment.*` inventory fields; restartWindowUtilization is required number \| undefined, a count rather than fraction                                                                                                                                                                                                                                                                                     |
| `PjsWorkerStats`                                     | total, busy, idle, starting, failures, restarts: number; details: WorkerState[]                                                                                                                                                                                                                                                                                                                                          |
| `PjsQueueStats`                                      | size, capacity: number                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PjsTimingStats`                                     | All six `timing.*` fields: number; means zero for no own samples                                                                                                                                                                                                                                                                                                                                                         |
| `PjsOperationStats`                                  | PjsOutcomeStats plus capacity: number and collecting/completion/streaming/mapping: PjsOutcomeStats                                                                                                                                                                                                                                                                                                                       |
| `PjsStreamResultStats`                               | All seventeen `streamResults.*` fields: number, exact spellings and distinct meanings retained                                                                                                                                                                                                                                                                                                                           |
| `PjsMapResultStats`                                  | blocks, elements, assemblyMs: number                                                                                                                                                                                                                                                                                                                                                                                     |
| `PjsPartitionStats`                                  | generated, admitted, completed, failed, cancelled: number; no invented timedOut count                                                                                                                                                                                                                                                                                                                                    |
| `PjsDispatchStats`                                   | All six `dispatch.*` fields: number                                                                                                                                                                                                                                                                                                                                                                                      |
| `PjsOperationSnapshot`                               | All 28 `activeOperations[].*` fields and exact optionality in inventory: fixed plan/identity/status/mode and child counts; optional stream/map metrics; typedOutput remains string \| undefined when map property present                                                                                                                                                                                                |
| `PjsOperationStatus`, `PjsRangeResultMode`           | Intentionally root-export current OperationStatus and RangeResultMode vocabularies with these public names; no narrower active-only vocabulary                                                                                                                                                                                                                                                                           |
| Existing `TaskSnapshot`, `WorkerState`, status types | Preserve every member/type/optional marker from inventory and current mutability; no new physical task history                                                                                                                                                                                                                                                                                                           |

Annotate `stats(): PjsRuntimeStats` at the facade, with the telemetry projection
structurally checked against that explicit type. Define each numeric property in
source, not a mapped type over ReturnType or a copied opaque inferred alias.
Use the inventory to review public fields; do not expose internal reservation
debug graphs, Worker objects, payloads, clocks or cancellation callbacks.

For errors, intentionally root-export `PjsErrorContext` and
`PjsBinaryResultErrorContext` matching the two current reachable interfaces.
Add `PjsTaskErrorDetails { name: string; message: string; stack?: string }` for the
current inline task-error constructor record. Rename internal references or use
explicit aliases with full reviewed definitions; do not export worker protocol
types. Preserve current constructor defaults/required context, hierarchy,
`instanceof`, concrete names, cause unknown, six readonly possibly-undefined
instance context fields and class-specific byte/remote fields. Native Error's
optional stack/cause remain platform properties. Context key presence never
implies every subclass copies all byte keys. No message/stack text freeze.

There is no deliberate diagnostic removal/narrowing in B4. The deliberate
changes across B are B2's backing constraint, B3's unsupported method removal,
and intentional new root type names; record these separately from additive B1/B4.

Acceptance: installed TS imports each intended name and constructs each error;
checks required versus optional/undefined fields, all status unions and readonly
error fields, writable defensive diagnostic copies, and unknown cause narrowing.
Installed JS checks error inheritance/name/metadata and snapshot isolation.
Behavior tests assert lifecycle counter transitions, zero-sample means, alias
equality, map validated-copy counts versus child completion, byte wait/refund/peak
units, optional mode fields, replacement lifetimes and caller-vs-physical
divergence. Use synchronized real-worker events for ownership and existing bounded
R2/R3 campaigns at promotion/final qualification, not sleeps or performance bounds.

## Review order and shared exits

B1 is first and independent of B2/B3. B2 can follow B1; B3 can be reviewed
separately. B4 consumes the approved inventory and B3 removal. Each change runs
build, contract tests applicable to affected ownership, both compiler consumers,
installed package smoke, lint, format, docs and diff checks. Review emitted
source/declaration/root graph differences against the named unit; expected API
changes mean historical RC4 exact freeze is not the semantic acceptance oracle.
Do not alter RC4 baselines to turn those checks green.

C1 containment can follow B4 independently of C2/C3. C2 requires B1/B3/B4; C3
requires B1/B2/B4 and C2 option-normalization conventions. Promotion and evidence
requirements are in the [C migration plan](v1-api-migration-plan.md). Stop for a
new design decision if implementation needs behavior beyond this specification.
