# v0.14 cross-platform compression conclusion

**Outcome B with codec/platform caveats. v0.14 is closed.** Fedora reproduces
useful coarse compression, bounded variable-output streaming, refund-driven
producer progress, exact decompression, lifecycle cleanup and conditional libuv
isolation with the frozen PJS runtime. Codec-bound provenance required a benchmark
repair. No runtime primitive, ordered stream or `@pjs/compression` is justified.

## Windows research and Fedora reproduction

Windows exploratory research remains unchanged at
`12c22343686a0238d2830114ebc47eb5078c1de2`; its
[report](benchmarks-v0.14.md) retains 162 main cells, seven supplement cells and
six fresh-memory cells. Windows used four physical/eight logical CPUs and Node
24.21.0's researched Motley codec. Absolute MiB/s across these machines is not
a runtime-regression comparison.

Fedora started this continuation at
`890a1fc780271cb0859ea706d5ab27477596a111`. Its first
[stopped report](research/v0.14-fedora-qualification.md) and artifacts remain
immutable. The qualified continuation adds **70 reduced cells, 140 warmups and
420 retained trials**, then **six supplement cells, 12 warmups and 36 trials**.
No skips, discarded valid trials or failed output checks occurred. Four workers
equal availableParallelism, so the prepared profile deduplicates the additional
Windows worker case: 70 rather than 71 main cells and six rather than seven
supplement cells.

The [complete Fedora measurements](research/v0.14-fedora-measurements.md) and
[supplement](research/v0.14-fedora-supplement.md) preserve all observations. Each
cell has two warmups/six trials. Tables here use the harness's nearest-rank p50;
latencies are p50 across per-trial percentiles, not pooled percentiles. Fixed
cell order, short cheap windows, host activity, allocator history and CV limit
small percentage claims. No unfavorable trial was replaced.

## Fedora codec qualification

Fedora 44 KDE runs Ryzen 3 PRO 3300U, four physical/logical/available CPUs and
approximately 7.2 GiB RAM. Node/npm are 24.13.1/11.8.0; V8 is
13.6.233.17-node.40, libuv 1.51.0 and OpenSSL 3.5.7. AC is online, the governor
is schedutil and UV_THREADPOOL_SIZE remains unset. The stored TuneD preset was
balanced-battery, but the active profile could not be verified. Existing swap use
was recorded rather than cleared. No Node or system settings were modified.

The executing codec is **system zlib-ng 2.3.3 compatibility mode**, exact RPM
`zlib-ng-compat-2.3.3-3.fc44.x86_64`, reporting `1.3.1.zlib-ng`. Node and the
temporary C diagnostic load the same verified library. Fedora disables new
strategies, selecting `NO_QUICK_STRATEGY`; raw wrapper overhead is zero and
x86_64 does not activate s390x conservative-bound hooks.

| Contract                              | Raw maximum at 1 MiB | Four-max capacity |
| ------------------------------------- | -------------------: | ----------------: |
| Windows researched stock-style Motley |      1,048,903 bytes |   4,195,612 bytes |
| Fedora qualified zlib-ng              |      1,114,119 bytes |   4,456,476 bytes |

The [bound derivation](research/v0.14-compression-bounds.md) and
[continuation](research/v0.14-fedora-bound-qualification-continuation.md)
distinguish source facts, native diagnostics and inference. Unknown identities,
versions, builds, parameters or native disagreement fail closed. The stock formula
is unchanged. All 111 raw native bounds match the selected formula; 333 actual
compression round trips and the same 324 prepared bound fixtures pass.

## Compression, crossover and ratio

Level-6 input MiB/s, matched independent blocks and options:

| Corpus / grain    | Serial | Native async |   PJS | Raw workers | PJS / serial |
| ----------------- | -----: | -----------: | ----: | ----------: | -----------: |
| High / 64 KiB     |  226.7 |        686.2 | 373.5 |       541.3 |         1.65 |
| Moderate / 64 KiB |   59.7 |        124.5 | 110.5 |       129.6 |         1.85 |
| Poor / 64 KiB     |   54.4 |         99.6 |  85.0 |       117.0 |         1.56 |
| High / 1 MiB      |  547.5 |        899.6 | 845.4 |       883.5 |         1.54 |
| Moderate / 1 MiB  |   54.4 |        132.2 | 162.3 |       152.5 |         2.98 |
| Poor / 1 MiB      |   48.7 |         92.2 | 128.8 |       137.3 |         2.65 |

