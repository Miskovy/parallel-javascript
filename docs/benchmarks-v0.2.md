# v0.2 measurements: explicit buffer transfer

Recorded 2026-09-19T18:30:45.501Z on v24.21.0, win32, Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz; 8 available logical CPUs. Builds use TypeScript 7.0.2. These runs measure runtime transport and kernels, not compiler speed.

The v0.1 reports remain unchanged. These are local observations, not cross-platform performance guarantees or a Piscina comparison. See [methodology](../benchmarks/README.md) for timing boundaries, CPU/RSS definitions, and ordering limitations.

## Round-trip transport

One persistent worker, five warmups, twenty retained samples per mode/size. Mode order alternates. Both modes reuse the returned buffer and validate every byte outside timing. No data allocation is hidden for only one mode. The scalar rows perform the same no-transfer operation.

[Raw samples, endpoint RSS, CPU time, and startup](../benchmarks/results/transfer-v0.2.json).

| Payload       | Clone median ms | Transfer median ms | Clone / transfer      |
| ------------- | --------------- | ------------------ | --------------------- |
| scalar bytes  | 0.163           | 0.134              | same operation; noise |
| 1024 bytes    | 0.090           | 0.088              | 1.027                 |
| 1048576 bytes | 1.180           | 0.259              | 4.553                 |
| 8388608 bytes | 7.294           | 0.262              | 27.798                |

The large-payload probe demonstrates reduced transport cost. Tiny-payload and scalar differences do not establish an advantage. The slow samples remain in the JSON; no outliers were removed.

## Matrix multiplication

The same row-major kernel and independent reference validate every output element. All required left-row and right-matrix preparation copies, task dispatch, output transport, and assembly are timed. Each mode uses a fresh process for each worker count. The whole clone phase runs before the transfer phase, and each obtains a separate serial baseline.

Raw artifacts: [clone](../benchmarks/results/matrix-clone-v0.2.json), [transfer](../benchmarks/results/matrix-transfer-v0.2.json). Serial rows execute the same non-worker algorithm; the labels identify separate measurement phases.

| Size | Workers | Clone raw ms                                | Transfer raw ms                             | Clone median | Transfer median | Clone / transfer | Peak sampled RSS MiB clone / transfer |
| ---- | ------- | ------------------------------------------- | ------------------------------------------- | ------------ | --------------- | ---------------- | ------------------------------------- |
| 128  | serial  | 5.054, 3.647, 3.415, 5.441, 3.617           | 4.957, 3.245, 3.529, 3.397, 3.281           | 3.647        | 3.397           | 1.074            | 47.4 / 48.1                           |
| 128  | 1       | 4.194, 4.152, 4.137, 4.655, 4.325           | 5.846, 6.124, 3.731, 3.647, 3.837           | 4.194        | 3.837           | 1.093            | 68.4 / 67.3                           |
| 128  | 2       | 2.442, 2.715, 2.742, 2.521, 2.412           | 2.242, 2.384, 2.368, 2.279, 2.253           | 2.521        | 2.279           | 1.106            | 85.0 / 84.9                           |
| 128  | 4       | 2.786, 2.685, 2.505, 2.555, 2.612           | 1.629, 2.083, 1.768, 1.828, 1.457           | 2.612        | 1.768           | 1.478            | 117.8 / 118.9                         |
| 128  | 8       | 2.296, 2.624, 2.577, 2.710, 2.131           | 2.481, 3.925, 2.043, 1.793, 1.919           | 2.577        | 2.043           | 1.261            | 182.1 / 189.6                         |
| 256  | serial  | 25.763, 25.875, 25.795, 25.707, 26.553      | 25.653, 25.685, 25.723, 25.795, 25.712      | 25.795       | 25.712          | 1.003            | 53.3 / 53.7                           |
| 256  | 1       | 29.519, 29.941, 52.023, 40.022, 27.682      | 26.966, 27.274, 26.853, 27.209, 26.553      | 29.941       | 26.966          | 1.110            | 95.2 / 85.4                           |
| 256  | 2       | 19.529, 23.383, 20.944, 23.915, 14.376      | 18.592, 22.395, 23.046, 14.866, 14.257      | 20.944       | 18.592          | 1.126            | 115.6 / 105.4                         |
| 256  | 4       | 13.857, 15.001, 18.849, 19.802, 11.916      | 13.003, 20.118, 20.188, 8.623, 8.804        | 15.001       | 13.003          | 1.154            | 157.0 / 147.4                         |
| 256  | 8       | 13.066, 10.452, 14.713, 17.082, 11.343      | 8.651, 10.016, 8.427, 10.210, 9.784         | 13.066       | 9.784           | 1.335            | 235.0 / 234.6                         |
| 512  | serial  | 225.883, 228.305, 235.134, 208.957, 247.183 | 205.968, 206.505, 205.170, 204.818, 204.775 | 228.305      | 205.170         | 1.113            | 71.5 / 72.1                           |
| 512  | 1       | 209.427, 208.142, 209.335, 217.677, 218.083 | 205.974, 206.526, 206.343, 208.510, 206.551 | 209.427      | 206.526         | 1.014            | 187.3 / 153.4                         |
| 512  | 2       | 146.937, 140.030, 139.015, 148.632, 147.905 | 138.344, 118.879, 109.216, 118.338, 140.876 | 146.937      | 118.879         | 1.236            | 223.6 / 187.0                         |
| 512  | 4       | 83.733, 81.776, 89.929, 84.082, 96.160      | 71.570, 84.972, 75.406, 78.648, 81.057      | 84.082       | 78.648          | 1.069            | 302.8 / 262.6                         |
| 512  | 8       | 76.079, 76.116, 74.951, 73.910, 71.912      | 59.462, 61.436, 60.175, 58.481, 60.811      | 74.951       | 60.175          | 1.246            | 444.4 / 412.2                         |

