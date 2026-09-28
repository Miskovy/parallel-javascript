# v0.4: runtime-owned partitioning

This milestone adds experimental numeric range ownership above the existing
FIFO. It measures whether that ownership changes successful-work cost and how
explicit grain affects uniform and uneven kernels. It does not introduce
adaptive chunking, work stealing, nested execution, or stable parallel APIs.

## Implementation and lifecycle contract

`partitionRange(task, { start, end, grainSize }, createInput, options?)` owns one
main-isolate parent, lazy immutable descriptors, bounded ordinary child tasks,
and logically ordered outputs. The factory synchronously prepares explicit
payloads; only registered module tasks execute in workers. No whole-range
descriptor/Promise/result allocation occurs at admission.

Active parent records are bounded by `min(MAX_SAFE_INTEGER, workers + maxQueue)`.
Each parent has at most worker-count unsettled children; actual children share
the existing global `maxQueue` and worker slots. Parent acceptance can wait for
startup/capacity, while ordinary `run()` retains immediate overflow rejection.
Factories reserve an admission credit against reentrant submissions. Output
retention is proportional to completed results, not bounded in bytes.

First observed child/factory failure rejects once and cancels sibling callers.
Queued children disappear; busy workers remain occupied until completion/crash.
No retry or task-failure termination is added. Errors retain their existing
classes and gain operation/partition context. One parent signal/deadline covers
startup through collection. Graceful shutdown drains the entire accepted range,
including ungenerated chunks; non-draining shutdown cancels parents and uses
the existing worker termination path. Worker-created partition operations reject.

`tasks.*` includes ordinary tasks plus admitted children. `operations.*` records
parent outcomes independently; `partitions.*` separates generated/admitted and
terminal child callers. A timed-out parent cancels its children rather than
giving every child a new timeout. Scheduled children count as running in live
operation snapshots. No completed-parent history is retained.

See the [proposal written before implementation](proposal-v0.4.md),
[range guide](partitioning.md), [ADR 0008](adr/0008-runtime-owned-partitioning.md)
and [ADR 0009](adr/0009-partition-admission-and-metrics.md). The scheduler, pool,
worker protocol, transfer implementation and shared construction helper remain
unchanged. Runtime dependencies remain zero.

## Environment and reproduction

Measured 2026-09-27: Node **24.13.1**, Linux **6.19.10-300.fc44.x86_64**,
AMD **Ryzen 3 PRO 3300U**, four logical CPUs and availableParallelism=4,
7,715,659,776 bytes physical memory. No affinity, governor, exclusive-machine
reservation or hardware performance counters were imposed. This is one laptop
session; thermal state, OS activity, JIT and GC remain sources of variation.

[Reproduction instructions](../benchmarks/partitioning/README.md) build committed
v0.3 **f6cd689** with the same installed compiler, using its own runtime module
and transfer envelope recognition. Pinned **Piscina 5.3.2** is development-only.

- PJS manual: archived v0.3 with a bounded workers-sized harness producer.
- PJS owned: v0.4 `partitionRange()`, with runtime-generated descriptors.
- Piscina manual: the same bounded harness producer over a fixed Piscina pool.

Each uses the same kernels, grain, payloads, output ordering, workers-sized
unsettled window and `maxQueue=workers`. Manual production is lazy; there is no
unbounded Promise.all baseline. This comparison includes both the PJS version
change and ownership change; differences are not isolated coordinator CPU cost.
Cancellation/failure behavior is not compared across libraries.

Workers 1/2/4 × target factors 1/2/4/8/32 chunks per worker. Grain is
`ceil(size / (workers * factor))`; actual grain/chunk count is recorded. All tested
sizes divide these settings exactly. Each configuration has a fresh process and
fixed pool, an all-worker import barrier, one separately retained first run,
two warmups and **five retained timed samples**. Configurations run sequentially,
with engine/memory order rotation; no tests run concurrently. No outliers are
removed. Reported times are sample medians, not confidence intervals.

These are **warm reused-input** timings. Original input generation and every
independent oracle check are excluded equally. Shared allocation/copy occurs
once per configuration and is separately reported. Wall time includes lazy
factories, required input slicing, dispatch, computation, result transport,
ordered collection and matrix assembly. Every first/warmup/timed output is
checked against an arithmetic-series or differently ordered matrix oracle.

