# PJS v0.14 — bounded compression and decompression evaluation

## IMPLEMENTATION / RESEARCH SUMMARY

**Outcome B: useful bounded binary pipelines, with documented ergonomics and
resource caveats. No missing primitive; do not create `@pjs/compression`.**
Existing `streamRange()` expresses variable-output compression and exact-output
decompression coherently. It provides enforceable count/byte admission, real
refunds, incremental delivery and covered lifecycle cleanup. It does not always
beat native async zlib or raw workers, and credits are not a process memory cap.

The main Windows campaign has **162 cells, 324 warmups and 972 retained trials**.
Seven targeted resource cells add 42 trials; six fresh processes add 36 trials.
Together: **175 measured cells, 350 warmups, 1,050 retained trials**, with no
skips or failed output checks. Separately, 324 bound fixtures, 24 causal prefill
observations, seven lifecycle cases and three direct parallel round trips pass.
No valid trial or negative relationship was discarded.

The [proposal](proposal-v0.14.md) preceded implementation and measurements.
The [harness contract](../benchmarks/real-world/compression/README.md),
[complete main measurements](research/v0.14-compression-measurements.md) and
[targeted supplement](research/v0.14-compression-supplement.md) define scope and
retain per-cell median/min/max/CV. All rates below are six-trial medians; latency
figures are medians of per-trial percentiles. Sequential trial/cell order,
frequency changes and short fast windows limit small percentage comparisons.

## WHY COMPRESSION WAS SELECTED

Compression exercises CPU transforms, binary ownership, runtime partitioning,
variable output, maximum reservations, refunds and a consumer in the same real
pipeline. Inflating the block protocol supplies a natural known-output control.
This extends crypto's dedicated compute evidence to bounded binary streaming.

## ENVIRONMENT

| Field                               | Observation                                                       |
| ----------------------------------- | ----------------------------------------------------------------- |
| OS / architecture                   | Windows 10, 10.0.19045 / x64                                      |
| CPU                                 | Intel Core i3-10100F, nominal 3.60 GHz                            |
| Physical / logical / available CPUs | 4 / 8 / 8                                                         |
| RAM / initially free                | 15.87 / 6.07 GiB                                                  |
| Node / V8                           | 24.21.0 / 13.6.233.17-node.53                                     |
| zlib                                | 1.3.2.1-motley-8002e91                                            |
| npm / OpenSSL                       | 11.18.0 / 3.5.8                                                   |
| Power                               | Existing Balanced plan, GUID 381b4222-f694-41f0-9685-ff5bb260df2e |
| libuv                               | Default four threads; UV_THREADPOOL_SIZE unchanged                |
| Starting HEAD                       | d9e259ef2ee14a11e05b57fb7621295aa67958c9                          |
| Client date                         | 2026-10-02, Africa/Cairo                                          |

The nested CIM/npm queries were unavailable inside the harness. A separate
read-only processor observation and matching npm CLI observation supply the
missing values in validation metadata; raw fields remain null. No Node version,
power setting, dependency or system configuration was changed. Fedora is
**unmeasured for v0.14**; the reduced portable profile is prepared, not completed.

## PJS SOURCE STATUS

Runtime source remains the validated v0.12 implementation
`18f0c87e7b7920179403bbc396afabced6bb06c4`. Before/after SHA-256 manifests agree
for every campaign. Validation compares pinned source and all previously tracked
files against the starting commit. Historical v0.1–v0.13 evidence, dependencies,
public API and runtime version remain unchanged. Only research/harness files were added.

## ALGORITHMS

Node built-in `deflateRawSync` / `deflateRaw` and `inflateRawSync` / `inflateRaw`.
No algorithm implementation, addon, Brotli expansion or compression package.
Compression fixes windowBits=15, memLevel=8, default strategy, no dictionary and
no intermediate flush. Levels 1 and 6 form the primary sweep; level 9 is targeted.
The inspected synchronous codec path has no internal worker pool; SIMD is not
additional threads. Native async zlib uses libuv, while PJS/raw workers call sync zlib.

## CORPUS DESIGN

