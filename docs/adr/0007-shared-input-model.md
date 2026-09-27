# 0007: Native shared backing with explicit construction

## Context

v0.2 transfers avoid message copies but still prepare a right-hand matrix per
worker. Native SharedArrayBuffer messaging already shares backing bytes through
the existing transport. See the [v0.3 proposal](../proposal-v0.3.md).

## Decision

Provide `sharedReadonly(source)` for Uint8Array, Int32Array, Uint32Array,
Float32Array and Float64Array. Copy the visible bytes once into a fresh,
fixed-length SAB, preserving element kind and exact bits, with offset zero.
Return a native typed array whose TypeScript buffer type is SharedArrayBuffer.
Never invoke a source constructor or preserve subclasses. Buffer inputs become
Uint8Array. Empty views are valid; invalid types and detached views throw
TypeError. Allocation errors propagate. Already shared sources are copied too;
pass an existing SAB/view directly to tasks to reuse it without another copy.

Read-only is a PJS usage contract, **not enforced memory protection**, a type
system guarantee, or hostile-code isolation. No participant may write after
publication. The source must be stable during construction. Native views and
aliases remain writable; incorrectly implemented tasks can corrupt shared data.

Objects around views are structured-cloned metadata. Backing bytes are shared
without detachment; ArrayBuffer transfer lists keep their independent ownership
rules and continue rejecting SAB. No scheduler, protocol, task settlement,
registry snapshot, transfer reservation or worker readiness changes are needed.

Use native GC lifetime. Application references, queued inputs and active worker
views keep storage alive; tasks can also retain references in module globals.
There is no dispose, revocation or guaranteed immediate reclamation. Cancellation
settles a caller without ending active access. A read-only input survives a
crash; the replacement receives its reference in the next ordinary task message,
so no resource replay or extra readiness phase exists. Crashes cannot roll back
contract-violating writes. Graceful shutdown drains late executions as before.

`maxQueue` bounds waiting compute jobs, not shared allocation bytes. Construction
is synchronous application work outside admission, never a hidden compute job.
Keep byte accounting in benchmarks: arbitrary clone payload sizes and unique
shared-byte residency cannot be inferred accurately from run() inputs.

## Alternatives

- Native passthrough only: sufficient transport, but lacks discoverable
  construction, compact copies, typed backing and a common usage contract.
- Runtime-managed resources: IDs, reference counts and disposal could support
  future budgets, but require queued/active lifetime rules and replacement
  synchronization without demonstrated benefit here.
- Proxy/frozen typed arrays: do not enforce backing-store immutability and
  interfere with native methods and structured clone. Avoid false guarantees.
- General object sharing and synchronization primitives: a different problem;
  partition mutable outputs and share immutable inputs instead.

## Consequences

One allocation/copy is explicit and measurable, with no per-dispatch graph walk.
All isolates can reuse the same bytes. Small and compute-bound workloads may
not benefit. Applications own memory budgets and mutation discipline. Native
SAB accepts other view kinds without expanding the helper's initial surface.
Future partitioners can reference this same view in every chunk without copies.

## Revisit conditions

Reconsider a registry only when measured metadata costs, resource budgets,
worker initialization or explicit revocation justify its lifecycle protocol.
Expand constructors in response to actual kernels. Revisit partitioning after
the clone/transfer/shared measurements; do not couple this design to work
stealing, mutexes or public parallel algorithms.
