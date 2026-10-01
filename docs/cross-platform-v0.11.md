# PJS v0.11 cross-platform validation

Generated from original machine JSON on 2026-10-01T11:00:38.908Z.

## VALIDATION SUMMARY

**READY WITH CAVEATS.** The tested environments preserve correctness and runtime-owned cleanup. A fresh second-OS campaign is missing, so AMD/Intel and Linux/Windows reproduction is not established. Laptop performance was measured on battery; an AC repeat remains a performance-quality caveat.

## SOURCE COMMIT

`716e86d48987ae838c421ff22ade2b7a469e8242` (v0.11.0). Each run extracts this commit with `git archive`; checks and measurements use the archive, never a later working tree. Source file hashes and the lockfile SHA-256 accompany every artifact. Runtime source and public APIs are unchanged. The construction invariant is documented in ADR 0018.

| Environment                  | Lockfile SHA-256                                                   | Source verification                                                                  |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| fedora-ryzen3300u / v22.23.3 | `1e447b3528ce00a47ff01515f74832d06bd6511aa69c2d6db8d3abdc0a2ff073` | All source/lockfile hashes unchanged; soak output changed only in disposable archive |
| fedora-ryzen3300u / v24.21.0 | `1e447b3528ce00a47ff01515f74832d06bd6511aa69c2d6db8d3abdc0a2ff073` | All source/lockfile hashes unchanged; soak output changed only in disposable archive |

## MACHINE MATRIX

| Machine                      | OS / kernel                   | CPU                                             | Architecture | Logical / available CPUs | RAM GiB |
| ---------------------------- | ----------------------------- | ----------------------------------------------- | ------------ | ------------------------ | ------- |
| fedora-ryzen3300u / v22.23.3 | Linux 6.19.10-300.fc44.x86_64 | AMD Ryzen 3 PRO 3300U w/ Radeon Vega Mobile Gfx | x64          | 4 / 4                    | 7.19    |
| fedora-ryzen3300u / v24.21.0 | Linux 6.19.10-300.fc44.x86_64 | AMD Ryzen 3 PRO 3300U w/ Radeon Vega Mobile Gfx | x64          | 4 / 4                    | 7.19    |

## NODE VERSION MATRIX

| Physical environment                      | Node 22    | Node 24    |
| ----------------------------------------- | ---------- | ---------- |
| Fedora / AMD (actual metadata below)      | v22.23.3   | v24.21.0   |
| Windows / Intel (expected until captured) | not tested | not tested |

| Environment                  | V8                  | npm     | Node executable                                      |
| ---------------------------- | ------------------- | ------- | ---------------------------------------------------- |
| fedora-ryzen3300u / v22.23.3 | 12.4.254.21-node.57 | 10.9.9  | `/home/miskovy/.nvm/versions/node/v22.23.3/bin/node` |
| fedora-ryzen3300u / v24.21.0 | 13.6.233.17-node.53 | 11.19.0 | `/home/miskovy/.nvm/versions/node/v24.21.0/bin/node` |

## FEDORA MACHINE DETAILS

Detected OS release:

```text
NAME="Fedora Linux"
VERSION="44 (KDE Plasma Desktop Edition)"
RELEASE_TYPE=stable
ID=fedora
VERSION_ID=44
VERSION_CODENAME=""
PRETTY_NAME="Fedora Linux 44 (KDE Plasma Desktop Edition)"
ANSI_COLOR="0;38;2;60;110;180"
LOGO=fedora-logo-icon
CPE_NAME="cpe:/o:fedoraproject:fedora:44"
DEFAULT_HOSTNAME="fedora"
HOME_URL="https://fedoraproject.org/"
DOCUMENTATION_URL="https://docs.fedoraproject.org/en-US/fedora/f44/"
SUPPORT_URL="https://ask.fedoraproject.org/"
BUG_REPORT_URL="https://bugzilla.redhat.com/"
REDHAT_BUGZILLA_PRODUCT="Fedora"
REDHAT_BUGZILLA_PRODUCT_VERSION=44
REDHAT_SUPPORT_PRODUCT="Fedora"
REDHAT_SUPPORT_PRODUCT_VERSION=44
SUPPORT_END=2027-05-19
VARIANT="KDE Plasma Desktop Edition"
VARIANT_ID=kde
```

Initial power: battery; battery: 73% Discharging; power profile: unavailable; governor: schedutil. No power configuration was changed. Topology and frequency limits are retained in metadata.

## WINDOWS MACHINE DETAILS

Unavailable in this session. The earlier `runtime-architecture-v0.11.json` reports Windows/i3-10100F results from a v0.11 working tree based on another commit. It is historical context, not a tested cell at this campaign’s exact reference. No new Windows artifact was fabricated.

## CORRECTNESS RESULTS

