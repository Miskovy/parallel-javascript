# PJS v0.12 cross-platform validation

Generated from original campaign JSON and companion metadata on 2026-10-02T12:15:05.410Z.

## VALIDATION SUMMARY

**READY WITH CAVEATS.** All included cells pass the pinned correctness and terminal-ownership gates. All four requested Fedora/AMD and Windows/Intel cells are complete.

Node 22 reduced is correctness coverage with a five-second soak; Node 24 full adds ten stress rounds, a 30-second soak, and the benchmark matrix. These unequal protocols do not support a Node 22-versus-24 performance comparison. The API remains experimental as described in [the implementation report](benchmarks-v0.12.md). This campaign does not begin v0.13.

## PINNED SOURCE AND PROVENANCE

Validated implementation: `18f0c87e7b7920179403bbc396afabced6bb06c4`. Each prepared runner extracts this exact commit with `git archive`; measurements use disposable reference directories rather than the current working tree. All input source manifests and lockfile hashes agree. Companion hashes bind metadata to the original campaign bytes. Raw JSON is neither edited nor reformatted.

| Environment                            | Controller commit                          | Lockfile SHA-256                                                   | Source unchanged |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ---------------- |
| fedora-ryzen3300u / v22.23.3 / reduced | `f5f461fa379451f41223f188c23d6f63f09f6e35` | `9197e42d8e3ccd4375b6ede97193408d76e5f5033ec64534cfc2abeabccf9cdd` | verified         |
| fedora-ryzen3300u / v24.21.0 / full    | `f5f461fa379451f41223f188c23d6f63f09f6e35` | `9197e42d8e3ccd4375b6ede97193408d76e5f5033ec64534cfc2abeabccf9cdd` | verified         |
| windows-i3-10100f / v22.23.3 / reduced | `d8c982ea98ae8dbc76c0bfab78a8200b3d7cda7d` | `9197e42d8e3ccd4375b6ede97193408d76e5f5033ec64534cfc2abeabccf9cdd` | verified         |
| windows-i3-10100f / v24.21.0 / full    | `d8c982ea98ae8dbc76c0bfab78a8200b3d7cda7d` | `9197e42d8e3ccd4375b6ede97193408d76e5f5033ec64534cfc2abeabccf9cdd` | verified         |

Nested machine helpers may report the controller commit or null inside an archive. The authoritative implementation identity is sourceCommit plus the archive/source hashes. Runtime/API semantics, prepared runner, and original Fedora artifacts remain unchanged.

## MACHINE AND NODE MATRIX

| Environment                            | OS / kernel                                                                  | CPU                                             | Architecture | Physical / logical / available CPUs | RAM GiB | npm     |
| -------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- | ------------ | ----------------------------------- | ------- | ------- |
| fedora-ryzen3300u / v22.23.3 / reduced | #1 SMP PREEMPT_DYNAMIC Wed Mar 25 18:23:49 UTC 2026; 6.19.10-300.fc44.x86_64 | AMD Ryzen 3 PRO 3300U w/ Radeon Vega Mobile Gfx | x64          | 4 / 4 / 4                           | 7.19    | 10.9.9  |
| fedora-ryzen3300u / v24.21.0 / full    | #1 SMP PREEMPT_DYNAMIC Wed Mar 25 18:23:49 UTC 2026; 6.19.10-300.fc44.x86_64 | AMD Ryzen 3 PRO 3300U w/ Radeon Vega Mobile Gfx | x64          | 4 / 4 / 4                           | 7.19    | 11.19.0 |
| windows-i3-10100f / v22.23.3 / reduced | Windows 10 Pro; 10.0.19045                                                   | Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz       | x64          | 4 / 8 / 8                           | 15.87   | 10.9.9  |
| windows-i3-10100f / v24.21.0 / full    | Windows 10 Pro; 10.0.19045                                                   | Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz       | x64          | 4 / 8 / 8                           | 15.87   | 11.19.0 |

## POWER AND OPERATING CONDITIONS

