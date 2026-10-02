# PJS v0.13 — real-world hashing and crypto evaluation

## IMPLEMENTATION / RESEARCH SUMMARY

**Outcome B: PJS is useful for specific workloads; postpone `@pjs/crypto`.**
The strongest reusable result is scrypt isolation from filesystem/libuv contention
at essentially unchanged crypto throughput. Coarse independent SHA jobs also
benefit. Tiny individual hashes and the tested AES transport path lose throughput.
Argon2 shows a substantial advantage on this Node build, but a reproduced native
async submission problem prevents generalizing that advantage to other releases.

Implemented a public-API benchmark under
[`benchmarks/real-world/crypto`](../benchmarks/real-world/crypto/README.md), with
independent output checks, persistent pools, ownership controls, resource guards,
bounded admission, synthetic application probes, raw worker controls, and a
report generator. No crypto package or runtime feature was added.

The main Fedora campaign contains **91 cells × 6 retained trials = 546 trials**,
plus two warmups per cell, with zero skipped cells and zero correctness errors.
Two fresh-process Argon2 confirmations add 12 retained trials. A separate native
submission probe retains six trials per API after two warmups. Development smoke
evidence is preserved separately and is not pooled with the retained campaign.
All slow trials and negative results remain in the artifacts.

Full per-cell median/min/max/CV, latency, queue, execution, CPU, memory and probe
tables are in the [measurement appendix](research/v0.13-crypto-measurements.md).
The [proposal](proposal-v0.13.md) records hypotheses written before measurements.
The [methodology](../benchmarks/real-world/crypto/README.md) defines every metric.

## WHY CRYPTO WAS SELECTED

Independent backend derivations and transforms exercise CPU concurrency, native
execution, transport, queueing, working memory, and interference with application
I/O. The experiment compares execution environments using trusted implementations;
it does not compare weakened cryptographic parameters or implement algorithms.

## ENVIRONMENT

| Field                                     | Observed value                                |
| ----------------------------------------- | --------------------------------------------- |
| OS / kernel                               | Fedora 44 KDE / Linux 6.19.10-300.fc44.x86_64 |
| CPU                                       | AMD Ryzen 3 PRO 3300U                         |
| Physical / logical / availableParallelism | 4 / 4 / 4                                     |
| RAM / initially free                      | 7.19 GiB / 3.33 GiB                           |
| Node / V8                                 | 24.13.1 / 13.6.233.17-node.40                 |
| OpenSSL / npm                             | 3.5.7 / 11.8.0                                |
| Governor / power plan                     | schedutil / unavailable                       |
| libuv pool                                | default 4; not changed                        |
| Checkout                                  | `4fc6cd31648ef7527c08ffda9af008499dc2bd32`    |
| Campaign date                             | 2026-10-02                                    |

The sandbox's nested npm query returned an empty string; validation metadata
preserves a separately observed `npm --version` result. No power setting, default
Node version, or system configuration was changed. Dynamic frequency, temperature,
desktop activity and sequential trial ordering limit small percentage claims.
Only Fedora was available. **Windows is not validated by this milestone run.**
Portable full/reduced commands are prepared; no remote machine access was assumed.

## PJS SOURCE STATUS

Every `packages/runtime/src` file has before/after SHA-256 hashes in the raw main
artifact, and the manifests agree exactly. Git comparison also confirms equality
with runtime implementation `18f0c87e7b7920179403bbc396afabced6bb06c4`.
Historical v0.1–v0.12 artifacts remain unchanged. Root dependencies, runtime
version, runtime tests and public API are unchanged. Bcrypt 6.0.0 and its lockfile
are isolated in the private benchmark directory.

Build, existing tests, type tests, compatibility typecheck, lint, format check,
`git diff --check`, benchmark harness tests, and runtime/historical-source checks
are recorded in [validation-v0.13.json](../benchmarks/results/validation-v0.13.json).

## SECURITY PARAMETERS