| Environment                  | Normal tests | Pass / fail | Test duration s | Build / type tests / compat / lint / format |
| ---------------------------- | ------------ | ----------- | --------------- | ------------------------------------------- |
| fedora-ryzen3300u / v22.23.3 | 159          | 159 / 0     | 15.51           | all pass                                    |
| fedora-ryzen3300u / v24.21.0 | 159          | 159 / 0     | 12.60           | all pass                                    |

The full suite covers error classes, timeout/cancellation timing, abandonment, crash replacement, batch correlation, binary validation, transfer ownership, AsyncLocalStorage, and draining/non-draining shutdown. Passing suites establish the covered behavior; they do not prove all possible schedules. `git diff --check` and source hashes verify preservation. Dependency installs use `npm ci` with the lockfile.

## INVARIANT RESULTS

| Environment                  | Tests | Pass / fail | Duration s |
| ---------------------------- | ----- | ----------- | ---------- |
| fedora-ryzen3300u / v22.23.3 | 159   | 159 / 0     | 14.65      |
| fedora-ryzen3300u / v24.21.0 | 159   | 159 / 0     | 12.55      |

Full suites ran with `PJS_DEBUG_RESERVATION_INVARIANTS=1`.

## STRESS RESULTS

| Environment                  | Fresh rounds passed / target | Test executions | Intermittent failures | Wall duration s |
| ---------------------------- | ---------------------------- | --------------- | --------------------- | --------------- |
| fedora-ryzen3300u / v22.23.3 | 10 / 10                      | 1590            | 0                     | 144.68          |
| fedora-ryzen3300u / v24.21.0 | 10 / 10                      | 1590            | 0                     | 130.06          |

The existing stress script stops at its first failing round. Failed output is retained; no failed round is silently retried.

## SOAK RESULTS

| Environment                  | Duration s | Completed scenario iterations | Verified completed streams (minimum) | Cancel / timeout / crash scenarios | Failures / replacements | Terminal tasks / operations / reservations / correlations / bytes |
| ---------------------------- | ---------- | ----------------------------- | ------------------------------------ | ---------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| fedora-ryzen3300u / v22.23.3 | 30.12      | 623                           | 125                                  | 104 / 104 / 104                    | 104 / 104               | 0 / 0 / 0 / 0 / 0                                                 |
| fedora-ryzen3300u / v24.21.0 | 30.05      | 646                           | 129                                  | 108 / 108 / 108                    | 108 / 108               | 0 / 0 / 0 / 0 / 0                                                 |

Iterations are completed scenarios, not a count of every child task or parent operation. Verified completed streams count successful stream scenarios plus asserted graceful shutdown streams; the unmodified soak does not emit cumulative operations.completed across all runtimes, so this is a lower bound. Crash counters above include main-runtime worker failures; shutdown scenarios construct additional runtimes and are separately counted in raw scenario data. The soak validates quiescence repeatedly and stopped-state ownership at termination.

## WORKER SCALING

Counts are filtered by detected `availableParallelism()`: 1/2/4 on this four-CPU laptop, and 1/2/4/8 where eight CPUs are available. The worker sweep runs fixed prime-search inputs; feature relationships use four workers. Architecture regressions reuse their established four-worker definition. Machines with fewer than four CPUs skip that definition rather than silently alter it.

## CPU-BOUND SCALING

Existing prime-search benchmark over `[0, 5,000,000)`, fixed 32 chunks, independent sieve validation, two warmups and five retained samples per process. Two fresh processes per Node/count in a two-Node campaign. Speedup uses the same Node’s **one-worker** median, not a serial or different-machine baseline. CPU 100% means one logical CPU.

### fedora-ryzen3300u / v22.23.3

| Workers | Wall ms  | Speedup T1/Tp | Efficiency | CPU % | Sample CV % |
| ------- | -------- | ------------- | ---------- | ----- | ----------- |
| 1       | 2763.076 | 1.000         | 1.000      | 103.1 | 0.5         |
| 2       | 1432.695 | 1.929         | 0.964      | 195.9 | 41.3        |
| 4       | 980.503  | 2.818         | 0.705      | 283.9 | 36.6        |

### fedora-ryzen3300u / v24.21.0

| Workers | Wall ms  | Speedup T1/Tp | Efficiency | CPU % | Sample CV % |
| ------- | -------- | ------------- | ---------- | ----- | ----------- |
| 1       | 2820.897 | 1.000         | 1.000      | 101.1 | 13.7        |
| 2       | 1429.130 | 1.974         | 0.987      | 195.9 | 2.2         |
| 4       | 945.733  | 2.983         | 0.746      | 294.9 | 13.8        |

## CLONE RESULTS

| Environment                  | Case            | Median ms | Min–max ms    | Samples | CV % |
| ---------------------------- | --------------- | --------- | ------------- | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | run-clone-input | 25.540    | 17.544–33.766 | 12      | 17.0 |
| fedora-ryzen3300u / v24.21.0 | run-clone-input | 21.449    | 17.309–29.581 | 12      | 17.8 |

## TRANSFER RESULTS

