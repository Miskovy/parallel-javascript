# v0.7: bounded result delivery

## IMPLEMENTATION SUMMARY

v0.7 adds experimental `PjsRuntime.streamRange()`, backed by the existing lazy
range engine and a bounded host delivery coordinator. It yields identified
partition outputs through an `AsyncIterable` in completion order. No map,
reduce, work stealing, automatic grain/batch selection, or cooperative
cancellation was added. See the [proposal](proposal-v0.7.md) and
[ADR 0014](adr/0014-streaming-result-semantics.md).

## STREAMING SEMANTICS

A stream yields `{ partition, output }` as worker results settle. Success means
all logical children completed and all values were delivered. Unlike
`partitionRange()`, partial successful output is observable before terminal
success and cannot be rolled back.

## MAP SEMANTICS DECISION

No map API was added. `partitionRange()` already supplies ordered, retained,
one-result-per-partition collection. Calling that map would misleadingly imply
one result per range element when grain exceeds one. True element mapping needs
block flattening or disjoint shared output semantics. The benchmarks also show
no consistent performance basis for a wrapper: stream-plus-collect was slower
for fine scalar output but faster in one numeric-block sample.

## PUBLIC / EXPERIMENTAL API

```ts
for await (const { partition, output } of runtime.streamRange(
  task,
  range,
  createInput,
  {
    experimentalDispatchBatchSize: 4,
    experimentalMaxBufferedResults: 8,
  },
)) {
  consume(partition, output);
}
```

`StreamRangeOptions` and `StreamRangeResult<Output>` are exported types. The
result-bound name and the complete range family remain experimental.

## RESULT BUFFER MODEL

Capacity counts logical results, not physical messages or bytes, and defaults
to worker count. Runtime statistics expose stream parent outcomes and
produced/yielded/current/peak-buffered logical counts. Application-side ordered
reassembly or collection is intentionally outside this bound.

## BACKPRESSURE MODEL

For each stream, buffered results plus admitted unsettled children never exceed
`experimentalMaxBufferedResults`. Each child reserves a future result credit;
consumer reads release credits and repump the shared FIFO. `maxQueue` continues
to bound waiting compute weight independently. Batch admission consumes one
credit per logical item.

## ORDERING MODEL

Only completion order is supported. Within one physical batch, sequential
worker execution naturally preserves that batch's logical order; across
batches, settlement order wins. Ordered delivery is left to userland because a
slow low index can move almost all retention outside the runtime buffer.

## TRANSFER OWNERSHIP

The existing transfer envelope works without protocol changes. A worker owns a
buffer until posting, the host stream buffer owns it until yield, and the
consumer owns it afterward. Closing or failing drops undelivered host
references; prior ownership cannot be restored.

## SHARED RESULT BEHAVIOR

SAB-backed views yield normally and remain shared. Yielding neither transfers
nor freezes storage and introduces no synchronization guarantee. Disjoint
regions or Atomics remain the application's responsibility.

## FAILURE SEMANTICS

First producer failure rejects iteration, stops future production, cancels
siblings, and discards buffered values. Already-yielded values remain visible.
In a failing batch, earlier items can be observed and later items are skipped.
Worker crashes are not retried because side-effect progress is unknowable.

## CONSUMER CANCELLATION

Iterator `return()`—including `break` and loop-body exceptions—cancels remaining
logical work, clears buffered values, and removes listeners/timers. Iterator
`throw()` performs the same cleanup and rejects with the consumer error. Active
executions retain worker occupancy until they finish or crash.

## TIMEOUT / SHUTDOWN

One deadline covers startup, production, queueing, execution, buffering, and
consumer waiting. Slow consumers can therefore time out. Graceful shutdown
includes delivery and can wait indefinitely on an abandoned iterator; consumers
must drain or close it. Non-draining shutdown rejects iteration and terminates
under the established rules.

## ASYNC CONTEXT

