# Flagship Monte Carlo campaign

This campaign asks where PJS is useful against serial JavaScript, a competent
persistent raw worker pool, and Piscina. Negative results are evidence. Runtime
source, APIs, dependencies and package versions are frozen. Nothing is published.

## Preregistered hypotheses

Written before performance collection; these statements must not be edited after
measured results exist.

- **H1:** Small workloads favor serial execution because dispatch and transport
  cannot be amortized.
- **H2:** Coarse independent CPU simulations eventually favor persistent workers
  on this multicore host.
- **H3:** Reusable shared numeric backing reduces repeated input transport costs
  when model size and task count make transport meaningful. SAB is a JavaScript
  capability available to all worker contenders.
- **H4:** PJS is competitive with mature pools for coarse CPU work; it need not
  beat Piscina.
- **H5:** Excessively fine chunks reduce efficiency as dispatch, transport,
  promise settlement, queues, scheduling and result handling dominate.
- **H6:** Additional workers may improve, plateau or reduce throughput while
  increasing RSS, contention or latency.
- **H7:** Workers preserve host event-loop responsiveness better than equivalent
  synchronous host CPU work, subject to whole-machine contention.
- **H8:** No strategy dominates every size, grain, transport and worker count.

## Frozen design and decision rules

The canonical kernel uses 16 factors and 1,024 positions, seed `0x504a5301`,
Float64 numeric arrays, correlated normals and delta-gamma P&L. No artificial
loops. An equicorrelation matrix (off-diagonal 0.2) is Cholesky decomposed.
Position loadings, deltas and gammas are deterministic synthetic exposures.
Every path is generated from seed, path index and random dimension using a fixed
32-bit integer mixer and Box-Muller transform. All contenders import the same
kernel; scheduling never chooses random streams.

Aggregate mode returns count, compensated sum and sumSquares, extrema, and an
order-independent checksum of path bits. Distribution mode returns cloned
per-chunk Float64Arrays for every contender. Logical chunk order determines
assembly and reduction. Sorting and 99% loss VaR/expected shortfall are timed
separately from compute. Aggregate sums across different grain policies may
differ by rounding; path bits and checksum must agree.

Public dependencies are exactly `@pjavascript/runtime@1.0.0-rc.2` and
`piscina@5.3.2`, installed from `https://registry.npmjs.org/` into an isolated
consumer under `.node-tools/`. Entry realpaths, package versions, registry lock
integrities and the resolved `next` tag are retained and asserted before runs.
Workspace links and local tarballs fail validation.

All pools are persistent and fixed at p workers. Raw workers use a ready
handshake and FIFO dispatch, one task per worker, and explicit termination.
Piscina uses public options `minThreads=p`, `maxThreads=p`, `maxQueue=2p`,
`concurrentTasksPerWorker=1`; other options remain defaults. PJS registers one
module task and uses `run`, `workers=p`, `maxQueue=2p` and public `ready/shutdown`.
The common driver admits at most **2p** tasks. Neutral primary grain is **8p**
chunks, capped at N, offering scheduling slack without choosing a contender's
observed optimum. Serial primary uses the same logical 8 chunks at p=1.

Repeated-clone passes the entire ordinary model with **every** chunk; no worker
cache. Reusable-shared passes views over one shared model with every chunk (SAB
references, no numeric copying). No per-worker hidden cache or representation
change. PJS uses `sharedReadonly`; raw/Piscina use an equivalent one-time SAB
copy. Model generation and shared preparation are measured separately. These are
different ownership strategies, not equivalent deployment patterns. No transfer
input experiment is appropriate for a read-many model.

Stages: correctness fixture (37 paths); serial-only calibration (discrete
candidate counts in config, 2 warmups and 3 measured trials, nearest log-distance
to 100ms/1s/5s); freeze and commit counts before parallel performance; grain at
medium, p=min(4,availableParallelism), multipliers 1/4/16/64; primary aggregate
scaling at all three sizes and unique sorted counts 1/2/4/availableParallelism
within host capacity; distribution sensitivity at medium representative p;
clone/shared at medium and large representative p; cold at medium representative
p. Primary large trials also provide responsiveness/memory evidence. Optional
oversubscription is excluded from v1 to limit resource pressure. No full
Cartesian product and no post-hoc grain replacement.

Every full cell has 10 retained trials, fresh child per trial, two full-workload
warmups inside that child for steady state. Cold has no warmups and includes
construction, shared setup, first workload, reduction and shutdown; model
generation is separate. First-result time is recorded. Steady simulation timing
includes partition creation, bounded dispatch, kernel, result transport and
collection; risk reduction/sorting is separate. No forced GC or outlier deletion.
Stages rotate deterministically using a seeded Fisher-Yates order per trial.
Every child has a 120s watchdog including shutdown; failures are JSONL records,
not missing cells. Child exit must be natural; watchdog kills are failure data.

Summary: median/min/max/mean/sample SD/CV/IQR, seeded 2,000-resample median
bootstrap 95% intervals, throughput=N/(median ms/1000), speedup=matching primary
serial median/parallel median, efficiency=speedup/p. Bootstrap intervals are
descriptive, not a multiple-comparison corrected significance test. A practical
win requires >5% median advantage AND non-overlapping bootstrap intervals;
otherwise label indistinguishable/uncertain. Ten trials are frozen even if noisy;
high variance weakens conclusions rather than triggering selective reruns.

Process CPU deltas are user/system milliseconds; (user+system)/wall is CPU seconds
per wall second, not a machine utilization claim. RSS is process-wide, sampled
every 10ms plus endpoints, with `resourceUsage().maxRSS` high-water mark retained
separately (includes initialization/warmups). Serial sampling can miss blocked
peaks. Heap/external/arrayBuffers are host-isolate snapshots, not all-worker heap.
Event-loop delay, ELU, and 10ms timer drift sentinel are armed before compute and
flushed after it, so serial blocked time is visible. Timers stop before shutdown.
Per-chunk submit/worker-start/worker-end/completion timestamps and index coverage
are retained; worker-start clock uses performance.timeOrigin+performance.now().

Recommended host conditions: AC power, close heavy applications, avoid builds,
updates and video, stable thermals. Power/governor/background state is recorded
as observed/unknown; no automatic governor changes. Single-host synthetic results
do not generalize to Windows, macOS, ARM, other kernels or other Node versions.

## Reproduction

```bash
npm ci
npm run benchmark:flagship:test
npm run benchmark:flagship:smoke
npm run benchmark:flagship:calibrate
# Commit frozen serial-calibrated config before full parallel measurement.
npm run benchmark:flagship:full
npm run benchmark:flagship:analyze -- path/to/full.jsonl
```

Full is explicit and never part of ordinary CI. Smoke validates correctness,
cleanup, serialization and analysis, and is not performance evidence. Files use
exclusive creation and include Cairo execution date, host, Node and unique ID;
raw trial evidence is append-only. Existing historical files are never changed.