PJS 1-MiB high/moderate/poor rate CV is 5.2%/3.4%/2.6%. High 64-KiB serial
has **44.4% CV**, so its nominal ratio needs caution. Native/raw ordering varies;
PJS does not establish a win over either for cheap high-data compression.

At 1-KiB high blocks, serial/native/PJS/raw achieve **48.2/27.5/5.9/21.6 MiB/s**.
PJS CV is 20.4%, yet its loss is large. Useful work crosses between tiny and
coarse tested grains: the high-data median bracket is 1–64 KiB, with a stronger
coarse observation at 1 MiB. Moderate/poor already benefit at 64 KiB; their finer
crossover is unmeasured. No universal threshold or level-dependent crossover
follows from this reduced level-6 profile.

High 64-KiB/1-MiB compressed/original ratios are 0.004887/0.003484, increasing
compressed bytes versus one continuous stream by **43.84%/2.55%**. Moderate
penalties are 1.63%/0.11%; poor about 0.00294%/0.00043%. Whole-stream compression
is a ratio reference only, never the throughput speedup denominator.

## Ownership

High-data 4-MiB blocks, input MiB/s:

| Model                  | Clone | Transfer |  Shared |
| ---------------------- | ----: | -------: | ------: |
| PJS                    | 518.9 |    702.9 |   748.1 |
| Raw persistent workers | 660.8 |    881.8 | 1,358.4 |

PJS transfer/shared reach 1.35/1.44 times clone. Transfer includes timed lazy
allocation/copy; shared retains one-time setup outside timing. The prepared
reduced profile omits poor-data ownership cases, so the expensive-transform half
of Windows's conditional ownership finding is not remeasured.

## Credits, refunds, capacities and consumers

All sampled count and byte limits hold; reserved bytes equal unreconciled plus
reconciled bytes. Every terminal PJS trial has zero ownership. Focused lifecycle
additionally enables reservation invariant scans. Capacities are compared in
safe maxima, since the platform contracts use different byte values.

Representative 1-MiB PJS trials:

| Corpus              | Declared bytes | Actual bytes | Refund bytes | Refund count | Actual / maximum |
| ------------------- | -------------: | -----------: | -----------: | -----------: | ---------------: |
| High, 128 blocks    |    142,607,232 |      467,600 |  142,139,632 |          128 |          0.3279% |
| Moderate, 64 blocks |     71,303,616 |   15,418,506 |   55,885,110 |           64 |         21.6237% |
| Poor, 64 blocks     |     71,303,616 |   67,129,644 |    4,173,972 |           64 |         94.1462% |

Poor data refunds about **5.85% of the declaration**, unlike Windows's almost
zero slack. This is a codec-contract difference, not a PJS improvement.
Consumer-withheld prefill reproduces six **32 versus two** high-data pairs at
two maxima/count 64. Poor produces two in both modes: its aggregate slack cannot
fund a third full maximum. This proves producer progress before delivery, not a
throughput multiplier or RSS saving.

At count 64, one/four maxima raise fast high rates **330.7 → 858.0 MiB/s** and
poor **46.1 → 137.5 MiB/s**. Poor body occupancy rises **24.3% → 93.0%**.
Four maxima fund four workers. There is no matched poor fast sixteen-max cell.
Matched high slow four/sixteen-max cells reach 623.0/578.9 MiB/s, CV 9.1%/12.3%,
supplying no stable extra-capacity benefit.

Count-only/normal-upper/held-max high fast rates are **796.8/409.6/471.4 MiB/s**;
upper/held CV is 13.3%/12.8%. Count-only has no byte guarantee. Requested 1-ms
slow-sink rates are **652.6/368.1/477.4 MiB/s**, with observed mean waits
**1.391/1.129/1.087 ms**. Normal refunds do not establish a wall-time advantage.
Timer behavior, admission and scheduling all contribute; causal prefill is separate.