| Workload | Identical parameters within each model comparison                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| SHA      | SHA-256 / SHA-512; 1 KiB, 64 KiB, 1 MiB, 8 MiB                                                                       |
| scrypt   | N=16384, r=8, p=1, maxmem=64 MiB; 32-byte output; 16-byte synthetic salt                                             |
| Argon2id | 64 MiB, three passes, 32-byte output, 16-byte synthetic nonce; lanes 1/2/4 in separate comparisons                   |
| bcrypt   | native bcrypt 6.0.0; cost 10; fixed synthetic salt and password                                                      |
| AES      | AES-256-GCM; fresh random key per trial, unique 12-byte IV per operation, 16-byte tag, authenticated associated data |

These are test parameters, not password-storage recommendations. SHA and derived
values match trusted serial results. Every AES ciphertext decrypts to its input;
every deliberately altered tag is rejected. Fixtures and checking are outside
timed work. No real passwords, private keys or credentials were used or retained.

## SHA RESULTS

Median operations/s, six trials each. PJS and raw pools have four workers and
16 logical jobs in flight. Serial has one executing job.

| SHA-256 size |  Serial | PJS clone | PJS transfer | PJS shared | Raw shared |
| ------------ | ------: | --------: | -----------: | ---------: | ---------: |
| 1 KiB        | 246,267 |    22,442 |       15,893 |     21,605 |     37,831 |
| 64 KiB       |  24,175 |    12,584 |       12,146 |     16,060 |     21,232 |
| 1 MiB        |   1,571 |     1,479 |        2,694 |      2,797 |      3,223 |
| 8 MiB        |     192 |       310 |          543 |        534 |        567 |

For SHA-512, serial/PJS-shared operations/s are 195,417/21,851 at 1 KiB,
9,217/10,048 at 64 KiB, 592/1,325 at 1 MiB and 74/223 at 8 MiB.
The 64 KiB SHA-512 difference is modest relative to PJS's 6.8% CV; the larger
payload differences are much clearer. Full variance is retained in the appendix.

## HASH CROSSOVER POINTS

For **individual SHA-256 jobs**, the measured shared/transfer crossover is bounded
between 64 KiB and 1 MiB. Clone crosses between 1 MiB and 8 MiB. These are brackets
from measured sizes, not an interpolated exact byte threshold. Shared SHA-256
reaches 1.78× serial throughput at 1 MiB and 2.77× at 8 MiB on this host.

Single-job concurrency does not deliver parallel throughput: 1 MiB PJS shared
at concurrency 1 achieves 1,101 ops/s, below serial's 1,571. Concurrency 4/8/16
achieves 2,793/2,809/2,797 ops/s; increasing to 32/64/128 gives
2,712/2,949/2,864. Deep queues do not establish a compelling additional gain.

Manual 64-operation batches of 1 KiB SHA-256 produce 451,780 serial, 494,633 PJS,
and 675,401 raw-worker operations/s. PJS's roughly 9.5% gain over the **batched**
serial control is modest (CV 3.4% versus 6.5%). Batching amortizes harness as well
as dispatch cost, so comparing batched PJS against unbatched serial would mislead.

## CLONE / TRANSFER / SHARED EFFECTS

At 1 MiB, cloning loses to serial while shared and transferred inputs win. At
8 MiB, eliminating input cloning lifts PJS from 310 to 534–543 ops/s. Transfer
here includes returning input ownership to the caller for reuse; it is not a
zero-cost one-way handoff. Equal-content lane-local inputs are reused, so cache
behavior differs from an arbitrarily large unique-data corpus. Shared data stays
immutable throughout execution. No runtime transport fast path was added.

## SCRYPT RESULTS

Native async scrypt is a strong baseline. At four concurrent jobs, native and
PJS both achieve about 66.8 ops/s. At 16 jobs, native/PJS/raw achieve
66.6/66.3/67.6 ops/s. These differences do not establish a throughput win for
PJS. The important difference appears in unrelated I/O below.

## SCRYPT CONCURRENCY

| Logical concurrency | Native ops/s | PJS four-worker ops/s |
| ------------------- | -----------: | --------------------: |
| 1                   |        22.53 |                 22.42 |
| 2                   |        38.72 |                 40.39 |
| 4                   |        66.81 |                 66.84 |
| 8                   |        66.81 |                 65.47 |
| 16                  |        66.59 |                 66.30 |
| 32                  |        68.31 |                 67.41 |
| 64                  |        70.75 |                 67.92 |

