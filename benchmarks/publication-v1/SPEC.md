# PJS 1.0 publication campaign: frozen design

Campaign `pjs-1.0-publication-v1`, specified 30 October 2026, independently of
historical RC2 and benchmark-health evidence. This document and `config.mjs`
define the campaign before retained competitor measurement. Smoke checks are
correctness/cleanup evidence and cannot establish a ranking. No calibration or
post-result tuning is used. Any future change to this specification requires a
new campaign identity; retained evidence is never rewritten.

## Identities and isolation

Use exactly Node **24.22.1**, supported by all four packages. Install exactly
`@pjavascript/runtime@1.0.0`, `piscina@5.3.2`, `tinypool@2.2.0`, and
`workerpool@10.0.3` using the independent consumer manifest/lockfile. The runner
checks availability, engines and registry integrity before `npm ci`. It records
the actual Node executable/sha256, npm CLI/version/sha256, installed file hashes,
registry metadata, lock digest, host entry realpaths and worker resolution probes.
No workspace links, unpublished builds or root dependency changes are permitted.
The consumer is a new OS-temp directory outside the repository and is retained.

## Matrix and controls

Six contenders: serial JavaScript; persistent raw `node:worker_threads`; PJS;
Piscina; Tinypool; workerpool. Main worker count p=min(4, usable capacity).
Usable capacity respects Node's observed affinity and observable cgroup CPU
quotas (round fractional CPU quotas down, minimum one). Scaling uses unique
sorted values from {1,2,p}, only at medium Monte Carlo. No oversubscription.
Unknown Windows job quotas and ancestor cgroup restrictions remain explicit.

All libraries use fixed minimum/maximum workers, one active CPU task per worker,
queues bounded at 2p, and the same common driver admitting at most 2p tasks.
Serial admits one synchronous task at a time. Tinypool explicitly selects
`runtime: worker_threads`; workerpool selects `workerType: thread` and registered
`task` submissions. Other options remain documented defaults. Raw uses ready
messages, task correlation, bounded FIFO dispatch, task/error/exit handling and
awaited termination. Warm workers persist across the first execution, warmups
and measured workload in each trial. No worker is spawned per task.

| Family / study             | Fixed sizes and boundaries                                                  | Outputs / transport                                                                                             |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Monte Carlo primary        | 5,000 / 50,000 / 200,000 paths; chunk size ceil(N/32), independent of p     | Aggregate count, compensated moments, extrema and path-bit checksum; entire ordinary model cloned on every task |
| Monte Carlo scaling        | 50,000 paths at each additional p in {1,2,p}; identical 32-partition policy | Same aggregate contract and cloned model                                                                        |
| Image primary              | 512x512 and 2048x2048 RGBA, 64 output rows per tile, one-row halos          | Complete host-owned output; clone and transfer reported separately                                              |
| Numerical primary          | 262,144 values; logical chunks 64 / 1,024 / 16,384                          | Every logical chunk's sum/checksum; one chunk per submitted task                                                |
| Numerical batching control | Same 262,144 values and logical chunk 64; eight logical chunks per task     | Identical grouping, output records and batching for **all** contenders; separate labelled experiment            |

At p=4 this is 13 workload cells x six contenders x ten trials = **780 fresh
child processes**. Without scaling it is 11 x six x ten = 660. This deliberately
avoids a Cartesian product. All eleven primary/batching cases appear in both
overview charts; scaling remains in the full report. No favourable-case filter.

Monte Carlo reuses exact copies of the existing nontrivial 16-factor,
1,024-position correlated-normal delta-gamma kernel, PRNG, model and bootstrap
helpers. Copies are byte-equal to their historical sources at implementation;
the historical campaign's source/config/results remain untouched. Seed
`0x504a5301`; per-path counter-based random streams do not depend on scheduling.

The image kernel is one integer 3x3 Gaussian RGBA stencil, clamped boundaries,
integer rounding, alpha preserved. Tile input includes its halo. Clone retains
input/output backing; transfer moves input to worker and complete output back,
with host detachment asserted. Fresh identical input is prepared before each
iteration for every adapter, so a transferred buffer is never reused while
detached. The serial transfer control uses structuredClone transfer to implement
the same ownership transitions without worker transport. Serial clone executes
directly, as an ordinary serial baseline. There is no hidden worker cache or
native codec/GPU comparison.

