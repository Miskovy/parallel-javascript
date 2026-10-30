# PJS v0.8 element-block mapping and result-memory report

## IMPLEMENTATION SUMMARY

v0.8 adds experimental element-oriented `parallelMapRange()`, direct block
assembly into one flat result, map-specific validation and metrics, and
diagnostic stream payload-byte accounting. It preserves the v0.7 scheduler,
worker protocol, eager stream start, logical result credit bound, failure
model, and completion-order delivery. No reduce, ordered stream, work stealing,
automatic grain selection, or hard byte limit was added.

## MAP SEMANTICS DECISION

Map means one output element for every integer in `[start, end)`. It does not
mean one arbitrary value per partition. Workers still operate on partitions,
but each worker result is a block that PJS validates and places in logical
element order. The numeric-domain name `parallelMapRange()` makes that boundary
explicit.

## ELEMENT-BLOCK CONTRACT

For partition `{ start, end }`, the worker must return a block with exactly
`end - start` elements. Grain controls elements per block; dispatch batch size
controls blocks per physical message. Completion order never changes the final
element order. A short, long, wrong-kind, wrong-constructor, or detached block
fails the entire parent with `PjsMapContractError`; PJS does not truncate, pad,
or expose a partial final result.

## PUBLIC / EXPERIMENTAL API

The exported overloads are:

```ts
parallelMapRange<Input, Output>(
  task: PjsTask<Input, readonly Output[]>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: PartitionOptions,
): Promise<Output[]>;

parallelMapRange<Input, Constructor extends PjsTypedArrayConstructor>(
  task: PjsTask<Input, InstanceType<Constructor>>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: TypedMapRangeOptions<Constructor>,
): Promise<InstanceType<Constructor>>;
```

Typed mode is selected by `experimentalOutputConstructor`. The API and option
remain experimental.

## BLOCK CARDINALITY

Empty generic maps return `[]`; empty typed maps return a zero-length instance
of the requested constructor. Single-element, uneven final, negative-endpoint,
and reversed-completion cases retain exact element correspondence. The host
preallocates the final result and copies every validated block at
`partition.start - range.start`, avoiding an intermediate retained block array
and a later flatten pass.

## GENERIC OUTPUT MODEL

Generic blocks must be ordinary arrays. Elements may be arbitrary
structured-cloneable values; PJS validates only the outer block and its
cardinality. It deliberately does not traverse elements or enforce an
application schema. Generic arrays offer composability, not compact numeric
storage: in the retained numeric case they took 22.19 ms and peaked at
173.86 MiB RSS.

## TYPED OUTPUT MODEL

Typed mode accepts the built-in typed-array constructor explicitly requested by
the caller and rejects a different view kind. Blocks can arrive by clone or the
existing output transfer envelope. Both paths still copy into the final
preallocated typed array; transfer removes the worker-to-host backing copy, not
final assembly. For 262,144 Float64 elements, cloned and transferred typed maps
took 5.04 ms and 6.21 ms respectively; assembly medians were 0.50 ms and
0.71 ms. Transfer was not faster for these 32 KiB blocks.

## SHARED OUTPUT COMPARISON

`parallelFor()` with disjoint SAB-backed output remains the specialized
low-transport path. It took 3.66 ms in the numeric workload versus 5.04 ms for
typed clone map and 6.21 ms for typed transfer map. Shared output is faster here
but exposes mutable shared-memory responsibilities and retains partial writes
after failure; map returns privately owned, all-or-nothing results.

## STREAM PIPELINE FINDINGS

The realistic pipeline transformed 64 transferred 8 KiB blocks, hashed each
block, ran controlled host work, and crossed an asynchronous sink boundary. At
zero consumer cost, median wall time ranged from 14.47 to 16.54 ms. At 5 ms of
consumer work per block it ranged from 350.28 to 364.66 ms: the consumer
dominated and more buffering could not create throughput. Sampled average busy
workers rose from 1.00 at capacity 1 to 1.29/1.50 at capacities 4/8 for the fast
consumer, but stayed near one for slow consumers. Capacity therefore needs
workload evidence rather than a universal high default.

## STREAM START SEMANTICS

Streams remain eager. Calling `streamRange()` accepts the parent, starts its
single deadline, and admits bounded work before the first `next()`. Tests cover
production and timeout before consumption. This preserves low first-result
latency and existing admission/shutdown ownership; lazy start would be a
different lifecycle contract.

## RESULT MEMORY OBSERVABILITY