| Environment                  | Case               | Median ms | Min–max ms   | Samples | CV % |
| ---------------------------- | ------------------ | --------- | ------------ | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | run-transfer-input | 10.714    | 8.879–15.384 | 12      | 17.3 |
| fedora-ryzen3300u / v24.21.0 | run-transfer-input | 10.729    | 9.255–13.950 | 12      | 12.9 |

The input round-trip sweep reuses the established one-worker clone/transfer test (1 KiB, 1 MiB, 8 MiB plus scalar control); allocation and full-byte validation are outside timing in both modes. Input ownership/detachment is asserted. These round trips differ from worker-generated binary streams below.

### fedora-ryzen3300u / v22.23.3 — input round trips

| Payload | Clone ms | Transfer ms | Transfer / clone |
| ------- | -------- | ----------- | ---------------- |
| 1024    | 0.211    | 0.281       | 1.332            |
| 1048576 | 3.452    | 0.690       | 0.200            |
| 8388608 | 16.845   | 0.699       | 0.041            |

### fedora-ryzen3300u / v24.21.0 — input round trips

| Payload | Clone ms | Transfer ms | Transfer / clone |
| ------- | -------- | ----------- | ---------------- |
| 1024    | 0.188    | 0.230       | 1.220            |
| 1048576 | 3.297    | 0.695       | 0.211            |
| 8388608 | 10.402   | 0.679       | 0.065            |

## SHARED-MEMORY RESULTS

| Environment                  | Case             | Median ms | Min–max ms   | Samples | CV % |
| ---------------------------- | ---------------- | --------- | ------------ | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | run-shared-input | 5.928     | 4.695–10.614 | 12      | 29.1 |
| fedora-ryzen3300u / v24.21.0 | run-shared-input | 6.171     | 5.270–8.830  | 12      | 16.1 |

Shared input avoids per-task source cloning. The numeric shared-output comparison in MAP RESULTS uses `parallelFor` to write disjoint output spans. It measures the numeric path, not arbitrary object output.

## PARTITION RESULTS

| Environment                  | Case            | Median ms | Min–max ms     | Samples | CV % |
| ---------------------------- | --------------- | --------- | -------------- | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | partition-range | 47.090    | 25.587–189.354 | 12      | 76.5 |
| fedora-ryzen3300u / v24.21.0 | partition-range | 46.201    | 27.653–234.981 | 12      | 88.8 |

Established tiny no-op versus fixed-width increasing-cost skew controls, identical inputs across runtimes, with supported batches 1/8/16. Large skew batches can reduce dispatch overhead while limiting load balance. Any initial unsupported batch attempts are retained in raw evidence and explained below; explicit supplements provide their corrected controls.

| Environment                  | Kind        | Batch 1 ms | Batch 8 ms | Batch 16 ms | B8 vs B1 | B16 vs B1 |
| ---------------------------- | ----------- | ---------- | ---------- | ----------- | -------- | --------- |
| fedora-ryzen3300u / v22.23.3 | noop        | 109.340    | 54.996     | 40.460      | -49.7%   | -63.0%    |
| fedora-ryzen3300u / v22.23.3 | stable-skew | 189.008    | 135.880    | 119.471     | -28.1%   | -36.8%    |
| fedora-ryzen3300u / v24.21.0 | noop        | 154.818    | 66.761     | 55.932      | -56.9%   | -63.9%    |
| fedora-ryzen3300u / v24.21.0 | stable-skew | 213.218    | 142.154    | 136.692     | -33.3%   | -35.9%    |

| Environment                  | Coarse skew batch 1 ms | Batch 16 ms | Batch 16 / 1 |
| ---------------------------- | ---------------------- | ----------- | ------------ |
| fedora-ryzen3300u / v22.23.3 | 140.550                | 195.068     | 1.388        |
| fedora-ryzen3300u / v24.21.0 | 174.129                | 555.923     | 3.193        |

Coarse skew keeps the same 2,048-item kernel but uses 16 logical partitions. Batch 16 puts all partitions in one physical dispatch and limits worker utilization. This is a load-balance control, not tuning per Node or OS.

## PARALLELFOR RESULTS

| Environment                  | Case         | Median ms | Min–max ms    | Samples | CV % |
| ---------------------------- | ------------ | --------- | ------------- | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | parallel-for | 31.468    | 25.009–46.488 | 12      | 21.8 |
| fedora-ryzen3300u / v24.21.0 | parallel-for | 56.825    | 28.193–85.912 | 12      | 32.5 |

## STREAM RESULTS

| Environment                  | Case              | Median ms | Min–max ms     | Samples | CV % |
| ---------------------------- | ----------------- | --------- | -------------- | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | stream-count-only | 60.512    | 55.297–111.680 | 12      | 25.9 |
| fedora-ryzen3300u / v24.21.0 | stream-count-only | 78.494    | 73.941–83.800  | 12      | 4.1  |