## Metric boundaries

PJS queue/execution means use per-operation cumulative-count deltas, excluding
startup probes and other samples. Queue means acceptance to scheduling;
execution means worker function/await, excluding output posting. Piscina's
different histogram boundaries are not presented as identical: those two fields
are null, and all engines additionally record kernel time and payload-ready to
kernel-start latency. The latter includes serialization and transport, **not
just queue delay**. Near-zero queue latency is expected with a workers-sized
window; it does not establish fairness under saturation.

CPU is process CPU time divided by wall time: 100% means one logical CPU, 400%
is this machine's nominal four-CPU capacity. It includes host/worker/JIT/GC work.
RSS is process-wide, sampled every 5 ms plus endpoints, with no forced GC or
baseline subtraction. Short synchronous peaks may be missed. Known backing-byte
budgets exclude object metadata, allocator history and VM overhead.

The worker occupancy proxy sums kernel wall intervals divided by workers ×
operation wall. Each probed thread appears, including zero-work threads.
Preemption can occur inside a kernel interval, so this is not measured CPU or
precise idle time. Per-thread intervals help diagnose skew but cannot identify
OS scheduling pauses. No-op wall/chunk measures amortized coordination and
round-trip cost, not isolated dispatch CPU. Timestamp instrumentation itself
costs something, especially at tiny grains.

## Range sum: 16 MiB, three input layouts

Each kernel sums disjoint indices of a Float64 array repeating 0..250. Clone
sends the **entire 16 MiB source per child**. Shared sends the same reusable
SAB view. Transfer slices and moves only the child's compact disjoint portion;
its offset is explicit. All return small scalar/diagnostic results.

Four-worker median wall time (ms), with actual child counts:

| Input            | Children | Manual v0.3 | Owned v0.4 |  Piscina |
| ---------------- | -------: | ----------: | ---------: | -------: |
| Clone            |        4 |      86.627 |     79.230 |  111.929 |
| Clone            |        8 |     136.652 |    115.670 |  195.415 |
| Clone            |       16 |     166.339 |    186.021 |  363.866 |
| Clone            |       32 |     393.819 |    379.228 |  738.753 |
| Clone            |      128 |    1456.397 |   1577.173 | 2982.279 |
| Shared           |        4 |       6.061 |      4.358 |    3.854 |
| Shared           |        8 |       5.837 |      5.609 |    5.790 |
| Shared           |       16 |       7.404 |      8.031 |    7.407 |
| Shared           |       32 |       9.080 |     11.467 |    7.624 |
| Shared           |      128 |      18.953 |     23.807 |   14.779 |
| Compact transfer |        4 |      18.947 |     19.486 |   18.569 |
| Compact transfer |        8 |      21.693 |     20.171 |   19.605 |
| Compact transfer |       16 |      20.351 |     23.671 |   20.369 |
| Compact transfer |       32 |      38.207 |     27.070 |   26.695 |
| Compact transfer |      128 |      35.042 |     37.551 |   32.474 |

At four children, owned shared input took **4.358 ms**, plus **14.474 ms**
one-time shared preparation outside the reused-operation timer. Compact transfer
took **19.486 ms**, including its per-operation 16 MiB preparation copy. Thus
shared reuse wins here, but the warm number is not a one-shot construction
claim. Four-worker owned shared samples ranged 3.86–5.01 ms across the five trials;
small engine differences should not be generalized.

Increasing children to 128 slowed owned shared input to **23.807 ms**, while
mean worker execution per child fell from **2.345 ms to 0.050 ms**. PJS queue
means were only **0.0066 / 0.0049 ms** at these endpoints. Finer chunks mostly
add coordination and messaging for this uniform scan. Owned was slower than
manual at 16/32/128 shared children; Piscina was faster at those grains too.

Clone is dominated by duplicated transport: four versus 128 children clone
**64 MiB versus 2 GiB** per operation. Its 79.230→1577.173 ms increase cannot
be diagnosed as a need for work stealing. Compact transfer always slices/moves
only **16 MiB total**, although increasing messages still costs time.