Count 4/16/64 at sixteen maxima gives high slow rates 586.0/753.5/578.9 MiB/s,
with actual waits 1.165/1.147/1.369 ms. Logical count limits remain independent of
bytes even for tiny payloads. This is not a deep-queue experiment; application
retention after yield is outside both PJS bounds.

## Exact decompression and lifecycle

Reconstructed output MiB/s:

| Corpus   |  Serial | Native async | PJS exact | Raw workers |
| -------- | ------: | -----------: | --------: | ----------: |
| High     | 1,056.0 |        762.4 |     944.3 |     1,094.3 |
| Moderate |   358.0 |        435.4 |     573.4 |       823.6 |
| Poor     | 1,043.1 |        765.7 |     941.6 |     1,313.9 |

Moderate inflate benefits over serial/native; high/poor PJS do not beat serial.
Known original length supplies exact credit naturally; all exact cells have
zero refunds and terminal credit. The supplement reconstructs three actual
PJS-compress → PJS-inflate round trips of 4 MiB + 37 bytes, including each tail.
External index/offset metadata handles completion order without an ordered stream.

Six lifecycle cases cover active/queued cancellation, consumer break, crash and
replacement, maximum violation and exact-size violation. The supplement adds an
ungated native-compression abort. Active caller settlement retains occupancy and
the maximum until physical execution ends; queued reservation releases immediately.
Crash cleanup/replacement and subsequent compression pass. All final tasks,
operations, reservations, execution correlations, credit records, buffered results,
busy workers and reserved/unreconciled/reconciled bytes are zero.

## Filesystem, event loop and worker allocation

Cached benchmark-owned 4-KiB reads, at most one in flight, with 10-ms rest:

| Path       | MiB/s | FS p50 / p95 / p99 ms | Samples/trial | Timer p99 ms |   ELU | CPU % | Block p99 ms |
| ---------- | ----: | --------------------- | ------------: | -----------: | ----: | ----: | -----------: |
| Native c4  |  92.0 | 1.15 / 1.98 / 6.38    |            60 |         1.04 | 0.235 |   281 |        52.63 |
| Native c16 | 104.3 | 7.49 / 14.60 / 15.13  |            35 |         3.67 | 0.281 |   349 |       167.56 |
| Native c64 | 101.6 | 33.02 / 53.34 / 53.34 |            14 |        19.32 | 0.226 |   347 |       626.84 |
| PJS w1     |  46.5 | 0.31 / 1.93 / 11.60   |            63 |         1.74 | 0.133 |   122 |        25.46 |
| PJS w2     |  82.2 | 0.38 / 8.79 / 12.23   |            33 |         1.98 | 0.209 |   221 |        30.41 |
| PJS w4     | 129.4 | 4.51 / 10.35 / 11.90  |            32 |         5.43 | 0.246 |   347 |        40.64 |

Deep native submission reproduces libuv interference; dedicated workers improve
the c64 tail relationship. Native c4 already has lower FS p95 than PJS w4.
Dedicated workers do not eliminate shared CPU/memory pressure. Native c64 supplies
64 blocks per trial here; 14 FS samples cannot establish a robust population p99.
Serial has one FS observation per trial and about 651-ms timer delay; its FS p99
is not meaningful.

One → two → four workers raises throughput/CPU use and worsens selected tails.
CPU 100% means one core. The funded four-worker supplement reaches 136.3 MiB/s,
CPU 354%, FS p95 6.06 ms, timer p99 1.18 ms and block p99 34.53 ms. Differences
from the main four-worker cell show resource/run-order sensitivity. This host
has no eight-worker expansion measurement; availableParallelism is not a universal
best worker count.

## Fully supplied queue

Four workers, 64-MiB poor input and public run():

