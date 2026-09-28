# v0.5: dispatch efficiency and bounded batching

## IMPLEMENTATION SUMMARY

v0.5 keeps the fixed worker pool and central FIFO. It adds protocol version 2
and an experimental `experimentalDispatchBatchSize` range option (1–16). A
physical message may carry several logical children from one operation; the
worker invokes the registered export sequentially and returns one correlated
response. Batch size 1 follows the ordinary v0.4 path.

The implementation also adds disabled-by-default internal profiling and a
public `stats().dispatch` split between physical execute/result messages and
logical task/partition counts. It adds no automatic grain, work stealing,
streaming, stable `for/map/reduce`, or scheduler replacement. See the
[pre-implementation proposal](proposal-v0.5.md), [ADR 0010](adr/0010-dispatch-efficiency.md),
and [ADR 0011](adr/0011-batched-partition-dispatch.md).

Measured 2026-09-28 on Node **24.13.1**, Linux **6.19.10-300.fc44.x86_64**,
AMD **Ryzen 3 PRO 3300U**, four available logical CPUs and 7.72 GB RAM. No CPU
affinity, governor control, exclusive host, forced GC, or hardware counters
were used. Each of 306 main-sweep configurations used a fresh process and fixed
pool, one warmup, and three retained samples. All samples and outliers remain in
[`dispatch-efficiency-v0.5.json`](../benchmarks/results/dispatch-efficiency-v0.5.json).

## PROFILING RESULTS

Internal timing was run in fresh-process **off/on/on/off** order, eight
operations each, with the last two used as the warm comparison. Off-session
medians were **28.09/29.78 ms** and on-session medians **29.18/30.12 ms** for
512 no-op children. The roughly 2–4% change is visible, so performance
claims below use non-instrumented runs.

The diagnostic main-process CPU profile repeatedly sampled worker
snapshot/dispatch code, supporting message-count reduction rather than
descriptor redesign. The retained stage-timing artifact preserves every timing observation in
[`dispatch-profile-v0.5.json`](../benchmarks/results/dispatch-profile-v0.5.json).

## CURRENT-RUNTIME MANUAL VS OWNED

The current candidate runtime is used for both controls. Manual production has
a bounded workers-sized unsettled window, identical logical descriptors,
payloads, ordering and pool size. At four workers/512 scalar no-ops, manual was
**26.92 ms** and owned batch 1 was **31.27 ms** in the primary sweep. At 128,
they were **12.12/12.45 ms**. The coordinator therefore adds measurable work at
fine grain; the archived v0.3 comparison remains historical context rather than
the isolation control.

The independent four-worker/512 sequence A/B/B/A retained substantial host
variation: manual **27.99/26.75 ms**, owned batch 8 **14.59/14.56 ms**. The
direction survives the drift, but these are not confidence intervals.

## DISPATCH COST BREAKDOWN

Warm instrumented observations gave these median per-logical-item probes:

| Probe                                         | Approximate µs/item |
| --------------------------------------------- | ------------------: |
| Frozen descriptor creation                    |                0.63 |
| Factory                                       |                0.24 |
| Child admission, including immediate dispatch |               10.20 |
| Host `postMessage` call                       |               10.92 |
| Worker ingress                                |                6.37 |
| Worker output preparation                     |                1.11 |
| Worker-result transport to handler            |              147.29 |
| Parent collection                             |                0.40 |
| Host result settlement                        |                2.21 |

The transport probe includes event-loop wait and overlaps across workers; child
admission includes `postMessage`. These rows must not be added into an operation
prediction. They show that descriptor/factory/collection work is small and that
the repeated asynchronous round trip dominates no-op scale.

Observed time is usefully described as
`production + dispatch(messages) + serialization + compute + result transport + settlement + collection + contention`.
The relative terms change with payload size, output size, grain and skew.

## DESCRIPTOR / HOST PRODUCTION FINDINGS

