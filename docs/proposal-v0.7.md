# v0.7 proposal: bounded result delivery

## Decision summary

v0.7 should add experimental completion-order `runtime.streamRange()` and not
add a map API. The returned `AsyncIterable` yields one explicitly identified
result per logical partition:

```ts
for await (const { partition, output } of runtime.streamRange(
  task,
  range,
  createInput,
  { experimentalMaxBufferedResults: 4 },
)) {
  consume(partition, output);
}
```

This keeps three distinct semantics:

```text
parallelFor()   -> no successful values transported or retained
partitionRange() -> all partition values retained and returned in index order
streamRange()    -> partition values delivered incrementally in completion order
```

## Collected map versus stream

### Collected map

An experimental `parallelMapRange()` could return an ordered array. That is
already the semantic behavior of `partitionRange()`: one result per logical
partition, retained until every partition succeeds. Calling it map would imply
one result per source element even when grain is greater than one. Element map
would instead require every task to return a block, followed by flattening and
new typing/ownership rules. A new name would therefore add ambiguity rather
than capability.

### Streaming

Streaming exposes partial progress, transferred blocks, and bounded host
retention. It changes failure semantics because yielded values cannot be
retracted, and it needs independent result backpressure and consumer-close
handling. Those are real capabilities not provided by `partitionRange()`.

### Both / map built on stream

A collected map could consume a stream and reorder by partition index, but it
would recreate full retention and still would not define element-level map.
Internally routing `partitionRange()` through a public iterator would also add
iterator machinery to the established collection path. v0.7 therefore keeps
the shared range engine but does not make collection consume a stream.

Shared typed numeric element transforms remain better expressed as disjoint
shared output plus `parallelFor()` when the ownership contract fits.

## API and result shape

`AsyncIterable` is the smallest platform-native abstraction. It integrates with
`for await`, carries normal promise/AsyncLocalStorage behavior, and does not add
Node Readable object-mode or Web ReadableStream cancellation adapters.

Each yielded item is:

```ts
interface StreamRangeResult<Output> {
  readonly partition: RangePartition;
  readonly output: Output;
}
```

Identity is mandatory because delivery is completion order. The API produces
partition results, not element-map values.

## Ordering

v0.7 supports completion order only. It minimizes head-of-line retention and
time to first result. Within one physical batch, successful items arrive in
logical batch order because the worker executes them sequentially. Across
batches, worker completion determines delivery.

Ordered streaming is not exposed. A slow partition zero can force retention of
every later completed result, undermining the primary memory goal. Benchmarks
will model userland reordering to quantify that cost before any second mode is
considered.

## Result buffer and backpressure

`experimentalMaxBufferedResults` is a positive safe integer and defaults to the
worker count. It counts logical results, not bytes or messages. Arbitrary
structured-clone graphs do not have a cheap reliable byte measure.

Work admission and result buffering are separate:

```text
maxQueue                         -> queued logical compute weight
experimentalMaxBufferedResults  -> completed plus reserved in-flight results
```

For a live stream, the coordinator maintains:

```text
buffered results + admitted unsettled stream children <= result capacity
```

An in-flight child reserves one future result credit. A worker becomes free as
soon as its result reaches the host. If the buffer is full, no new stream child
is produced; existing ordinary/range work may use free workers. Consumer reads
release credits and repump the shared FIFO. A physical batch reserves one credit
per logical item, so batching cannot bypass the bound.

This deliberately may leave workers idle for a slow consumer. Holding completed
workers busy would couple host consumption to isolate occupancy and reduce
fairness without reducing retained host values.

## Lifecycle and partial results

The accepted stream operation includes result delivery. Its single deadline
covers startup, production, queueing, execution, host buffering, and consumer
waiting. Slow-consumer time therefore counts. The stream succeeds only when all
logical work completed and every result was delivered to the iterator.

`shutdown({ drain: true })` waits for both computation and consumer delivery.
An abandoned iterator can therefore make graceful shutdown wait; consumers must
drain it or close it. `drain: false` cancels and terminates under existing rules.
This is explicit rather than silently dropping accepted results.

If a producer fails, already yielded results remain observable, buffered results
are discarded, the iterator rejects with the contextual PJS error, future
production stops, queued siblings cancel, and running siblings retain occupancy.
There is no rollback.

## Consumer cancellation

Iterator `return()`—including normal `break` from `for await`—cancels remaining
work, clears buffered values, removes listeners/timers, and resolves `{ done:
true }`. Iterator `throw()` performs the same cleanup and rejects with the
consumer error. JavaScript `for await` invokes `return()` when the loop body
throws, so consumer exceptions also close the operation.

An explicit external AbortSignal has the existing PJS cancellation behavior and
causes pending/future `next()` to reject with `PjsCancelledError`.

## Transfer and shared results

Output transfer envelopes use the existing worker transport. The host buffer
owns a transferred result until it is yielded; after delivery the runtime drops
its reference and the consumer owns it. Consumer abandonment drops buffered
transferred values without restoring worker ownership.

SAB-backed views yield normally and remain shared. Yielding does not transfer,
freeze, or add synchronization guarantees.

## Internal design

The existing `RangeOperation` gains `resultMode: 'stream'` and an internal
`RangeStream` delivery coordinator. Common production, weighted scheduling,
task settlement, failure, deadline, crash replacement, and shutdown stay shared.
Only stream delivery/backpressure is specialized. This remains understandable
without a second scheduler or worker protocol.

Protocol v2 needs no new messages: streamed tasks use ordinary success/failure
transport. Successful host settlement moves output into the bounded stream
buffer instead of an indexed collector.

## Async context and metrics

The one operation-level `PjsRangeOperation` AsyncResource is preserved. No
resource is created per result. Iterator promises and consumer callbacks use
normal caller async context; worker stores remain unpropagated.

Experimental stats add stream parent outcomes and logical result counts:

```text
streams.accepted/completed/failed/cancelled/timedOut/pending
streamResults.produced/yielded/buffered/peakBuffered
```

No byte count is claimed.

## Evidence plan

The retained benchmark compares 32 x 1 MiB collection, fast stream, delayed
stream, and completion-only work; records wall time, first/last result latency,
RSS, buffer occupancy, messages, CPU, event-loop delay/utilization, and drift;
and tests capacities 1/4/8. It also compares:

- completion order with userland ordered reassembly under a slow-first skew;
- userland stream collection with `partitionRange()`;
- shared-output `parallelFor()` for typed numeric transformation;
- bounded Piscina manual collect and callback-style incremental consumption;
- mixed slow stream, ordinary `run()`, `parallelFor()`, and another stream;
- committed-v0.6 regression controls for all existing public APIs.

Map is rejected for v0.7 unless this evidence demonstrates semantic value beyond
the existing collected partition operation. No reduce, work stealing,
cooperative cancellation, or automatic grain/batch selection is introduced.