| Offered jobs | MiB/s | Rate CV % | Queue mean ms | Block p99 ms |
| ------------ | ----: | --------: | ------------: | -----------: |
| 4            | 132.3 |       8.9 |         0.017 |        49.64 |
| 8            | 142.7 |       8.9 |         25.48 |        65.99 |
| 16           | 144.0 |       2.0 |         71.02 |       123.75 |
| 32           | 142.1 |       1.4 |        143.52 |       234.23 |
| 64           | 123.0 |       6.8 |        222.12 |       487.08 |

Waiting/tails strongly reproduce. Throughput is not exactly flat: q8/q16 medians
are about 8–9% above q4, whose CV is 8.9% and whose range overlaps them. No robust
monotonic throughput gain is established; q64 loses throughput while multiplying
block p99 roughly tenfold. Windows's stronger flat-throughput claim is only
partially reproduced. No extra sweep was run to force the ordering.

## Memory limits

The long-lived main process reaches about **1,631 MiB sampled RSS** across retained
trials. No fresh-process Fedora memory campaign was run, so no refund-driven RSS
saving is claimed. Source/shared backing, consumer retention, workers, codec state,
transport and allocator history contribute. Result credits cover PJS-owned visible
successful output and pending declarations, not total RSS or delivered results.

## Relationship classification

| Windows relationship                                     | Fedora status        | Scope                                                      |
| -------------------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| 1. Tiny compression loses                                | Reproduced           | Clear loss at 1 KiB                                        |
| 2. Coarse compression benefits                           | Reproduced           | Matched level-6 serial comparisons                         |
| 3. Block-size crossover exists                           | Reproduced           | Tiny/coarse bracket, no universal threshold                |
| 4. Ownership matters conditionally                       | Partially reproduced | High transport benefit; poor ownership unmeasured          |
| 5. Upper-bound contract remains safe                     | Reproduced           | Codec-specific derivation, native agreement, enforcement   |
| 6. Compressible data produces substantial refunds        | Reproduced           | High/moderate reconciliation                               |
| 7. Incompressible data produces almost no refund         | Not reproduced       | zlib-ng maximum leaves about 5.85% slack                   |
| 8. Refunds increase pre-delivery progress                | Reproduced           | Six high 32-vs-2 pairs; poor 2-vs-2                        |
| 9. One maximum underutilizes workers                     | Reproduced           | Poor occupancy about 24%                                   |
| 10. Worker-sized capacity restores occupancy             | Reproduced           | Four maxima restore about 93%                              |
| 11. Excess additional capacity provides little benefit   | Partially reproduced | High slow four/sixteen; other sixteen-max cases unmeasured |
| 12. Count capacity remains independent                   | Reproduced           | Logical limits enforced alongside bytes                    |
| 13. Exact decompression credit is natural/correct        | Reproduced           | Reconstruction, zero refunds/terminal credit               |
| 14. Deep queues increase tails without useful throughput | Partially reproduced | Strong tails; modest q8/q16 median gains amid q4 variance  |
| 15. Dedicated workers can isolate libuv under contention | Reproduced           | Native depth matters; c4 remains healthy                   |
| 16. More workers trade headroom for throughput           | Reproduced           | One/two/four; eight workers unmeasured                     |
| 17. No ordered stream is required                        | Reproduced           | Three indexed partial-tail round trips                     |
| 18. No missing runtime primitive appears                 | Reproduced           | Covered pipeline and lifecycle gates pass                  |

## Final decision

**Outcome B with codec/platform caveats.** The architecture remains correct and
useful on the second environment. Bound tightness, ownership scope, queue variance
and decompression ordering differ and remain visible. These differences do not
justify reopening runtime architecture.

Build, 178 runtime tests, type tests, compatibility, lint, formatting, diff check
and 12 harness tests pass. Runtime source stays pinned; Windows/v0.1–v0.13 artifacts
and first Fedora stopped qualification evidence retain their hashes. Validation
artifacts record command output, source provenance and preservation checks.

The new pain point is benchmark codec-family/build qualification. Workloads must
supply a trustworthy library-specific maximum; PJS enforces it without knowing
compression. No new runtime pain, primitive, ordered stream or compression package
follows. No v0.15 work starts. Stabilization and usage-model consolidation remain
a separate user decision.
