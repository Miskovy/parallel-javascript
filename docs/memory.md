# Clone, transfer, and reusable shared input

v0.11 preserves the v0.10 memory contract. The refactor moves exact binary
result-credit state into `ResultCreditManager` and task input transfer claims
into `TaskCoordinator`; it does not change clone, transfer, shared backing,
detachment, or reservation timing.

| Model    | Backing storage                          | Ownership                               | Typical use                                         |
| -------- | ---------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Clone    | One copy per receiving task/isolate      | Independent data                        | Small messages and simple ownership                 |
| Transfer | Dedicated ArrayBuffer moves at dispatch  | Sender detaches; receiver becomes owner | Large input the sender no longer needs              |
| Shared   | One SAB backing store, many native views | All participants retain access          | Large immutable reference data reused by many tasks |

```text
CLONE       B ──copy──> W1[B]     B ──copy──> W2[B]
TRANSFER    B1 ──move─> W1[B1]   B2 ──move─> W2[B2]
SHARED                  [shared B]
                         ↑     ↑
                         W1    W2
```

Transfer avoids message copies after preparation; it does not let several
workers own the same ArrayBuffer. Sharing does. Objects enclosing shared views
still undergo structured clone. The receiver gets native wrappers over the
same backing bytes, not the sender's arbitrary objects or prototypes. SAB
cannot appear in a transfer list. See [Node's messaging contract](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist).

## Construct once, read many times

```ts
import { sharedReadonly } from '@pjs/runtime';

const b = sharedReadonly(new Float64Array([1, 2, 3, 4]));
// b: Float64Array<SharedArrayBuffer>
const results = await Promise.all([
  runtime.run(matrixRows, { a: leftRows1, b, size: 2, rows: 1 }),
  runtime.run(matrixRows, { a: leftRows2, b, size: 2, rows: 1 }),
]);
// b remains accessible and reusable. Each result is independent.
```

`sharedReadonly` accepts Uint8Array, Int32Array, Uint32Array, Float32Array and
Float64Array. It allocates a fixed-length SAB and copies exactly the supplied
view's visible bytes, preserving bit patterns and element kind. The result has
offset zero; the original stays attached and independent. Buffer becomes
Uint8Array; subclasses become the corresponding built-in view. Empty views are
valid. Unsupported inputs (including raw buffers, DataView and object graphs)
and detached sources throw TypeError; allocation failures propagate. A source
already backed by SAB is copied too. Pass existing SAB or SAB-backed views
directly through `run()` for allocation-free reuse; other native view kinds
also work through that native path.

**Read-only is a PJS usage contract, not enforced protection.** JavaScript and
TypeScript native views remain writable. A malicious or incorrectly implemented
worker can mutate these bytes through any alias. PJS does not isolate hostile
code. Do not use this feature to distribute secrets to untrusted tasks.

Finish initialization before dispatch and never write or grow published input.
The construction source must be stable while copying; copying concurrently
written shared data is not an atomic snapshot. Keep mutable outputs private to
each task, optionally returning them with `transfer(output, [output.buffer])`.
Ordinary owned input buffers can be transferred alongside shared views.

## Lifetime and failures

Native GC controls lifetime. The application, queued tasks and active worker
views retain access; module globals may retain it longer. PJS has no shared
resource registry, dispose, revocation, reference-count API or immediate release
guarantee. Dropping one reference does not detach anyone else's view.

Cancellation or timeout settles the caller, but a running task can continue
reading until it returns or crashes. Do not repurpose shared input on promise
rejection. Graceful shutdown waits for these executions; non-draining shutdown
terminates workers. The application's shared view remains valid in either case.
A replacement worker receives shared views through future task inputs without
resource replay. Contract-violating writes are not rolled back after failures.

Admission is unchanged: waiting work is bounded by `maxQueue`, active executions
by worker count. The helper creates no hidden tasks. **maxQueue does not bound
shared-memory bytes**, application allocations, or references retained by task
modules. Budget those separately. Runtime statistics do not invent serialized
byte sizes or deduplicate arbitrary shared object graphs.

## Mutation and Atomics

`values[0]++` is a read followed by a write. Two workers can both read zero and
both write one. [The controlled test](../packages/runtime/test/shared.test.mjs)
forces this interleaving with a separate control buffer; replacing the update
with `Atomics.add(values, 0, 1)` produces two. This test deliberately violates
the shared-input convention; it is not a supported mutable-resource API.

| Operation                 | Relevant behavior                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `Atomics.load` / `store`  | Atomic cell access; store returns the stored value                                       |
| `Atomics.add`             | Indivisible read-modify-write; returns the previous value                                |
| `Atomics.compareExchange` | Replaces only on equality; returns the previous value                                    |
| `Atomics.wait`            | Blocks on an equal Int32/BigInt64 shared cell; returns `ok`, `not-equal`, or `timed-out` |
| `Atomics.notify`          | Wakes up to a requested number of waiters; returns the count woken                       |

Atomic integer operations participate in sequentially consistent ordering.
They do not make a sequence of operations or an unrelated object graph atomic.
Floats and DataView are not atomic integer cells. Notify is not a persistent
event: check a predicate in a loop around waiting. Blocking the Node main
thread prevents timers and messages from progressing; test gates wait only in
workers and poll asynchronously on the host. See the [ECMAScript Atomics
algorithms](https://tc39.es/ecma262/multipage/structured-data.html#sec-atomics-object)
and [memory model](https://tc39.es/ecma262/multipage/memory-model.html).

Immutable compute input requires no Atomics in its read loop. Initialize before
publication, then have no writers. Mutexes, barriers and semaphores are outside
the public PJS API. The test-only controls do not change that scope.

## Disjoint shared output

v0.6 `parallelFor()` can receive an application-allocated SAB-backed output and
write non-overlapping ranges without returning per-partition values. This is a
mutable-output contract, distinct from `sharedReadonly()`: PJS does not make it
safe automatically. Establish all sizes and input data before dispatch, assign
each logical partition an exclusive region, and do not let the host read final
results until the parent resolves. Overlapping writes require an explicit
correct synchronization design. Cancellation, timeout, failure, and worker crash
do not roll back writes that already happened.

## Streamed results

v0.7 `streamRange()` bounds retained host results by logical count. A result
credit is reserved before its child is admitted, so completed buffered results
plus unsettled children never exceed `experimentalMaxBufferedResults`. This is
not a byte budget: one result can contain an arbitrarily large structured-clone
graph.

v0.8 adds diagnostic queued-payload accounting for direct `ArrayBuffer`,
`SharedArrayBuffer`, typed-array, Node `Buffer`, and `DataView` outputs. Buffers
contribute their `byteLength`; views contribute their visible `byteLength`.
Ordinary objects, arrays, and scalars count as unknown, even if a nested value is
a buffer. PJS does not traverse output graphs because getters, proxies, cycles,
aliases, native values, and unbounded traversal work would make the observation
unsafe and misleading.

Aliased views count separately, including overlapping bytes. Separate worker
messages can produce different host wrappers for the same physical SAB, so
cheap wrapper-identity deduplication would not reliably measure unique backing
memory. `knownBufferedPayloadBytes` is therefore visible payload bytes retained
in the PJS queue, not heap size, RSS, exclusive ownership, or physical memory.
Direct delivery to an already waiting consumer is not buffered. Current values
return to zero on yield, close, failure, or cancellation; peak values remain
diagnostic history in runtime metrics.

These observations cannot support a hard general byte limit. Unknown graphs are
not zero-sized, transport temporaries are outside the queue, and a result's size
is known only after it crossed the worker boundary. Ordinary streams therefore
retain only the enforceable logical-result credit bound. See
[ADR 0016](adr/0016-result-memory-observability.md).

v0.9 adds a separate opt-in strict contract for binary results whose exact
visible length is known before dispatch. The host reserves declared bytes before
child admission, and the worker checks direct live ArrayBuffer-owned binary
output before successful posting. Count credit still applies independently.
For a view, the reservation and validation use its visible `byteLength`, not the
whole backing buffer. The declaration is exact; over- and undersized results
both fail.

Raw SharedArrayBuffer and SAB-backed views do not qualify. They may outlive the
operation through unrelated references, cannot transfer ownership, and have a
different memory model. Nested objects also do not qualify because PJS does not
traverse result graphs. Both remain valid in ordinary count-only streams and
continue contributing the v0.8 diagnostics where directly observable.

Reservations last through buffered retention and release on yield. Queued
cancellation releases immediately. Running cancellation, timeout, or parent
failure retains credit until the worker execution returns, fails, crashes, or
is terminated, because allocation may still occur. This bound covers declared
payload pressure only: worker temporaries, clone/transfer machinery, allocator
history, RSS, inputs, and consumer-held outputs remain outside it. See
[ADR 0017](adr/0017-binary-result-reservations.md).

v0.10 leaves this contract unchanged. Its debug-only invariant scanner and
failure soaks validate that queued cancellation, running cancellation, timeout,
crash, buffering, consumer abandonment, and shutdown release the same owned
records at their documented terminal events. A crash-heavy Windows soak ended
with zero PJS-owned reservation state while RSS retained a native/allocator
high-water mark; RSS alone is therefore not the byte-credit invariant. See the
[v0.10 report](benchmarks-v0.10.md).

A transferred output buffer is worker-owned until posting, host-buffer-owned
until iterator delivery, then consumer-owned. PJS drops its buffered reference
after yield. Closing or failing the stream drops undelivered transferred values;
ownership cannot be restored to the worker. Allocator and GC behavior can keep
RSS high after references are dropped, so the logical retention bound is
stronger than any promise of immediate process-memory release.

SAB-backed views yield as ordinary shared views. Yielding neither transfers nor
freezes their backing memory and adds no ordering guarantee. Producers and
consumers must still use disjoint regions or Atomics where synchronization is
required.

## Costs and choice

Sharing still costs allocation/copy at construction, metadata transport, worker
startup and memory bandwidth. Tiny inputs or expensive kernels may show little
gain. Measure one-shot preparation and repeated reuse separately. RSS includes
isolates, JIT, retained allocations and allocator history; sampled RSS is not an
exact count of unique physical shared pages. See the [v0.3 report](benchmarks-v0.3.md)
and [design decision](adr/0007-shared-input-model.md).