Generator version 1, seed `0x5eed1234`, 32 MiB per primary corpus. Highly
compressible data repeats a structured log record; moderate JSON-like records
change numeric fields, route/status and tokens; poor data emits little-endian
xorshift32 words. Those bytes are deterministic pseudorandom, not cryptographic
randomness. Grain is 64 KiB / 256 KiB / 1 MiB / 4 MiB. A 1-MiB corpus at 1-KiB
grain isolates tiny tasks. The queue supplement uses 64 MiB to supply 64 jobs.
Memory preflight estimates source/shared copies, bounded consumer retention,
worker heaps and codec working state against half free / quarter total RAM.
No swapping or OOM was intentionally induced.

## BLOCK FORMAT

Private records retain index, start, original length, compressed length and payload.
`streamRange()` supplies partition identity externally; the returned value is a
direct compact transferred Uint8Array that qualifies for strict binary credit.
Reassembly uses original offsets and checks gaps, duplicates and lengths. This
is benchmark infrastructure, not a public file format or ordered runtime stream.

## COMPRESSION BOUND DERIVATION

For the fixed default raw-deflate parameters, reserve
`N + floor(N/4096) + floor(N/16384) + floor(N/33554432) + 7`.
The [bound derivation](research/v0.14-compression-bounds.md) traces both stock zlib
and this Node build's bundled `deflateBound_z`, distinguishes raw/zlib/gzip
wrappers, records finish/no-flush restrictions, overflow checks and version gates.
At 1 MiB, the safe maximum is **1,048,903 bytes**. Node does not expose this bound
as a JS API. It must not be reused with arbitrary codec parameters or extra flushes.

## BOUND VALIDATION

**324 fixtures pass**: empty, one byte, tiny/boundary inputs, all tested grains,
levels 1/6/9, three entropy classes, multiple PRNG seeds, ramps and alternating
runs. Every fixture inflates exactly. A deliberately undersized maximum fails
with `PjsBinaryResultContractError` before successful result transport. Tests
confirm the implementation contract; they do not replace its derivation.

## COMPRESSION CORRECTNESS

Every retained compression result is inflated and byte-compared outside timing.
Every retained trial also reconstructs the full original input from independent
records. A finite consumer retention budget allows these checks without pretending
that delivered outputs remain covered by PJS credits.

## DECOMPRESSION CORRECTNESS

Every retained inflate output and reconstructed corpus byte-matches the original.
Three additional PJS-compress → PJS-inflate round trips use each entropy class,
4 MiB + 37 bytes, a partial tail block and completion-order delivery. All pass;
exact inflate produces no refunds. These use actual PJS compressed output,
not host precompression to discover an exact compression size.

## SERIAL BASELINE

Serial sync compresses the same independent blocks on the main thread. At 1-MiB
grain/level 6 it reaches 296.2 / 42.5 / 29.4 input MiB/s for high/moderate/poor
entropy. It is often efficient, but bulk execution blocks timers and file callbacks.
The contention serial timer delay is about 861 ms; its single FS observation per
trial cannot establish a population p99.

## NATIVE ASYNC BASELINE

Native async is a serious production baseline, with bounded offered concurrency
and identical blocks/options/compaction. At 1 MiB/level 6 it reaches 631.3 / 109.2 /
115.0 MiB/s. It often wins inexpensive level-1 compression and the poor-data
level-6 comparison. Native submission is not the blocked main-thread baseline.

## PJS RESULTS

At 1-MiB grain, four workers, shared input and capacity for four maxima:

| Corpus / level | Serial | Native async |    PJS | Raw workers | PJS / serial |
| -------------- | -----: | -----------: | -----: | ----------: | -----------: |
| High / 1       | 1279.0 |       3017.9 | 2784.6 |      3376.0 |         2.18 |
| High / 6       |  296.2 |        631.3 |  825.1 |       821.5 |         2.79 |
| Moderate / 1   |   99.7 |        274.1 |  299.0 |       324.5 |         3.00 |
| Moderate / 6   |   42.5 |        109.2 |  122.0 |       105.9 |         2.87 |
| Poor / 1       |   39.2 |         96.4 |  100.2 |        90.9 |         2.55 |
| Poor / 6       |   29.4 |        115.0 |   96.9 |       108.9 |         3.30 |

