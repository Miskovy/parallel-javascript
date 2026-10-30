# JavaScript worker pools: CPU throughput and main-thread responsiveness

On this local four-core Windows desktop, published PJS 1.0.0 completed the large
Monte Carlo workload **2.64x faster than matching chunked serial JavaScript**.
The other worker pools had overlapping intervals in that case, so it does not
establish a worker-pool winner. PJS had a clear advantage on the large image
transfer case and a clear disadvantage on the finest numerical tasks. The
smaller image and numerical cells were often noisy.

This is the completed **780-trial publication campaign**, not the earlier smoke
run. All 78 contender/configuration cells have ten measured trials. All trials
passed correctness and awaited cleanup, with natural process exits and no
timeouts. The preceding 78-cell smoke and nine functional/analysis tests passed.
No samples were deleted, no failed cells selectively rerun, and no workload,
seed, order, warmup count or analysis rule was changed for these measurements.

[Computation PNG](evidence/publication-local-01/graphics/throughput.png) /
[SVG](evidence/publication-local-01/graphics/throughput.svg) ·
[Responsiveness PNG](evidence/publication-local-01/graphics/responsiveness.png) /
[SVG](evidence/publication-local-01/graphics/responsiveness.svg) ·
[Complete table](evidence/publication-local-01/REPORT.md) /
[CSV](evidence/publication-local-01/results.csv) /
[JSON](evidence/publication-local-01/summary.json)

## Scope and denominator

Exact contenders: `@pjavascript/runtime@1.0.0`, `piscina@5.3.2`,
`tinypool@2.2.0`, `workerpool@10.0.3`, a persistent raw worker-thread pool and
serial JS. All execute the same imported kernels, deterministic inputs, logical
chunks and required output collection. Pools use fixed worker counts, one active
CPU task per worker, bounded queues and at most 2p outstanding submissions.
Clone and transfer are separate ownership experiments. Batching applies equally
to every contender; no PJS-only range API appears in the primary comparisons.

Node **24.22.1**, npm **11.19.0**, Intel i3-10100F (4 physical cores / 8 logical
CPUs), approximately 15.87 GiB RAM, Windows 10 x64. Primary p=4; scaling p=1,2,4.
The desktop reported AC power, the existing Balanced plan, affinity 255 and no
enabled CPU-rate cap in the queried current job. Pre-run total CPU observations
were 2,1,6,0,4,9%; browser/editor and system processes remained present. Ancestor
job restrictions, CPU core temperatures and sustained clock stability were not
measured. No known shared CPU cap or sustained heavy competing load was observed;
this is a local desktop observation, not a dedicated laboratory host guarantee.

Each measured trial is a fresh process with a cold execution, two full warmups
and one warm sample on its persistent pool. The complete run took place on
30 October 2026, 10:36:45–11:03:27 UTC (12:36–13:03 Cairo), from clean harness
commit `1263cabe72da379d9eb9a2f36fc637f0e61dd59d`.

All reported speedups mean **matching-case serial median / contender median**.
Serial uses identical chunking/grouping and output requirements, with no worker
transport. Wall time includes dispatch, transport and required collection and
reduction/assembly. Input generation is separately measured. Intervals are
descriptive seeded 2,000-resample percentile 95% bootstrap intervals of the
median; they are not corrected significance tests. The preregistered practical
difference rule requires >5% median difference and non-overlapping wall-time
intervals. The complete tables retain variability and all pairwise assessments.

## What the workload panels show

This table includes every PJS primary/batching/scaling cell. It is a reading aid;
the linked full table includes every contender and every interval.

| Workload                             | PJS warm ms [95% interval] | Serial warm ms | Serial/PJS | Interpretation                                                               |
| ------------------------------------ | -------------------------: | -------------: | ---------: | ---------------------------------------------------------------------------- |
| Monte Carlo 5,000 paths, p=4         |       53.92 [47.41, 89.35] |         104.57 |      1.94x | Clear benefit over serial; worker-pool intervals overlap                     |
| Monte Carlo 50,000 paths, p=4        |    415.63 [388.27, 445.81] |        1049.78 |      2.53x | Clear benefit over serial; worker-pool intervals overlap                     |
| Monte Carlo 200,000 paths, p=4       | 1626.68 [1503.40, 1664.51] |        4286.94 |      2.64x | Clear benefit over serial; worker-pool intervals overlap                     |
| Monte Carlo 50,000 paths, p=1        | 1064.38 [1043.47, 1110.18] |        1062.38 |      1.00x | Small/noisy difference from serial                                           |
| Monte Carlo 50,000 paths, p=2        |    644.58 [622.20, 663.20] |        1077.16 |      1.67x | Faster than serial; clear loss to raw and Tinypool                           |
| Image 512x512 clone, p=4             |       33.86 [10.34, 37.75] |          58.90 |      1.74x | Faster than serial; no clear worker-pool ordering                            |
| Image 512x512 transfer, p=4          |         9.16 [7.69, 38.26] |          56.77 |      6.20x | High variability; no clear worker-pool ordering                              |
| Image 2048x2048 clone, p=4           |    175.07 [156.74, 189.29] |         256.21 |      1.46x | Clear benefit over serial, Piscina and Tinypool; overlap with raw/workerpool |
| Image 2048x2048 transfer, p=4        |     107.05 [97.57, 119.94] |         266.61 |      2.49x | Clear benefit over serial and each other pool in this cell                   |
| Numerical grain 64, batch 1, p=4     |    413.68 [393.37, 427.35] |          12.61 |      0.03x | Clear loss to serial and every other pool                                    |
| Numerical grain 1,024, batch 1, p=4  |       51.65 [32.17, 74.14] |          10.22 |      0.20x | Clear loss to serial; worker-pool ordering inconclusive                      |
| Numerical grain 16,384, batch 1, p=4 |        13.85 [4.98, 25.38] |           9.54 |      0.69x | Inconclusive; wide overlapping intervals                                     |
| Numerical grain 64, batch 8, p=4     |       72.06 [60.81, 84.16] |          11.41 |      0.16x | Clear loss to serial and raw; other pool intervals overlap                   |

