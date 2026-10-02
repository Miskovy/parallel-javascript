# v0.13 crypto: Windows reproduction of Fedora research

**Decision: Outcome B with platform caveats. PJS is useful for specific workloads;
postpone `@pjs/crypto`.** The strongest Fedora findings survive: dedicated scrypt
workers protect filesystem responsiveness, coarse SHA amortizes dispatch and
transport, tiny SHA loses heavily, and the tested AES clone pipeline loses.
Windows has a responsive native Argon2 baseline and different resource-allocation
tradeoffs. No runtime change or v0.14 work is justified by this reproduction.

## Evidence boundary

Fedora's completed research remains in [benchmarks-v0.13.md](benchmarks-v0.13.md),
[proposal-v0.13.md](proposal-v0.13.md), and the
[runtime pain log](research/v0.13-runtime-pain-log.md). Those historical findings
and their raw artifacts were not rewritten or regenerated. Repository synchronization
was fast-forward-only and reported already up to date at Fedora research commit
`0daece375aaa8d838595e1e9c7923a2dd3718f8a` (`Benchmark Test of Crypto`).

Both platforms study the unchanged v0.12 implementation
`18f0c87e7b7920179403bbc396afabced6bb06c4`. Windows used the existing harness's
43-cell `reproduce` profile, with two warmups and six retained trials per cell.
Five existing concurrency-64 cells and eight existing bcrypt cells are separate
focused supplements; the full 91-cell research matrix was not rerun. All 56 cells,
336 retained trials, and admission-control checks completed with validated outputs,
zero errors and zero skips. The native submission probe is separate and imports
no PJS runtime.

All throughput values below are medians across six retained trials. Latency columns
are medians of per-trial percentiles, not pooled percentiles. Comparisons are
within each machine; absolute Fedora and Windows rates are not comparable.
See the [generated Windows measurements](research/v0.13-windows-measurements.md)
for every retained cell's throughput, variability, latency, queue/body measurements,
responsiveness and resources. Cryptographic parameters and synthetic fixtures are
the existing [measurement contract](../benchmarks/real-world/crypto/README.md).

## Windows environment, Node and power

Observed Windows 10 Pro, version 10.0.19045, build 19045, x64; Intel Core
i3-10100F at nominal 3.60 GHz; 4 physical cores, 8 logical CPUs and
`availableParallelism() = 8`; 17,037,594,624 bytes RAM (15.87 GiB).
The observed active power plan was **Balanced**,
GUID `381b4222-f694-41f0-9685-ff5bb260df2e`.

Node was **24.21.0**, V8 **13.6.233.17-node.53**, OpenSSL **3.5.8**;
the default npm command reported **11.18.0**. Node resolved to
`C:\Program Files\nodejs\node.exe`. The validation artifact records both `where.exe`
outputs and the selected CIM processor, OS and computer-system properties.
The harness's npm field is unavailable because its direct Windows `.cmd` execution
does not launch a shell; the separately recorded `npm.cmd --version` supplies the
actual value. The authoritative power observation is `powerObserved`, rather than
the optional environment label `power`.

Fedora used Node 24.13.1 / OpenSSL 3.5.7. That version difference matters for Argon2.
No default Node selection, PATH, power plan, Windows setting or CPU configuration
was changed. `UV_THREADPOOL_SIZE` was unset throughout: native async crypto used
Node's default four-thread pool. Prepared worker counts were retained, including
the profile's explicit eight-worker scrypt resource-allocation comparison.

## Validation and runtime source hash check

The build, runtime tests (**178 passed**), type tests, compatibility typecheck,
lint, format check, `git diff --check`, and crypto harness tests (**4 passed**)
all passed before retained benchmarking. Only the isolated benchmark dependencies
were installed, using `npm.cmd ci --prefix benchmarks/real-world/crypto --ignore-scripts`.
Root and runtime dependencies were unchanged. Final tooling/report checks are
recorded with the original gate outputs in
[Windows validation](../benchmarks/results/validation-v0.13-windows.json).