`streamResults` now reports current/peak `knownBufferedPayloadBytes` and
current/peak `unknownBufferedResults`. Active stream snapshots expose the two
current values. Accounting exists only while results are in PJS's queue;
direct delivery to a waiting consumer contributes zero, and yield, close,
failure, or cancellation releases current counts.

## BYTE ESTIMATION MODEL

Direct `ArrayBuffer`, `SharedArrayBuffer`, typed-array, Node `Buffer`, and
`DataView` outputs contribute their visible `byteLength`. A recognized
zero-length value is known and contributes zero. Scalars, ordinary arrays, and
objects are unknown, even when they contain a nested buffer. PJS performs no
object-graph traversal. The pipeline observed exact peaks of 8, 32, and 64 KiB
for capacities 1, 4, and 8 with 8 KiB direct views.

## ALIASING / SHARED-BACKING SEMANTICS

Metrics count each queued payload view. Two views of one backing buffer count
both visible lengths, including overlap. A targeted experiment showed that the
same physical SAB sent in separate worker messages can be represented by
different host wrapper identities, so inexpensive identity deduplication would
not reliably describe unique physical memory. These metrics are intentionally
not RSS, heap size, backing allocation, or exclusive ownership.

## HARD BYTE LIMIT DECISION

v0.8 adds no byte admission limit. Unknown graphs are not zero bytes, transport
temporaries are outside the queue, shared storage may be retained elsewhere,
and result size is learned only after transport. Rejecting then would not have
prevented the peak. The existing logical-result capacity remains enforceable;
the byte fields are diagnostics.

## FAILURE / CANCELLATION

Map reuses range failure, cancellation, timeout, crash replacement, saturation,
async-context, and shutdown behavior. A contract error stops production,
cancels queued siblings, leaves already-running siblings occupying workers,
and discards the final allocation. Streams retain their different incremental
rule: already-yielded values remain observable, while buffered values and
their accounting are released.

## TEST RESULTS

The full correctness suite passes 143/143 tests. New coverage includes generic
and typed map shapes, empty/single/uneven/negative ranges, completion reordering,
clone/transfer, malformed blocks, worker/serialization/crash/cancellation/
timeout/shutdown paths, saturation, metrics, AsyncLocalStorage association,
direct buffer/view/SAB accounting, zero-length values, aliases, eager start,
concurrent iteration rejection, and sink-failure cleanup.

## STRESS RESULTS

Ten full-suite repetitions pass without intermittent failures (1,430 test
executions total). The stress command builds once, then launches a fresh Node
test process per repetition to exercise worker lifecycle and new operation
paths.

## ELEMENT MAP BENCHMARK

The primary case maps 262,144 Float64 elements with grain 4,096, batch size 4,
four workers, 16 kernel iterations, one warmup, and three retained trials in
fresh configuration processes. Serial took 9.47 ms. Typed clone map took
5.04 ms, typed transfer 6.21 ms, generic numeric arrays 22.19 ms, explicit
partition blocks plus host assembly 4.77 ms, and shared output 3.66 ms. This is
one Windows/i3-10100F/Node 24.21.0 observation, not a general speed claim.

## GENERIC OBJECT MAP BENCHMARK

For 32,768 objects, the serial loop took 1.05 ms, PJS generic map 23.42 ms, and
bounded Piscina collection 27.98 ms. Serialization and host event-loop work
dominate this deliberately cheap transform. PJS's 0.11 ms assembly time shows
that flattening was not the main cost.

## TRANSFERRED BLOCK BENCHMARK

Typed transfer used 138.98 MiB sampled peak RSS versus 146.83 MiB for typed
clone, but took 6.21 ms versus 5.04 ms. Piscina's bounded controls reversed that
timing on this run: 4.71 ms transfer versus 6.99 ms clone. Block size, allocation,
message count, implementation, and noise all matter; “transfer is always
faster” is rejected.

## STREAM VS MAP

Transferred stream collection took 8.46 ms, with the first result at 1.05 ms;
typed transfer map took 6.21 ms but exposed nothing until completion. Stream
discard took 9.32 ms and first result arrived at 0.90 ms. Streaming buys
incremental delivery and bounded runtime retention, not lower total overhead in
this configuration.

## MAP VS PARTITIONRANGE

`partitionRange()` plus explicit typed assembly took 4.77 ms versus 5.04 ms for
typed map clone. Their host assembly medians were 0.43 and 0.50 ms. Map's value
is its validated element contract and flat return type; this small difference
does not justify claiming a faster primitive.

## MAP VS SHARED PARALLELFOR

Shared `parallelFor()` was the fastest PJS numeric path at 3.66 ms because it
avoided returned blocks and final host copies. Use it when disjoint shared
writes and partial-side-effect semantics are acceptable. Use map when returned
ownership, generic values, or all-or-nothing collection is more important.