Numerical values use the same integer mixer and sqrt/sin/log1p calculation by
global index. The batch control groups ordinary tasks, with no PJS range API.
Changing grain changes only task/reduction boundaries, never the useful values.

## Correctness and timing

The campaign host computes and retains deterministic references **outside fresh
trial children**, before competitor execution. Images must match every byte;
counts/checksums/extrema must match exactly. Floating moments/sums allow 1e-12
relative with a 1e-10 absolute floor, solely for ordinary binary64 reduction
roundoff; all contenders use this same tolerance and reduction order. Fixtures
also check the image stencil against a separate scalar oracle, uneven boundaries,
batch equivalence, historical helper equality, and serial blocked-timer capture.

Each trial creates one fresh child and one fresh pool. Record input preparation,
construction/readiness, cold first useful chunk, cold completed workload, two
full-workload warmups, **one measured warm sample**, and awaited cleanup.
Cold is pool construction to first useful result/completed workload in an
already imported host process, excluding Node launch, host module loading,
oracle loading and input preparation. It is explicitly not total CLI startup.
No identity probe precedes the cold useful computation. Warmups, cold samples,
errors and all process receipts remain in raw evidence.

Warm wall time includes dispatch, input transport, kernel computation, output
transport, ordered collection and required reduction/assembly. It excludes input
generation, oracle construction, validation, instrumentation arming/flush and
cleanup, each measured or documented separately. Input preparation appears in
the report alongside warm compute; it is not amortized away or called free.
Ordinary GC only. No forced GC, outlier deletion, selective reruns or tuning.

Exactly ten measured trials per publication cell. Execution is sequential across
all contenders/children. The seeded permutation and cyclic rotation in
`balancedOrder` balances contender positions to once or twice across ten rounds.
Case order rotates by the same predeclared rule. The **complete ordered job list**,
specification, source/file hashes and environment are written to `freeze.json`
before package installation or any reference/contender measurement. A 120s child
watchdog covers startup through natural exit; failed/timed-out children remain
records and invalidate publication eligibility. No retry is automatic.

Process-wide RSS is sampled every 10ms plus workload endpoints; this is
observational and can miss peaks, especially during host blocking. The lifetime
RSS high-water mark is separate and includes startup/warmups. No host heap metric
is presented as process memory. A 10ms host timer sentinel is armed before timing
and flushed after computation, allowing synchronous serial blocking to be
observed. Retain all drift samples, n, p95 and max. Missing samples mean unknown,
never zero. Short tasks have sparse samples and p95 is not an application request
latency guarantee. RSS/timer instrumentation is the same for every contender.

Record CPU model, observed logical/physical topology, RAM, OS/architecture,
affinity, observable virtualization/quotas, power plan/governor observation and
background conditions or explicit unknowns. The runner makes no system changes.
Publication requires a quiet local host and a recorded host note; managed-host
smoke observations never authorize publication performance claims.

## Analysis and publication rules

Medians, min/max, mean, SD, CV and IQR; seeded **2,000-resample percentile 95%
bootstrap intervals of the median**, reusing historical `stats.mjs`. These are
descriptive uncertainty, with no significance or multiple-comparison guarantee.
Throughput=N/median seconds. Graph throughput interval endpoints invert the wall
interval. The median of per-trial timer p95 is graphed with its own bootstrap
interval. All bar axes start at zero, consistent contender order/colours.

Speedup explicitly means **matching-case chunked serial median / contender
median**. Serial uses identical logical chunks, inputs, grouping and output
requirements; it has no worker transport. Scaling cases retain the same chunk
size, and each has its own matching serial control. No average across families.
A clear practical improvement/loss requires >5% median difference **and**
non-overlapping wall intervals; otherwise small/noisy. Every pairwise comparison
is retained. Failed/missing/capability-unavailable results cannot be wins.

Report every observed loss and uncertain result, sampled size/grain crossovers
and overhead limits. Infer no unmeasured break-even point or reliability/feature
completeness claim. Produce PNG/SVG computation and responsiveness graphics using
committed Matplotlib code directly from retained JSON. Every chart gives package
versions, host, Node, p, n, interval method and reproduction reference. Smoke
graphics are visibly watermarked and never used as release speed claims.