Units are input MiB/s. Different raw/PJS orderings across cells remain visible;
do not attribute every reversal to runtime overhead. Primary high/moderate/poor
level-6 PJS rate CV is 1.8% / 5.7% / 9.5%, respectively.

## RAW WORKER RESULTS

Persistent raw workers use the same sync native body, input ownership, compact
output copy and output transfer, with the same primary worker count. The pool
provides no result-credit system, telemetry or lifecycle guarantees equivalent
to PJS. At high/level 1/4 MiB, raw reaches 3327.1 versus PJS 2847.4 MiB/s;
orchestration can matter even with substantial blocks and a cheap codec.

## BLOCK-SIZE CROSSOVER

For highly compressible level-1 data, PJS/serial ratios at 64 KiB / 256 KiB /
1 MiB / 4 MiB are **0.78 / 1.09 / 2.18 / 3.23**. The 256-KiB edge is modest
with PJS CV 13%; a clear advantage appears at 1 MiB. This is a bracket, not a
precise byte threshold. For high level 6, the ratios are 1.43 / 2.58 / 2.79 /
2.04. The tiny high/level-6 control loses: serial/native/PJS/raw achieve
19.8 / 19.4 / 10.0 / 9.4 MiB/s at 1 KiB; its crossover is between 1 and 64 KiB.
Moderate/poor data already benefit at the smallest primary 64-KiB grain, so their
finer crossover is unmeasured. Grain optimality is workload-dependent and nonmonotonic.

## COMPRESSION LEVEL EFFECT

Raising level increases useful codec work per dispatch but reduces throughput.
At moderate/1 MiB, PJS is 299.0 / 122.0 / 46.9 MiB/s for level 1 / 6 / 9;
serial is 99.7 / 42.5 / 15.3. Compressed/original ratios are 0.27602 / 0.22977 /
0.22710. Level 9's small size improvement has a substantial CPU cost. High-data
level 6 crosses at a smaller tested block than level 1; H9 is supported in that scope.

## CLONE / TRANSFER / SHARED

Four-MiB ownership supplement, input MiB/s:

| Corpus | PJS clone | PJS transfer | PJS shared | Raw clone | Raw transfer | Raw shared |
| ------ | --------: | -----------: | ---------: | --------: | -----------: | ---------: |
| High   |     265.4 |        569.3 |      481.1 |     447.5 |        576.3 |      797.7 |
| Poor   |      95.3 |         85.3 |       81.3 |     102.1 |         89.3 |       87.9 |

Avoiding clone materially helps the inexpensive high-data transform (shared
1.81× and transfer 2.15× clone). It does **not** improve the expensive poor-data
cells here; H3 is conditional. Transfer includes lazy dedicated input allocation
and copying inside timing, not free reuse or returned ownership. Shared creation
copies once outside timing; a Buffer view over SAB copies no backing, verified
by identity/alias tests. Native zlib still copies into its window, and every
model compacts output once. Setup and worker readiness costs are recorded separately.

## INPUT MiB/s

Rates divide actual codec input bytes by timed wall time. Compression input is
the original corpus; inflate input is its compressed blocks. Calibration repeats
the same block corpus at most four times; repetitions and total bytes are retained.
This does not manufacture larger independent compression contexts.

## OUTPUT MiB/s

At representative high/moderate/poor 1-MiB/level-6 PJS compression, output rates
are **2.87 / 28.04 / 96.98 MiB/s**, versus input 825.1 / 122.0 / 96.9.
For decompression, output MiB/s describes reconstructed bytes and is used below.
Blocks/s is separately retained and is not compared across grain as if bytes were equal.

## COMPRESSION RATIO

Always compressedBytes / originalBytes; smaller is better. At level 6 and 1 MiB,
high/moderate/poor ratios are **0.003484 / 0.229773 / 1.000310**. All equivalent
models produce the same payload sizes. Poor input expands slightly.

## INDEPENDENT BLOCK RATIO COST

Relative increase in compressed bytes versus separately measured whole-stream
serial compression, level 6:

| Corpus   |   64 KiB |  256 KiB |    1 MiB |    4 MiB |
| -------- | -------: | -------: | -------: | -------: |
| High     |   43.84% |   10.80% |    2.55% |    0.51% |
| Moderate |    1.62% |    0.43% |    0.11% |   0.025% |
| Poor     | 0.00293% | 0.00085% | 0.00043% | 0.00010% |

The tiny 1-KiB high-data ratio is 0.0901: resetting compression context is costly.
Whole-stream compression is a ratio tradeoff, never the speedup denominator.

## FIRST RESULT LATENCY

Representative high/moderate/poor PJS first result is 3.17 / 22.47 / 28.44 ms,
10% delivery 14.00 / 57.40 / 69.13 ms, 50% 73.45 / 246.97 / 289.91 ms,
completion 153.12 / 521.19 / 588.41 ms. Trials include different calibrated
repetition counts. Streaming delivers useful blocks well before completion;
serial also emits blocks incrementally, so no universal first-result win is claimed.

## P50 / P95 / P99 LATENCY

For those PJS compression cells, block delivery p50/p95/p99 in milliseconds:
high 4.18/7.45/8.52; moderate 30.88/37.89/44.92; poor 36.13/44.66/48.95.
Raw JSON additionally retains p90/max and sample counts. These are closed-loop
submit-to-consumer-delivery observations, not production SLAs.

## QUEUE / EXECUTION TIMING

Public queue means are approximately 0.010 / 0.013 / 0.017 ms in those bounded
streams; task-body means are 4.30 / 31.43 / 35.22 ms. Admission-to-body includes
queue and input transport. Exact queue quantiles and native queue/execution
splits remain null. Body duration includes native work and compact output copying;
it does not include output transport or consumer waiting.

## UPPER-BOUND RESULT CREDIT

The host reserves a safe maximum before input creation/admission. The worker
validates the direct binary result before transport. Successful receipt reconciles
to actual bytes; delivery releases that credit. Byte and logical count capacities
both apply. No sampled capacity overshoot, negative credit or terminal ownership
leak occurred; focused lifecycle runs additionally enable internal invariant scans.

## REFUND BEHAVIOR

Every representative high/moderate/poor block reconciles. Over calibrated trials,
the high case refunds 133,791,984 bytes across 128 blocks; moderate refunds
51,709,982 across 64; poor refunds only 148 across 64. Refund counts and waits
are retained. Cancellation discard releases ownership without recording a success
refund. Terminal credit composition always returns to zero.

## SAFE-BOUND UTILIZATION

Actual / maximum is approximately **0.3483% / 22.970% / 99.9998%** for these
high/moderate/poor blocks. The bound is tight for incompressible data and deliberately
conservative for compressible data. Admission must initially fund a complete
maximum even when the eventual output is tiny; refund cannot predict future bytes.

## FAST CONSUMER

For high data at a two-maximum cap, count-only / normal maximum / held maximum
reach 667.9 / 431.4 / 386.7 MiB/s. The byte-bounded paths restrict outstanding
maxima; count-only has no byte guarantee. This is not a pure reconciliation-cost
measurement. Increasing a one-maximum cap to four materially restores worker use.

## SLOW CONSUMER

Requested 1-ms sinks are variable Windows timer waits. In the same refund cells,
count / upper / held reach 166.8 / 291.1 / 253.0 MiB/s, while actual mean sink waits
are 5.23 / 2.84 / 3.51 ms. Rate CV is 18.6% / 14.5% / 13.0%. Do not attribute
the median throughput difference solely to refunds. Fresh-process high-data
upper/held rates are nearly equal, 337.2 / 333.7 MiB/s. The causal progress result
below is stronger than a timer-sink throughput claim.

## BYTE CAPACITY SWEEP

Fast-consumer input MiB/s for capacities of one/four/sixteen safe maxima:
high 282.1 / 564.2 / 607.3; poor 38.0 / 91.6 / 92.3. Poor-data worker-body
occupancy is about 25% / 95% / 95%. One maximum permits one running child; four
fund the four-worker plane; sixteen cannot create more CPU. With slow sinks,
poor rates are 35.1 / 83.6 / 82.2. High slow-sink ordering reverses under timer
variance and remains visible. Capacity is a resource choice, not an automatic optimizer.