Isolated medians were: plain descriptor **8 ns**, frozen descriptor **57 ns**,
numeric triple **2 ns**, UUID **218 ns**, Map insert/delete **78 ns**, resolved
Promise construction **49 ns**, and abort-listener add/remove **365 ns** per
operation. These microbenchmarks omit integration effects and are not additive.

Freezing costs more than an internal numeric triple, but even 512 measured
frozen descriptors account for only tens of microseconds. Public immutable
`{ index, start, end }` descriptors remain unchanged. Reconstructing them in a
worker would complicate identity and protocol semantics without addressing the
measured round trips.

## BATCHING DESIGN

One bounded batch contains adjacent children from one operation and task. The
host retains every logical task ID and partition context. The worker processes
items sequentially, awaits each export, stops on first failure, aggregates
output transfer lists, and sends one response. Batch size is capped at 16;
production stages no more than one batch at a time per selected worker and no
more than worker-count physical batches per synchronous production turn.

The option stays experimental and defaults to 1. No workload-independent
automatic value is justified: no-op prefers large batches, while the stable
skew control shows serious loss of balance when coarse work is grouped.

## LOGICAL VS PHYSICAL ADMISSION

`maxQueue` counts logical waiting weight. A queued batch of eight consumes eight
credits, even though it is one FIFO node. Each operation has at most
`workers × batchSize` live logical children; the worker pool still has at most
`workers` physical executions. The active-parent limit remains
`workers + maxQueue`. Logical `tasks`, `operations`, and `partitions` meanings
are unchanged; `dispatch` reports physical messages separately.

At four workers/512 no-ops, batch 1 recorded **512 execute + 512 result**
messages. Batch 8 recorded **64 + 64**; batch 16 recorded **32 + 32**. No entire
range or hidden `maxQueue × batchSize` backlog is created.

## TRANSFER OWNERSHIP FINDINGS

Configured batching above one rejects a nonempty input transfer list before
reservation, posting, or detachment. This adopts the conservative strategy:
logical items skipped after an earlier failure never lose caller-owned input.
Shared and cloned inputs batch normally. Worker-owned output buffers can be
transferred together in the combined response and are tested.

Production matrix work with transferred A row blocks therefore remains at batch
size one. The matrix research grid below clones exclusive A rows and shares B
solely to study compute/message behavior without changing the production
ownership contract.

## FAILURE SEMANTICS

Earlier items in a failing batch may succeed internally. The first failing item
retains its logical operation ID, partition index and range. Later items do not
execute. The parent rejects once, queued siblings are removed, running sibling
executions keep their slots, and accumulated/late output is discarded. Invalid
or reordered correlation fails the worker. A crash fails the parent and uses
bounded replacement with no retry because partial side effects are unknown.

## CANCELLATION SEMANTICS

Queued weighted batches are removed logically. A posted batch is one
non-preemptive worker execution: cancellation or timeout settles the caller and
cancels undispatched work, while that worker finishes the full batch unless an
item fails. Tests verify the occupied slot is not released early. Cooperative
batch cancellation remains separate design work.

## TEST RESULTS

The complete suite passes **105/105** tests, including batch size 1 equivalence,
reversed completion, failures at first/middle/final items, output serialization,
shared/clone/output-transfer behavior, explicit input-transfer rejection,
weighted saturation, reentrant factories, cancellation/timeout occupancy,
crash/no-retry/replacement, malformed responses, both shutdown modes,
concurrent parents, ordinary competition and logical/physical metrics.

## STRESS RESULTS

Two complete five-round stress campaigns pass after the final implementation.
They exercise existing transfer/cancellation/crash races plus the new batch
tests; no failed, cancelled, skipped or duplicate-settlement test was observed.

## NO-OP BENCHMARK

The retained matrix covers 1/2/4 workers and 1/2/4/8/16/32/128/512 logical
items. Selected scalar-output medians:

| Workers | Logical | Manual PJS | Owned b1 | Owned b4 | Owned b8 | Owned b16 |
| ------: | ------: | ---------: | -------: | -------: | -------: | --------: |
|       1 |     128 |      14.53 |    14.89 |     7.87 |     6.45 |      7.18 |
|       1 |     512 |      46.71 |    43.86 |    22.79 |    19.24 |     15.82 |
|       2 |     128 |      11.47 |    12.69 |     6.77 |     6.32 |      5.52 |
|       2 |     512 |      36.84 |    33.56 |    17.13 |    16.22 |     12.55 |
|       4 |     128 |      12.12 |    12.45 |     8.45 |     6.93 |      5.81 |
|       4 |     512 |      26.92 |    31.27 |    16.87 |    15.63 |     12.26 |

Times are ms. At four/512, b16 reduces owned wall **60.8%** and messages
**93.75%** relative to b1. One worker also improves, proving this is message and
lifecycle amortization rather than added compute parallelism.

## SHARED-SCAN BENCHMARK

A reusable shared 2 MiB Float64 input plus scalar output isolates compact
metadata transport. Four-worker medians:

| Logical partitions | Owned b1 |    b2 |   b4 |   b8 | Manual | Piscina manual |
| -----------------: | -------: | ----: | ---: | ---: | -----: | -------------: |
|                  4 |     1.15 |  1.24 | 1.31 | 1.51 |   1.16 |           0.91 |
|                 16 |     3.16 |  2.09 | 1.43 | 1.92 |   1.55 |           2.26 |
|                 32 |     5.54 |  3.06 | 2.05 | 2.64 |   4.30 |           3.34 |
|                128 |    11.75 | 11.39 | 8.03 | 6.08 |  10.03 |          10.75 |

Batching helps fine shared scans, while four coarse partitions are already too
short/noisy for a general ranking.

## MATRIX BENCHMARK

The v0.5 128×128 control shares B and clones compact A rows so batching is
ownership-safe. At 128 logical rows, owned b1/b2/b4/b8 measured
**14.16/13.97/10.23/7.90 ms** with 128/64/32/16 messages. At 16 logical blocks,
the best was b2 at **4.15 ms**. At four blocks, b1 was **3.69 ms** and larger
batches reduced parallelism. This control is smaller and has different output
transport than v0.4's transferred 512×512 study; the reports are not direct
speed comparisons.

## SKEW BENCHMARK

The original floating-number/increasing-addition skew is retained. At 128
logical partitions, b1/b2/b4/b8 measured **11.90/10.93/8.37/6.29 ms**. Its
small total workload lets transport dominate, and its known grain-dependent
JIT/number behavior prevents a clean balance claim.

## ARITHMETIC-STABLE SKEW CONTROL

The new control uses `Math.imul`, bitwise xorshift and a bounded 32-bit
accumulator. With four coarse logical partitions, b1 took **25.65 ms**, b2
**40.16 ms**, and b4 **48.70 ms**: grouping reduced physical parallelism and
nearly doubled wall time. At 32 partitions b1/b2/b4/b8 were
**22.68/21.67/22.23/27.92 ms**. At 128 they were
**22.66/19.95/17.20/19.94 ms**. Batching can recover fine-grain message cost,
but no fixed batch is best across grains.

## GRAIN VS BATCH RESULTS

Grain and transport batching are independently observable. For the stable skew
control, changing four logical partitions from b1 to b4 keeps computation and
boundaries fixed but changes 4 messages to 1 and hurts balance. Changing grain
from 4 to 32 partitions at b1 improves balance (25.65→22.68 ms) while increasing
messages eightfold. At 128 partitions, b4 restores 32 messages and reaches
17.20 ms. This is the tradeoff an eventual cost model must represent.

## PISCINA COMPARISON

