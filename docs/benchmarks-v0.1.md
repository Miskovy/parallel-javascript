# v0.1 benchmark measurements

Generated from the retained JSON reports. Times below are milliseconds. All five samples are included without outlier removal; speedup uses medians. See [methodology](../benchmarks/README.md) for scope and limitations.

## Prime search

2026-09-19T17:41:49.964Z; v24.21.0; win32 10.0.19045; Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz; 8 available logical CPUs. The 8-worker configuration also represents availableParallelism on this machine.

Raw artifact: [cpu.json](../benchmarks/results/cpu.json).

| Size    | Workers | Raw wall times                               | Median  | Speedup | Efficiency | Peak sampled RSS MiB | CPU % median |
| ------- | ------- | -------------------------------------------- | ------- | ------- | ---------- | -------------------- | ------------ |
| 100000  | serial  | 4.367, 4.373, 4.405, 4.368, 4.425            | 4.373   | 1.000   | —          | 41.0                 | 0.0          |
| 100000  | 1       | 5.963, 7.014, 6.684, 6.279, 6.309            | 6.309   | 0.693   | 0.693      | 58.5                 | 0.0          |
| 100000  | 2       | 4.860, 4.903, 4.386, 26.090, 6.248           | 4.903   | 0.892   | 0.446      | 71.5                 | 0.0          |
| 100000  | 4       | 3.666, 3.089, 2.824, 3.012, 3.576            | 3.089   | 1.416   | 0.354      | 98.1                 | 0.0          |
| 100000  | 8       | 5.269, 3.611, 4.101, 3.020, 3.040            | 3.611   | 1.211   | 0.151      | 147.9                | 0.0          |
| 1000000 | serial  | 120.528, 109.876, 113.940, 104.702, 103.582  | 109.876 | 1.000   | —          | 42.0                 | 99.2         |
| 1000000 | 1       | 106.595, 93.087, 93.794, 97.563, 96.386      | 96.386  | 1.140   | 1.140      | 59.9                 | 97.5         |
| 1000000 | 2       | 57.170, 57.321, 53.786, 53.786, 55.703       | 55.703  | 1.973   | 0.986      | 74.0                 | 195.7        |
| 1000000 | 4       | 37.209, 32.413, 33.202, 33.399, 32.525       | 33.202  | 3.309   | 0.827      | 99.2                 | 326.4        |
| 1000000 | 8       | 24.678, 25.170, 25.477, 23.708, 25.584       | 25.170  | 4.365   | 0.546      | 149.0                | 427.8        |
| 5000000 | serial  | 858.698, 899.325, 863.110, 859.781, 877.162  | 863.110 | 1.000   | —          | 46.9                 | 99.9         |
| 5000000 | 1       | 842.556, 932.201, 834.314, 839.325, 1043.608 | 842.556 | 1.024   | 1.024      | 64.8                 | 99.2         |
| 5000000 | 2       | 508.004, 507.668, 525.068, 541.672, 527.612  | 525.068 | 1.644   | 0.822      | 73.9                 | 194.0        |
| 5000000 | 4       | 333.667, 320.997, 320.292, 324.776, 334.488  | 324.776 | 2.658   | 0.664      | 104.3                | 370.4        |
| 5000000 | 8       | 232.260, 224.125, 215.006, 234.807, 308.503  | 232.260 | 3.716   | 0.465      | 149.6                | 565.6        |

CPU percentage is process-wide: 100% represents one logical CPU. Short-sample zeroes reflect CPU timer granularity, not an absence of work.

| Workers | Startup | First size first execution | Startup + first execution | Scalar round trip median | 8 MiB round trip median |
| ------- | ------- | -------------------------- | ------------------------- | ------------------------ | ----------------------- |
| serial  | 0.000   | 4.725                      | 4.725                     | —                        | —                       |
| 1       | 44.001  | 12.225                     | 56.226                    | 0.085                    | 8.757                   |
| 2       | 54.264  | 9.955                      | 64.219                    | 0.102                    | 9.537                   |
| 4       | 57.756  | 7.767                      | 65.523                    | 0.107                    | 8.657                   |
| 8       | 99.916  | 10.000                     | 109.916                   | 0.111                    | 8.541                   |

Startup is one observation per configuration, not a distribution. The first-execution column applies only to the smallest size. Later sizes use the same pool.

### Serial chunking control

The main serial comparison uses one monolithic call. This diagnostic uses the same 32 chunks as PJS and runs after each monolithic measurement group.

| Range upper bound | Raw chunked serial times                    | Median  |
| ----------------- | ------------------------------------------- | ------- |
| 100000            | 4.518, 4.538, 4.570, 4.550, 5.104           | 4.550   |
| 1000000           | 88.364, 93.017, 95.177, 90.357, 86.972      | 90.357  |
| 5000000           | 867.788, 867.790, 858.373, 899.644, 861.520 | 867.788 |

## Matrix multiplication

2026-09-19T17:45:20.378Z; v24.21.0; win32 10.0.19045; Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz; 8 available logical CPUs. The 8-worker configuration also represents availableParallelism on this machine.

Raw artifact: [matrix.json](../benchmarks/results/matrix.json).