## COUNT CAPACITY

Count 4 / 16 / 64 remains independent of bytes, even for tiny compressed output.
High slow-sink rates are 336.7 / 203.5 / 184.4 MiB/s with respective actual mean
waits 2.32 / 3.60 / 4.62 ms. Increasing logical retention does not establish a
throughput benefit. Count bounds buffer entries plus unsettled children;
batch-1 `streamRange()` live children stay bounded by workers. Application retention
after yield and reordering are outside both PJS dimensions.

## HELD-MAXIMUM CONTROL

The established v0.12 benchmark-only reconciliation override preserves worker
validation and terminal release, adding no public option. With consumer delivery
withheld, count cap 64 and bytes for two maxima, all six high-data trials produce
**32 normal-refund blocks versus two held-maximum blocks** before any yield:
16× producer progress for this finite source. Buffered actual versus running
unreconciled credit is captured separately. Poor-data controls produce two blocks
in both modes, with almost no slack. This proves pre-delivery progress, not 16×
throughput or 16× less RSS. The prefill fixture clones the source; no ownership
speed comparison is inferred from its elapsed time.

## DECOMPRESSION EXACT CREDITS

Original block length naturally declares exact visible output without duplicated
compression. At 1-MiB blocks, reconstructed output MiB/s:

| Corpus   | Serial | Native async | PJS exact | Raw workers |
| -------- | -----: | -----------: | --------: | ----------: |
| High     |  824.6 |        700.5 |     894.9 |      1118.8 |
| Moderate |  286.9 |        408.2 |     698.7 |       614.8 |
| Poor     |  997.1 |        776.0 |    1055.0 |       928.6 |

Moderate decompression shows a substantial benefit. High/poor PJS gains over
serial are modest against rate CV (serial 18.1%/8.6%, PJS 11.1%/5.7%); no broad
win is established there. A wrong exact length fails equality validation.
Compression reserves maximum then refunds; exact inflate reserves original size
and never refunds. Internal exact credit is labelled unreconciled until release.

## FILESYSTEM CONTENTION

Bounded cached reads of a benchmark-owned 4-KiB file, at most one in flight,
followed by 10-ms rest. Main matched poor-data 1-MiB/level-6 cells:

| Path               | Input MiB/s | FS p50 / p95 / p99 ms | FS samples/trial | Timer p99 ms |
| ------------------ | ----------: | --------------------- | ---------------: | -----------: |
| Native c4          |       112.0 | 1.36 / 2.96 / 3.49    |               49 |          6.0 |
| Native c16         |        99.9 | 7.31 / 11.55 / 12.01  |               36 |         10.8 |
| Native c64 offered |        79.4 | 22.83 / 28.93 / 28.93 |               12 |         10.5 |
| PJS one worker     |        41.1 | 1.14 / 1.73 / 2.75    |               49 |         12.7 |
| PJS two workers    |        69.9 | 1.15 / 2.69 / 7.09    |               29 |         12.6 |
| PJS four workers   |        86.3 | 1.45 / 5.90 / 7.88    |               21 |         14.8 |

Native c64 can have fewer than 64 simultaneous blocks in the finite main source;
the fully supplied 64-job PJS queue supplement is separate. Idle FS p95 in the
later control is about 1.68 ms. Probe counts qualify tails; this is not disk bandwidth.
Temporary files are generated, bounded and removed; no user data is used.

## LIBUV INTERFERENCE

H4/H5 are conditional: higher native concurrency delays filesystem work, while
the dedicated plane isolates libuv queue contention. At native c4, FS p95 is
already lower than four-worker PJS; dedicated workers do not universally improve
I/O. The roughly 4.9× c64-native/four-worker-PJS FS-p95 relationship is much smaller
than crypto's scrypt result. CPU/memory pressure remains shared. No libuv tuning
was used to manufacture an advantage.

## EVENT LOOP RESPONSIVENESS

ELU, a primed delay histogram and an independent final-drained timer are retained.
Both async and dedicated workers avoid the serial bulk stall. PJS timer tails do
not consistently beat native async; worker expansion can worsen responsiveness.
The histogram alone is insufficient to dismiss synchronous bursts.