Best observed owned configuration at each worker count (selection among five
grains; not an automatic policy):

| Workers | Clone ms (factor) | Shared ms (factor) | Compact transfer ms (factor) |
| ------- | ----------------: | -----------------: | ---------------------------: |
| 1       |        18.906 (1) |          5.209 (1) |                   22.068 (1) |
| 2       |        53.830 (1) |          4.504 (4) |                   19.060 (1) |
| 4       |        79.230 (1) |          4.358 (1) |                   19.486 (1) |

More workers hurt full-clone transport and barely help the reused shared scan
on this host. At four workers/factor 1, owned process CPU was **160% clone,
251% shared, 139% transfer**; high process CPU alone does not mean useful kernel
parallelism. Raw [135 range configurations](../benchmarks/results/range-partition-v0.4.json)
retain every sample, factory cost, latency, CPU, RSS and allocation budget.

## Matrix rows: common B and exclusive A/output

The application specifies rows `[0, 512)`; owned PJS divides that range.
Each child receives compact transferred A rows and the same shared B, performs
the existing i-k-j Float64 multiplication, and transfers its private output.
The host assembles rows inside the wall timer. A full i-j-k reference checks
every signed-integer output element outside timing.

Four-worker median wall time (ms):

| Factor | Children | Rows/child | Manual v0.3 | Owned v0.4 | Piscina |
| ------ | -------: | ---------: | ----------: | ---------: | ------: |
| 1      |        4 |        128 |     161.561 |    130.054 | 117.889 |
| 2      |        8 |         64 |     164.030 |    113.368 | 106.984 |
| 4      |       16 |         32 |     109.760 |    108.708 | 110.045 |
| 8      |       32 |         16 |     110.601 |    111.403 | 111.377 |
| 32     |      128 |          4 |     158.308 |    149.927 | 135.225 |

The three engines converge around **109–111 ms** at factor 4. Owned PJS's
best observed result is **108.708 ms**, with samples **101.08–118.82 ms**;
Piscina's best is **106.984 ms** at factor 2. Neither supports a general winner.
Owned factor 32 regresses to **149.927 ms**, despite only **3.102 ms** mean
worker execution per child. At factor 4 it has **22.000 ms** mean execution,
**0.0187 ms** queue mean, **306%** process CPU and **0.846** kernel occupancy
proxy; factor 32 drops to **273% / 0.634**. Fine division is not free even when
the transferred byte total is fixed.

Best owned medians at 1/2/4 workers are **330.865 / 160.987 / 108.708 ms**,
at factors **32 / 8 / 4** respectively. These independently selected grains
give about 3.04× from one to four workers, not a serial-main-thread speedup.
The one-worker optimum differing from the four-worker optimum reinforces that
one universal grain is unjustified. Cache effects, JIT and session variation
also affect grain comparisons; smaller chunks are not a pure load-balance test.

All grains share **2 MiB B** once per configuration, copy/transfer **2 MiB A**
per operation, transfer **2 MiB output**, and allocate **2 MiB assembly**. The
original A/B are retained equally. At the four-worker owned optimum, shared
construction took **2.235 ms** outside reused-operation timing and sampled
peak RSS was **158.0 MiB**. This combines shared common data with exclusive
transfers without a registry. Raw
[45 matrix configurations](../benchmarks/results/matrix-partition-v0.4.json)
include all five grains at every worker count.

## Increasing-cost skew

Indices `[0, 4096)` perform `(i + 1) * 16` inner additions of `j & 255`, so
later indices require more loop iterations. Expected sums use full cycles of
0..255 plus an arithmetic remainder, not a second copy of the timed loop.
Inputs are small cloned metadata and outputs are scalar. Static equal-width
grains still flow dynamically to idle workers through the same central FIFO.

Four-worker median wall time (ms):

| Factor | Children | Indices/child | Manual v0.3 | Owned v0.4 | Piscina |
| ------ | -------: | ------------: | ----------: | ---------: | ------: |
| 1      |        4 |          1024 |      88.591 |     89.370 |  83.964 |
| 2      |        8 |           512 |      68.484 |     71.030 |  78.281 |
| 4      |       16 |           256 |      41.670 |     42.266 |  40.294 |
| 8      |       32 |           128 |      41.282 |     42.791 |  42.310 |
| 32     |      128 |            32 |      55.404 |     58.834 |  51.227 |