| Environment                            | Initial power value                                                | Observed sources | Observed plans / governors                                         | Samples |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------ | ------- |
| fedora-ryzen3300u / v22.23.3 / reduced | AC                                                                 | AC               | schedutil                                                          | 3       |
| fedora-ryzen3300u / v24.21.0 / full    | AC                                                                 | AC               | schedutil                                                          | 10      |
| windows-i3-10100f / v22.23.3 / reduced | Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e (Balanced) | unavailable      | Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e (Balanced) | 12      |
| windows-i3-10100f / v24.21.0 / full    | Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e (Balanced) | unavailable      | Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e (Balanced) | 13      |

The companion observer samples before/after each invocation and every 30 seconds, using the existing machine/context helper. Windows plan GUID/name is captured from powercfg and passed as PJS_POWER_MODE only within the campaign process. No default Node, persistent PATH, shell profile, governor, or power plan is changed. No applications are terminated. A desktop without a battery is not assumed to be on AC; its source may remain unavailable while the plan is known. Periodic samples do not prove continuous power/frequency/load conditions between samples.

## CORRECTNESS, INVARIANTS, STRESS AND SOAK

| Environment                            | Normal pass / fail | Invariant pass / fail | Build / types / compatibility / lint / format | Stress                        | Soak seconds / iterations |
| -------------------------------------- | ------------------ | --------------------- | --------------------------------------------- | ----------------------------- | ------------------------- |
| fedora-ryzen3300u / v22.23.3 / reduced | 178 / 0            | 178 / 0               | all pass                                      | not included in reduced mode  | 5.08 / 138                |
| fedora-ryzen3300u / v24.21.0 / full    | 178 / 0            | 178 / 0               | all pass                                      | 10 / 10; 1780 test executions | 30.13 / 952               |
| windows-i3-10100f / v22.23.3 / reduced | 178 / 0            | 178 / 0               | all pass                                      | not included in reduced mode  | 7.56 / 96                 |
| windows-i3-10100f / v24.21.0 / full    | 178 / 0            | 178 / 0               | all pass                                      | 10 / 10; 1780 test executions | 31.61 / 810               |

Both complete suites cover the pinned 178 tests, including preserved exact equality, upper-bound violations, zero-length binary values, transfer ownership, per-item batch reconciliation, cancellation/timeout, failure/crash, fairness, and shutdown. The invariant suite and full stress use PJS_DEBUG_RESERVATION_INVARIANTS=1. The original mixed soak includes exact and upper-bound lifecycle scenarios; failed commands are retained and never silently retried.

## TERMINAL OWNERSHIP

| Environment                            | Tasks / operations / reservations / executions / credit operations | Reserved / unreconciled / reconciled bytes | Worker failures / replacements |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------ |
| fedora-ryzen3300u / v22.23.3 / reduced | 0 / 0 / 0 / 0 / 0                                                  | 0 / 0 / 0                                  | 24 / 24                        |
| fedora-ryzen3300u / v24.21.0 / full    | 0 / 0 / 0 / 0 / 0                                                  | 0 / 0 / 0                                  | 166 / 166                      |
| windows-i3-10100f / v22.23.3 / reduced | 0 / 0 / 0 / 0 / 0                                                  | 0 / 0 / 0                                  | 18 / 18                        |
| windows-i3-10100f / v24.21.0 / full    | 0 / 0 / 0 / 0 / 0                                                  | 0 / 0 / 0                                  | 143 / 143                      |

Every complete full-matrix measurement also asserts zero reservations, execution correlations, and credit operations. Crash/replacement counts above are intentional hostile scenarios. RSS and allocator retention are platform memory context, not evidence of a credit leak; original memory/scenario samples remain in campaign JSON.

## NODE 24 FULL BENCHMARK MATRIX

Each full cell retains 33 configurations × six trials = 198 measurements. Cases rotate and reverse between trials, with two warmups and a fresh runtime per case inside one benchmark process. Trials are not independent machine sessions or fresh processes. Throughput CV below uses population standard deviation divided by mean, matching the prepared benchmark. All samples, including outliers, remain retained.

The matrix covers utilization 1/0.75/0.5/0.25/0.1/0.01; byte capacities 1/4/16 blocks; variable RLE count/exact/upper/held-maximum with fast/slow consumers; constrained refund controls; and equal exact/upper clone/transfer. Held-maximum suppresses reconciliation only on a benchmark runtime instance; it is not a shipping runtime option.