| Size | Workers | Raw wall times                              | Median  | Speedup | Efficiency | Peak sampled RSS MiB | CPU % median |
| ---- | ------- | ------------------------------------------- | ------- | ------- | ---------- | -------------------- | ------------ |
| 128  | serial  | 4.271, 3.607, 3.631, 3.561, 3.701           | 3.631   | 1.000   | —          | 43.8                 | 0.0          |
| 128  | 1       | 4.689, 4.243, 4.350, 4.169, 4.481           | 4.350   | 0.835   | 0.835      | 65.8                 | 0.0          |
| 128  | 2       | 4.617, 2.691, 3.462, 2.452, 2.750           | 2.750   | 1.320   | 0.660      | 81.9                 | 0.0          |
| 128  | 4       | 2.969, 2.664, 2.735, 2.701, 2.618           | 2.701   | 1.344   | 0.336      | 114.9                | 0.0          |
| 128  | 8       | 2.461, 2.386, 2.390, 3.853, 2.239           | 2.390   | 1.519   | 0.190      | 177.7                | 0.0          |
| 256  | serial  | 37.990, 42.273, 39.902, 26.587, 27.279      | 37.990  | 1.000   | —          | 49.2                 | 111.2        |
| 256  | 1       | 30.053, 29.839, 43.689, 45.105, 35.736      | 35.736  | 1.063   | 1.063      | 92.2                 | 89.5         |
| 256  | 2       | 20.700, 18.902, 28.886, 28.109, 21.186      | 21.186  | 1.793   | 0.897      | 112.5                | 167.2        |
| 256  | 4       | 17.100, 13.588, 18.769, 21.697, 12.920      | 17.100  | 2.222   | 0.555      | 150.4                | 362.6        |
| 256  | 8       | 13.606, 13.623, 18.238, 18.625, 11.067      | 13.623  | 2.789   | 0.349      | 231.5                | 671.1        |
| 512  | serial  | 270.344, 241.635, 264.478, 231.760, 261.277 | 261.277 | 1.000   | —          | 68.9                 | 100.6        |
| 512  | 1       | 289.078, 262.949, 302.205, 276.796, 249.844 | 276.796 | 0.944   | 0.944      | 187.0                | 96.1         |
| 512  | 2       | 143.872, 146.159, 218.060, 168.737, 194.619 | 168.737 | 1.548   | 0.774      | 212.6                | 192.3        |
| 512  | 4       | 92.266, 97.151, 105.077, 109.921, 106.216   | 105.077 | 2.487   | 0.622      | 294.9                | 338.2        |
| 512  | 8       | 94.219, 132.583, 83.323, 83.489, 84.148     | 84.148  | 3.105   | 0.388      | 441.6                | 468.3        |

CPU percentage is process-wide: 100% represents one logical CPU. Short-sample zeroes reflect CPU timer granularity, not an absence of work.

| Workers | Startup | First size first execution | Startup + first execution | Scalar round trip median | 8 MiB round trip median |
| ------- | ------- | -------------------------- | ------------------------- | ------------------------ | ----------------------- |
| serial  | 0.000   | 6.092                      | 6.092                     | —                        | —                       |
| 1       | 44.919  | 11.256                     | 56.175                    | 0.065                    | 10.524                  |
| 2       | 60.136  | 11.387                     | 71.522                    | 0.091                    | 9.056                   |
| 4       | 60.528  | 11.975                     | 72.503                    | 0.085                    | 10.081                  |
| 8       | 98.906  | 20.720                     | 119.627                   | 0.131                    | 10.749                  |

Startup is one observation per configuration, not a distribution. The first-execution column applies only to the smallest size. Later sizes use the same pool.

## Interpretation and next improvement

These are local baseline observations with visible variance, not release-level performance claims. All prime counts matched an independent sieve; every matrix element matched an independent loop-order oracle. Benchmark thread IDs confirmed participation by every configured worker. The test suite separately uses a blocking barrier to prove simultaneous execution.

For the largest prime workload, 8 workers improved median wall time from 863.110 ms to 232.260 ms (3.716×, 46.5% logical-worker efficiency). At 512×512, matrix time fell from 261.277 ms to 84.148 ms (3.105×, 38.8%). Eight logical CPUs do not imply eight independent physical cores or linear scaling. These runs did not measure hardware counters, so physical-resource contention, bandwidth, and cache effects cannot be separated.

The largest directly measured runtime overhead for bulk payloads is the clone/message data path: warmed 8 MiB round trips take roughly 8–11 ms versus about 0.07–0.13 ms for scalar messages. Matrix input cloning grows from 4 MiB with one worker to 18 MiB with eight at size 512, plus 2 MiB of output and main-thread partition/assembly allocations. Sampled RSS reaches 441.6 MiB with eight workers, versus 68.9 MiB serial. This identifies data movement as the most actionable bottleneck; it does not prove cloning dominates total large-kernel execution time.

For tiny jobs, startup is the dominant cold-path cost: the eight-worker matrix pool takes 98.906 ms to start and another 20.720 ms for its first 128×128 execution, versus 6.092 ms for the first serial execution. In warm runs, one worker is slower than serial for 100,000-prime search and 128×128 matrix multiplication. Reuse pools and choose meaningful task granularity.

The 1,000,000-prime serial chunking control has a 90.357 ms median, compared with 109.876 ms monolithic and 96.386 ms through one worker. This exposes a chunking/JIT/context effect; a nominal one-worker speedup over the monolithic reference is not evidence of a faster runtime. The preliminary run is preserved in cpu-initial.json; no outliers were removed from either run.

Next: add explicit transferable input/output ownership at the existing protocol boundaries, with detachment/error/cancellation tests and a repeat of the scalar/bulk probes and matrix benchmarks. Then evaluate reusable read-only shared right-hand matrices with an explicit immutability/lifetime contract. Keep FIFO while isolating these copy costs; these measurements do not yet justify work stealing. Runtime-owned partitioning follows once payload ownership is clear.