Owned improves **2.11×** from four to sixteen children, then loses **39%**
at 128 children relative to sixteen. The three engines show the same broad
tradeoff. Runtime ownership is not itself a scheduling-speed breakthrough;
bounded finer division over FIFO is enough to reduce this tail imbalance.

In the owned four-child sample nearest its median, per-worker kernel intervals
were **6.25 / 34.91 / 57.02 / 87.88 ms**, with operation wall **89.37 ms**.
At sixteen children, the median-wall sample accumulated **24.32 / 31.81 /
28.96 / 32.97 ms** per worker over **42.27 ms** wall. The median occupancy
proxy rises **0.535→0.731**; at 128 children it drops to **0.495**, even though
worker kernel totals are more similar. More even compute assignment does not
offset unlimited message overhead.

At factor 4, owned mean queue delay is **0.0116 ms**, mean worker execution
**7.433 ms**, and process CPU **267.5%**. At factor 32 those become
**0.0071 ms / 0.938 ms / 260.1%**. Queuing is small; a faster queue policy is
not established as the bottleneck. At factor 1, process CPU is only **206.5%**.

There is an important confound: even one worker improves from **183.142 ms**
at one chunk to **130.970 ms** at 32 chunks, where there is no inter-worker
balancing benefit. Chunk boundaries also change the accumulator's magnitude
and V8 optimization feedback; JIT/number representation is a plausible cause,
not established by a profile here. Therefore the whole 2.11× four-worker change
must not be credited to balance alone. Kernel wall intervals include preemption,
and grain-specific JIT/GC/session variation remains. A future study should add
an arithmetic-representation control before predicting general imbalance gains.

Best owned medians at 1/2/4 workers are **130.970 / 60.639 / 42.266 ms**, at
factors **32 / 8 / 4**. Raw [45 skew configurations](../benchmarks/results/skew-partition-v0.4.json)
retain all per-worker observations rather than an invented exact idle metric.

## Grain cost and no-op control

The no-op task returns only metadata and timing diagnostics. Its operation
wall captures parent/manual production, payload factory, admission, messaging,
adapter work and ordered collection. It is not a subtraction-based estimate
of scheduler CPU. Four-worker medians:

| Children | Manual v0.3 ms | Owned v0.4 ms | Piscina ms | Owned amortized µs/child |
| -------- | -------------: | ------------: | ---------: | -----------------------: |
| 4        |          1.111 |         1.230 |      0.841 |                    307.4 |
| 8        |          1.585 |         4.433 |      1.761 |                    554.1 |
| 16       |          2.967 |         3.528 |      2.395 |                    220.5 |
| 32       |          4.900 |         6.930 |      3.963 |                    216.6 |
| 128      |         25.590 |        27.708 |     16.213 |                    216.5 |

The eight-child owned result is especially noisy/non-monotonic and is retained.
At 128 children, owned mean queue is **0.0057 ms**, worker execution
**0.0278 ms**, kernel **0.0016 ms**, and payload-ready to kernel start
**0.2884 ms**. Wall per child (**0.2165 ms**) and per-child latency have different
overlap/measurement boundaries; they must not be added as an accounting identity.
Raw [45 dispatch configurations](../benchmarks/results/dispatch-partition-v0.4.json)
include all workers and grains.

For the tested four-worker workloads, coarse shared scans prefer factor 1,
matrix factor 4, and skew factor 4–8. Factor 32 costs more in all three. These
are observed settings, not a built-in heuristic or universal minimum task time.
The one-/two-worker optima differ. Larger grains, fewer copied bytes and reduced
round-trip overhead deserve investigation before a new scheduling algorithm.

## Piscina interpretation

PJS owns partition generation; the Piscina harness owns it. Both use persistent
fixed pools, identical successful-work payloads/kernels, and bounded producers.
Piscina uses minThreads=maxThreads, concurrency one, maxQueue=workers and its
default synchronous Atomics. The pinned version and all raw samples are retained.