| Environment                  | Case                | Median ms | Min–max ms    | Samples | CV % |
| ---------------------------- | ------------------- | --------- | ------------- | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | stream-strict-clone | 24.098    | 20.232–35.279 | 12      | 18.4 |
| fedora-ryzen3300u / v24.21.0 | stream-strict-clone | 20.913    | 18.637–24.908 | 12      | 9.4  |

| Environment                  | Case                   | Median ms | Min–max ms   | Samples | CV % |
| ---------------------------- | ---------------------- | --------- | ------------ | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | stream-strict-transfer | 10.276    | 8.198–16.048 | 12      | 18.8 |
| fedora-ryzen3300u / v24.21.0 | stream-strict-transfer | 9.849     | 8.425–13.468 | 12      | 14.4 |

| Environment                  | CPU stream capacity 1 ms | Capacity 8 ms | Capacity 1 / 8 |
| ---------------------------- | ------------------------ | ------------- | -------------- |
| fedora-ryzen3300u / v22.23.3 | 400.009                  | 132.405       | 3.021          |
| fedora-ryzen3300u / v24.21.0 | 377.367                  | 128.250       | 2.942          |

## STRICT RESERVATION RESULTS

Worker-generated binary result sweep: 1 KiB/64 KiB/1 MiB/8 MiB, clone, count-only transfer, fixed exact transfer, and callback exact transfer. Batch size 1 and count capacity 16 are identical across modes; strict capacity is exactly 16 payloads. Existing reservation-audit task, profiling disabled. Byte lengths, boundary content, delivery counts and zero terminal ownership are asserted. Reported milliseconds are per full stream; sustained samples repeat the full stream. Sample variance is in ms² and CV uses sample standard deviation / mean. The two process medians expose between-process variation; twelve samples are not twelve independent machine sessions.

### fedora-ryzen3300u / v22.23.3

| Bytes   | Mode            | Median ms | vs count transfer | Min–max ms      | Variance ms² | CV % | Process medians ms | Sustained windows min–max ms |
| ------- | --------------- | --------- | ----------------- | --------------- | ------------ | ---- | ------------------ | ---------------------------- |
| 1024    | clone           | 130.179   | -5.3%             | 128.718–175.152 | 232.257      | 11.0 | 130.179, 132.015   | 515–701                      |
| 1024    | transfer        | 137.428   | 0.0%              | 124.069–321.863 | 3017.285     | 35.2 | 135.778, 141.044   | 496–1287                     |
| 1024    | strict-fixed    | 146.056   | 6.3%              | 137.882–209.112 | 465.578      | 13.7 | 149.498, 146.056   | 552–836                      |
| 1024    | strict-callback | 155.593   | 13.2%             | 135.934–229.869 | 897.152      | 18.2 | 146.061, 169.382   | 544–919                      |
| 65536   | clone           | 52.554    | 46.6%             | 50.931–68.596   | 38.673       | 11.1 | 52.176, 52.917     | 815–1098                     |
| 65536   | transfer        | 35.846    | 0.0%              | 33.632–67.536   | 118.226      | 26.3 | 35.744, 36.253     | 538–1081                     |
| 65536   | strict-fixed    | 39.312    | 9.7%              | 37.921–70.551   | 131.768      | 25.2 | 39.222, 39.635     | 607–1129                     |
| 65536   | strict-callback | 38.817    | 8.3%              | 37.876–73.962   | 165.150      | 27.9 | 39.078, 38.817     | 606–1183                     |
| 1048576 | clone           | 82.968    | 137.4%            | 80.185–87.269   | 5.285        | 2.7  | 84.208, 82.544     | 641–698                      |
| 1048576 | transfer        | 34.956    | 0.0%              | 30.946–38.805   | 5.882        | 7.0  | 35.881, 33.570     | 248–310                      |
| 1048576 | strict-fixed    | 45.399    | 29.9%             | 33.206–69.100   | 125.942      | 24.2 | 55.231, 36.318     | 266–553                      |
| 1048576 | strict-callback | 37.534    | 7.4%              | 32.029–42.380   | 14.028       | 10.1 | 40.316, 34.939     | 256–339                      |
| 8388608 | clone           | 108.930   | 192.3%            | 102.435–122.440 | 55.547       | 6.7  | 110.848, 107.935   | 410–490                      |
| 8388608 | transfer        | 37.269    | 0.0%              | 32.640–45.080   | 18.667       | 11.4 | 36.840, 37.817     | 131–180                      |
| 8388608 | strict-fixed    | 34.979    | -6.1%             | 31.263–41.287   | 12.281       | 9.9  | 32.107, 35.911     | 125–165                      |
| 8388608 | strict-callback | 45.903    | 23.2%             | 33.328–67.638   | 111.987      | 22.6 | 51.920, 37.724     | 133–271                      |

### fedora-ryzen3300u / v24.21.0

