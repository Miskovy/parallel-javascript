# PJS flagship Monte Carlo evidence report

## Question

Under what characteristics does public PJS offer useful performance, scaling, memory transport and host isolation against serial JavaScript, persistent raw worker_threads and Piscina? This is a synthetic single-host evidence campaign; it is not a universal JavaScript speed claim.

## Hypotheses

The immutable preregistration is in the [benchmark README](../../benchmarks/flagship-monte-carlo/README.md#preregistered-hypotheses), committed before parallel performance collection. Hypotheses are evaluated below without rewriting them.

## Workload

A synthetic delta-gamma portfolio with **16 factors**, **1024 positions**, seed **1347048193 (0x504a5301)** and **149,504 numeric model bytes**. Off-diagonal factor correlation is 0.2; the model uses its Cholesky factor, position loadings, delta and gamma Float64 arrays. Each independently indexed path generates normal shocks, correlates them and evaluates every position: delta × shock + 0.5 × gamma × shock². Work is O(positions × factors) per path.

## Why this workload

Reusable numeric inputs, independent paths, nontrivial arithmetic and risk-distribution outputs provide understandable CPU work without artificial busy loops. The nonlinear gamma term prevents collapse to one linear portfolio dot product. A specialized implementation could preaggregate this fixed quadratic model into factor-space coefficients; that would change the benchmark algorithm and is outside this runtime comparison. The results do not imply the chosen algorithm is the fastest possible financial model.

## Determinism

A fixed 32-bit hash-counter generator uses seed, absolute path index and random dimension, then Box-Muller normals. No Math.random or mutable per-worker stream. Chunk IDs restore logical order. Neumaier-style compensated sums reduce rounding loss; path-bit additive checksums are order-independent. The PRNG is a reproducibility device, not a cryptographic generator or independently qualified financial simulation engine.

## Competitors and public provenance

| Package              | Exact version | Resolved package.json                                                                                                  | Registry artifact                                                        |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| @pjavascript/runtime | 1.0.0-rc.2    | `/home/miskovy/Documents/pjs/.node-tools/flagship-monte-carlo/consumer/node_modules/@pjavascript/runtime/package.json` | https://registry.npmjs.org/@pjavascript/runtime/-/runtime-1.0.0-rc.2.tgz |
| piscina              | 5.3.2         | `/home/miskovy/Documents/pjs/.node-tools/flagship-monte-carlo/consumer/node_modules/piscina/package.json`              | https://registry.npmjs.org/piscina/-/piscina-5.3.2.tgz                   |

Requested tag: `@pjavascript/runtime@next`; resolved tag: `1.0.0-rc.2`. Registry: `https://registry.npmjs.org/`. Integrity and tarball metadata are retained in the raw header and exact consumer lock. Real import resolution and realpath assertions reject workspace links. Raw uses persistent fixed workers with readiness, FIFO dispatch and one active task per worker; Piscina and PJS use only public APIs.

## Fairness rules and neutral grain

All contenders import the identical numerical kernel. Headline worker comparisons use identical SAB-backed input, cloned per-chunk output, fixed persistent worker count and **8p chunks**, capped at N. The common submission limit is **2p**. Serial uses eight chunks and one host lane. Repeated-clone sends the whole model per task; reusable-shared passes one shared backing repeatedly, with a one-time preparation copy recorded separately. SAB is available to raw workers and Piscina; PJS exposes sharedReadonly with a caller-enforced immutability contract. These tracks test distinct ownership strategies. No PJS-specific high-level API or transfer shortcut is in the headline.

## Environment

| Field                               | Observed value                                  |
| ----------------------------------- | ----------------------------------------------- |
| OS                                  | Fedora Linux 44 (KDE Plasma Desktop Edition)    |
| Kernel                              | 6.19.10-300.fc44.x86_64                         |
| CPU                                 | AMD Ryzen 3 PRO 3300U w/ Radeon Vega Mobile Gfx |
| Architecture                        | x64                                             |
| Physical cores                      | 4                                               |
| Logical CPUs / availableParallelism | 4 / 4                                           |
| RAM bytes                           | 7715655680                                      |
| Node                                | v24.13.1                                        |
| V8                                  | 13.6.233.17-node.40                             |
| npm                                 | 11.8.0                                          |
| Governor                            | schedutil                                       |
| AC online                           | 1                                               |
| Initial load averages               | 2.12 1.50 1.28 1/1439 629621                    |
| Starting source commit              | ebf4ce1bc3b63a8860e667605e6456bccae1f09c        |
| Measured harness/evidence commit    | 5f0e6693cf1221b17e511190be463e4806c98b48        |
| Branch                              | research/flagship-monte-carlo                   |
| Dirty at campaign capture           | false                                           |

Background applications were uncontrolled. Initial available RAM and swap occupancy are retained in meminfo; this was a constrained desktop session. AC power was connected, and no governor or host settings were changed. Windows, macOS and ARM were not measured.

## Methodology

Stages cover grain, primary scaling, distribution, transport and cold start, with large primary also providing responsiveness and memory. **620/620 trials**, **0 explicit failures**, complete=true. Fresh child per trial; two untimed full-workload warmups for steady state; ten measured trials per cell. Cold has no warmups. Deterministic seeded within-stage order, 120s child timeout including natural exit, no forced GC, no deleted slow trials. Serial oracle validation occurs after timing for every contender and may heat the host between trials.

Median bootstrap intervals use 2,000 seeded resamples. A practical win requires >5% median advantage and non-overlapping descriptive 95% intervals. Overlap means uncertain/indistinguishable under this rule, not statistical equivalence. Full min/max/mean/sample SD/CV/IQR and all trial records are retained.

## Calibration

| Candidate paths | Serial median ms |
| --------------- | ---------------- |
| 1000            | 30.267           |
| 2000            | 53.674           |
| 5000            | 127.597          |
| 10000           | 242.702          |
| 20000           | 465.681          |
| 50000           | 1177.507         |
| 100000          | 2303.388         |
| 200000          | 4673.754         |
| 500000          | 11586.931        |

| Frozen size | Paths  |
| ----------- | ------ |
| small       | 5000   |
| medium      | 50000  |
| large       | 200000 |

[Raw serial-only calibration](../../benchmarks/results/flagship-monte-carlo/2026-10-06-linux-x64-node24.13.1-calibrate-1791276198403.jsonl). Selection was nearest log-distance to 100ms/1s/5s, using only serial results. Counts and config were committed before full parallel measurement. They were never retuned against Piscina/PJS.

## Correctness

8 fixture contender/transport checks passed exact per-path equality in distribution mode and exact ordered aggregates in both modes. Every successful measured trial checked count, path-bit checksum, extrema and tight aggregate agreement against the same serial kernel; materialized trials checked every path bit.

The harness has eleven unit tests covering PRNG/model determinism, correlation reconstruction, partition coverage, ordered reduction, bounded driver, percentiles/statistics, provenance rejection, schema/analysis, timeout and crash evidence. All child processes exited naturally after pool cleanup.

## Grain-size results

| Runtime | Workers | Chunks | Paths/chunk | Median ms | CV    | Task p50/p95/p99 ms  |
| ------- | ------- | ------ | ----------- | --------- | ----- | -------------------- |
| piscina | 4       | 16     | 3125.0      | 450.86    | 0.198 | 204.09/246.09/265.81 |
| piscina | 4       | 256    | 195.3       | 432.41    | 0.333 | 13.02/18.72/21.76    |
| piscina | 4       | 4      | 12500.0     | 465.35    | 0.291 | 442.50/461.57/463.99 |
| piscina | 4       | 64     | 781.3       | 502.47    | 0.228 | 58.14/88.59/98.84    |
| pjs     | 4       | 16     | 3125.0      | 502.92    | 0.287 | 208.17/266.26/292.92 |
| pjs     | 4       | 256    | 195.3       | 456.48    | 0.283 | 13.78/19.30/23.53    |
| pjs     | 4       | 4      | 12500.0     | 450.04    | 0.315 | 422.08/446.02/448.63 |
| pjs     | 4       | 64     | 781.3       | 476.97    | 0.123 | 54.88/79.97/85.86    |
| raw     | 4       | 16     | 3125.0      | 486.32    | 0.200 | 214.92/257.55/265.57 |
| raw     | 4       | 256    | 195.3       | 433.62    | 0.324 | 13.40/18.11/21.31    |
| raw     | 4       | 4      | 12500.0     | 469.59    | 0.231 | 445.14/468.90/469.29 |
| raw     | 4       | 64     | 781.3       | 495.40    | 0.252 | 57.06/80.45/89.41    |

This sweep describes sensitivity at the medium size. Observed optima do not replace the neutral 8p policy. The finest tested chunk still contains useful Monte Carlo work; failure to observe a collapse does not refute the existence of dispatch-dominated finer tasks.

## Main scaling results

| Size   | Runtime | Workers | Median ms | 95% interval ms | Sims/s | Speedup | Efficiency | Peak RSS MiB |
| ------ | ------- | ------- | --------- | --------------- | ------ | ------- | ---------- | ------------ |
| large  | piscina | 1       | 4586.77   | 4580.91–4683.55 | 43604  | 1.01    | 1.011      | 73.8         |
| large  | piscina | 2       | 2697.98   | 2524.94–2811.77 | 74129  | 1.72    | 0.860      | 86.3         |
| large  | piscina | 4       | 1660.64   | 1537.37–2101.63 | 120436 | 2.79    | 0.698      | 111.1        |
| medium | piscina | 1       | 1156.62   | 1151.73–1186.88 | 43229  | 1.00    | 1.004      | 73.4         |
| medium | piscina | 2       | 682.69    | 656.91–698.23   | 73240  | 1.70    | 0.851      | 86.3         |
| medium | piscina | 4       | 404.81    | 392.16–438.09   | 123514 | 2.87    | 0.717      | 111.4        |
| small  | piscina | 1       | 120.71    | 120.23–124.35   | 41421  | 0.98    | 0.979      | 73.1         |
| small  | piscina | 2       | 70.74     | 68.56–75.16     | 70681  | 1.67    | 0.836      | 86.4         |
| small  | piscina | 4       | 49.13     | 47.74–66.46     | 101781 | 2.41    | 0.602      | 111.4        |
| large  | pjs     | 1       | 4610.46   | 4580.13–4824.09 | 43380  | 1.01    | 1.006      | 73.7         |
| large  | pjs     | 2       | 2562.88   | 2464.13–2704.66 | 78037  | 1.81    | 0.905      | 85.8         |
| large  | pjs     | 4       | 1885.25   | 1574.50–2055.47 | 106087 | 2.46    | 0.615      | 110.3        |
| medium | pjs     | 1       | 1155.25   | 1151.52–1264.05 | 43281  | 1.01    | 1.005      | 73.1         |
| medium | pjs     | 2       | 674.08    | 636.71–711.91   | 74175  | 1.72    | 0.861      | 85.5         |
| medium | pjs     | 4       | 414.74    | 403.40–441.01   | 120557 | 2.80    | 0.700      | 110.1        |
| small  | pjs     | 1       | 120.95    | 119.81–121.75   | 41341  | 0.98    | 0.978      | 72.9         |
| small  | pjs     | 2       | 69.95     | 66.11–101.44    | 71485  | 1.69    | 0.845      | 85.6         |
| small  | pjs     | 4       | 47.79     | 46.25–87.18     | 104618 | 2.47    | 0.618      | 110.1        |
| large  | raw     | 1       | 4660.53   | 4624.87–4695.11 | 42914  | 1.00    | 0.995      | 73.2         |
| large  | raw     | 2       | 2639.37   | 2557.54–2688.81 | 75776  | 1.76    | 0.879      | 86.1         |
| large  | raw     | 4       | 1610.42   | 1511.53–1818.24 | 124191 | 2.88    | 0.720      | 109.8        |
| medium | raw     | 1       | 1161.15   | 1151.76–1239.47 | 43061  | 1.00    | 1.000      | 72.8         |
| medium | raw     | 2       | 666.39    | 630.64–685.05   | 75031  | 1.74    | 0.871      | 85.6         |
| medium | raw     | 4       | 424.88    | 419.83–458.26   | 117681 | 2.73    | 0.683      | 109.8        |
| small  | raw     | 1       | 120.43    | 119.12–121.62   | 41518  | 0.98    | 0.982      | 72.6         |
| small  | raw     | 2       | 69.32     | 67.15–77.12     | 72132  | 1.71    | 0.853      | 84.9         |
| small  | raw     | 4       | 43.89     | 43.17–49.34     | 113932 | 2.69    | 0.674      | 109.6        |
| large  | serial  | 1       | 4638.73   | 4609.62–4894.46 | 43115  | 1.00    | —          | 67.2         |
| medium | serial  | 1       | 1161.34   | 1149.51–1218.91 | 43054  | 1.00    | —          | 67.1         |
| small  | serial  | 1       | 118.23    | 117.49–118.96   | 42290  | 1.00    | —          | 67.4         |

Speedup is matching-size primary serial median / worker median; efficiency is speedup / p. Values above p would require cache/JIT/boundary investigation. Logical CPU counts are not assumed to be physical cores; this host separately reported four cores.

## Clone versus shared results

| Size   | Runtime | Clone ms | Shared ms | Shared/clone | Shared prep ms | Interpretation |
| ------ | ------- | -------- | --------- | ------------ | -------------- | -------------- |
| large  | piscina | 1926.98  | 1758.32   | 0.912        | 0.286          | uncertain      |
| medium | piscina | 455.52   | 452.17    | 0.993        | 0.305          | uncertain      |
| large  | pjs     | 1823.15  | 1876.89   | 1.029        | 0.433          | uncertain      |
| medium | pjs     | 448.96   | 451.01    | 1.005        | 0.469          | uncertain      |
| large  | raw     | 1724.37  | 1822.78   | 1.057        | 0.297          | uncertain      |
| medium | raw     | 508.95   | 478.11    | 0.939        | 0.290          | uncertain      |

Wall time also includes execution on ordinary versus shared typed-array backing. This is not a pure serialization-cost probe; backing access, cache and JIT effects remain possible confounders. The model is 149,504 bytes and the neutral representative cell has 32 tasks: 4,784,128 logical numeric clone bytes per workload, versus reusable backing references. Payload byte counts do not equal RSS. A measured setup break-even is defensible only where the paired time saving survives the registered uncertainty rule; the generated transport table reports that condition. Otherwise no reliable break-even threshold is established.

## Cold versus steady state

| Runtime | p   | Cold ms | First result ms | Steady medium ms | Startup ms | Shared prep ms |
| ------- | --- | ------- | --------------- | ---------------- | ---------- | -------------- |
| piscina | 4   | 610.25  | 182.96          | 404.81           | 18.87      | 0.306          |
| pjs     | 4   | 604.93  | 190.20          | 414.74           | 99.20      | 0.435          |
| raw     | 4   | 596.62  | 183.54          | 424.88           | 89.54      | 0.324          |
| serial  | 1   | 1250.96 | 190.08          | 1161.34          | 0.23       | 0.308          |

Cold includes shared preparation, construction/readiness, the first entire workload, reduction and shutdown. Time-to-first-result starts at pool construction. Host module imports and Node process creation are outside these boundaries for all contenders; model generation is separately measured. Steady simulation excludes pool construction and model preparation and reports reduction separately. Cold CPU sampling starts before construction but after shared preparation; CPU and cold wall boundaries therefore differ by the separately retained preparation cost.

## Distribution and risk reduction

| Runtime | p   | Simulation ms | Assembly/reduction/sort ms | Compute + reduction ms | Mean P&L | P&L SD   | Loss VaR 99% | Loss ES 99% |
| ------- | --- | ------------- | -------------------------- | ---------------------- | -------- | -------- | ------------ | ----------- |
| piscina | 4   | 501.14        | 20.32                      | 523.98                 | 2.4911   | 537.7817 | 1251.7246    | 1443.5740   |
| pjs     | 4   | 521.95        | 18.28                      | 539.38                 | 2.4911   | 537.7817 | 1251.7246    | 1443.5740   |
| raw     | 4   | 533.55        | 19.78                      | 553.69                 | 2.4911   | 537.7817 | 1251.7246    | 1443.5740   |
| serial  | 1   | 1203.47       | 14.03                      | 1217.30                | 2.4911   | 537.7817 | 1251.7246    | 1443.5740   |

The empirical loss quantile uses sorted index floor(0.99N); expected shortfall is the mean of that upper tail. All contenders return cloned Float64 chunk outputs. Sorting and risk reduction are separate from headline simulation timing.

## Event-loop responsiveness

| Runtime | p   | Timer p95 ms | Timer p99 ms | Timer max ms | ELU   |
| ------- | --- | ------------ | ------------ | ------------ | ----- |
| piscina | 1   | 0.49         | 0.77         | 1.28         | 0.017 |
| piscina | 2   | 0.69         | 1.04         | 2.45         | 0.020 |
| piscina | 4   | 1.00         | 1.67         | 2.98         | 0.017 |
| pjs     | 1   | 0.54         | 0.85         | 1.80         | 0.017 |
| pjs     | 2   | 0.70         | 1.19         | 2.98         | 0.020 |
| pjs     | 4   | 1.24         | 3.75         | 8.68         | 0.020 |
| raw     | 1   | 0.45         | 0.66         | 1.23         | 0.015 |
| raw     | 2   | 0.80         | 1.85         | 3.20         | 0.021 |
| raw     | 4   | 0.56         | 1.36         | 2.61         | 0.012 |
| serial  | 1   | 4403.04      | 4588.43      | 4634.77      | 1.000 |

The sentinel is armed before CPU execution and flushed after it so synchronous blocking is observed. Short serial runs have few samples; p95/p99 are not high-resolution tail estimates. Worker runtimes preserve host execution capacity subject to shared CPU/memory contention; they do not make the whole machine nonblocking. The monitorEventLoopDelay histogram is retained as supporting data, not the sole serial-blocking evidence.

## Memory

| Runtime | p   | Initial RSS MiB | Peak RSS MiB | Final RSS MiB | Delta RSS MiB | High-water RSS MiB |
| ------- | --- | --------------- | ------------ | ------------- | ------------- | ------------------ |
| piscina | 1   | 72.7            | 73.8         | 73.8          | 1.0           | 73.9               |
| piscina | 2   | 85.3            | 86.3         | 86.3          | 1.1           | 86.4               |
| piscina | 4   | 110.6           | 111.1        | 111.1         | 0.5           | 112.1              |
| pjs     | 1   | 72.6            | 73.7         | 73.7          | 0.9           | 73.8               |
| pjs     | 2   | 84.9            | 85.8         | 85.7          | 0.9           | 86.8               |
| pjs     | 4   | 109.5           | 110.3        | 110.3         | 0.9           | 112.8              |
| raw     | 1   | 72.4            | 73.2         | 73.1          | 0.7           | 73.3               |
| raw     | 2   | 85.5            | 86.1         | 86.0          | 0.5           | 87.3               |
| raw     | 4   | 109.1           | 109.8        | 109.8         | 0.6           | 111.7              |
| serial  | 1   | 66.9            | 67.2         | 67.2          | 0.4           | 67.9               |

RSS is process-wide, sampled at 10ms plus endpoints; serial blocking can hide intermediate peaks. The process high-water mark includes warmup/startup and is kept separately. Initial/final snapshots refer to the measured workload, before shutdown. Host-isolate heap/external/arrayBuffers are retained, but do not represent every worker heap. No exact physical-memory savings are inferred from payload bytes or RSS.

## CPU

| Runtime | p   | User ms | System ms | CPU seconds/wall second |
| ------- | --- | ------- | --------- | ----------------------- |
| piscina | 1   | 4637.39 | 24.85     | 1.015                   |
| piscina | 2   | 5227.63 | 16.84     | 1.966                   |
| piscina | 4   | 6261.01 | 6.94      | 3.768                   |
| pjs     | 1   | 4658.72 | 24.35     | 1.015                   |
| pjs     | 2   | 5072.30 | 15.94     | 1.963                   |
| pjs     | 4   | 6284.77 | 12.25     | 3.329                   |
| raw     | 1   | 4703.92 | 23.84     | 1.015                   |
| raw     | 2   | 5216.78 | 16.91     | 1.976                   |
| raw     | 4   | 6099.69 | 6.49      | 3.786                   |
| serial  | 1   | 4622.90 | 0.60      | 0.997                   |

These are process.cpuUsage deltas across compute plus reduction. The ratio is CPU seconds per wall second, not a claim about machine utilization. Higher parallel CPU time may coexist with shorter wall time; scheduler, JIT and transport overhead are included.

## Where serial wins

No primary pairwise comparison met the preregistered practical-win rule. This does not establish equivalence or exclude smaller differences.

No additional peer-runtime comparison in the secondary stages met the same practical-win rule.

Only the frozen sizes were retained as performance evidence. Smoke is excluded. This campaign bounds useful regions at those sizes; it does not pinpoint a crossover below the smallest measured size.

## Where raw workers win

| Size   | Workers | Comparison    | Practical winner |
| ------ | ------- | ------------- | ---------------- |
| small  | 2       | raw vs serial | raw              |
| small  | 4       | raw vs serial | raw              |
| medium | 2       | raw vs serial | raw              |
| medium | 4       | raw vs serial | raw              |
| large  | 2       | raw vs serial | raw              |
| large  | 4       | raw vs serial | raw              |

Serial comparisons are repeated at each corresponding worker count. A worker victory at one count is not a victory at every count. These are descriptive comparisons without correction for multiple testing.

Secondary-stage practical comparisons (kept separate from the headline):

| Stage        | Size   | Transport | p   | Chunks | Pair         | Winner |
| ------------ | ------ | --------- | --- | ------ | ------------ | ------ |
| cold         | medium | shared    | 4   | 32     | raw / serial | raw    |
| distribution | medium | shared    | 4   | 32     | raw / serial | raw    |

The lower-level pool supplies only FIFO task execution and shutdown; it does not recreate the full ownership, lifecycle and diagnostic contracts of higher-level runtimes. Those architectural differences are separate from throughput evidence.

## Where Piscina wins

| Size   | Workers | Comparison        | Practical winner |
| ------ | ------- | ----------------- | ---------------- |
| small  | 2       | piscina vs serial | piscina          |
| small  | 4       | piscina vs serial | piscina          |
| medium | 2       | piscina vs serial | piscina          |
| medium | 4       | piscina vs serial | piscina          |
| large  | 2       | piscina vs serial | piscina          |
| large  | 4       | piscina vs serial | piscina          |

Serial comparisons are repeated at each corresponding worker count. A worker victory at one count is not a victory at every count. These are descriptive comparisons without correction for multiple testing.

Secondary-stage practical comparisons (kept separate from the headline):

| Stage        | Size   | Transport | p   | Chunks | Pair             | Winner  |
| ------------ | ------ | --------- | --- | ------ | ---------------- | ------- |
| cold         | medium | shared    | 4   | 32     | piscina / serial | piscina |
| distribution | medium | shared    | 4   | 32     | piscina / serial | piscina |

## Where PJS wins

| Size   | Workers | Comparison    | Practical winner |
| ------ | ------- | ------------- | ---------------- |
| small  | 2       | pjs vs serial | pjs              |
| small  | 4       | pjs vs serial | pjs              |
| medium | 2       | pjs vs serial | pjs              |
| medium | 4       | pjs vs serial | pjs              |
| large  | 2       | pjs vs serial | pjs              |
| large  | 4       | pjs vs serial | pjs              |

Serial comparisons are repeated at each corresponding worker count. A worker victory at one count is not a victory at every count. These are descriptive comparisons without correction for multiple testing.

Secondary-stage practical comparisons (kept separate from the headline):

| Stage        | Size   | Transport | p   | Chunks | Pair         | Winner |
| ------------ | ------ | --------- | --- | ------ | ------------ | ------ |
| cold         | medium | shared    | 4   | 32     | pjs / serial | pjs    |
| distribution | medium | shared    | 4   | 32     | pjs / serial | pjs    |

Coarse large PJS versus serial practical advantage observed: **true**. Claims are limited to this host, Node version, synthetic model and frozen grain policy.

## Where PJS loses

No primary pairwise comparison met the preregistered practical-win rule. This does not establish equivalence or exclude smaller differences.

No additional peer-runtime comparison in the secondary stages met the same practical-win rule.

Observed primary median disadvantages greater than 5%, retained even when uncertain:

| Size  | p   | Peer    | PJS ms  | Peer ms | PJS slower by | Evidence                               |
| ----- | --- | ------- | ------- | ------- | ------------- | -------------------------------------- |
| large | 4   | piscina | 1885.25 | 1660.64 | 13.5%         | median disadvantage; intervals overlap |
| large | 4   | raw     | 1885.25 | 1610.42 | 17.1%         | median disadvantage; intervals overlap |
| small | 4   | raw     | 47.79   | 43.89   | 8.9%          | median disadvantage; intervals overlap |

## Where results are indistinguishable

| Size   | p   | Pair             |
| ------ | --- | ---------------- |
| small  | 1   | piscina / pjs    |
| small  | 1   | piscina / raw    |
| small  | 1   | piscina / serial |
| small  | 1   | pjs / raw        |
| small  | 1   | pjs / serial     |
| small  | 1   | raw / serial     |
| small  | 2   | piscina / pjs    |
| small  | 2   | piscina / raw    |
| small  | 2   | pjs / raw        |
| small  | 4   | piscina / pjs    |
| small  | 4   | piscina / raw    |
| small  | 4   | pjs / raw        |
| medium | 1   | piscina / pjs    |
| medium | 1   | piscina / raw    |
| medium | 1   | piscina / serial |
| medium | 1   | pjs / raw        |
| medium | 1   | pjs / serial     |
| medium | 1   | raw / serial     |
| medium | 2   | piscina / pjs    |
| medium | 2   | piscina / raw    |
| medium | 2   | pjs / raw        |
| medium | 4   | piscina / pjs    |
| medium | 4   | piscina / raw    |
| medium | 4   | pjs / raw        |
| large  | 1   | piscina / pjs    |
| large  | 1   | piscina / raw    |
| large  | 1   | piscina / serial |
| large  | 1   | pjs / raw        |
| large  | 1   | pjs / serial     |
| large  | 1   | raw / serial     |
| large  | 2   | piscina / pjs    |
| large  | 2   | piscina / raw    |
| large  | 2   | pjs / raw        |
| large  | 4   | piscina / pjs    |
| large  | 4   | piscina / raw    |
| large  | 4   | pjs / raw        |

This label follows the descriptive threshold and uncertainty rule. It is not an equivalence test. Variance and interval widths are available rather than hidden behind a tie label.

## Hypothesis assessment

- **H1 — not established in the retained range:** No serial primary win met the registered rule. Warmed two/four-worker execution already paid at 5,000 paths. The sufficiently tiny serial-favored crossover remains unmeasured; smoke cannot establish it. No smaller performance cells were added post hoc.
- **H2 — supported at large size:** Practical coarse-worker advantage against serial for each of raw/Piscina/PJS: **true**. This is a result for this workload and host.
- **H3 — not confirmed by throughput:** Shared has a practical paired advantage in **0/6** cells. No robust end-to-end setup break-even is established. Logical repeated copying decreases, but computation on shared backing and host noise prevent isolating transport cost. SAB remains a common capability.
- **H4 — competitive within the measured uncertainty:** No primary worker-peer comparison met the practical-win rule. PJS nevertheless had slower four-worker large medians than both peers; those disadvantages are reported above. Competitive does not mean equivalent or fastest.
- **H5 — no collapse observed:** The registered sweep spans four through 256 chunks at p=4, still roughly 195 paths in the finest chunk. No robust collapse was established there, and finer tasks were not measured.
- **H6 — partial support:** RSS increased with worker count, while throughput improved through the tested maximum of four. No plateau or oversubscription decline was established; higher counts were deliberately excluded.
- **H7 — supported for host isolation:** The serial large-workload sentinel observes seconds of blocking; all worker approaches retain millisecond-scale host drift in the table. Host resource contention remains a qualifier.
- **H8 — no universal winner demonstrated:** No worker runtime dominated the primary comparisons under the rule. This uncertainty is not proof of equivalence or a universal absence of a winner; operating regions below the smallest size and beyond four workers remain unmeasured.

## Architectural properties

PJS offers explicit registered module tasks, bounded admission, ownership helpers, lifecycle and diagnostic APIs. This campaign uses the core run mechanism and sharedReadonly contract. It does not experimentally compare every runtime cancellation, restart, admission or diagnostic invariant. The common 2p driver controls admission for all pools. API properties cannot excuse a measured throughput loss and are kept separate from performance claims.

## Limitations and threats to validity

Single synthetic workload and one desktop CPU; fixed factors, positions, seed and grain; no real market calibration; simple counter PRNG; Node 24.13.1 and V8 tiering/GC; prerelease PJS rc.2 and Piscina 5.3.2; four physical/logical cores without SMT on this machine; OS scheduling, thermal/frequency variation, background activity and heavy swap occupancy; repeated serial validation heating between trials; sample precision, instrument overhead and few serial timer samples; RSS sampling blind spots and host-only heap snapshots; SAB immutability is a usage contract, not protection. Cell ordering is seeded but stages remain sequential, so cross-stage drift can affect clone/shared or cold/steady comparisons. Ten bootstrap trials and many comparisons do not provide formal multiplicity-corrected significance. Every child loads the adapter modules, including serial; this common host-library RSS baseline is included in memory snapshots and excluded from simulation timing. No multi-session, cross-platform or Windows replication was performed.

## Negative results and anomalies

No slow trials were removed. Explicit trial failures: **0**. Cells with CV > 20%: **15/62**. PJS median disadvantages and uncertain comparisons are printed above. The serial crossover, shared-input throughput benefit and fine-grain collapse were not established in this frozen range. These are negative/inconclusive findings, not reasons to tune the campaign after measurement.

After all 620 children exited successfully, automatic full analysis encountered a circular top-level-await import and the parent exited with code 13. The raw completion record remained intact. Moving the unchanged matrix to an independent module repaired postprocessing; a regression test now covers full analysis. Standalone analysis confirms the full matrix. This harness defect affected no measured timings or runtime code.

Apparent changes across count, grain or transport remain observations unless they repeat materially and can be attributed to a runtime mechanism. One anomalous cell is insufficient for a scheduler change.

## Conclusions and campaign outcome

**Outcome B** — mixed but useful.

The retained map is bounded by the frozen workload and this Fedora session. Useful worker regions, serial wins, peer runtime losses and uncertainty must be considered together. Public claims should use this report and the raw interval/trial evidence. Root README performance claims were not changed.

## Runtime-change recommendation

**Runtime defect found: NO. Runtime change recommended: NO.** No runtime defect is established by throughput comparisons alone. Findings are observation-only unless a repeatable material anomaly can be isolated to PJS with a fair baseline, a clear invariant and independent validation. Runtime source, public API, runtime dependencies and package versions remain unchanged. No npm publication occurred.

## Reproduction and artifacts

See [methodology and commands](../../benchmarks/flagship-monte-carlo/README.md#reproduction), [research log](../../benchmarks/flagship-monte-carlo/RESEARCH-LOG.md), [raw full trials](../../benchmarks/results/flagship-monte-carlo/2026-10-06-linux-x64-node24.13.1-full-1791276552890.jsonl), [generated tables](../../benchmarks/results/flagship-monte-carlo/2026-10-06-linux-x64-node24.13.1-full-1791276552890-tables.md), [summary JSON](../../benchmarks/results/flagship-monte-carlo/2026-10-06-linux-x64-node24.13.1-full-1791276552890-summary.json), and [serial calibration](../../benchmarks/results/flagship-monte-carlo/2026-10-06-linux-x64-node24.13.1-calibrate-1791276198403.jsonl).

`npm run benchmark:flagship:smoke` checks all contenders without public performance claims. `npm run benchmark:flagship:full` prepares an exact public-registry consumer and runs the same frozen matrix. Analysis never overwrites historical artifacts: copy a retained JSONL file to a new temporary filename before invoking `npm run benchmark:flagship:analyze -- /tmp/new-campaign.jsonl`. Full is never invoked by normal tests/CI. Windows replication must reuse this exact config without recalibration.

This document is generated from explicit full and calibration paths by `node benchmarks/flagship-monte-carlo/report.mjs FULL.jsonl B CALIBRATION.jsonl`. Outcome selection is a scientific review decision; numeric tables and comparison classifications are derived from retained evidence.