Piscina is faster in the shared scan at four/128 children (**3.854/14.779 ms**
versus owned **4.358/23.807 ms**) and in the no-op control. Matrix engines are
close around their useful middle grains; the skew curves share the same trend.
PJS clone results are faster in this sweep, but full-array transport dominates
that deliberately inefficient layout. This is not evidence for a general
PJS performance advantage, nor a comparison of cancellation, diagnostics,
fairness or all library features. No timing from an old machine is used as a
direct v0.4 baseline.

## Memory findings

Four-worker sampled process RSS peaks across timed trials (MiB):

| Layout/configuration                 | Manual v0.3 | Owned v0.4 | Piscina |
| ------------------------------------ | ----------: | ---------: | ------: |
| Range clone, 4 children              |       443.6 |      490.5 |   534.4 |
| Range clone, 128 children            |       587.3 |      635.8 |   734.4 |
| Range shared, 4 children             |       135.7 |      134.9 |   135.3 |
| Range shared, 128 children           |       145.2 |      146.4 |   144.0 |
| Range compact transfer, 4 children   |       246.0 |      247.1 |   248.0 |
| Range compact transfer, 128 children |       207.4 |      209.1 |   260.5 |
| Matrix shared/transfer, 16 children  |       159.5 |      158.0 |   162.5 |
| Skew metadata, 16 children           |       102.5 |      103.8 |   102.6 |

Shared storage is one source copy, not one per child. Compact transfers move
only exclusive slices but create fresh backing each operation. Clone allocations
grow with child count even though only a worker-sized window is unsettled.
GC/allocator retention explains why RSS can greatly exceed the live payload
window and why transfer RSS is not monotonic with grain. These samples neither
prove exact physical savings nor diagnose a leak.

The ten-million-chunk correctness case generates only two payloads with two
workers before cancellation. That establishes lazy metadata/task production,
not a promise that successfully collecting ten million outputs is cheap. Output
arrays and captured source data still need application memory budgeting.

## Public API and v0.5 decision gate

The numeric-range contract is coherent enough to experiment with, but does not
yet justify stabilizing both `parallel.for()` and `parallel.map()`:

- A future `for` could accept a numeric range, registered range task, explicit
  shared/transfer payload factory, grain, signal and whole-operation deadline.
  A non-collecting output contract and side-effect expectations need a decision.
- A future `map` must choose index/array inputs, per-element versus per-chunk
  output typing/order, compact transfer behavior and retention/streaming. The
  current chunk-output array is not automatically an element map API.
- First failure, occupied cancelled workers and full-range graceful drain are
  tested contracts to preserve, not incidental Promise.all behavior.
- The derived parent limit, producer fairness, window size and synchronous
  factory ergonomics need concurrent-producer measurements before stabilization.

**Recommend v0.5: grain and dispatch efficiency (Outcome C), with explicit
static grain retained.** Profile host production/settlement versus transport,
compare current-runtime manual and owned controls, and evaluate bounded batching
or cheaper descriptors only with measured benefit and unchanged admission,
ownership and cancellation semantics. Include a skew arithmetic control and
multiple independent sessions. This is a recommendation, not implemented work.

Medium grains already balance this skew under central FIFO; distributed queues
or work stealing are not justified here. Large clone payloads require better
data layout, not theft. Lifecycle tests found no need to replace the model.
Keep `partitionRange` experimental until output retention and higher-level
algorithm contracts are resolved. No v0.5 code or stable algorithm exports were
started.

## Ordinary-task CPU regression control

The separate CPU harness runs archived v0.3/current/current/archived per worker
count, with fixed 32 manual prime-search chunks and identical kernels. It keeps
six timed observations per version/size/count from two fresh processes each.
This checks ordinary `run()` rather than partition ownership. Serial is a
main-thread kernel control. Raw
[cpu-regression-v0.4.json](../benchmarks/results/cpu-regression-v0.4.json):