### fedora-ryzen3300u / v24.21.0 / full

| Case                             | Results/s median | Min–max       | CV % | Host sizing ms median | Refund MiB median | First result ms median | Worker occupancy median |
| -------------------------------- | ---------------- | ------------- | ---- | --------------------- | ----------------- | ---------------------- | ----------------------- |
| slack-1-capacity-1               | 663.6            | 618.0–771.0   | 7.9  | 0.00                  | 0.00              | 1.55                   | 0.25                    |
| slack-1-capacity-4               | 1234.5           | 1045.4–1348.4 | 9.5  | 0.00                  | 0.00              | 2.17                   | 0.98                    |
| slack-1-capacity-16              | 1215.1           | 1033.5–1379.1 | 10.0 | 0.00                  | 0.00              | 2.37                   | 0.97                    |
| slack-0.75-capacity-1            | 764.7            | 708.3–852.7   | 6.7  | 0.00                  | 32.00             | 1.27                   | 0.25                    |
| slack-0.75-capacity-4            | 1342.2           | 1242.9–1553.4 | 7.5  | 0.00                  | 32.00             | 1.80                   | 0.97                    |
| slack-0.75-capacity-16           | 1375.5           | 1202.5–1514.3 | 6.9  | 0.00                  | 32.00             | 1.90                   | 0.97                    |
| slack-0.5-capacity-1             | 921.4            | 902.7–1036.3  | 4.8  | 0.00                  | 64.00             | 1.12                   | 0.25                    |
| slack-0.5-capacity-4             | 1635.5           | 1501.3–1966.0 | 9.0  | 0.00                  | 96.00             | 1.60                   | 0.98                    |
| slack-0.5-capacity-16            | 1599.9           | 1516.2–1895.5 | 8.4  | 0.00                  | 96.00             | 1.60                   | 0.98                    |
| slack-0.25-capacity-1            | 1286.8           | 1174.4–1326.1 | 3.7  | 0.00                  | 96.00             | 0.93                   | 0.25                    |
| slack-0.25-capacity-4            | 2229.2           | 2085.4–2564.4 | 6.9  | 0.00                  | 192.00            | 1.36                   | 0.97                    |
| slack-0.25-capacity-16           | 2296.8           | 2076.6–2538.7 | 7.6  | 0.00                  | 192.00            | 1.29                   | 0.98                    |
| slack-0.1-capacity-1             | 1688.6           | 1604.8–1761.0 | 3.3  | 0.00                  | 172.80            | 0.75                   | 0.25                    |
| slack-0.1-capacity-4             | 3085.1           | 2765.7–3217.2 | 6.2  | 0.00                  | 288.00            | 1.06                   | 0.97                    |
| slack-0.1-capacity-16            | 2942.3           | 2777.0–3235.4 | 5.7  | 0.00                  | 288.00            | 1.09                   | 0.98                    |
| slack-0.01-capacity-1            | 2011.5           | 1723.5–2218.3 | 8.3  | 0.00                  | 190.08            | 0.61                   | 0.25                    |
| slack-0.01-capacity-4            | 3812.3           | 3471.1–4039.2 | 5.5  | 0.00                  | 380.16            | 0.92                   | 0.98                    |
| slack-0.01-capacity-16           | 3923.6           | 3646.1–4061.4 | 3.8  | 0.00                  | 380.16            | 0.85                   | 0.98                    |
| variable-count-consumer-0        | 3802.3           | 3538.7–4035.0 | 4.6  | 0.00                  | 0.00              | 0.88                   | 0.98                    |
| variable-exact-consumer-0        | 2463.7           | 1928.4–2535.6 | 8.6  | 137.21                | 0.00              | 1.68                   | 0.98                    |
| variable-upper-consumer-0        | 3798.1           | 3485.7–4015.8 | 4.9  | 0.00                  | 379.22            | 0.78                   | 0.97                    |
| variable-held-maximum-consumer-0 | 3813.9           | 3521.0–3922.1 | 3.8  | 0.00                  | 0.00              | 0.89                   | 0.98                    |
| variable-count-consumer-1        | 865.6            | 852.2–882.8   | 1.6  | 0.00                  | 0.00              | 0.85                   | 0.17                    |
| variable-exact-consumer-1        | 727.0            | 689.0–738.1   | 2.2  | 86.56                 | 0.00              | 1.74                   | 0.24                    |
| variable-upper-consumer-1        | 858.7            | 829.4–877.2   | 2.1  | 0.00                  | 126.41            | 0.92                   | 0.18                    |
| variable-held-maximum-consumer-1 | 823.4            | 762.0–865.8   | 4.0  | 0.00                  | 0.00              | 0.95                   | 0.09                    |
| refund-count-slow                | 849.9            | 833.6–872.2   | 1.6  | 0.00                  | 0.00              | 0.31                   | 0.06                    |
| refund-upper-slow                | 840.2            | 827.6–874.0   | 1.9  | 0.00                  | 120.00            | 0.52                   | 0.05                    |
| refund-held-maximum-slow         | 834.5            | 811.9–850.8   | 1.4  | 0.00                  | 0.00              | 0.51                   | 0.05                    |
| equal-exact-clone                | 2431.7           | 1901.9–2997.6 | 17.1 | 0.00                  | 0.00              | 1.09                   | 0.96                    |
| equal-upper-clone                | 2587.7           | 1956.5–3063.9 | 17.1 | 0.00                  | 0.00              | 1.02                   | 0.97                    |
| equal-exact-transfer             | 4566.9           | 3407.8–5883.2 | 23.4 | 0.00                  | 0.00              | 0.72                   | 0.97                    |
| equal-upper-transfer             | 4410.3           | 3322.5–5846.9 | 22.7 | 0.00                  | 0.00              | 0.87                   | 0.97                    |

