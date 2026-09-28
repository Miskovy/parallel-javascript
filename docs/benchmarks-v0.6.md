# v0.6: completion-only parallel ranges and async context

## IMPLEMENTATION SUMMARY

v0.6 adds experimental `PjsRuntime.parallelFor()`, backed by the same lazy,
bounded range-operation engine as `partitionRange()`. The operation resolves
`void`, allocates no indexed result array, and tells workers to acknowledge
completion without preparing or posting task values. Protocol version remains
2 with explicit completion variants. One `AsyncResource` represents each range
parent. No map, reduce, work stealing, automatic grain/batch sizing, cooperative
cancellation, or worker context serialization was added.

See the [pre-implementation proposal](proposal-v0.6.md),
[ADR 0012](adr/0012-completion-only-operations.md), and
[ADR 0013](adr/0013-async-resource-context.md).

## COMPLETION-ONLY SEMANTICS

Success means every logical partition completed. Worker return values are
allowed for compatibility but ignored before transfer-envelope inspection,
structured clone, or result-message construction. First failure rejects once;
earlier side effects remain. Cancellation, timeout, and shutdown preserve v0.5
non-preemptive occupancy and exactly-once settlement.

## PUBLIC / EXPERIMENTAL API

```ts
await runtime.parallelFor(task, range, createInput, options);
```

The return type is `Promise<void>`. Range, partition, factory, and option types
are shared with `partitionRange()`. `runtime.parallelFor()` was selected over
`runtime.forRange()` and a new `parallel.for()` namespace; the latter remains a
possible stable family only after more algorithms mature.

## INTERNAL OPERATION MODEL

One `RangeOperation` has `resultMode: 'collect' | 'discard'`. Both modes share
production, children, weighted admission, deadlines, cancellation, failure,
and shutdown. Only collect mode owns `outputs[]`. Live child state remains
bounded by workers times batch size and no whole-range descriptor/Promise list
is created.

## OUTPUT TRANSPORT BEHAVIOR

Completion executes return `completed(taskId, executionMs)`; batch items use the
same compact type. The worker awaits user code but skips `transferOutput()` and
does not place its return value in `postMessage`. Tests confirm that an
uncloneable function return succeeds in completion mode while the ordinary
collecting path would reject serialization.

## SHARED OUTPUT MODEL

Benchmarks and tests use application-allocated SAB-backed arrays. Each partition
writes a disjoint index/row interval. PJS adds no mutex or automatic safety.
Overlapping writes need explicit synchronization. Failure and cancellation do
not roll back completed writes.

## BATCHING INTERACTION

Batch sizes 1/4/8 use the same logical items and completion contract. One batch
still executes sequentially and stops at first failure. Completion batching
reduces messages but may delay fairness and cancellation exactly as in v0.5.
Batching stays opt-in; input transfer lists still require batch size one.

## ADMISSION MODEL

`maxQueue` counts queued logical weight. A parent has at most
`workers * batchSize` unsettled children. Completion mode neither bypasses the
FIFO nor creates hidden capacity. Parent-operation capacity and factory
reservations are unchanged.

## FAILURE SEMANTICS

Earlier batch items report completion, the first failed item retains task,
worker, operation, and partition context, later items are skipped, and all
siblings settle under the existing first-failure rule. Worker crashes are not
retried because side-effect progress is unknowable.

## CANCELLATION / DEADLINES

One signal/deadline covers startup through final completion. Ungenerated and
queued work stops. Posted items remain non-preemptive and late acknowledgements
only release worker occupancy. Graceful shutdown drains the entire accepted
range; non-draining shutdown cancels it. The first shutdown mode wins.

## ASYNCRESOURCE DESIGN

One `PjsRangeOperation` AsyncResource is created in the accepting host context.
Factories and parent resolve/reject run in that scope, and cleanup emits destroy
once. A synthetic 512-item control measured medians of **0.0008 ms** with no
resource, **0.0011 ms** with one operation resource, and **0.0248 ms** with 512
per-child resources. The micro-control is not an additive runtime model, but it
supports avoiding per-child resources.

## ASYNCLOCALSTORAGE RESULTS

Concurrent stores remained distinct in lazy factories and after `await`, and
error/cancellation tests retained caller context. Worker tasks receive no host
store unless an application explicitly includes data in the task input. No
arbitrary context is serialized across isolates.

## TEST RESULTS

The suite covers empty/single/multiple ranges, batch 1/4/8, shared vector and
matrix output, clone metadata, input transfer, uncloneable/large ignored worker
values, batch failure, crash/replacement, cancellation, timeout, graceful and
non-draining shutdown, saturation, concurrent contexts, listener/resource
cleanup, metrics, and all existing v0.1-v0.5 behavior. Final validation commands
passed **117/117 tests** on the measurement host.

## STRESS RESULTS

The full 117-test correctness suite passed **10 consecutive rounds** for v0.6.
This covers the existing cancellation/failure/crash/shutdown races plus the new
completion suite.

## COMPLETION VS COLLECTING BENCHMARK

Measured 2026-09-28 on Node **24.21.0**, Windows **10.0.19045**, Intel
**Core i3-10100F**, eight available logical CPUs, using four workers. Each
configuration used a fresh process, one warmup, three retained samples, no
forced GC, and no outlier deletion.

Fine no-op/scalar results were mixed rather than a universal win. At 512
undefined outputs, collect/completion medians were **29.77/28.84 ms** (batch 1),
**12.28/13.84 ms** (batch 4), and **13.03/9.73 ms** (batch 8). At 512 scalar
outputs they were **26.12/29.94**, **13.37/12.40**, and **10.82/11.44 ms**.
Both modes emitted 512/128/64 execute and result messages at batches 1/4/8.
The compact completion response helps some cases, but host lifecycle and run
variation remain significant for tiny values.