| Workers | Search end | Manual v0.3 ms | Current v0.4 ms | Current / baseline |
| ------- | ---------: | -------------: | --------------: | -----------------: |
| Serial  |    100,000 |         10.771 |          10.933 |              1.015 |
| Serial  |  1,000,000 |        276.549 |         275.378 |              0.996 |
| Serial  |  5,000,000 |       2348.026 |        2749.018 |              1.171 |
| 1       |    100,000 |         18.984 |          19.454 |              1.025 |
| 1       |  1,000,000 |        298.754 |         293.348 |              0.982 |
| 1       |  5,000,000 |       2775.354 |        2766.646 |              0.997 |
| 4       |    100,000 |          8.628 |           9.264 |              1.074 |
| 4       |  1,000,000 |         92.779 |          97.718 |              1.053 |
| 4       |  5,000,000 |        843.358 |         835.818 |              0.991 |

The small/medium four-worker medians are **7.4% / 5.3% slower**, while the large
case is **0.9% faster**. A **17.1%** serial-control difference, where no runtime
dispatch occurs, shows substantial JIT/session/host variation. These results do
not prove a regression-free ordinary path or a causal 5–7% runtime regression.
Keep that overhead question open and profile it in the recommended follow-up.
Historical Windows/v0.2 timings are not compared directly to this Linux session.

## Validation and stress

The suite has **87 passing correctness tests**, retaining all **58** original
tests and adding **29** partition tests. The coverage oracle enumerates visited
indices independently across **1,000 seeded random plans**, checks ordering,
non-overlap, no gaps, safe-integer endpoints and frozen descriptors. Runtime
tests cover empty/singleton/awkward ranges, reversed completion, ten million
logical chunks with only a worker-sized generated window, shared reuse and
compact transferred inputs/outputs.

Lifecycle checks include task/parent saturation, reentrant factory and clone
getters, transfer reservation release/detachment, first sibling failure, factory
and serialization failure, queued/running abort and timeout, zero-generated
deadline, whole-parent timeout, worker crash/replacement/exhaustion, nested
rejection, startup shutdown, shutdown inside production, and both drain modes.
Repeated concurrent operations assert terminal accounting and listener cleanup.

Two separate `npm run test:stress` invocations each completed **five full rounds**:
**10 rounds / 870 test executions**, with no failures. Every round includes
96 sequential/concurrent mixed-outcome operations and 36 abort/deadline/crash
race operations, plus the occupancy/production/shutdown cases. Stress is finite
evidence, not a proof of every possible event ordering.

All required checks passed: `npm run build`, `npm test`, `npm run test:stress`,
`npm run test:types`, `npm run typecheck:compat`, `npm run lint`, and
`npm run format:check`. Declaration tests cover payload/result inference,
synchronous factories, immutable descriptors and forbidden SAB transfer lists.

The partition study completed **270 configurations / 1,350 timed operations**,
plus **810 validated first/warmup operations**. Range, matrix, skew and dispatch
reports retain all first/timed samples; warmups are validated but not retained.
All configurations passed their independent output checks and expected task
counts. The ordinary CPU control also completed successfully. Benchmarks and
stress campaigns ran sequentially, not concurrently.

## Files and preserved boundaries

- Runtime: new `partition/range.ts` and `partition/operation.ts`; runtime
  coordinator/admission integration, experimental exports, optional task/error
  context and operation/partition statistics.
- Tests: new partition fixture and 29-test suite; declaration coverage extended.
  Existing 58 correctness tests remain intact.
- Benchmarks: `benchmarks/partitioning/` supplies shared kernels, matching engine
  adapters, isolated measurements and reproduction instructions. Five new raw
  `*-v0.4.json` artifacts include the CPU control. Existing runners now target
  v0.4 filenames so future invocations preserve older evidence.
- Documentation: proposal, range guide, ADRs 0008/0009, this report, README,
  architecture, benchmark methodology and research review. Workspace/runtime
  versions and lockfile are 0.4.0; Piscina remains exactly 5.3.2.

No v0.1–v0.3 artifact or historical report was changed. The FIFO implementation,
pool, worker protocol, transfer/shared primitives and runtime dependency count
are unchanged. Remaining questions are output streaming/non-collecting scopes,
fairness under sustained competing admission, grain/JIT effects, descriptor and
transport overhead, and the eventual per-element API contract.