| Workers | Clone startup ms | Transfer startup ms |
| ------- | ---------------- | ------------------- |
| 1       | 41.035           | 52.966              |
| 2       | 48.742           | 58.660              |
| 4       | 59.215           | 69.055              |
| 8       | 89.265           | 111.628             |

At 512 x 512 and eight workers, wall-time medians were 74.951 ms with cloning and 60.175 ms with transfer. The separate serial medians were 228.305 and 205.170 ms: this visible phase drift means the entire direct ratio cannot safely be attributed to transfer.

At that size/count, clone mode prepares 2 MiB of compact left rows, clones 18 MiB of inputs through messaging, and clones 2 MiB of outputs. Transfer mode prepares 18 MiB of dedicated inputs, transfers those buffers, and transfers 2 MiB of outputs. The right matrix still needs eight copies; moving ownership is not shared-memory reuse. Main-thread result assembly remains in both modes.

## CPU regression workload

Prime search retains the same 32-chunk policy and independent sieve validation. This workload uses small structured-clone messages and does not opt into transfer. These are fresh observations, not an isolated experiment attributing differences from v0.1 to the compiler.

[Raw CPU report, serial chunking control, startup, memory, and CPU samples](../benchmarks/results/cpu-v0.2.json).

| Range upper bound | Workers | Raw ms                                      | Median ms | Speedup vs this run serial | Efficiency |
| ----------------- | ------- | ------------------------------------------- | --------- | -------------------------- | ---------- |
| 100000            | serial  | 4.953, 6.727, 4.746, 4.419, 4.367           | 4.746     | 1.000                      | -          |
| 100000            | 1       | 6.637, 6.168, 7.246, 6.363, 6.151           | 6.363     | 0.746                      | 0.746      |
| 100000            | 2       | 4.074, 4.977, 3.952, 3.456, 3.634           | 3.952     | 1.201                      | 0.601      |
| 100000            | 4       | 3.569, 3.328, 2.948, 3.118, 2.747           | 3.118     | 1.522                      | 0.381      |
| 100000            | 8       | 4.045, 4.198, 3.203, 2.875, 4.152           | 4.045     | 1.173                      | 0.147      |
| 1000000           | serial  | 104.868, 107.901, 110.553, 103.226, 106.829 | 106.829   | 1.000                      | -          |
| 1000000           | 1       | 92.324, 92.314, 92.083, 94.792, 98.648      | 92.324    | 1.157                      | 1.157      |
| 1000000           | 2       | 51.722, 54.190, 48.665, 47.037, 47.425      | 48.665    | 2.195                      | 1.098      |
| 1000000           | 4       | 32.415, 29.662, 31.228, 33.409, 34.433      | 32.415    | 3.296                      | 0.824      |
| 1000000           | 8       | 26.718, 26.133, 25.291, 25.394, 26.629      | 26.133    | 4.088                      | 0.511      |
| 5000000           | serial  | 854.907, 873.477, 825.706, 822.645, 821.359 | 825.706   | 1.000                      | -          |
| 5000000           | 1       | 829.529, 829.187, 836.524, 832.138, 829.939 | 829.939   | 0.995                      | 0.995      |
| 5000000           | 2       | 440.439, 458.661, 436.403, 433.373, 433.132 | 436.403   | 1.892                      | 0.946      |
| 5000000           | 4       | 283.028, 290.729, 305.170, 297.759, 324.098 | 297.759   | 2.773                      | 0.693      |
| 5000000           | 8       | 189.872, 188.051, 193.213, 197.197, 184.433 | 189.872   | 4.349                      | 0.544      |

## What to improve next

Bulk message copying was a measurable transport bottleneck and explicit transfer reduces it in the round-trip probe. For the matrix workload, repeated right-matrix preparation remains a cost, along with the kernel, assembly, allocation/GC, and CPU/cache contention. No hardware profiling here separates those contributions.

The next memory experiment should use reusable read-only shared input with a clear lifetime and immutability contract, then compare it with these clone/transfer baselines in interleaved repeated sessions. Keep FIFO until an uneven-workload benchmark justifies a scheduler change. Runtime-owned partitioning remains the next higher-level abstraction.