## CPU UTILIZATION

CPU 100% means one core. Representative four-worker PJS high/moderate/poor cells
use about 336% / 337% / 350%, with body occupancy 89% / 96% / 95%. Native sync
deflate has no selected inner threading plane. In the funded worker supplement,
four/eight workers use about 358% / 513% CPU. No thread-count assumption is used
as a substitute for this measured utilization.

## MEMORY

The main long-lived process peaks at about **829 MiB sampled RSS**, including
source/shared storage, consumer-retained output, native allocations and allocator
history. Fresh-process per-cell median sampled peaks are:

| Corpus | Upper / held / count RSS MiB |
| ------ | ---------------------------- |
| High   | 282 / 285 / 286              |
| Poor   | 467 / 445 / 536              |

Each fresh process has two warmups and six trials. These do not establish a precise
RSS saving from refunds; the high cases have nearly equal RSS despite different
credits. Main-isolate heapUsed/external/arrayBuffers and endpoints remain in JSON.
For example, high upper peaks at about 7.7 / 132.4 / 161.6 MiB in those fields,
which must not be summed as unique physical memory. Credit bounds cover visible
successful output pending/buffered in PJS, not native working memory, backing,
transport temporaries, RSS or the finite outputs retained after yield for validation.

## WORKER COUNT

The main eight-worker cell is limited by a four-maximum budget: preserve it as
capacity-limited evidence, not an eight-way CPU comparison. The targeted control
funds one maximum per worker. Four/eight workers reach **120.4 / 141.4 MiB/s**,
rate CV 4.3% / 1.8%, but FS p95 worsens **3.49 → 16.10 ms**, timer p99
**11.58 → 15.21 ms**, block p99 **40.85 → 85.14 ms**. A 17% throughput increase
has a substantial application-tail/resource cost. One/two workers offer lower
throughput and more FS headroom. availableParallelism is not a universal best count.

## QUEUE DEPTH

The targeted 64-MiB control supplies 64 blocks, four workers, public `run()`:

| Offered concurrency | Input MiB/s | Queue mean ms | Block p99 ms |
| ------------------- | ----------: | ------------: | -----------: |
| 4                   |       115.1 |         0.012 |        44.17 |
| 8                   |       113.2 |         31.68 |        79.28 |
| 16                  |       117.0 |         87.78 |       149.45 |
| 32                  |       108.7 |        184.75 |       296.94 |
| 64                  |       114.6 |        247.78 |       547.78 |

Deep queues offer no useful throughput gain here and markedly worsen tails.
This is admission-depth evidence, not a stream count-capacity experiment.

## CANCELLATION

Active/queued abort and consumer break pass with invariant checks. Running callers
settle while worker slots and maximum reservations remain occupied until physical
termination; queued owners release immediately. Late discarded results create no
success refund. A separate ungated 32-MiB native compression abort confirms the
same physical ownership while the codec runs. No cooperative cancellation was added.

## WORKER CRASH

A benchmark-only task intentionally exits during the operation. Parent failure,
exactly-once credit cleanup, replacement under the existing restart policy and a
successful recovery compression all pass. Crash is correctness evidence only.

## TERMINAL OWNERSHIP

Every measured PJS trial and focused lifecycle ends with tasks, pending operations,
reservations, execution correlations, credit-operation records, buffered results,
reserved bytes, unreconciled bytes and reconciled bytes equal to zero. Physical
busy workers also return to zero. This proves covered ownership cleanup, not
immediate RSS reclamation or freedom from every possible application leak.

## RAW WORKER VS PJS

PJS orchestration costs are workload-sensitive; raw often wins cheap high-data
compression and high-data decompression, while some moderate/poor cells reverse
ordering. Neither model changes codec complexity. PJS's additional value is its
existing admission, credit/lifecycle contracts and observability. A raw baseline
without those features is not an equivalent bounded-pipeline product.

## NEGATIVE RESULTS