One `PjsRangeOperation` AsyncResource remains associated with the parent.
Concurrent stream factories and consumer continuations retained isolated
AsyncLocalStorage stores. No resource is created per result, and worker stores
remain explicitly unpropagated.

## TEST RESULTS

The suite covers empty/one/many streams, batches 1 and greater than 1,
completion order, fast/slow consumers, bounds and metrics, break/throw,
producer failure, crash/replacement, cancellation, slow-consumer timeout,
draining/non-draining shutdown, transferred and shared output, concurrent
streams, ordinary/completion coexistence, async-context isolation, listener
cleanup, invalid options, and all pre-v0.7 behavior. Final validation passed
**130/130 tests**.

## STRESS RESULTS

The full correctness suite passed **10 consecutive rounds**. Repetition covers
consumer close versus results/batches, failure and timeout settlement,
shutdown with buffered results, worker crash replacement, and concurrent stream
contention. Terminal accounting remained exactly once.

## LARGE OUTPUT BENCHMARK

Measured 2026-09-28 on Node **24.21.0**, Windows **10.0.19045**, Intel Core
i3-10100F, eight available logical CPUs, and four workers. Each configuration
used a fresh process, one warmup, three retained samples, no forced GC, and no
outlier deletion.

For 32 transferred 1 MiB outputs, collected `partitionRange()` measured
**6.61 ms / 201.8 MiB** median wall/peak RSS. Completion-only measured
**4.85 ms / 234.4 MiB**. Fast streams at capacities 1/4/8 measured
**16.67/6.99/9.17 ms** and **170.4/172.2/176.5 MiB**. RSS includes allocator
history and worker-local allocations; completion's high RSS is a reminder that
discarded return values can still be allocated by user tasks.

## FAST CONSUMER BENCHMARK

Capacities 1/4/8 produced median peak runtime buffers of **0/3/3** and total
times of **16.67/6.99/9.17 ms**. Capacity 1 serialized admission enough to cost
throughput. Capacity 4 was best in this sample; the result does not justify an
automatic policy.

## SLOW CONSUMER BENCHMARK

With `await delay(2)` after every one of 32 values, capacities 1/4/8 retained
exact peaks of **1/4/8**, with RSS **171.4/174.7/178.9 MiB**. Total times were
**496.3/488.7/498.8 ms**. Windows timer granularity made the nominal 2 ms waits
roughly 15–16 ms each; the important observation is bounded production, not the
absolute delay duration.

## FIRST RESULT LATENCY

Collection exposed its first value only at **6.61 ms**. Fast streaming exposed
one at **1.39/1.66/1.62 ms** for capacities 1/4/8. Slow streaming still exposed
the first value in **0.54–1.64 ms** before consumer delay dominated total time.

## ORDERED VS COMPLETION ORDER

With partition zero deliberately slow, completion order exposed its first value
at **0.40 ms** and retained a peak of 3 runtime items. Userland ordered
reassembly exposed its first consumable value at **32.16 ms** and accumulated a
peak of **124** runtime-plus-userland pending values. Total times were similar
(**32.72/32.28 ms**), showing that ordering primarily changes latency and
retention rather than kernel completion.

## MAP VS STREAM-COLLECT

For 512 scalar no-ops at batch 8, stream-plus-userland-collection took
**31.27 ms** versus **10.46 ms** for direct `partitionRange()`. Iterator and
per-yield lifecycle work are visible. For 128 private numeric blocks totaling
2 MiB, the same comparison measured **16.75 ms** versus **29.11 ms**; process/JIT
variation and different settlement timing can reverse the ratio. These mixed
results support keeping direct collection rather than implementing map as a
stream wrapper.

## SHARED OUTPUT COMPARISON

The same 262,144-element numeric transform using shared input, disjoint shared
output, and `parallelFor()` measured **11.96 ms**. Private numeric
stream-collection measured **16.75 ms** and direct private block collection
**29.11 ms** in their fresh processes. Shared output avoided 2 MiB of returned
block transport but changes ownership and synchronization semantics, so it is
an alternative for typed numeric transforms rather than a general map result.