### windows-i3-10100f / v24.21.0 / full

| Case                             | Results/s median | Min–max       | CV % | Host sizing ms median | Refund MiB median | First result ms median | Worker occupancy median |
| -------------------------------- | ---------------- | ------------- | ---- | --------------------- | ----------------- | ---------------------- | ----------------------- |
| slack-1-capacity-1               | 610.2            | 585.1–772.8   | 10.0 | 0.00                  | 0.00              | 1.62                   | 0.25                    |
| slack-1-capacity-4               | 1535.1           | 1427.2–1620.1 | 4.8  | 0.00                  | 0.00              | 2.03                   | 0.98                    |
| slack-1-capacity-16              | 1530.1           | 1459.2–1641.4 | 3.6  | 0.00                  | 0.00              | 1.60                   | 0.98                    |
| slack-0.75-capacity-1            | 856.0            | 700.7–881.7   | 7.2  | 0.00                  | 32.00             | 1.17                   | 0.25                    |
| slack-0.75-capacity-4            | 1948.2           | 1662.7–2123.1 | 7.6  | 0.00                  | 48.00             | 1.46                   | 0.97                    |
| slack-0.75-capacity-16           | 1799.1           | 1539.3–1965.5 | 9.8  | 0.00                  | 48.00             | 1.42                   | 0.98                    |
| slack-0.5-capacity-1             | 1083.2           | 688.0–1123.6  | 14.9 | 0.00                  | 64.00             | 1.02                   | 0.25                    |
| slack-0.5-capacity-4             | 2643.4           | 2249.8–3191.3 | 10.6 | 0.00                  | 128.00            | 1.13                   | 0.98                    |
| slack-0.5-capacity-16            | 2644.1           | 2407.1–3038.3 | 7.6  | 0.00                  | 128.00            | 1.36                   | 0.98                    |
| slack-0.25-capacity-1            | 1416.2           | 1356.9–1543.0 | 4.2  | 0.00                  | 120.00            | 0.65                   | 0.25                    |
| slack-0.25-capacity-4            | 3826.7           | 3363.4–4096.8 | 8.1  | 0.00                  | 288.00            | 0.80                   | 0.97                    |
| slack-0.25-capacity-16           | 3631.5           | 3298.4–4250.7 | 7.9  | 0.00                  | 288.00            | 0.75                   | 0.98                    |
| slack-0.1-capacity-1             | 1797.2           | 1373.4–1953.5 | 11.0 | 0.00                  | 172.80            | 0.64                   | 0.25                    |
| slack-0.1-capacity-4             | 4607.8           | 4271.8–5465.0 | 8.3  | 0.00                  | 403.20            | 0.72                   | 0.98                    |
| slack-0.1-capacity-16            | 4891.5           | 4418.4–5380.9 | 6.7  | 0.00                  | 432.00            | 0.61                   | 0.98                    |
| slack-0.01-capacity-1            | 2373.0           | 2035.0–2449.3 | 7.0  | 0.00                  | 253.44            | 0.43                   | 0.25                    |
| slack-0.01-capacity-4            | 6354.1           | 5859.7–6953.6 | 5.6  | 0.00                  | 601.92            | 0.54                   | 0.98                    |
| slack-0.01-capacity-16           | 6426.3           | 4924.4–7153.9 | 12.6 | 0.00                  | 601.92            | 0.52                   | 0.98                    |
| variable-count-consumer-0        | 6284.6           | 5178.0–7056.7 | 10.1 | 0.00                  | 0.00              | 0.58                   | 0.98                    |
| variable-exact-consumer-0        | 2639.6           | 2100.8–2956.6 | 12.1 | 155.41                | 0.00              | 1.46                   | 0.98                    |
| variable-upper-consumer-0        | 6177.3           | 4956.2–6766.4 | 9.4  | 0.00                  | 568.83            | 0.57                   | 0.98                    |
| variable-held-maximum-consumer-0 | 5932.9           | 5069.0–7014.1 | 10.1 | 0.00                  | 0.00              | 0.65                   | 0.98                    |
| variable-count-consumer-1        | 114.3            | 91.1–127.2    | 11.5 | 0.00                  | 0.00              | 0.59                   | 0.10                    |
| variable-exact-consumer-1        | 104.8            | 91.0–130.5    | 12.7 | 36.89                 | 0.00              | 1.30                   | 0.17                    |
| variable-upper-consumer-1        | 103.4            | 89.1–116.1    | 8.4  | 0.00                  | 63.20             | 0.55                   | 0.10                    |
| variable-held-maximum-consumer-1 | 146.1            | 101.3–206.9   | 24.8 | 0.00                  | 0.00              | 0.56                   | 0.13                    |
| refund-count-slow                | 86.0             | 75.2–90.9     | 6.7  | 0.00                  | 0.00              | 0.17                   | 0.07                    |
| refund-upper-slow                | 90.5             | 85.1–130.3    | 15.9 | 0.00                  | 60.00             | 0.14                   | 0.12                    |
| refund-held-maximum-slow         | 94.8             | 83.3–116.7    | 11.8 | 0.00                  | 0.00              | 0.36                   | 0.14                    |
| equal-exact-clone                | 3551.5           | 2800.0–4115.2 | 11.6 | 0.00                  | 0.00              | 0.83                   | 0.98                    |
| equal-upper-clone                | 3365.8           | 2349.2–4068.4 | 15.7 | 0.00                  | 0.00              | 1.60                   | 0.98                    |
| equal-exact-transfer             | 7058.7           | 6287.7–8995.8 | 12.8 | 0.00                  | 0.00              | 0.41                   | 0.98                    |
| equal-upper-transfer             | 6981.4           | 6682.1–8051.4 | 6.3  | 0.00                  | 0.00              | 0.81                   | 0.98                    |