Piscina remains exactly **5.3.2**, with a fixed pool, concurrency one and a
bounded producer. At four workers/512 no-ops, Piscina manual was **31.50 ms**,
manual batch 4 **12.90 ms**, and manual batch 16 **3.71 ms**. PJS owned b1/b4/b16
was **31.27/16.87/12.26 ms**. Both improve sharply as message count falls, so
the result demonstrates a general batching benefit. It does not establish PJS
scheduler superiority; Piscina remains faster in this no-op harness.

## EVENT-LOOP IMPACT

Each main sweep sample records ELU, `monitorEventLoopDelay`, and independent
one-millisecond timer drift. At four workers/512 no-ops, median maximum delay
was **2.54 ms** for owned b1, **2.77 ms** for b8 and **2.98 ms** for b16;
timer drift was **1.47/1.69/1.88 ms**. Batching did not materially improve this
short-run latency signal; the dedicated sustained fairness run is more useful.

The fairness campaign ran two 128-child parents plus 128 continuously produced
ordinary tasks. No stream starved. Batch 1 ordinary first progress was
13.3–22.0 ms; batch 4 was 66.5–75.4 ms; batch 8 was 59.4–68.0 ms. Maximum
event-loop delay across those trials was 9.83 ms. Larger non-preemptive batches
improved parent tails but delayed competing ordinary work.

## OUTPUT-RETENTION FINDINGS

For 512 manual calls, collecting versus discarding was within session noise for
undefined/scalar/object/three-word typed outputs. A 64 KiB output per logical
item (32 MiB total) measured **49.61 ms / 292.1 MiB peak RSS** when collected
and **49.26 ms / 263.2 MiB** when discarded. Owned b8 still collects and used
**45.88 ms / 276.9 MiB**. Output bytes, unlike admission count, remain
unbounded. The evidence supports future non-collecting semantics for large
results, but does not define streaming or reduction.

## ORDINARY RUN() REGRESSION CONTROL

An isolated build of v0.4 commit `1f3e647` and the final candidate ran in
baseline/candidate/candidate/baseline order. At one worker, candidate/baseline
ratios for small/medium/large CPU work were **0.956/0.953/1.002**; at four they
were **1.209/0.949/1.005**. The 32-way small four-worker control is a retained
1.65 ms regression, while medium and large controls do not show a broad
slowdown. Its fixed per-message sensitivity is consistent with new protocol
validation and physical counters, but this run does not isolate those terms.
Exact observations are in
[`cpu-regression-v0.5.json`](../benchmarks/results/cpu-regression-v0.5.json).
The candidate removes defensive worker-snapshot allocations from internal
dispatch and keeps an allocation-free ordinary correlation fast path; batching
arrays and weighted accounting are entered only for partition batches.

## BOTTLENECKS

At tiny grain, per-message worker transport, protocol transitions and generic
task lifecycle dominate; the FIFO queue and frozen descriptor cost do not.
Large cloned/transferred values move the bottleneck to serialization and bytes.
Compute-heavy irregular work makes worker occupancy and contiguous batch shape
dominant. Large outputs make transport and retention visible. Batching reduces
round trips but cannot fix all four regimes with one value.

## OPEN QUESTIONS

- Should a future completion-only operation avoid storing ordered output?
- Can batch choice be advised from measured task/payload/output cost without an
  unsafe universal auto-grain policy?
- Should posted batches eventually poll a cooperative cancellation flag?
- What async scope and `AsyncLocalStorage` behavior should each logical item
  have inside one physical worker message?
- Would interleaved rather than contiguous batch membership reduce skew without
  weakening deterministic identity?

## RECOMMENDED V0.6

Design a high-level experimental completion-only `parallel.for` on the existing
bounded range machinery, with explicit output-retention semantics and
`AsyncResource`/context requirements. Keep dispatch batching opt-in and explicit
while collecting wider workload data. Do not add work stealing: v0.5 again
shows message cost and batch occupancy, not central FIFO contention, as the
important limits. Streaming, adaptive grain and cooperative cancellation each
need separate lifecycle designs rather than incidental additions.