| Bytes   | Mode            | Median ms | vs count transfer | Min–max ms      | Variance ms² | CV % | Process medians ms | Sustained windows min–max ms |
| ------- | --------------- | --------- | ----------------- | --------------- | ------------ | ---- | ------------------ | ---------------------------- |
| 1024    | clone           | 168.357   | -5.0%             | 160.776–214.561 | 305.763      | 9.9  | 171.583, 168.357   | 643–858                      |
| 1024    | transfer        | 177.258   | 0.0%              | 164.915–217.994 | 336.244      | 10.1 | 177.258, 177.495   | 660–872                      |
| 1024    | strict-fixed    | 188.074   | 6.1%              | 180.368–243.850 | 401.430      | 10.1 | 192.009, 187.302   | 721–975                      |
| 1024    | strict-callback | 190.768   | 7.6%              | 175.946–227.090 | 255.248      | 8.2  | 187.622, 193.124   | 704–908                      |
| 65536   | clone           | 60.982    | 29.6%             | 53.706–84.412   | 119.295      | 17.0 | 55.836, 63.958     | 859–1351                     |
| 65536   | transfer        | 47.070    | 0.0%              | 43.391–74.463   | 83.078       | 17.9 | 46.382, 48.583     | 694–1191                     |
| 65536   | strict-fixed    | 50.743    | 7.8%              | 48.052–70.807   | 50.094       | 13.3 | 50.463, 50.794     | 769–1133                     |
| 65536   | strict-callback | 50.136    | 6.5%              | 46.699–64.887   | 36.881       | 11.7 | 49.519, 50.572     | 747–1038                     |
| 1048576 | clone           | 93.419    | 186.0%            | 78.537–129.469  | 214.057      | 15.7 | 80.068, 99.292     | 628–1036                     |
| 1048576 | transfer        | 32.659    | 0.0%              | 29.811–39.910   | 12.295       | 10.4 | 31.374, 36.652     | 238–319                      |
| 1048576 | strict-fixed    | 32.146    | -1.6%             | 29.545–43.263   | 15.877       | 11.9 | 32.373, 32.106     | 236–346                      |
| 1048576 | strict-callback | 35.799    | 9.6%              | 30.168–47.195   | 25.108       | 13.6 | 38.586, 34.371     | 241–378                      |
| 8388608 | clone           | 108.254   | 200.4%            | 96.245–134.682  | 103.671      | 9.3  | 113.059, 102.399   | 385–539                      |
| 8388608 | transfer        | 36.036    | 0.0%              | 31.333–41.110   | 8.879        | 8.3  | 36.001, 36.667     | 125–164                      |
| 8388608 | strict-fixed    | 37.081    | 2.9%              | 31.583–43.758   | 8.284        | 7.8  | 37.081, 37.379     | 126–175                      |
| 8388608 | strict-callback | 35.432    | -1.7%             | 30.372–47.122   | 23.665       | 13.2 | 40.312, 33.729     | 121–188                      |

Interpret the small strict-reservation differences against the retained variance and process medians. No universal transfer crossover or portable fixed overhead is inferred from two CPUs or one session. Longer windows reduce timer noise but do not eliminate GC, frequency and background-load effects.

fedora-ryzen3300u / v22.23.3: at 64 KiB, fixed exact median is 9.7% above count-only transfer; callback exact is 8.3%. Fixed-exact deltas change magnitude or sign at larger payloads; a consistent portable overhead is not established.

fedora-ryzen3300u / v24.21.0: at 64 KiB, fixed exact median is 7.8% above count-only transfer; callback exact is 6.5%. Fixed-exact deltas change magnitude or sign at larger payloads; a consistent portable overhead is not established.

## MAP RESULTS

| Environment                  | Case        | Median ms | Min–max ms   | Samples | CV % |
| ---------------------------- | ----------- | --------- | ------------ | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | map-generic | 8.063     | 6.859–12.346 | 12      | 22.1 |
| fedora-ryzen3300u / v24.21.0 | map-generic | 8.430     | 6.401–12.426 | 12      | 19.6 |

| Environment                  | Case      | Median ms | Min–max ms   | Samples | CV % |
| ---------------------------- | --------- | --------- | ------------ | ------- | ---- |
| fedora-ryzen3300u / v22.23.3 | map-typed | 8.149     | 7.268–15.686 | 12      | 28.2 |
| fedora-ryzen3300u / v24.21.0 | map-typed | 9.384     | 6.859–15.646 | 12      | 25.5 |

The architecture map cases use only 1,024 elements and do not test the cheap-object performance claim. The larger existing mapping workload uses 262,144 elements, grain 4,096, zero extra iterations, batch 4 and equivalent numeric transformation. Object mapping additionally returns index/category fields; this is a representation/workload relationship, not a pure output-constructor comparison. Numeric array, typed clone, typed transfer and shared output controls are also retained.