## WITHIN-MACHINE RELATIONSHIPS

| Environment                         | Fast RLE upper / exact throughput | Slow RLE upper / exact throughput | Constrained slow refund upper / held throughput | Equal upper / exact clone throughput | Equal upper / exact transfer throughput |
| ----------------------------------- | --------------------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------------ | --------------------------------------- |
| fedora-ryzen3300u / v24.21.0 / full | 1.54                              | 1.18                              | 1.01                                            | 1.06                                 | 0.97                                    |
| windows-i3-10100f / v24.21.0 / full | 2.34                              | 0.99                              | 0.95                                            | 0.95                                 | 0.99                                    |

Ratios greater than one favor upper-bound throughput for the named workload. Exact variable RLE performs host sizing; equal-bound controls isolate contract-mode overhead more closely. Refund counters measure successful slack reconciliation, not consumer release. Conservative bounds constrain admission before actual size is known; refund does not make worker allocation or consumer memory bounded. Interpret small differences against retained variance, sample windows, and operating conditions.

fedora-ryzen3300u / v24.21.0 / full: fast variable RLE upper / host-sized exact throughput is 1.54×, with median host sizing 137.21 ms for exact and 0.00 ms for upper. Slow-consumer RLE upper / exact throughput is 1.18×. The constrained slow refund upper / held-maximum control is 1.01×. These are within-session workload ratios, not portable guarantees.