Concurrency beyond four mostly adds waiting: PJS p99 grows from 66 ms at four
jobs to 250 ms at 16 and 930 ms at 64. Native p99 similarly reaches 902 ms at 64.
The small throughput variation is not a reason to admit an unbounded backlog.

## ARGON2 RESULTS

At concurrency four and one lane, main-campaign native/PJS-four-worker throughput
is 4.37/6.82 ops/s. Fresh-process confirmations yield 3.80/7.00 ops/s, with CV
1.6%/1.9%. However, the native async path has substantial synchronous submission
work on this tested build. Its main-campaign timer p99 is 689 ms versus 2.15 ms
for PJS; this is not normal scrypt-like asynchronous behavior.

The standalone `argon2-probe.mjs`, which imports no PJS code, reproduces native
call-return times of 197–215 ms per request and a 10 ms timer firing at 822–840 ms
after four submissions. Scrypt control submissions return in 0.01–0.14 ms.
This behavior matches [Node's upstream Argon2 blocking issue #62861](https://github.com/nodejs/node/issues/62861).
That issue is closed upstream; this campaign does **not** identify which released
builds contain its fix. No Node version was installed or changed to improve the
baseline. Treat Argon2 model ratios as **version-specific, affected-baseline
results**, not durable justification for a crypto package. Recheck a fixed build
before making an adoption claim based on this contrast.

## PJS WORKERS × ARGON2 PARALLELISM

Median operations/s; each cell has four logical jobs, 64 MiB per derivation,
three passes, and independently checked outputs. Lanes change the derivation;
compare execution models only within one lane column.

| PJS workers          | 1 lane | 2 lanes | 4 lanes |
| -------------------- | -----: | ------: | ------: |
| 1                    |   2.52 |    2.81 |    4.12 |
| 2                    |   4.61 |    5.51 |    6.05 |
| 4                    |   6.82 |    6.76 |    6.59 |
| Native async control |   4.37 |    4.52 |    6.76 |

## OVERSUBSCRIPTION FINDINGS

Four PJS workers with one lane use about 334% CPU and 15 process threads;
four workers with four lanes use 342% CPU and a median sampled peak of 35 threads.
Timer p99 rises from 2.15 to 8.08 ms, while throughput does not improve. The small
3.4% throughput decline is within the noisier one-lane cell's 6.2% CV; it is not
a precisely established slowdown. Increased thread pressure and worse timer
tails provide stronger evidence against indiscriminately nesting parallelism.

One worker does benefit from additional lanes. The result is a resource-allocation
tradeoff, not a rule that internal parallelism is always harmful. Node's native
integration explicitly requests OpenSSL threads using the lane count; sampled
thread counts corroborate actual thread growth on this build.
[Node source](https://github.com/nodejs/node/blob/v24.13.1/deps/ncrypto/ncrypto.cc#L1796)
and [OpenSSL thread/lanes documentation](https://docs.openssl.org/3.5/man7/EVP_KDF-ARGON2/).

## BCRYPT RESULTS

Cost 10, six trials per cell. Native/PJS ops/s at concurrency 1/4/16/32 are
15.16/17.36, 54.19/55.18, 55.36/53.66, and 54.51/55.44. Saturated throughput
and latency are broadly similar. The isolated single-concurrency difference is
not a general PJS advantage: native CV is 8.2%, and cells were run sequentially.
At concurrency 32, native/PJS p99 is 585/575 ms. No separate bcrypt contention
campaign was run; do not extrapolate the measured scrypt I/O ratios to bcrypt.

## AES-GCM RESULTS

| Payload | Serial ops/s | PJS ops/s | Serial / PJS CV |
| ------- | -----------: | --------: | --------------: |
| 1 KiB   |       81,528 |    14,571 |    11.1% / 7.1% |
| 64 KiB  |       17,671 |     6,544 |    7.9% / 11.4% |
| 1 MiB   |        1,358 |       711 |     8.7% / 2.0% |
| 8 MiB   |          138 |       118 |   18.6% / 10.4% |

PJS is markedly worse through 1 MiB with cloned input and returned ciphertext.
The smaller 8 MiB difference has high variance and only 16 jobs per trial;
it does not establish a robust throughput ordering. Native AES cost, allocation,
input copying and full ciphertext return are all included. No AES transfer/shared
variant was tested, so this is not a claim about every possible AES pipeline.

## RAW NODE VS PJS

Native async scrypt/bcrypt already protect the event loop and match PJS saturated
throughput. Serial SHA/AES are efficient but block the main thread during a long
bulk burst. PJS changes where work and waiting happen; it does not accelerate
one native primitive. Native Argon2's tested submission issue is a separate API
limitation and must not be used to portray Node async generally as weak.

## WORKER_THREADS CONTROL

The raw pool is persistent, uses the same task body, inputs and worker count, and
provides FIFO job dispatch without building a competing runtime. At 1 MiB shared
SHA-256, PJS reaches 2,797 versus raw's 3,223 ops/s (about 13% below raw). At 8 MiB
it reaches 534 versus 567 (about 6% below raw). The larger gap on tiny jobs confirms
material orchestration overhead. Scrypt's 66.3 versus 67.6 ops/s is close enough
that its native work dominates. PJS adds bounded admission and existing metrics.

## THROUGHPUT

The appendix preserves median, min/max, sample count and sample CV for every cell.
Warm pool ready times of 79–165 ms for PJS are recorded separately; lazy task
module loading occurs in warmup. Throughput excludes fixture/reference generation,
validation and startup. Calibration targets 350 ms, capped at 32,000 jobs and
128 MiB of retained AES output. Large AES windows are about 90–135 ms; their
variance limits claims. No outlier was manually discarded.

## P50 / P95 / P99 LATENCY

Representative values are medians of per-trial percentiles, in milliseconds:

| Scenario                      |    p50 |    p95 |    p99 |
| ----------------------------- | -----: | -----: | -----: |
| SHA-256 1 MiB shared, PJS c16 |   5.48 |   7.21 |   8.16 |
| SHA-256 1 MiB clone, PJS c16  |  10.09 |  14.12 |  15.79 |
| Scrypt native c16, pure       | 210.90 | 236.52 | 236.58 |
| Scrypt PJS c16, pure          | 190.97 | 244.96 | 250.37 |
| Scrypt native c64, pure       | 472.23 | 871.33 | 901.99 |
| Scrypt PJS c64, pure          | 482.95 | 891.73 | 929.51 |

These are closed-loop job latencies, not open-loop server SLAs. Batched SHA reports
job latency for 64 operations. The appendix also reports p90 and maximum.

## QUEUE LATENCY

Public cumulative PJS statistics yield exact per-trial queue means. For scrypt
four-worker concurrency 4/16/64, these are approximately 0.02/115.53/432.89 ms.
Queue p50/p95/p99 remain **unavailable**. Admission-to-task-body percentiles include
transport and dispatch as well as queue wait and are labeled separately.
Native libuv queue time is not exposed by the APIs and is not fabricated.

## EXECUTION LATENCY

Every synchronous worker task records task-body duration; PJS also supplies its
runtime execution mean. Their scopes differ: runtime timing can include transport
and worker notification handling. Native async execution cannot be separated from
internal queueing through the public API. All available distributions and missing
fields are explicit in JSON and the appendix.

## EVENT LOOP RESPONSIVENESS

Scrypt native/PJS timer p99 at concurrency 16 with contention is 1.62/0.81 ms;
at 64 it is 2.62/2.12 ms. Both protect the event loop well on this machine; these
small differences do not establish a broad PJS event-loop advantage over scrypt.
Serial 1 MiB SHA bulk work delays the timer by about 343 ms versus 1.2 ms for
PJS shared input. AES similarly exchanges throughput for responsiveness.

Argon2 is the version-specific exception described above. ELU and the independent
timer expose its submission stall. `monitorEventLoopDelay` can miss the initial
synchronous burst in these short windows even when primed; do not mistake its
roughly 10 ms histogram floor for proof that the loop stayed responsive. The
independent timer and standalone reproduction are decisive for this finding.

## CPU UTILIZATION

CPU 100% means one CPU and includes all process threads. Saturated scrypt generally
uses about 340–360%; one/two dedicated workers use about 103%/196%. PJS shared
1 MiB SHA uses about 302%; worker-body occupancy helps distinguish execution from
transport/queue overhead. Native one-lane Argon2 uses only about 172% versus PJS's
334%, consistent with its observed synchronous submission bottleneck. This is an
interpretation of measurements, not a claim of a PJS algorithmic speedup.

## MEMORY BEHAVIOR

The maximum sampled process RSS in the main campaign is about 1,958 MiB. It includes
fixture buffers, prior-cell allocator retention, workers and native scratch memory.
It is **not** the working memory of the last algorithm. A later one-job scrypt cell
still has high RSS after a larger SHA cell; this demonstrates why per-cell RSS
levels cannot be cleanly attributed in a single long-lived process.

Per-trial before/after and sampled peak RSS, main-isolate heapUsed, external and
arrayBuffers are retained. Worker heaps are not included in those JS heap fields;
short native peaks may be missed. Estimated requirements were checked against
half of free RAM and a quarter of total RAM before each cell. All scheduled cells
passed. Native algorithm memory is independent of result-byte credits. No unsafe
worker expansion, forced swapping, or OOM experiment was attempted.

## CONTENTION TEST

Crypto runs beside a 10 ms timer and sequential cached reads of a benchmark-owned
4 KiB temporary file. The directory is removed afterward. An idle control is
included. No user files are read or modified. Filesystem sampling has one request
in flight, so heavily blocked periods produce fewer samples; the recorded tails
are observations of this probe, not a production service percentile guarantee.
At c16 the native probe completes only 3–5 reads per trial, versus 23–27 with
four PJS workers. At c64 it completes 3–5 versus 59–72. Thus native per-trial
p95/p99 often equal the observed maximum. Six repeated trials support the large
interference finding; they do not precisely estimate a population p99.

## FILESYSTEM INTERFERENCE

| Scrypt concurrency | Native ops/s | PJS ops/s | Native fs p95 ms | PJS fs p95 ms |
| ------------------ | -----------: | --------: | ---------------: | ------------: |
| 4                  |        67.25 |     65.45 |            64.34 |          6.48 |
| 16                 |        67.09 |     65.96 |           319.39 |          7.62 |
| 64                 |        69.43 |     69.42 |           876.89 |          6.87 |

At c16, PJS lowers this probe's p95 by about 42× with similar crypto throughput;
at c64 the measured ratio is about 128×. These are large repeated differences,
not a claim of a few percent improvement beneath noise. They are specific to the
default four-thread libuv pool, this read probe, and this host.

## LIBUV INTERFERENCE

Async filesystem work and async scrypt share libuv's pool. Dedicated workers
running synchronous crypto leave that pool available, while still competing for
CPU and memory. This explains the observed isolation relationship; it is not a
claim that dedicated workers eliminate all application interference.
[Node's threadpool documentation](https://nodejs.org/api/cli.html#uv_threadpool_sizesize).
Changing UV_THREADPOOL_SIZE or adding application-level admission for native async
crypto are plausible alternatives, but neither was tuned in this campaign.

## PJS BACKPRESSURE

A separate burst offers 16 jobs to one worker with queue capacity two. Exactly
three complete successfully and thirteen reject as `PjsQueueFullError`. Accepted
outputs are checked and the final queue is empty. The main campaign bounds client
concurrency and uses queue capacity 256. Rejection is explicit admission control,
not automatic waiting or a bound on native working memory.

## WORKER COUNT FINDINGS

At c16, one/two/four PJS scrypt workers achieve 23.1/41.9/66.3 ops/s. Four is best
for crypto throughput among tested safe counts; two under contention achieve
42.3 ops/s with fs p95 1.31 ms, versus four's 66.0 ops/s and 7.62 ms. One leaves
more application capacity but only delivers 22.9 ops/s. Thus best depends on the
application's resource budget. No evidence supports choosing availableParallelism
without considering native memory and nested threads. Counts above four were not
needed to demonstrate Argon2 nested oversubscription on this four-core host.

## NEGATIVE RESULTS

Tiny unbatched SHA loses heavily. SHA-256 cloning at 1 MiB does not beat serial.
Scrypt and bcrypt show no compelling saturated-throughput improvement. Deep
scrypt queues mostly worsen tails. AES's tested clone path loses clearly at small
and medium sizes. Argon2 extra lanes add threads without helping four-worker
throughput. All of these results remain in the raw evidence.

## PJS RUNTIME PAIN POINTS

See the [classified pain log](research/v0.13-runtime-pain-log.md): missing queue
quantiles, explicit buffer recycling, small-task overhead, native-memory budgeting,
worker-heap visibility, benchmark checkpoint visibility, and platform-specific
native API behavior. These observations did not trigger runtime modifications.

## MISSING PRIMITIVES DISCOVERED

None required to run these workloads. Existing task registration, `run()`, transfer,
shared input, queue bounds and statistics suffice. Completed-task telemetry might
improve research ergonomics, but this is a possible future improvement rather than
a demonstrated need for another public primitive. Cancellation was not benchmarked.

## SECURITY LIMITATIONS

This measures defensive server-side derivation and trusted native transforms, not
password guessing. Benchmark salts and repeated inputs are synthetic fixtures,
not a production storage protocol. Timing comparisons do not establish adequate
password cost, constant-time application behavior, secure key erasure, or resistance
to side channels. No key management package or cryptographic assurance is provided.

## WHAT PJS IS GOOD AT

Coarse independent transforms, explicit dedicated concurrency, bounded queues,
basic observability, and isolating synchronous native work from the application's
event loop and libuv queue. Here, the strongest general finding is scrypt I/O
isolation; larger SHA provides a separate throughput case.

## WHAT PJS SHOULD NOT BE USED FOR

Do not add one worker dispatch around each tiny hash to improve throughput. Do not
expect to accelerate a single derivation or use a deep queue as extra CPU capacity.
The measured AES clone pipeline and ordinary async password hashing without an
isolation requirement do not justify extra PJS complexity on throughput alone.
These are measured scope boundaries, not universal bans on all crypto worker use.

## DOES @PJS/CRYPTO DESERVE TO EXIST?

**Not yet. Outcome B.** Repeated scrypt isolation evidence justifies a documented
dedicated-runtime recipe. Existing APIs already express it; no repeated ergonomic
need establishes a separate package. SHA benefits depend on size, ownership and
batching. The Argon2 benefit includes an upstream native-API issue and must be
rechecked on a fixed build. Do not implement bulk wrappers or a package based on
these findings alone.

## RECOMMENDED V0.14

First reproduce the key relationships on Windows and recheck native Argon2 on a
build confirmed to contain the upstream fix, without changing user defaults.
For the next real-world domain, evaluate bounded compression/decompression with
mixed application I/O and explicit memory budgets. Keep the same evidence-first
approach and only propose runtime work when a measured limitation demands it.
No v0.14 implementation was started.

## Raw evidence and reproduction

- [Main campaign](../benchmarks/results/crypto-v0.13-fedora-node24.json)
- [Argon2 native confirmation](../benchmarks/results/crypto-v0.13-argon2-native-confirm.json)
- [Argon2 PJS confirmation](../benchmarks/results/crypto-v0.13-argon2-pjs-confirm.json)
- [Native submission diagnosis](../benchmarks/results/crypto-v0.13-native-submission-probe.json)
- [Development smoke](../benchmarks/results/crypto-v0.13-smoke.json)
- [Validation](../benchmarks/results/validation-v0.13.json)

The full campaign is locally complete; cross-platform adoption evidence is not.
Use `--profile=reproduce` with a new platform-specific filename to run the reduced
suite. Use the standalone native submission probe before interpreting Argon2 on
another Node build. Fixed input corpora, finite closed-loop bursts, sequential
cell trials and sampled process-wide memory are deliberate limits, not hidden
production claims.