## PIPELINE BENCHMARK

Observed `(capacity, peak queued bytes)` pairs were `(1, 8 KiB)`,
`(4, 32 KiB)`, and `(8, 64 KiB)` at every consumer cost. RSS stayed roughly
115.6-118.6 MiB, too coarse to infer 8-64 KiB queue changes. At 0.25, 1, and
5 ms consumer targets, wall medians were about 33.0-38.3, 88.6-91.7, and
350.3-364.7 ms across capacities. The exact queue metric was more informative
than process RSS. Occupancy was sampled from runtime worker state every 2 ms;
that instrumentation is included in these wall times and is not a CPU-time
estimate.

## EVENT LOOP IMPACT

Generic numeric and object maps showed 8.49 ms and 6.28 ms maximum event-loop
delay, while compact typed/shared modes were about 1.14-1.66 ms. The pipeline's
5 ms consumer case produced 10.91-11.35 ms maxima. CPU samples on this short
Windows run were coarse (often zero), so wall, delay, utilization, and timer
drift are retained rather than converted into precise CPU-efficiency claims.

## FAIRNESS RESULTS

Nine mixed trials ran a large map, a 64-result stream, shared-output
`parallelFor()`, and ordinary `run()` traffic at stream capacities 1/4/8. Every
operation completed with exact counts and no starvation flag. Median total wall
times were 19.65, 17.58, and 19.29 ms respectively. This supports retaining the
central FIFO and current range pumping; it does not prove fairness for arbitrary
unbounded workloads.

## PISCINA COMPARISON

Piscina 5.3.2 used fixed four-thread bounded manual producers and the same
worker kernel. Numeric clone/transfer took 6.99/4.71 ms, versus PJS typed
clone/transfer map at 5.04/6.21 ms; object collection took 27.98 ms versus PJS
23.42 ms. Message counts differ (64 Piscina submissions versus 16 PJS batched
messages), and the APIs/lifecycles are not equivalent. The data does not support
a general ranking.

## REGRESSION CONTROLS

No separately committed v0.7 tree existed, so the causal control uses a
temporary build of the same v0.8 source with only payload-byte retain/release
accounting disabled. It runs baseline/candidate/candidate/baseline in fresh
processes with ten retained observations per case. Long 4,096-result scalar
streams measured candidate/baseline ratios of 0.996 (batch 1) and 1.005
(batch 8). `parallelFor()` ratios were 1.004 and 1.015; partition ratios were
0.992 and 0.918. Non-stream paths are source-identical, so their wider short-run
variation is a noise control, not an attributed v0.8 speedup.

## MEMORY FINDINGS

Logical capacity precisely bounded runtime-queued result counts, and direct
payload diagnostics precisely tracked visible bytes. RSS did not track those
small changes and cannot distinguish worker heaps, JIT, allocator retention,
shared pages, or transport temporaries. In a 4,096-result control at capacities
8/64/256, wall medians were 213.16/204.84/70.31 ms. Capacity also changes
dispatch grouping, but the absence of degradation at 256 gives no evidence that
the current small `Array.shift()` queue is the bottleneck; a ring-buffer rewrite
is deferred.

## BOTTLENECKS

Generic structured cloning and host message processing dominate cheap object
maps. Typed final assembly is measurable but small. Streaming pays more physical
messages to preserve incremental bounded delivery. Slow consumers dominate
pipeline wall time. Shared output avoids result transport but shifts correctness
to application-owned memory discipline.

## OPEN QUESTIONS

- Should a future binary-only mode require declared block bytes and reserve them
  before dispatch?
- Should typed map eventually accept a caller-provided destination, and how
  would ownership and partial failure work?
- Which real workloads justify automatic grain, batch, or result-capacity
  selection?
- Does a larger-capacity/high-rate workload ever justify a ring buffer after
  dispatch effects are isolated?

## RECOMMENDED V0.9

Do not jump to work stealing or generic reduce. First validate map and stream in
real binary/object pipelines, then prototype an opt-in binary result contract
with declared pre-dispatch byte reservations and explicit mismatch behavior.
That is the narrowest next step that can turn the new diagnostics into an
enforceable memory guarantee without pretending arbitrary JavaScript objects
have exact cheap sizes.

Raw artifacts: `benchmarks/results/element-map-v0.8.json`,
`map-pipeline-v0.8.json`, `map-fairness-v0.8.json`, and
`runtime-regression-v0.8.json`. Reproduce the main suites with
`npm run benchmark:map`; the regression helper additionally needs a built
comparison tree.
