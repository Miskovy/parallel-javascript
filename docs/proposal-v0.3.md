# v0.3 proposal: reusable shared inputs

The v0.2 matrix experiment still prepares one right-hand matrix per transfer
task. Existing worker postMessage boundaries already support native shared
backing storage; FIFO, settlement, transfer reservations and crash recovery do
not need to change.

| Approach                     | Value                                                                  | Cost                                                                         | Recommendation                                   |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| A: native SAB passthrough    | No copies of backing bytes; native views and metadata                  | Application owns construction and conventions                                | Preserve and document                            |
| B: construction helper       | Explicit contract, compact copy, typed shared backing, discoverability | One allocation/copy and a small API                                          | Add on top of A                                  |
| C: runtime resource registry | Named resources, potential accounting/disposal                         | Registration, replay on replacement, teardown and queued-reference lifetimes | Defer: no demonstrated benefit for this workload |

Proposed `sharedReadonly(source)` copies a supported numeric typed-array view
into a fresh, fixed-length SharedArrayBuffer and returns the corresponding
native view. Initially support Uint8Array, Int32Array, Uint32Array, Float32Array
and Float64Array. Raw SAB and any native SAB-backed views can already pass
through task inputs without this helper. No wrapper, resource ID, disposal,
runtime byte accounting or protocol change is needed. A future partitioner
can include the same view in every chunk's metadata.

Read-only is an application contract, not hardware enforcement or a security
boundary. Complete initialization before publication; never mutate shared
input, including after caller cancellation while an execution may remain.
The helper copies only the visible view bytes, leaves the source attached,
and does not call a user-supplied constructor. Native views intentionally
remain writable in JavaScript and TypeScript; the API must not imply protection.

Validate construction, native view/metadata behavior, concurrent reuse, queue
bounds, cancellation, deadlines, shutdown, replacement and independent output
transfer. Demonstrate a deterministic lost-update interleaving alongside
Atomics.add, using a separate test-only synchronization buffer.

Measure clone/transfer/shared matrix and range-sum workloads in fresh processes
per configuration. Include preparation in one-shot timing; separately record
one-time preparation and repeated execution for reuse. Preserve raw wall/CPU/RSS
samples and explicit allocation budgets. Pin Piscina as a development-only
baseline with matching kernels, fixed populations and output semantics. Run
the existing CPU and transfer suites, preserving historical artifacts. Use
1, 2, 4 and availableParallelism only within available hardware concurrency.

Accept the helper if correctness holds and measurements demonstrate useful
reuse without regressions. Keep v0.4 partitioning, scheduling changes and
synchronization libraries outside this milestone.