| Environment                  | Objects ms | Numeric array ms | Typed clone ms | Typed transfer ms | Shared parallelFor ms | Objects / typed clone |
| ---------------------------- | ---------- | ---------------- | -------------- | ----------------- | --------------------- | --------------------- |
| fedora-ryzen3300u / v22.23.3 | 305.942    | 44.576           | 11.087         | 8.935             | 7.053                 | 27.594                |
| fedora-ryzen3300u / v24.21.0 | 323.193    | 34.138           | 12.753         | 11.146            | 7.735                 | 25.342                |

## NODE 22 VS NODE 24

Same machine, source, four workers, inputs and per-case process ordering: 22 → 24 → 24 → 22. Cases are isolated in fresh Node processes. Positive delta means Node 24 was slower. These are contemporaneous runtime comparisons, not v0.10→v0.11 architectural deltas.

| Case                   | Node 22 ms | Node 24 ms | 24 vs 22 | CV 22 / 24 % |
| ---------------------- | ---------- | ---------- | -------- | ------------ |
| run-noop               | 37.216     | 42.469     | 14.1%    | 13.0 / 13.8  |
| run-medium-cpu         | 27.914     | 19.369     | -30.6%   | 151.2 / 22.1 |
| run-clone-input        | 25.540     | 21.449     | -16.0%   | 17.0 / 17.8  |
| run-transfer-input     | 10.714     | 10.729     | 0.1%     | 17.3 / 12.9  |
| run-shared-input       | 5.928      | 6.171      | 4.1%     | 29.1 / 16.1  |
| partition-range        | 47.090     | 46.201     | -1.9%    | 76.5 / 88.8  |
| parallel-for           | 31.468     | 56.825     | 80.6%    | 21.8 / 32.5  |
| stream-count-only      | 60.512     | 78.494     | 29.7%    | 25.9 / 4.1   |
| stream-strict-clone    | 24.098     | 20.913     | -13.2%   | 18.4 / 9.4   |
| stream-strict-transfer | 10.276     | 9.849      | -4.2%    | 18.8 / 14.4  |
| map-generic            | 8.063      | 8.430      | 4.5%     | 22.1 / 19.6  |
| map-typed              | 8.149      | 9.384      | 15.2%    | 28.2 / 25.5  |

fedora-ryzen3300u: Node 24 vs 22 parallelFor median 80.6%; count-only stream 29.7%. These are performance observations, not accepted architectural regression measurements. Assess them against the retained variance and operating conditions; material differences need another controlled interleaved session before causal attribution to Node/V8.

## WINDOWS VS LINUX BEHAVIOR

Fresh Windows behavior has not been tested here. Linux correctness and Node-version consistency are established only for the covered tests. AMD+Intel reproduction, Windows/Linux timer sensitivity and OS-specific lifecycle differences remain open.

## EVENT LOOP RESULTS

| Environment                  | Case                              | ELU median | Mean delay ms (median) | Max observed delay ms |
| ---------------------------- | --------------------------------- | ---------- | ---------------------- | --------------------- |
| fedora-ryzen3300u / v22.23.3 | relationships/noop-batch-1        | 0.973      | 1.105                  | 18.153                |
| fedora-ryzen3300u / v22.23.3 | relationships/stable-skew-batch-1 | 0.799      | 1.069                  | 7.709                 |
| fedora-ryzen3300u / v22.23.3 | binary-65536/transfer             | 0.963      | 1.177                  | 22.053                |
| fedora-ryzen3300u / v22.23.3 | binary-65536/strict-fixed         | 0.954      | 1.149                  | 22.610                |
| fedora-ryzen3300u / v24.21.0 | relationships/noop-batch-1        | 0.990      | 1.098                  | 19.464                |
| fedora-ryzen3300u / v24.21.0 | relationships/stable-skew-batch-1 | 0.896      | 1.063                  | 10.027                |
| fedora-ryzen3300u / v24.21.0 | binary-65536/transfer             | 0.976      | 1.109                  | 32.358                |
| fedora-ryzen3300u / v24.21.0 | binary-65536/strict-fixed         | 0.976      | 1.100                  | 23.511                |

Existing responsiveness instrumentation is used for dispatch controls; sustained binary windows also record ELU, mean and max delay. Resolution is 1 ms. Short samples and OS timer granularity constrain interpretation; low-millisecond Windows/Linux differences are not aggressively compared.

## RESOURCE / MEMORY OBSERVATIONS

| Environment                  | Final quiescent RSS MiB | Peak sampled RSS MiB | heapUsed MiB | external MiB | arrayBuffers MiB |
| ---------------------------- | ----------------------- | -------------------- | ------------ | ------------ | ---------------- |
| fedora-ryzen3300u / v22.23.3 | 155.3                   | 155.3                | 11.0         | 6.3          | 2.4              |
| fedora-ryzen3300u / v24.21.0 | 205.6                   | 208.9                | 9.7          | 2.8          | 0.2              |

RSS is process/platform memory context, not proof of a reservation leak. Linux RSS and Windows process working-set accounting are not interchangeable. Heap/external/arrayBuffers describe the reporting isolate; worker isolates and allocator retention complicate attribution. Samples may miss short peaks. Correctness is the repeated return of PJS-owned tasks, operations, reservations, execution correlations and reserved bytes to zero.