The large Monte Carlo pool medians ranged from 1,627 to 1,715 ms, with overlapping
intervals throughout. PJS's two-worker medium result (645 ms) was slower than raw
(569 ms) and Tinypool (556 ms) under the practical-difference rule. More workers
helped this kernel, but four workers did not yield a fourfold speedup.

The 2048x2048 transfer result is specific to this JavaScript 3x3 RGBA stencil,
tile halos and complete output ownership. PJS's 107 ms median compared with
239–264 ms for the other pools. Input generation/halo preparation itself cost
about **100–102 ms** across contenders, including 102 ms for PJS. That cost is
outside the computation chart and is visible in the complete table. These
numbers are not a native codec, sharp, WebGL, WebGPU or GPU-rendering comparison.

The smaller image cell has wide intervals: PJS CV was 0.56 for clone and 0.78
for transfer. The observed 6.20x serial/PJS median ratio exceeds the worker count;
it is an end-to-end observation with high variability, not a parallel efficiency
guarantee. This campaign does not isolate the causes of tiering, scheduling or
GC variation. It would be inappropriate to turn that small cell into a headline.

## Dispatch overhead, batching and sampled break-even

For the finest numerical grain, **every pool lost clearly to serial**. PJS was
32.8x slower by the ratio of warm medians (414 versus 12.6 ms). Grouping eight
unchanged logical chunks per submission reduced PJS's median to 72.1 ms, but
the matching serial grouping still completed in 11.4 ms.

| Contender         | Grain 64, batch 1 ms | Grain 64, batch 8 ms |
| ----------------- | -------------------: | -------------------: |
| Serial            |                12.61 |                11.41 |
| Raw threads       |                67.42 |                31.92 |
| PJS 1.0.0         |               413.68 |                72.06 |
| Piscina 5.3.2     |               103.94 |                57.15 |
| Tinypool 2.2.0    |                68.13 |                45.74 |
| workerpool 10.0.3 |               107.79 |                65.01 |

These are ratios/medians from separately retained ten-trial cells, not a new
paired significance test. At grain 16,384, PJS's interval overlaps serial, and
other pools also have wide intervals. No clear numerical serial-to-parallel
break-even was established within the sampled grains. Workers already helped
the smallest sampled Monte Carlo case (5,000 paths, approximately 105 ms serial),
so the campaign cannot locate its lower crossover. There is no universal chunk
size or overall score across unrelated workloads.

## Responsiveness, startup and memory

For 200,000 Monte Carlo paths, the median **per-trial p95 drift of the armed
10 ms host timer** was 4,064 ms serial versus 8.43 ms for PJS. This is timer
responsiveness, not HTTP or user-interaction latency. Serial has two flushed
timer observations per trial in this case; the blocked interval is captured,
but that does not form a dense application latency distribution. PJS had
90–108 observations per trial. The timer/max/sample-count evidence is retained.

| Contender         | Median per-trial timer p95 ms [95% interval] | Median sampled process peak RSS MiB |
| ----------------- | -------------------------------------------: | ----------------------------------: |
| Serial            |                   4063.57 [3933.17, 4149.48] |                               55.17 |
| Raw threads       |                           8.53 [7.11, 10.17] |                              139.84 |
| PJS 1.0.0         |                            8.43 [7.08, 9.73] |                              162.72 |
| Piscina 5.3.2     |                           9.75 [7.66, 10.64] |                              161.72 |
| Tinypool 2.2.0    |                           9.60 [7.74, 14.59] |                              158.06 |
| workerpool 10.0.3 |                           9.42 [9.07, 10.93] |                              139.37 |

Workers helped host responsiveness for coarse work, with no clear PJS-specific
timer advantage established here. Fine dispatch can itself burden the host:
at grain 64 PJS's timer p95 median was 21.3 ms versus serial's 10.4 ms, and
Piscina's was 35.4 ms. Very short cases have sparse timer samples.

Warm throughput also does not erase startup costs. For 5,000 Monte Carlo paths,
the cold completed-workload median was **187 ms PJS versus 136 ms serial**, even
though warm PJS was faster. Cold here starts at pool construction in an imported
host process; it excludes process launch, module imports and input generation.

RSS is whole-process observational sampling every 10 ms plus endpoints and can
miss peaks, especially during serial blocking. It is not a heap-size or memory
limit claim. Startup/warmup lifetime high-water RSS is retained separately.
Throughput does not establish reliability, feature completeness or universal
superiority. All conclusions are limited to this host, engine and fixed matrix.