## PISCINA COMPARISON

Bounded manual Piscina 5.3.2 loops over 512 scalar no-ops measured collect,
incremental callback, and completion medians of **20.05/17.64/14.79 ms** at
batch 1 and **4.41/4.35/3.89 ms** at batch 8. First callback arrived at
**0.20/0.23 ms**. PJS scalar stream-collect measured **31.27 ms** at batch 8,
while direct PJS collection measured **10.46 ms**. Piscina has no equivalent
range AsyncIterable lifecycle in this harness; this compares bounded transport
patterns, not API superiority.

## EVENT LOOP IMPACT

Fast stream capacities 1/4/8 recorded median maximum event-loop delays of
**2.07/2.28/1.54 ms** and timer drift of **1.04/1.34/0.70 ms**. Slow-consumer
maximum delay was **16.19–21.66 ms**, tracking Windows timer granularity, while
ELU fell to **0.02–0.03** because the host mostly waited. The slow-first ordered
case reached **13.07 ms** maximum delay versus **9.88 ms** for completion order.

## FAIRNESS RESULTS

A slow capacity-bound stream, a fast stream, ordinary `run()`, and
`parallelFor()` all made progress in all nine trials. Median first ordinary
progress was **7.70/5.09/15.88 ms** at capacities 1/4/8; first `parallelFor`
progress was **12.21/11.75/15.35 ms**. Both streams delivered all 64 values and
no starvation was observed. No scheduler change is justified.

## REGRESSION CONTROLS

Committed v0.6 (`988ac16`) and v0.7 ran in fresh-process
baseline/candidate/candidate/baseline order with ten retained measurements per
case. Candidate/baseline ratios were: ordinary no-op **0.900**, medium CPU
**0.680**, 8 MiB clone **0.958**, transfer **0.893**, shared input **0.857**;
`partitionRange` batch 1/8 **0.919/1.057**; and `parallelFor` batch 1/8
**1.018/0.873**. Fine timings vary substantially, but there is no consistent
causal regression across existing paths and the only slower median was 5.7%.
All semantic regression tests also passed.

## MEMORY FINDINGS

The runtime bound held exactly in fast and slow cases, including batching.
Streaming reduced large-output sampled RSS relative to retained transfer
collection on this host, but capacity counts items and cannot cap one item's
size. Dropped buffers may remain reflected in RSS until GC/allocator release.
Userland ordering or collection can deliberately recreate whole-output
retention outside runtime metrics.

## BOTTLENECKS

Fine streams pay one iterator promise/continuation and coordinator settlement
per logical result. Capacity 1 can underuse workers; large capacities retain
more host output. Userland ordering suffers head-of-line retention. UUID/task
records, started/result messages, and logical settlement remain dominant for
tiny work even when transport is batched.

## OPEN QUESTIONS

- Whether a byte-observable budget can be defined without misleading users.
- Whether ordered delivery deserves a separate explicit API despite its
  head-of-line retention.
- Whether a true element-map contract should flatten returned blocks or require
  shared output.
- Whether a future stable family should use a `parallel` namespace.
- Whether cooperative task cancellation is worth synchronous polling cost.

## RECOMMENDED V0.8

Do not add map as an alias for partition collection. A future v0.8 proposal
should first study stream lifecycle ergonomics in real pipelines and whether
diagnostic byte estimates or an explicit element-block contract can be made
honest. Keep reduce, work stealing, automatic grain/batch sizing, and
cooperative cancellation separate until evidence identifies a concrete need.

Raw artifacts:

- [`result-streaming-v0.7.json`](../benchmarks/results/result-streaming-v0.7.json)
- [`stream-fairness-v0.7.json`](../benchmarks/results/stream-fairness-v0.7.json)
- [`runtime-regression-v0.7.json`](../benchmarks/results/runtime-regression-v0.7.json)