Tiny PJS compression loses. Highly compressible level-1 64-KiB PJS loses to serial;
native async wins many cheap transforms. Avoiding clone fails to help the measured
poor-data ownership cells. Independent contexts harm ratio. One-maximum capacity
underutilizes workers even with tiny eventual output. Slow timer sinks dominate
and give inconsistent throughput ordering. High/poor inflate gains over serial
are not robust. More workers worsen tails; deep queues worsen waiting. Preserve all.

## PJS RUNTIME PAIN POINTS

The [classified pain log](research/v0.14-runtime-pain-log.md) records direct-binary
metadata composition, manually researched bounds/version mapping, explicit buffer
compaction, unavailable public queue quantiles/credit-plane diagnostics, native
memory budgeting and platform timer behavior. Partition identity and external
offset assembly handle completion order cleanly; only a few block records and
the explicitly retained payloads are needed. No measured reconstruction burden
justifies an ordered stream.

## MISSING PRIMITIVES DISCOVERED

**None.** Existing maximum and exact contracts, input ownership, numeric ranges,
completion-order streaming and lifecycle semantics suffice. No measured failure
crosses the stop-and-propose gate. Public telemetry improvements remain potential
future ergonomics work, not a reason to change this frozen runtime now.

## WHAT PJS IS GOOD AT

Coarse independent compression, especially when native work amortizes transport;
bounded streaming of variable successful output; early slack reconciliation;
known-size inflate; configurable dedicated compute allocation and libuv isolation
when async codec concurrency competes with filesystem work.

## WHAT PJS SHOULD NOT BE USED FOR

Tiny per-record throughput acceleration, automatically parallelizing one continuous
stream without a ratio/protocol tradeoff, choosing deep queues as extra CPU, or
promising an RSS/native-memory ceiling from result credits. Efficient native async
zlib remains preferable in many measured cases without a dedicated-plane requirement.

## DOES @PJS/COMPRESSION DESERVE TO EXIST?

**No package is justified by v0.14.** Native zlib already provides the trusted
codec. Existing PJS APIs express the pipeline; block protocol, codec settings,
safe bound provenance, capacity and sink ownership are application choices.
A documented recipe is more justified than another runtime/package abstraction.

## FINAL V0.14 DECISION

**Outcome B, Windows evidence complete with platform/methodology caveats.**
The central bounded-pipeline question is answered positively, with selected
throughput and isolation benefits and preserved losses. No runtime source change,
missing primitive or package follows. H1/H2/H6/H8/H10 are supported; H3/H4/H5/H9
are scoped; H7 is strongly supported for producer progress, while portable
slow-sink throughput benefit is not established.

## RECOMMENDED NEXT MILESTONE

Reproduce the strongest relationships on Fedora using the prepared reduced
profile, then prioritize stabilization and usage recipes for bounded pipelines.
Only repeated application evidence should motivate public observability changes.
No next milestone, runtime feature or cross-platform performance claim has begun.

## Evidence and validation

- [Main Windows campaign](../benchmarks/results/compression-v0.14-windows-node24.json)
- [Bound fixtures](../benchmarks/results/compression-v0.14-bound-validation.json)
- [Lifecycle and prefill](../benchmarks/results/compression-v0.14-lifecycle.json)
- [Funded workers, full queue, native abort and direct round trips](../benchmarks/results/compression-v0.14-contention.json)
- [Six fresh-process memory cases](../benchmarks/results/compression-v0.14-fresh-memory.json)
- [Validation, artifact hashes and historical preservation](../benchmarks/results/validation-v0.14.json)

Build, 178 runtime tests, type tests, compatibility typecheck, lint, format and
diff checks pass, plus six harness tests, 324 bound fixtures and the lifecycle/
round-trip controls above. Validation retains gate outputs and source/artifact
hashes. Use new filenames for repeats; do not regenerate historical artifacts.
The private reporter refuses incomplete or invalid campaigns.

```sh
node benchmarks/real-world/compression/run.mjs --profile=reproduce --output=benchmarks/results/compression-v0.14-fedora-node24-reproduce.json
node scripts/compression-supplement-v014.mjs benchmarks/results/compression-v0.14-fedora-supplement.json
```

The second command is a targeted supplement, not a request to repeat the complete
exploratory matrix. Read the prepared cross-platform strategy before selecting it.
