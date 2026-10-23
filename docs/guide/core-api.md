# Core API guide

**Promotion status:** Development P2 range/count/map/batch contracts are promoted following benchmark review; all six deprecated option aliases remain accepted through the actual shared transition window.

PJS runs explicitly registered CPU work in persistent Node worker isolates. Your
application keeps its event-loop/I/O plane; PJS supplies a bounded compute plane.

```text
Node application
  ├─ event loop / ordinary asynchronous I/O
  └─ PJS compute plane
       bounded admission → scheduler / fixed pool → worker isolates → module tasks
```

PJS does not discover parallelism in arbitrary JavaScript, capture closures,
replace the event loop, or make a tiny function inherently faster. Start with
[basic-run.mjs](../../examples/basic-run.mjs) and its
[task module](../../examples/tasks.mjs). The README's example uses the same files.

This guide describes **integrated development source through C3**, including
six new option names with [deprecated aliases](../partitioning.md#c2-development-option-transition).
Published RC4 has older declarations/spellings and lacks later containment
controls. The [README quickstart](../../README.md) works with RC4;
checkout examples are tested against the packed development artifact.

## One-sentence contracts

| API                                                    | Contract                                                                                                                         | Use / evidence / boundary                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| registry.register(id, fileURL, exportName = 'default') | Bind a unique name to a local module function and return an immutable typed identity handle.                                     | All workloads; cannot serialize closures or infer the export's schema                     |
| new PjsRuntime(options)                                | Snapshot registered tasks and start a fixed worker population with bounded admission.                                            | Runtime/lifecycle tests; min/max are construction bounds, not elasticity                  |
| ready()                                                | Resolve once initial workers import all registered tasks, or reject startup failure.                                             | Runtime tests; readiness is more than thread creation                                     |
| run(task, input, options)                              | Execute one registered task through bounded admission and settle its caller independently of physical worker occupancy.          | v0.13 crypto and v0.14 queue controls; no automatic retry or hidden admission wait        |
| partitionRange(task, range, factory, options)          | Lazily divide a numeric range and collect one output per partition in logical order.                                             | v0.4 and v0.12 controls; entire result retained, no result byte cap                       |
| parallelFor(task, range, factory, options)             | Execute range children and resolve when all succeed, discarding worker return values before serialization.                       | v0.6 and v0.12 controls; writes/side effects cannot be rolled back                        |
| streamRange(task, range, factory, options)             | Eagerly start a range and deliver identified partition outputs in completion order under count and optional binary-byte credits. | v0.14 pipeline; single consumer, not ordered delivery                                     |
| parallelMapRange(task, range, factory, options)        | Validate one element per range index and assemble blocks into a flat logically ordered array or selected typed array.            | v0.8 and v0.12 controls; requires exact block kind/cardinality, preallocates final output |
| transfer(value, buffers)                               | Wrap a worker result so listed ArrayBuffers move to the caller at successful posting.                                            | v0.13/14 ownership; does not reclaim lost buffers after failure                           |
| sharedReadonly(view)                                   | Copy supported visible numeric bytes once into reusable native shared backing under an immutable-by-contract rule.               | v0.13/14 shared input; does not freeze memory                                             |
| stats()                                                | Return copied current state and cumulative diagnostic counters without retaining completed-task history.                         | v0.13/14 measurements; no latency quantiles                                               |
| shutdown(options)                                      | Close admission and use the first chosen drain policy to finish or terminate accepted work and stop workers.                     | Cross-platform lifecycle suites; graceful drain can wait indefinitely                     |

All four range methods and their controls are [promoted in development](../stability.md).

## Registration and runtime options

Register every task before constructing the runtime. The registry accepts a
nonempty unique ID, a `file:` URL and nonempty export name. Every worker imports
every registered module. Module globals persist per isolate. A registration made
after construction is not in that runtime's snapshot. Handles from another
registry, or `{ id: 'same-name' }` objects, are rejected.

B3 development removes the unsupported public registry.snapshot() method and its
TypeScript declaration. Keep your own registration metadata for introspection.
Composition captures an internal copy after scalar normalization and before the
queue getter; later registrations cannot change existing runtimes or replacement
worker configuration. Internal snapshot access and TaskDescriptor are not root
exports or supported package subpaths. This pre-v1 removal is absent from RC4.

`registry` is required. `workers` chooses the fixed population; `minWorkers`
defaults to 1 and `maxWorkers` to the larger of minimum and explicit workers or
availableParallelism(). Without explicit workers the available value is clamped
to those bounds. This is a default, not a sizing recommendation.
`maxQueue` defaults to 1024 waiting logical tasks. `startupTimeout` defaults to
30000 ms per worker; `maxRestarts` defaults to four times workers over the
runtime's lifetime. Integer ranges and invalid-value behavior are in the
[current option inventory](../research/v1-api-contract-inventory.md).

`run` takes one input and returns a promise of one output. Clone is default;
optional `transferList` moves input buffers. `signal` and `timeout` affect caller
settlement, not preemption. Constructor/registration validation throws; ordinary
submission validation rejects. See [errors](errors.md) and [lifecycle](lifecycle.md).

R1 development adds `run({ executionLease })`,
constructor `restartPolicy` and graceful `shutdown({ forceAfter })`.
These opt-in controls are not part of the immutable RC4 publication.
See [physical containment](lifecycle.md#experimental-physical-execution-leases-r1-development)
for units, unsupported range/batch combinations and recovery limits.

## Choosing a range result

Use a half-open `{ start, end, grainSize }` range with safe integer endpoints and
positive grain. The synchronous factory runs on the host only as admission
becomes available. It receives a frozen `{ index, start, end }` descriptor and
returns `{ input, transferList? }`. Keep factories cheap. Do not launch async I/O
or return promises from them. Empty ranges succeed with an empty result or void.

```js
const range = { start: 0, end: data.length, grainSize: 4096 };
const factory = (partition) => ({ input: { partition, data } });
const partialSums = await runtime.partitionRange(sumTask, range, factory);
// Sum partialSums on the host if that is your application's reduction.

await runtime.parallelFor(writeTask, range, writeFactory);
const flat = await runtime.parallelMapRange(mapTask, range, factory, {
  outputConstructor: Float64Array,
});
for await (const { partition, output } of runtime.streamRange(
  sumTask,
  range,
  factory,
)) {
  console.log(partition.index, output);
}
```

These task-specific snippets are illustrated by the executable
[range-work](../../examples/range-work.mjs) and
[shared-input](../../examples/shared-input.mjs) recipes. Generic maps omit the
constructor and require ordinary array blocks. Typed maps require exactly the
selected built-in constructor. Each block has `partition.end - partition.start`
elements; mismatch rejects the whole operation with PjsMapContractError.

Range children use clone/transfer/shared inputs under the same ownership rules as
run. First failure fails the parent and cancels sibling callers; already running
work may finish. Collected/map partial outputs are not exposed. Streams can have
already delivered values; they discard undelivered buffered values on failure.
Use streaming when bounded incremental consumption matters, collection for a
small finite set of per-partition values, map for a flat element result, and
parallelFor for explicit side effects with no returned data.

Completion order is intentional. Use `partition.index`, start/end or application
metadata to restore logical order. Store at indexed offsets when you can afford
the output; an application reorder buffer has its own memory cost outside PJS.
The [binary recipe](../../examples/streaming-binary.mjs) demonstrates reconstruction.

## TypeScript and trusted tasks

### Explicit stream cleanup (B1 development)

Integrated development returns `PjsRangeStream<Output>` with required direct
`next()`, `return()` and `throw()`. `CountOnlyStreamRangeOptions` is also importable
from the root; it excludes all six strict byte spellings (three alias pairs). These type-only
exports are not in published RC4. Range streaming is promoted in development.

```ts
const stream = runtime.streamRange(task, range, createInput);
try {
  const item = await stream.next();
  if (!item.done) consume(item.value.partition, item.value.output);
} finally {
  await stream.return();
}
```

Creation is eager; dropping the reference does not cancel. A stream is its own
single-consumer iterator. `for await` break invokes cleanup, while a second read
that would install another pending waiter rejects without cancelling the first.
Explicit return clears delivery and synchronously cancels the parent, resolving
a pending read as done. Its fulfilled promise is not a physical-completion
barrier: posted work/byte reservations remain held until validated completion or
confirmed worker exit. Await runtime shutdown for final runtime cleanup.

Producer failure/abort/deadline is sticky for later reads even after return.
Consumer `throw(reason)` rejects itself and a pending read with the same normalized
Error and closes delivery; its supplied reason is not stored as producer failure.
Repeated close does not cancel again. See the [full protocol table](../research/v1-api-corrections.md)
for terminal throw and synchronous reason-conversion details.

### Task types

Use `registry.register<Input, Output>(...)` to describe the caller-visible payload
types, including when the worker returns `transfer(...)`. PJS infers outputs from
that handle; generics do not verify a separately loaded export or validate schemas.
Development exports the diagnostic type `PjsRuntimeStats` from the root (B4);
`ReturnType<PjsRuntime['stats']>` also describes the returned snapshot. These
diagnostics do not promise timing or performance bounds. Errors reject JavaScript
promises and need `instanceof` narrowing.

Tasks are trusted application code with Node's filesystem, network and process
capabilities. Workers are not a sandbox. No closure serialization, source eval,
arbitrary mutable-object sharing or compiler hook is supplied. Finish task-owned
asynchronous work before returning and do not use PJS's worker message port.
Shared-memory races and task side effects remain application responsibilities.