windows-i3-10100f / v24.21.0 / full: fast variable RLE upper / host-sized exact throughput is 2.34×, with median host sizing 155.41 ms for exact and 0.00 ms for upper. Slow-consumer RLE upper / exact throughput is 0.99×. The constrained slow refund upper / held-maximum control is 0.95×. These are within-session workload ratios, not portable guarantees.

Avoiding duplicate host sizing benefits the retained fast-RLE controls in both full cells. The slow-consumer controls show that this advantage can diminish. Refund correctness and terminal cleanup reproduce, but these sessions do not establish a portable throughput gain from refunds under the constrained slow-consumer control. The separate local refund trace remains separate evidence, rather than a result silently substituted into this matrix.

## CROSS-PLATFORM REPRODUCTION AND LIMITS

The included cells reproduce complete normal/invariant correctness and zero terminal ownership. Full cells additionally reproduce stress and the complete upper-bound matrix. Relative benefits and costs are quantified per machine above; their magnitudes need independent replication.

Fedora/AMD and Windows/Intel differ in CPU, OS, logical parallelism, and power context. Their absolute throughput cannot isolate OS speed. Node 22 reduced supplies no performance matrix or ten-round stress; Node 22 full remains additional coverage rather than a completed cell. macOS/ARM64 and repeated independent sessions remain untested. The separate v0.11 and local v0.12 regression experiments are historical controls, not rerun or merged into this campaign.

## FAILURES AND READINESS

No recorded correctness, lifecycle, source-preservation, matrix-completeness, or terminal-credit failures in the included cells.

**READY WITH CAVEATS.** Review performance variance and operating conditions before portable performance claims. Keep the adopted v0.12 API experimental. This execution stops at validation and does not implement or begin v0.13.

## ORIGINAL ARTIFACTS AND REPRODUCTION

- [fedora-ryzen3300u / v22.23.3 / reduced campaign](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node22-reduced.json)
- [Original companion metadata](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node22-reduced.metadata.json)

- [fedora-ryzen3300u / v24.21.0 / full campaign](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node24-full.json)
- [Original companion metadata](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node24-full.metadata.json)

- [windows-i3-10100f / v22.23.3 / reduced campaign](../benchmarks/results/cross-platform-v0.12-windows-i3-10100f-node22-reduced.json)
- [Original companion metadata](../benchmarks/results/cross-platform-v0.12-windows-i3-10100f-node22-reduced.metadata.json)

- [windows-i3-10100f / v24.21.0 / full campaign](../benchmarks/results/cross-platform-v0.12-windows-i3-10100f-node24-full.json)
- [Original companion metadata](../benchmarks/results/cross-platform-v0.12-windows-i3-10100f-node24-full.metadata.json)

Use existing Node and matching npm-cli.js paths. The read-only observer invokes the prepared runner, records actual power settings, and refuses existing campaign or companion filenames. For repeats, choose a new output directory.

```powershell
node scripts/cross-platform-v012/observe.mjs --commit 18f0c87e7b7920179403bbc396afabced6bb06c4 --mode reduced --label windows-i3-10100f --node "<existing Node 22 node.exe>" --npm "<matching npm-cli.js>"
node scripts/cross-platform-v012/observe.mjs --commit 18f0c87e7b7920179403bbc396afabced6bb06c4 --mode full --label windows-i3-10100f --node "<existing Node 24 node.exe>" --npm "<matching npm-cli.js>"
```

Regenerate from campaign inputs only; matching companions are discovered beside each input:

```powershell
node scripts/cross-platform-v012/report.mjs benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node22-reduced.json benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node24-full.json benchmarks/results/cross-platform-v0.12-windows-i3-10100f-node22-reduced.json benchmarks/results/cross-platform-v0.12-windows-i3-10100f-node24-full.json
```