## ARCHITECTURE / PUMP OBSERVATIONS

Covered hostile lifecycle schedules completed under normal, invariant, stress and soak runs without observed deadlocks, missed progress or recursive pump failure. This indirectly supports subsystem ownership/order and the guarded pump. It is not stack-depth instrumentation or exhaustive scheduling proof. ADR 0018 now states: **Subsystem constructors must not synchronously invoke operational callbacks during composition.** Workers start only after all coordinators/telemetry are assigned. Runtime construction was not redesigned.

## PLATFORM-SPECIFIC FAILURES

No PJS correctness, reservation or lifecycle failures in the tested cells. Windows was unavailable, not passing by assumption. Initial dependency download and host execution sandbox restrictions were resolved before the campaign; they are not PJS failures.

The first runner incorrectly requested batch 64. Minimal reproducer: call `partitionRange` with `experimentalDispatchBatchSize: 64`; v0.11 correctly throws `RangeError: experimentalDispatchBatchSize must be an integer between 1 and 16`. Causal explanation: the measurement configuration exceeded the public option’s accepted range. Both runtimes rejected it consistently before timing. All failed outputs remain in original JSON; corrected supported controls are separate supplemental evidence. Runtime code was not changed.

| Environment                  | Retained harness failure           | Exit |
| ---------------------------- | ---------------------------------- | ---- |
| fedora-ryzen3300u / v22.23.3 | relationships/noop-batch-64        | 1    |
| fedora-ryzen3300u / v22.23.3 | relationships/noop-batch-64        | 1    |
| fedora-ryzen3300u / v22.23.3 | relationships/stable-skew-batch-64 | 1    |
| fedora-ryzen3300u / v22.23.3 | relationships/stable-skew-batch-64 | 1    |
| fedora-ryzen3300u / v24.21.0 | relationships/noop-batch-64        | 1    |
| fedora-ryzen3300u / v24.21.0 | relationships/noop-batch-64        | 1    |
| fedora-ryzen3300u / v24.21.0 | relationships/stable-skew-batch-64 | 1    |
| fedora-ryzen3300u / v24.21.0 | relationships/stable-skew-batch-64 | 1    |

## VARIANCE / THERMAL NOTES

fedora-ryzen3300u / v22.23.3: observed power states battery; CPU Tctl range 38.3–57.3 °C; one-minute load range 1.00–10.81; battery range 57–68%.

fedora-ryzen3300u / v22.23.3 / architecture/run-medium-cpu: context wall-clock span 267.7 s versus monotonic process span 7.4 s. This is evidence of an uncontrolled clock/suspension discontinuity, not proof of its cause. The affected process and all samples are retained. No cooldown sleep was inserted.

fedora-ryzen3300u / v24.21.0: observed power states battery; CPU Tctl range 38.3–57.3 °C; one-minute load range 1.00–10.97; battery range 57–68%.

fedora-ryzen3300u / v24.21.0 / relationships/coarse-skew-batch-1: context wall-clock span 892.2 s versus monotonic process span 10.3 s. This is evidence of an uncontrolled clock/suspension discontinuity, not proof of its cause. The affected process and all samples are retained. No cooldown sleep was inserted.

Contexts include power, battery, governor/frequency, thermal readings, memory and uptime before/after every process. Linux `ps` percentages are lifetime averages, not instantaneous utilization; load averages include prior work. User applications were left running. Timings and process medians include all noise; no samples were removed. The Ryzen reports four cores with one thread/core, so SMT is not a demonstrated explanation on this machine. Frequency snapshots cannot prove or exclude transient throttling. Balanced ordering controls phase bias partially; it does not make battery/background conditions equivalent to an idle AC run.

## WHAT REPRODUCED

Normal correctness, reservation invariants, ten-round stress, hostile lifecycle soak and zero terminal ownership reproduce in every tested cell. Relative batching, mapping, streaming capacity and transfer results are quantified above per environment. Interpret performance reproduction using those ratios and their variance, not equal milliseconds.

fedora-ryzen3300u / v22.23.3: cheap-object mapping takes 27.6× typed numeric mapping; shared-output parallelFor takes 0.636× typed-map time; batching tiny no-ops at 8 takes 0.503× batch-1 time; CPU stream capacity 1 takes 3.02× capacity-8 time; coarse-skew batch 16 takes 1.39× batch-1 time. Ratios quantify which relationships reproduce in each cell; broad advantages are more robust than small percentage differences under this session's variance.

fedora-ryzen3300u / v24.21.0: cheap-object mapping takes 25.3× typed numeric mapping; shared-output parallelFor takes 0.606× typed-map time; batching tiny no-ops at 8 takes 0.431× batch-1 time; CPU stream capacity 1 takes 2.94× capacity-8 time; coarse-skew batch 16 takes 3.19× batch-1 time. Ratios quantify which relationships reproduce in each cell; broad advantages are more robust than small percentage differences under this session's variance.