## SHARED OUTPUT BENCHMARK

The shared vector transform processed 262,144 Float64 elements over 128 logical
partitions at batch 4 in **8.00 ms** median, with 32 execute/result messages and
no returned output payload. Every element was independently validated.

## MATRIX BENCHMARK

For exact 128x128 multiplication over 16 logical row partitions, private worker
output plus host assembly took **2.94 ms** median and transported 128 KiB of
numeric output. Disjoint shared C plus completion messages took **2.37 ms** and
transported no task output, using four physical messages at batch 4 versus 16
at batch 1. This comparison changes both output layout and batch count and is
reported as an end-to-end experiment, not an isolated transport ratio.

## VECTOR TRANSFORM BENCHMARK

The vector workload combines reusable shared input, disjoint shared output,
explicit grain, and completion-only acknowledgements. Correctness validation
found every value within 1e-12 of its expected result.

## OUTPUT-RETENTION RESULTS

Thirty-two 1 MiB successful outputs (32 MiB logical total) produced sampled peak
RSS of **325.5/326.2 MiB** for collection at batch 1/8 versus
**229.4/228.3 MiB** for completion. Wall medians were **25.20/32.28 ms** versus
**5.35/5.78 ms**. Completion workers still allocate the user-requested arrays;
the saving is that values are neither cloned into nor retained by the host.
RSS includes isolate heaps and allocator history and is not a byte-exact heap
accounting method.

## EVENT-LOOP IMPACT

Every main sample recorded `monitorEventLoopDelay`, event-loop utilization, and
1 ms timer drift. The 32 MiB batch-1 collection/completion max-delay medians
were **3.31/1.21 ms**; batch 8 was **10.50/3.37 ms**. Fine workloads were noisy,
typically around 1-2.6 ms maximum delay. Completion reduces host output pressure
for large values but does not guarantee lower delay for every small case.

## FAIRNESS RESULTS

A completion parent, collecting parent, and 128 ordinary tasks all made progress
in all nine trials. Median first ordinary progress was **5.57 ms** at batch 1,
**35.41 ms** at batch 4, and **34.91 ms** at batch 8. No starvation occurred,
but larger non-preemptive batches visibly delayed ordinary work. This supports
keeping batching explicit and making no scheduler change.

## PISCINA COMPARISON

The bounded manual Piscina 5.3.2 harness explicitly returned `undefined`. For
512 no-ops it measured **17.74 ms** at batch 1 and **4.03 ms** at batch 8,
versus PJS completion observations spanning **28.84-29.94 ms** at batch 1 and
**9.73-11.44 ms** at batch 8 for the two output-producing task variants.
Piscina has no identical algorithm API; these figures show that minimal result
transport and batching are general techniques, not a PJS performance advantage.

## ORDINARY RUN REGRESSION CONTROL

Committed v0.5 and v0.6 were run in fresh-process
baseline/candidate/candidate/baseline order with six retained samples per case.
Candidate/baseline ratios were: no-op **0.991**, small CPU **0.911**, medium CPU
**0.999**, large CPU **0.984**, 8 MiB clone **1.047**, 8 MiB transfer **0.638**,
and shared input **1.041**. The clone/shared differences are small enough to be
host variation; no broad causal ordinary-run regression is visible.

## PARTITIONRANGE REGRESSION CONTROL

The same committed-v0.5 control measured candidate/baseline ratios of **1.109**
for 512 no-ops at batch 1, **0.978** at batch 8, and **0.949** for 32 medium CPU
partitions. Operation-level AsyncResource cost is most visible in the finest
unbatched case; batching and meaningful CPU work did not regress in this sample.

## MEMORY FINDINGS

The defining invariant is validated: completion parents own no result array and
successful values do not cross the worker boundary. Memory can still scale with
application-owned shared output, worker-local allocations, live bounded inputs,
or module-global retention. `maxQueue` remains a work-count bound, not a byte
budget.

## BOTTLENECKS

Fine work is still dominated by per-child UUID, Promise/task records, started
acknowledgements, message delivery, and settlement. Completion removes output
work but does not remove logical lifecycle cost. Batch size 8 improves message
count but can delay competing ordinary work. Shared-output throughput remains
subject to cache and memory-bandwidth effects.

## OPEN QUESTIONS

- Whether the eventual stable family should use a `parallel` namespace.
- Whether completion-specific task registration would prevent enough accidental
  allocation to justify new surface.
- Whether output streaming or map is the more useful next retained-result step.
- Whether explicit typed worker context is needed by real framework integrations.
- Whether cooperative cancellation is worth additional task polling overhead.

## RECOMMENDED V0.7

Do not pre-commit a feature solely from this host. The strongest evidence is
that retained/transported output is a real cost and disjoint shared output is
useful. The next proposal should evaluate **output streaming versus an
experimental parallel map** around the shared range engine, while retaining
cooperative cancellation and worker-context propagation as separate candidates.
Work stealing and automatic batch/grain selection remain unjustified.

Raw artifacts:

- [`completion-only-v0.6.json`](../benchmarks/results/completion-only-v0.6.json)
- [`completion-fairness-v0.6.json`](../benchmarks/results/completion-fairness-v0.6.json)
- [`runtime-regression-v0.6.json`](../benchmarks/results/runtime-regression-v0.6.json)