All **25** runtime source files match Fedora's recorded SHA-256 hashes
byte-for-byte. `git diff` against the pinned implementation is empty for
`packages/runtime/src`, and each campaign's before/after source hashes match.
The validation evidence records before/after SHA-256 hashes for every historical
tracked results artifact; all remain identical. There were no runtime/API changes.

## Native Argon2 submission probe

**ARGON2 BASELINE APPEARS FIXED.** The standalone probe ran before the campaign.
For each API it retained six trials after two warmups, each submitting four jobs.

| Retained probe metric                      | scrypt control |      Argon2 |
| ------------------------------------------ | -------------: | ----------: |
| Submission-call min–max, ms                |    0.010–0.146 | 0.008–0.069 |
| Median submission call, ms                 |         0.0193 |      0.0189 |
| Median 10 ms timer fired at, ms from start |          16.16 |       16.35 |
| Median callback time, ms from start        |          48.45 |      278.75 |
| Median wall time, ms                       |          51.37 |      282.85 |

Argon2 submits promptly, with timer behavior like the control. Fedora's
197–215 ms per-call synchronous submission and roughly 822–840 ms timer firing
did not reproduce. The [upstream issue](https://github.com/nodejs/node/issues/62861)
is closed, but the classification here comes from the probe, not an assumption
that a particular release includes the fix. This is measured behavior on Windows
Node 24.21.0; platform and Node version changed together, so attribution to either
factor alone is not possible.

## SHA reproduction, crossover and ownership

Four workers and concurrency 16 for worker paths; serial concurrency one:

| SHA-256 input | Serial ops/s | PJS clone | PJS transfer | PJS shared | Raw shared |
| ------------- | -----------: | --------: | -----------: | ---------: | ---------: |
| 1 KiB         |      173,171 |    15,906 |       12,957 |     17,605 |     29,538 |
| 1 MiB         |          444 |       871 |        1,164 |      1,183 |      1,107 |
| 8 MiB         |         54.4 |     104.4 |        141.5 |      134.3 |      140.7 |

Tiny PJS hashes deliver only 7.5–10.2% of serial throughput; eliminating cloning
does not rescue tiny dispatch. At 1 MiB and 8 MiB, clone reaches roughly 1.96×
and 1.92× serial throughput; transfer/shared reach roughly 2.47–2.67×.
Eliminating input clone materially helps coarse jobs: shared is 36% faster than
clone at 1 MiB; transfer is 36% faster at 8 MiB. Transfer includes returning and
recycling ownership, and shared input remains immutable.

The reduced profile bounds Windows's observed crossover between 1 KiB and 1 MiB
for all three ownership paths; it does not locate an exact threshold. Fedora's
clone path was still slightly below serial at 1 MiB, so its exact clone crossover
did not reproduce. Hardware and versions differ; no matching byte threshold is
required. SHA-512 and manual tiny-hash batching were not repeated.

For 1 MiB shared SHA, concurrency 1/4/8/16 gives 339/1,048/1,266/1,183 ops/s;
the focused concurrency-64 supplement gives 984 ops/s. Per-trial p99 medians
rise from 7.20 ms at concurrency 4 to 16.52 ms at 16 and 69.53 ms at 64.
Additional logical concurrency beyond saturation adds queueing rather than capacity.
The concurrency-4 throughput CV is 14%; these finite bursts do not establish a
precise optimal concurrency.

## Scrypt throughput and filesystem contention

Both paths use `N=16384, r=8, p=1`, 64 MiB maxmem, 32-byte output and the same
synthetic password/salt contract. PJS runs synchronous scrypt in dedicated workers;
native runs the async API on the unchanged default libuv pool.

| Pure scrypt concurrency | Native ops/s | PJS, four workers ops/s | Native crypto p99 ms | PJS crypto p99 ms |
| ----------------------- | -----------: | ----------------------: | -------------------: | ----------------: |
| 4                       |        64.97 |                   67.35 |                65.48 |             65.80 |
| 16                      |        70.51 |                   68.45 |               223.82 |            226.86 |
| 64, supplement          |        65.10 |                   68.30 |               971.18 |            933.47 |

Saturated four-worker throughput remains roughly comparable. Increasing queue
depth to 64 yields no useful throughput gain and substantially worse crypto tails.

| Contention concurrency / path | Crypto ops/s | Crypto p50/p95/p99 ms      | FS p50/p95/p99 ms        | Timer p99 ms | ELU % |
| ----------------------------- | -----------: | -------------------------- | ------------------------ | -----------: | ----: |
| 4 / native                    |        71.39 | 52.45 / 61.32 / 64.56      | 38.99 / 83.40 / 83.40    |        13.54 |  3.62 |
| 4 / PJS                       |        61.78 | 62.38 / 67.97 / 71.24      | 1.16 / 3.23 / 3.63       |        13.29 |  7.24 |
| 16 / native                   |        61.99 | 173.54 / 239.03 / 248.28   | 0.95 / 286.52 / 286.52   |        11.99 |  3.86 |
| 16 / PJS                      |        58.18 | 180.19 / 271.87 / 271.87   | 1.25 / 3.12 / 4.87       |        12.11 |  6.86 |
| 64 / native, supplement       |        52.42 | 543.80 / 1116.12 / 1136.90 | 1.17 / 1116.80 / 1116.80 |        15.78 |  3.98 |
| 64 / PJS, supplement          |        61.11 | 534.03 / 1011.96 / 1040.59 | 1.30 / 5.55 / 7.33       |        14.35 |  7.79 |

The idle FS baseline is p50/p95/p99 1.07/1.82/2.39 ms. PJS preserves filesystem
responsiveness while native filesystem requests share libuv capacity with scrypt.
At concurrency 16 the native probe collects only 3–4 filesystem observations per
trial versus 19–24 under PJS; at 64 it collects just 1–2 versus 59–67. These sparse
native tail estimates should not be presented as precise population percentiles
or exact universal improvement ratios. Low native FS p50 at 16/64 reflects some
prompt reads outside blocked periods; it does not erase the long stalls.

Crypto throughput is of the same order under contention, but equality is not
universal: PJS is 6% below native at 16 and 17% above native at 64 in these samples.
Concurrency-4 PJS throughput CV is 15.2%, and concurrency-64 native CV is 9.5%.
The filesystem isolation conclusion is much stronger than any small throughput ordering.

At concurrency 16, prepared 1/2/4/8-worker pure scrypt rates are
24.33/35.14/68.45/88.36 ops/s. Eight workers help throughput on this 8-logical-CPU
machine, but timer p99 rises from 14.15 ms with four workers to 27.69 ms with eight,
and measured process CPU rises from 330% to 526% (100% is one CPU).
Two-worker contention sacrifices throughput (42.03 ops/s) for FS p95 1.74 ms.
Worker count remains an explicit resource-allocation tradeoff, not an automatic
`availableParallelism()` rule.

## Event loop and tail latency

Both native async scrypt and PJS keep the event loop broadly responsive while
native filesystem work stalls in the shared pool. Their contention timer p99
values are roughly 12–16 ms and ELU stays below 8%; filesystem delay and event-loop
blocking are distinct measurements. The probe's nominal 10 ms timers already fire
around 16 ms on this host, and idle timer-delay p99 is 6.42 ms. Do not compare these
absolute values to Fedora as if timer scheduling were identical.

Serial synchronous SHA/AES bursts occupy the main loop (ELU 100%) and delay timers;
workers reduce those stalls. Tiny PJS SHA and AES still consume high main-loop ELU
from orchestration, despite poor throughput. Event-loop histograms may miss the
initial synchronous burst; drained timer samples are necessary. Deep concurrency
worsens end-to-end latency, not just the unavailable exact queue percentiles.

## Argon2 workers × lanes and nested parallelism

Identical Argon2id parameters within each comparison: 64 MiB memory, three passes,
32-byte output, synthetic nonce/message, concurrency four.

| Model / workers | Lanes 1 ops/s | Lanes 4 ops/s | Timer p99, lanes 1/4 ms | Whole-process sampled threads, lanes 1/4 min–max |
| --------------- | ------------: | ------------: | ----------------------- | ------------------------------------------------ |
| Native async    |         13.99 |         13.43 | 9.44 / 10.33            | 13–13 / 15–30                                    |
| PJS / 1         |          5.57 |          8.00 | 8.80 / 11.21            | 15–15 / 15–19                                    |
| PJS / 4         |         12.73 |         14.14 | 11.31 / 10.54           | 19–19 / 19–34                                    |

Against the responsive native baseline, four-worker PJS is about 9% slower at one
lane and about 5% faster at four lanes; it offers no dramatic throughput or timer
advantage here. These differences should not be conflated with Fedora's affected
native baseline. Native throughput CV is 7.7%/6.7% and PJS four-worker CV is
2.6%/6.9% for lanes one/four; the small ordering is not strong evidence for a wrapper.

The separate read-only observer sampled whole-process `Get-Process Threads.Count`
every 250 ms around the prepared campaign. Cell samples include startup, warmups,
retained trials, validation and inter-cell teardown; peaks are not exact per-trial
thread maxima, and the observer itself has scheduling cost. The main harness's
Linux-only thread counts remain null on Windows. More lanes visibly add threads.
One worker benefits from multiple lanes in median throughput, but that cell's
24.4% CV limits precision. Four workers × four lanes also shows a modest median
gain here, and no worse timer tail: Fedora's specific no-gain/worse-tail
oversubscription pattern does not reproduce. CPU rises from 318% to 412%.
Thread pressure reproduces; a universal performance penalty does not.

## Bcrypt, AES-GCM and raw workers

Bcrypt 6.0.0's benchmark-local Windows native package loaded successfully with
install scripts disabled. The focused supplement uses existing cost-10 cells and
synthetic fixtures. At concurrency 1/4/16/32, native rates are
16.12/55.08/55.53/55.76 ops/s; PJS rates are 15.99/50.66/52.64/55.40 ops/s.
Saturated throughput is close, with no compelling PJS advantage. Variability and
latency are included in the measurements appendix; neither path establishes a
reason for a separate crypto package.

The existing AES-256-GCM clone pipeline still loses: at 1 KiB, serial/PJS are
17,001/6,168 ops/s; at 1 MiB, 641/380 ops/s. Full ciphertext and authentication-tag
return and result validation remain included. No shared/transfer AES path or special
output handling was added. Larger AES cells were not repeated.

Persistent raw workers use the same task body and parameters. At 1 MiB shared SHA,
raw/PJS are 1,107/1,183 ops/s: the strict Fedora ordering reverses slightly, within
the variability of sequential cells. At 8 MiB, raw/PJS are 140.69/134.28 ops/s,
roughly a 4.6% PJS deficit; at scrypt concurrency 16, 64.28/68.45 ops/s is close in
shape. Coarse crypto largely amortizes orchestration, while tiny raw shared SHA
still exceeds PJS (29,538 versus 17,605 ops/s). This is a control, not a worker-pool
competition or a precise portable overhead tax.

## Reproduction answers and final decision

| Question                                   | Windows answer                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1. Tiny SHA still loses badly?             | Yes, approximately 10–13× below serial.                                                   |
| 2. Coarse SHA benefits?                    | Yes, roughly 1.9–2.7× serial in tested coarse cells.                                      |
| 3. Shared/transfer materially help?        | Yes, roughly 29–36% above clone at coarse sizes.                                          |
| 4. Native scrypt matches PJS throughput?   | Broadly, with four-worker pure rates close; contention ordering varies.                   |
| 5. PJS isolates FS from scrypt contention? | Yes, healthy millisecond FS tails versus native tens/hundreds of milliseconds or seconds. |
| 6. Deep concurrency mostly worsens tails?  | Yes; concurrency 64 raises SHA/scrypt tails without throughput improvement.               |
| 7. Same Argon2 submission issue?           | No; baseline appears fixed in the standalone probe.                                       |
| 8. PJS versus fixed native Argon2?         | Comparable; no large PJS advantage.                                                       |
| 9. Nested Argon2 oversubscription?         | More threads/CPU, but Fedora's throughput/timer penalty is not established here.          |
| 10. AES clone still loses?                 | Yes, at both reproduced sizes.                                                            |
| 11. Raw-worker/PJS overhead shape similar? | Tiny overhead and coarse amortization reproduce; precise ordering differs.                |
| 12. New runtime limitation?                | None exposed; correctness, ownership and lifecycle checks passed.                         |

What reproduced from Fedora: selective usefulness, coarse ownership benefits,
scrypt's strong filesystem isolation, comparable saturated four-worker scrypt
throughput, deeper queues worsening tails, AES clone loss, and increased thread
pressure from Argon2 lanes. What differed: prompt native Argon2 submission and
loss of its dramatic PJS advantage, earlier observed clone-SHA crossover, modest
four-worker/four-lane Argon2 benefit without a worse timer tail, eight-worker scrypt
throughput benefit at a responsiveness/resource cost, and small raw/PJS ordering
reversals. These are platform/version/workload caveats, not correctness failures.

The main campaign's maximum sampled process RSS was about 1,243 MiB, including
allocator retention across sequential cells. Process-wide RSS is not a leak test;
main-isolate heap/external memory does not describe all workers. No unexpected
resource leak or major lifecycle problem was observed. Every campaign's overload
check accepted three of sixteen offers and rejected thirteen with `PjsQueueFullError`.
The existing bounded APIs suffice for these reproductions. No genuinely new
runtime pain point warrants duplicating or expanding the historical pain log.

**Final v0.13 decision: Outcome B with platform caveats.** Close the Windows
reproduction and postpone `@pjs/crypto`: throughput alone does not justify it, and
no repeated cross-platform ergonomic need was exposed. Do not reopen research or
change runtime semantics on these results. No compression/decompression work or
v0.14 implementation was started.

## Commands and files

On Windows, `npm.cmd` invokes the existing npm command because local PowerShell
policy blocks the `.ps1` shim. No execution-policy change is needed.

```powershell
node benchmarks/real-world/crypto/argon2-probe.mjs benchmarks/results/crypto-v0.13-windows-native-submission-probe.json
node scripts/crypto-windows-observe.mjs benchmarks/results/crypto-v0.13-windows-process-threads.json
# The observer invokes this exact prepared harness command:
# node benchmarks/real-world/crypto/run.mjs --profile=reproduce --output=benchmarks/results/crypto-v0.13-windows-node24-reproduce.json
node benchmarks/real-world/crypto/run.mjs --profile=full --filter=-c64- --output=benchmarks/results/crypto-v0.13-windows-deep-concurrency.json
node benchmarks/real-world/crypto/run.mjs --profile=full --filter=bcrypt- --output=benchmarks/results/crypto-v0.13-windows-bcrypt.json
node benchmarks/real-world/crypto/report.mjs benchmarks/results/crypto-v0.13-windows-node24-reproduce.json new-measurements.md
```

Use new filenames: raw campaigns, the probe and thread observer refuse overwrite.
The observer accepts an optional second filename for a new campaign output when
repeating the run; its default is the Windows reproduction filename above.
The existing reporter validates completed campaigns before producing tables; the
appendix combines its three separately generated reports without modifying JSON.

- [Reduced reproduction](../benchmarks/results/crypto-v0.13-windows-node24-reproduce.json)
- [Native submission probe](../benchmarks/results/crypto-v0.13-windows-native-submission-probe.json)
- [Read-only process thread observations](../benchmarks/results/crypto-v0.13-windows-process-threads.json)
- [Concurrency-64 supplement](../benchmarks/results/crypto-v0.13-windows-deep-concurrency.json)
- [Bcrypt supplement](../benchmarks/results/crypto-v0.13-windows-bcrypt.json)
- [Validation and preservation hashes](../benchmarks/results/validation-v0.13-windows.json)
- [Detailed generated measurements](research/v0.13-windows-measurements.md)
- [Windows thread observer](../scripts/crypto-windows-observe.mjs)

Historical Fedora evidence remains linked from its original report. The Windows
commit contains only these new evidence/report/tooling files; runtime sources,
dependency manifests and Fedora research files remain unchanged.