fedora-ryzen3300u / v22.23.3: worker-generated binary transfer / clone is 1.056 at 1 KiB and 0.682 at 64 KiB. These sampled ratios bracket a crossover where they change from above to below one; exact crossover sizes and OS sensitivity remain unmeasured.

fedora-ryzen3300u / v24.21.0: worker-generated binary transfer / clone is 1.053 at 1 KiB and 0.772 at 64 KiB. These sampled ratios bracket a crossover where they change from above to below one; exact crossover sizes and OS sensitivity remain unmeasured.

## WHAT DID NOT REPRODUCE

A portable exact percentage for strict binary reservation overhead is not established by this design. Small differences can change sign within retained process/sample variation. Historical architectural regression percentages are not re-measured against v0.10 here. Missing Windows cells cannot be treated as reproduction failures or passes.

## OPEN GAPS

- Fresh exact-reference Windows/i3-10100F runs under the existing Node generations.
- Idle AC-powered laptop repeat for primary retained performance conclusions.
- A second independent session for small strict-reservation differences and any large/noisy Node deltas.
- Architectures beyond the actually captured x64 machines remain untested; AMD/Intel is a microarchitecture distinction, not x64-versus-ARM validation.

## V0.12 READINESS DECISION

**READY WITH CAVEATS**. The tested correctness and ownership evidence supports proceeding with caveats; complete the missing reproduction cells and control performance conditions before making platform-wide claims. Recommend v0.12 upper-bound binary reservation + refund research after accepting these gaps. This campaign stops at validation and does not implement v0.12.

## USER-FACING RUN WORKFLOW

Inspect versions and executable paths before running; select existing installations only. The runner never installs Node, changes profiles, changes governors, terminates applications or changes the default runtime. Git and tar must be available; npm dependencies require cache or registry access. Source snapshots are preserved in the printed temporary directory. Existing evidence filenames are refused; use a new `--output` directory for repeats.

Fedora (run in the repository; capture inspection output if desired):

```bash
node --version
npm --version
which node
which npm
for manager in nvm fnm volta asdf mise; do command -v "$manager"; done
git status
git rev-parse HEAD
git log -1 --oneline
node22_path="$(nvm which 22)"
node24_path="$(nvm which 24)"
node scripts/cross-platform-v011/run.mjs --node22 "$node22_path" --node24 "$node24_path" --label fedora-ryzen3300u
```

Windows (PowerShell):

```powershell
node --version
npm --version
where.exe node
where.exe npm
Get-Command nvm,fnm,volta,asdf,mise -ErrorAction SilentlyContinue
git status
git rev-parse HEAD
git log -1 --oneline
# Discover installed paths through the existing manager, e.g. nvm list / nvm root.
# Use the actual version-directory node.exe paths, not a mutable shared symlink.
$node22 = "<existing absolute Node 22 node.exe path>"
$node24 = "<existing absolute Node 24 node.exe path>"
node scripts/cross-platform-v011/run.mjs --node22 $node22 --node24 $node24 --label windows-i3-10100f
```

If only one generation exists, omit the unavailable flag; the runner uses the current supported generation unless an explicit executable is supplied. For a nonstandard npm layout, supply `--npm22`/`--npm24` with the matching existing `npm-cli.js`. Machine labels are descriptive filenames; hardware claims come from captured metadata, not labels.

Transfer original campaign JSON and matching metadata JSON without editing them. To aggregate after independent runs:

```bash
node scripts/cross-platform-v011/report.mjs benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.json benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.json benchmarks/results/cross-platform-v0.11-windows-i3-10100f-node22.json benchmarks/results/cross-platform-v0.11-windows-i3-10100f-node24.json
```

Pass only files that actually exist. Repository convention tracks reviewed JSON benchmark evidence, so new raw artifacts are retained in `benchmarks/results/`. No commit is created automatically.

For this Fedora session, also pass the two `node22.supplement.json` / `node24.supplement.json` files listed below; the aggregator combines only explicitly identified supplements and keeps original metadata/artifacts unchanged. To reproduce the initial harness error correction from its preserved temporary reference, use `scripts/cross-platform-v011/supplement.mjs` with the two completed main campaign files. New campaigns use valid batches and include coarse-skew controls directly.

## RAW ARTIFACTS

- [fedora-ryzen3300u v22.23.3 campaign](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.json)
- [Original metadata](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.metadata.json)

- [fedora-ryzen3300u v24.21.0 campaign](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.json)
- [Original metadata](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.metadata.json)

- [fedora-ryzen3300u v22.23.3 campaign](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.supplement.json)
- [Original metadata](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.supplement.metadata.json)

- [fedora-ryzen3300u v24.21.0 campaign](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.supplement.json)
- [Original metadata](../benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.supplement.metadata.json)
