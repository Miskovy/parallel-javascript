# v0.8 proposal: element-block mapping and observable payload bytes

## Decision summary

v0.8 should add experimental `parallelMapRange()`, not generic
`parallelMap()`. Its semantic unit is an element in a numeric half-open range,
while its transport unit is a validated output block. The worker returns exactly
one array or typed-array element per index in its assigned partition. PJS
assembles blocks directly into one ordered flat result and rejects the whole
operation on any cardinality or block-kind mismatch.

v0.8 should also add diagnostic-only stream metrics for directly observable
buffer/view payload bytes retained in the host result queue. It should not add a
byte admission limit. Arbitrary object size remains unknown, and process RSS,
JavaScript heap size, view bytes, backing bytes, and unique physical memory are
not interchangeable.

## What map means

For range `[start, end)`, logical element `k` is the integer index
`start + k`. A successful map has exactly `end - start` output elements, and
output offset `k` corresponds to that input index regardless of worker
completion order.

PJS still partitions the range. A map block is one partition, and its required
cardinality is:

```text
block.length === partition.end - partition.start
```

The worker performs element transformation inside the block and returns one
output block. PJS validates and copies that block into the final result at
offset `partition.start - range.start`. It never sends one worker message per
element merely to satisfy the map name.

These remain separate levels:

```text
elements -> map blocks -> range children -> physical dispatch batches
```

Grain controls elements per map block. Experimental dispatch batch size controls
map blocks per worker message. Batching never changes output cardinality or
element order.

## API shape

The numeric domain makes `parallelMapRange()` more honest than
`parallelMap()`. The proposed overloads are conceptually:

```ts
parallelMapRange<Input, Output>(
  task: PjsTask<Input, readonly Output[]>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options?: PartitionOptions,
): Promise<Output[]>;

parallelMapRange<Input, Block extends PjsTypedArray>(
  task: PjsTask<Input, Block>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: TypedMapRangeOptions<Block>,
): Promise<Block>;
```

Typed mode requires an explicit `experimentalOutputConstructor`. This makes the
empty result type unambiguous, allows immediate output allocation, and rejects
workers that return a different typed-array kind. Generic mode requires an
ordinary JavaScript array. It does not silently convert typed arrays into boxed
element arrays.

The API remains experimental because constructor naming, maximum output length,
and the eventual algorithm namespace remain research questions.

## Assembly and cardinality

The host preallocates the final generic array or typed array when the operation
is accepted. Each successful block is validated before copying. No array of
blocks and no separate final flatten pass is retained, although block copy time
is still real host assembly work and must remain inside benchmark timing.

An empty generic map resolves `[]`; an empty typed map resolves a zero-length
instance of the requested constructor. A single element still travels in one
block. Negative range endpoints affect task indices but not zero-based output
offsets. A short, long, non-array, wrong typed-array kind, or detached block is
a map-contract failure. PJS never truncates, pads, or partially resolves.

## Generic and typed output

Generic blocks support arbitrary element values through ordinary arrays and
structured clone. PJS validates only the outer block and its length; it does not
traverse elements or validate an application schema.

Typed blocks preserve their native storage while crossing the worker boundary.
They may clone or use the existing transfer envelope. The host copies each
received block into the preallocated typed result and then releases its block
reference. Input transfer restrictions for physical batches remain unchanged.

For numeric workloads, `parallelFor()` with disjoint shared output avoids
returned-block transport and host copying and may remain faster. Map exists for
returned ownership, generic values, and simpler non-shared composition—not as a
claim that it beats explicit shared memory.

## Streaming map

No new streaming-map API is proposed. `streamRange()` already delivers a task's
output block with its partition identity under bounded completion-order
backpressure. A consumer can validate or assemble those blocks as application
logic. Unlike collected map, previous streamed blocks remain observable after a
later failure. Ordered streaming remains rejected because v0.7 measured severe
head-of-line latency and userland retention.

## Failure, cancellation, and context

A block contract violation fails the collected parent once, stops production,
cancels queued siblings, and leaves running siblings occupied. The final output
is discarded and never partially resolves. Worker errors, serialization,
cancellation, deadlines, crash replacement, saturation, and shutdown reuse the
existing range semantics. One operation-level AsyncResource remains; no
per-element or per-block resource is introduced.

## Stream start semantics

Keep eager start. Calling `streamRange()` accepts and begins bounded work before
the first `next()`. At most the configured result capacity is produced or
reserved, and the one deadline begins at the call. This gives low latency when a
consumer arrives and preserves v0.7 admission, timeout, and shutdown semantics.
Lazy start would move validation/admission errors, alter shutdown ownership, and
increase first-read latency. It requires separate evidence and an ADR rather
than a silent change.

## Observable result memory

Do not traverse arbitrary output graphs. Getters, proxies, cycles, aliases,
native values, side effects, and unbounded traversal cost make such accounting
unsafe and misleading.

For a directly yielded output that is one of the following, PJS can identify a
payload byte length without traversal:

- `ArrayBuffer` or `SharedArrayBuffer`;
- typed-array view, Node `Buffer`, or `DataView` through `.byteLength`.

Choose per-result observable payload bytes while values are actually queued.
Direct buffers contribute their `byteLength`; views contribute their visible
`byteLength`. Aliasing therefore counts each payload view, deliberately. An
experiment showed that the same physical SharedArrayBuffer can cross separate
worker messages as distinct host wrapper identities, so cheap identity tracking
cannot guarantee unique-backing accounting. The metric does not describe
exclusive PJS ownership or unique physical allocation.

Proposed diagnostics:

```text
streamResults.knownBufferedPayloadBytes
streamResults.peakKnownBufferedPayloadBytes
streamResults.unknownBufferedResults
streamResults.peakUnknownBufferedResults
```

A directly recognized zero-length buffer is known and contributes zero bytes.
Scalars, ordinary arrays, and plain objects count as unknown even if they contain
buffers, because PJS deliberately does not inspect their graph. Direct delivery
to an already waiting consumer is never host-buffered and contributes no queued
bytes. Yield, cancellation, failure, and close release the accounting with the
buffer reference.

## Why no hard byte limit

Observable payload bytes are useful diagnostics but cannot enforce a general memory
bound. Unknown results are not zero bytes; worker-local allocation and transport
temporaries are outside the queue; shared backings can remain reachable
elsewhere; and a single result is already transported before its size is known.
Rejecting after receipt would not prevent the peak. v0.8 therefore retains the
logical-result admission bound and exposes no `experimentalMaxBufferedBytes`.

A future restricted binary mode could require directly measurable results and
reserve declared byte budgets before dispatch, but declarations and mismatch
handling need their own contract.

## Evidence plan

The retained suite will compare serial transformation, generic object map,
generic numeric map, cloned and transferred typed blocks, streamed blocks,
stream-plus-userland assembly, `partitionRange()` blocks, and disjoint shared
output. Assembly time, wall/CPU time, RSS, result count, known output bytes,
messages, first-result latency, event-loop delay/utilization, and timer drift
will be retained.

A realistic pipeline will transform binary blocks in workers, consume them
through `streamRange()`, hash/process them in an async host stage, and test
several controlled consumer costs and result capacities. A mixed large map,
stream, `parallelFor()`, and ordinary producer will test fairness. Piscina gets
bounded manual block collection and transfer equivalents. Because the working
v0.7 tree was not committed separately, a same-source build with only the new
payload accounting disabled will isolate diagnostic bookkeeping overhead;
source-identical established paths will serve as run-noise controls.

No work stealing, reduce, ordered-stream API, cooperative cancellation, or
automatic grain/batch/buffer policy is introduced.
