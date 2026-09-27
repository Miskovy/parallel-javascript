# v0.3 technical report: reusable shared inputs

## Implementation summary

PJS 0.3.0 adds `sharedReadonly(view)`, a compact, one-time copy into native
SharedArrayBuffer backing storage. Uint8Array, Int32Array, Uint32Array,
Float32Array and Float64Array preserve their element kind; TypeScript exposes
the shared backing type. Existing native SAB/view passthrough remains available.
The helper does not share object graphs, freeze bytes, track resources or create
compute jobs. Read-only is a usage contract, not protection against writes.

The matrix demonstration prepares B once per session and references it from
every row task, with private transferred A blocks and private transferred
outputs. A dedicated range-sum workload and an exact Piscina 5.3.2 development
baseline compare clone, transfer and shared modes. No runtime dependency was
added. Package versions are 0.3.0; v0.1/v0.2 artifacts remain unchanged.

## Architecture decisions

[The proposal](proposal-v0.3.md) precedes the public implementation.
[ADR 0007](adr/0007-shared-input-model.md) selects a construction helper over
native transport (options B + A). Native passthrough alone lacks discoverable
construction and a common contract. A resource registry (option C) has no
measured justification for this workload and would add identity, replay,
reference lifetimes and disposal semantics.

Native GC owns lifetime. A replacement worker receives shared views in its next
ordinary task message, so no resource replay or additional ready phase exists.
Cancellation does not end active reads. A crash preserves correctly used input
but cannot undo illegal writes. maxQueue bounds compute jobs, not shared bytes.
See [the memory guide](memory.md) for ownership, Atomics and mutation examples.

Fixed persistent workers, registry snapshots, FIFO admission, backpressure,
transfer reservations, correlated settlement, cancellation occupancy, deadline
handling, bounded restart and both shutdown modes remain unchanged. Every
existing emitted runtime JavaScript file except the export index was compared
with the built v0.2 checkout and was byte-identical. The helper is not on the
run/dispatch path. Runtime statistics gain no guessed serialized-byte metrics.

## Files changed

- `packages/runtime/src/tasks/shared.ts` and the public export index: construction and typed shared backing.
- `packages/runtime/test/shared.test.mjs`, its fixture, matrix tests and declaration tests: shared correctness and lifecycle coverage, preserving prior tests.
- `benchmarks/shared-memory/`: shared kernel, PJS/Piscina adapters, isolated measurement and comparison runners.
- `benchmarks/cpu-baseline/compare.mjs`: alternating same-machine regression control.
- Existing benchmark launchers: v0.3 output names, useful concurrency bounds and collection on child `close` after stdout drains.
- Root/package manifests and lockfile: 0.3.0 and pinned development-only Piscina.
- README, architecture, research, memory guide, proposal, ADR, methodology and this report.
- `benchmarks/results/`: new raw v0.3 reports and separate local v0.2 regression control; historical artifacts unchanged.

## Correctness and stress

New coverage includes exact bit copies, subviews, empty/invalid/detached sources,
cross-realm views, subclass normalization, native wrapper aliasing/offsets,
four simultaneous readers, 80 queued reuse tasks, cloned metadata, private
transferred inputs/outputs, worker replacement, startup draining, queued and
running cancellation/deadlines, queue overflow, graceful and terminating
shutdown, and SAB transfer rejection. Uneven shared matrix rows are checked
against an independent multiplication oracle.

The educational mutation test forces two workers to read the same old cell
before either writes: the non-atomic update loses one increment, while
Atomics.add preserves both. Its synchronization controls are test-only; no
public mutex, semaphore or barrier API was introduced.

### Final verification results

| Command                                   | Result                         |
| ----------------------------------------- | ------------------------------ |
| `npm run build`                           | Passed                         |
| `npm test`                                | 58 passed, 0 failed, 0 skipped |
| `npm run test:stress` (first invocation)  | All five rounds passed         |
| `npm run test:stress` (second invocation) | All five rounds passed         |
| `npm run test:types`                      | Passed                         |
| `npm run typecheck:compat`                | Passed                         |
| `npm run lint`                            | Passed                         |
| `npm run format:check`                    | Passed                         |

The final stress verification exercised all 58 correctness cases in ten rounds
(580 case executions), with no intermittent failures. An earlier five-round
stress pass also completed during development. Final verification ran outside
the child-process-restricted sandbox. All required benchmark suites completed,
with every independent correctness check passing. Historical result files were
checked against Git and remain unchanged. No v0.4 code was added.

## Machine and methodology

Measured 2026-09-27 on Node v24.13.1, Linux 6.19.10-300.fc44.x86_64,
AMD Ryzen 3 PRO 3300U with Radeon Vega graphics, four available logical CPUs,
7,715,659,776 bytes total memory. Worker counts: 1, 2 and 4 (also
availableParallelism); no oversubscribed eight-worker rows. No CPU affinity,
frequency locking or hardware performance counters. Background load, power,
thermal state, JIT and GC are not controlled experimentally.

Suites ran sequentially. Each configuration uses a fresh process and fixed
pool. Main comparisons retain one first-run sample, two warmups, and five timed
samples. Original data generation and independent validation are outside timing
for every mode. Matrix samples include row preparation, common-input preparation,
dispatch, computation, result transport and assembly. Shared and transfer matrix
modes both transfer A and result blocks; clone-to-shared ratios also include
that output transport difference. Transfer-to-shared is the closer B comparison.

One-shot means one preparation and one execution. Reuse means one preparation
and five executions inside each measured session; tables report full session
time divided by five. Execution-only times are separate and must not be mistaken
for end-to-end times. Matrix outputs and assembled matrices remain live until
validation, equally in all new modes. This differs from the older matrix
harness, so compare its memory figures within that harness only.

Known backing-byte budgets accompany samples. RSS is process-wide, sampled
every 5 ms plus endpoints; synchronous work can hide peaks. It includes worker
heaps, JIT, GC/allocator history and retained outputs. No forced GC, subtraction
or outlier removal. RSS is not an exact measurement of unique physical shared
pages. CPU time is process-wide; 100% denotes one logical CPU.

The initial sandbox could not reliably run benchmark child processes (EPERM);
measured suites were run with the approved external execution permission. Failed
collection attempts produced no retained samples. Historical Windows reports
are contextual evidence, not same-machine regression controls.

## Clone, transfer and shared results

Times are medians in milliseconds per iteration, including amortized preparation. RSS columns are maximum sampled MiB across the five retained samples. A reuse session has five iterations; one-shot has one.

### 16 MiB common input, disjoint range sums

[Raw 16 mib common input, disjoint range sums samples](../benchmarks/results/shared-v0.3.json).

| Elements / matrix size | Workers | Session  | Clone ms | Transfer ms | Shared ms | Clone RSS | Transfer RSS | Shared RSS |
| ---------------------- | ------- | -------- | -------- | ----------- | --------- | --------- | ------------ | ---------- |
| 2097152                | 1       | one-shot | 13.886   | 23.091      | 20.556    | 180.6     | 180.4        | 212.3      |
| 2097152                | 1       | reuse ×5 | 14.767   | 15.595      | 8.491     | 228.5     | 199.3        | 213.1      |
| 2097152                | 2       | one-shot | 61.286   | 41.417      | 19.976    | 288.6     | 225.3        | 224.2      |
| 2097152                | 2       | reuse ×5 | 51.968   | 19.482      | 7.387     | 322.7     | 290.1        | 224.0      |
| 2097152                | 4       | one-shot | 73.236   | 81.054      | 20.137    | 483.3     | 377.9        | 247.1      |
| 2097152                | 4       | reuse ×5 | 63.262   | 35.254      | 12.019    | 568.6     | 457.4        | 248.1      |

### Matrix multiplication

[Raw matrix multiplication samples](../benchmarks/results/matrix-shared-v0.3.json).

| Elements / matrix size | Workers | Session  | Clone ms | Transfer ms | Shared ms | Clone RSS | Transfer RSS | Shared RSS |
| ---------------------- | ------- | -------- | -------- | ----------- | --------- | --------- | ------------ | ---------- |
| 128                    | 1       | one-shot | 6.727    | 6.599       | 8.507     | 77.9      | 75.9         | 75.6       |
| 128                    | 1       | reuse ×5 | 6.403    | 8.273       | 6.816     | 100.8     | 91.4         | 87.9       |
| 128                    | 2       | one-shot | 5.842    | 5.065       | 6.292     | 90.9      | 89.5         | 88.7       |
| 128                    | 2       | reuse ×5 | 6.072    | 4.933       | 4.918     | 119.4     | 109.2        | 100.6      |
| 128                    | 4       | one-shot | 4.215    | 6.166       | 5.965     | 117.5     | 116.3        | 113.0      |
| 128                    | 4       | reuse ×5 | 5.563    | 5.311       | 5.264     | 154.9     | 142.3        | 121.9      |
| 512                    | 1       | one-shot | 406.586  | 480.470     | 447.976   | 168.0     | 126.3        | 123.2      |
| 512                    | 1       | reuse ×5 | 429.907  | 414.926     | 391.744   | 233.3     | 214.8        | 214.0      |
| 512                    | 2       | one-shot | 275.127  | 236.940     | 252.689   | 205.2     | 170.8        | 152.7      |
| 512                    | 2       | reuse ×5 | 238.201  | 252.014     | 203.884   | 330.0     | 261.6        | 260.7      |
| 512                    | 4       | one-shot | 218.093  | 225.332     | 269.910   | 238.7     | 220.3        | 176.8      |
| 512                    | 4       | reuse ×5 | 195.851  | 211.817     | 121.151   | 467.1     | 422.5        | 284.5      |

Range sums validate every worker's result against an independent arithmetic-series formula. Every task receives the full common array and reads its own range. Copying only each compact range would be a different, potentially cheaper transfer strategy; this workload demonstrates shared transport, not the optimal range-sum algorithm. Matrix B is genuinely needed by every row task.

At four workers, the 16 MiB reuse run recorded 63.262 / 35.254 / 12.019 ms for clone / transfer / shared, including one shared preparation amortized over five executions. The shared execution-only median was 7.408 ms; it would be misleading to call that the full workload cost. One-worker one-shot sharing took 20.556 ms versus clone's 13.886 ms, showing that construction can outweigh transport savings.

At 512×512 and four workers, reusable shared B measured 121.151 ms versus 195.851 ms clone and 211.817 ms transfer. However, one-shot sharing measured 269.910 ms versus transfer's 225.332 ms. Matrix kernel CPU consumption and host conditions also vary between processes; the complete time difference cannot be attributed solely to avoided B copies. These are local observations, not a universal shared-mode speedup.

### Existing transport and matrix suites

The original round-trip methodology remains: returned buffers are reused equally, allocation is excluded equally, five warmups and twenty samples per mode, alternating mode order. RSS in this transport probe uses endpoints, not peak sampling. [Raw transport report](../benchmarks/results/transfer-v0.3.json).

| Bytes (0 = scalar) | Clone ms | Transfer ms |
| ------------------ | -------- | ----------- |
| 0                  | 0.204    | 0.197       |
| 1024               | 0.204    | 0.288       |
| 1048576            | 3.813    | 0.699       |
| 8388608            | 9.232    | 0.655       |

The 8 MiB round trip measured 9.232 ms clone versus 0.655 ms transfer; the 1 KiB transfer case was slower. Existing transfer ownership remains useful independently of sharing.

The unchanged matrix workload ran at 128, 256 and 512 in all legacy modes. All elements passed the independent oracle. Separate raw reports preserve [ordinary matrix](../benchmarks/results/matrix-v0.3.json), [clone comparison](../benchmarks/results/matrix-clone-v0.3.json) and [transfer comparison](../benchmarks/results/matrix-transfer-v0.3.json). Their separate serial controls expose phase drift; no direct historical Windows-to-Linux speedup is claimed.

## Piscina comparison

Exact Piscina **5.3.2**, fixed minThreads=maxThreads, concurrency one, maxQueue 1024, default synchronous Atomics. Both libraries use the same kernel and message contents, required preparation costs, warmups and samples. CPU is N=1,000,000 with 32 chunks. Both pool adapters use small startup probes; startup is recorded but is not an equivalent readiness ranking. Cancellation and failure recovery differ and are not compared. [Raw Piscina comparison](../benchmarks/results/piscina-v0.3.json).

| CPU workers | PJS ms  | Piscina ms |
| ----------- | ------- | ---------- |
| 1           | 301.092 | 298.973    |
| 2           | 217.957 | 161.030    |
| 4           | 140.646 | 181.678    |

| Workers | Iterations | 16 MiB mode | PJS ms | Piscina ms | PJS RSS MiB | Piscina RSS MiB |
| ------- | ---------- | ----------- | ------ | ---------- | ----------- | --------------- |
| 1       | 1          | clone       | 47.993 | 81.677     | 212.2       | 209.7           |
| 1       | 1          | transfer    | 34.047 | 21.334     | 180.9       | 181.2           |
| 1       | 1          | shared      | 23.746 | 19.816     | 212.2       | 212.2           |
| 1       | 5          | clone       | 36.729 | 32.693     | 245.5       | 262.0           |
| 1       | 5          | transfer    | 15.122 | 16.440     | 214.6       | 230.8           |
| 1       | 5          | shared      | 8.031  | 8.699      | 213.4       | 196.6           |
| 2       | 1          | clone       | 57.198 | 62.019     | 305.3       | 316.7           |
| 2       | 1          | transfer    | 40.254 | 34.799     | 257.1       | 289.2           |
| 2       | 1          | shared      | 18.762 | 21.067     | 224.4       | 224.1           |
| 2       | 5          | clone       | 54.670 | 58.648     | 322.2       | 418.2           |
| 2       | 5          | transfer    | 21.285 | 27.199     | 290.2       | 371.6           |
| 2       | 5          | shared      | 11.366 | 8.115      | 224.2       | 224.5           |
| 4       | 1          | clone       | 86.976 | 199.170    | 441.3       | 446.4           |
| 4       | 1          | transfer    | 59.320 | 72.851     | 378.0       | 457.8           |
| 4       | 1          | shared      | 20.048 | 18.898     | 247.4       | 246.9           |
| 4       | 5          | clone       | 61.090 | 148.119    | 552.1       | 762.0           |
| 4       | 5          | transfer    | 31.878 | 31.270     | 504.3       | 617.5           |
| 4       | 5          | shared      | 6.999  | 7.373      | 247.4       | 247.3           |

Piscina won the two-worker CPU row (161.030 versus 217.957 ms), while PJS won the four-worker row (140.646 versus 181.678 ms); the one-worker row was close. Piscina also won several transfer and shared cases, including two-worker shared reuse (8.115 versus 11.366 ms). Four-worker shared reuse was close: PJS 6.999 ms and Piscina 7.373 ms. Large clone differences and variation between the standalone PJS shared suite and these PJS rows warrant repeat sessions, not a general ranking. Both libraries benefit from native shared input. PJS is not established as better or faster than Piscina.

## Memory findings

Known buffer budgets establish the architectural difference independently of RSS. At 512×512, B is 2 MiB. Four transfer tasks prepare 8 MiB of B per iteration; shared mode prepares one 2 MiB B per session. Both still prepare 2 MiB of A per iteration, produce 2 MiB of private output and allocate 2 MiB for assembly. Original A/B stay live in every strategy. The new five-iteration matrix harness retains 20 MiB of result and assembled backing storage before validation, equally across modes.

For the 16 MiB input and four tasks, transfer prepares 64 MiB of common-input copies per iteration (320 MiB over five), while shared prepares 16 MiB once per session. Clone transmits the same logical 64 MiB each iteration. These are allocated/copied backing-byte totals, not concurrent live-memory bounds; task completion and GC can release storage at different times.

In the standalone four-worker reuse runs, peak sampled RSS was 568.6 / 457.4 / 248.1 MiB for clone / transfer / shared range sums, and 467.1 / 422.5 / 284.5 MiB for the 512 matrix. This supports the hypothesis of lower memory pressure for these reuse configurations. It does not establish an exact physical saving per worker. One-worker shared one-shot RSS exceeded clone, and the two-worker reused matrix had nearly equal shared/transfer RSS. Allocation history, live outputs and sample timing remain material.

## CPU observations and regression investigation

The first local comparison used committed v0.2 `a2c784d` with the same Node/compiler and machine. [Local v0.2 samples](../benchmarks/results/cpu-v0.2-local.json) and [v0.3 samples](../benchmarks/results/cpu-v0.3.json) preserve the full runs. The historic v0.2 artifact was not replaced.

| Workers | N       | Local v0.2 ms | v0.3 ms  | Change |
| ------- | ------- | ------------- | -------- | ------ |
| serial  | 100000  | 10.863        | 10.874   | +0.1%  |
| serial  | 1000000 | 276.976       | 280.231  | +1.2%  |
| serial  | 5000000 | 1919.681      | 2745.161 | +43.0% |
| 1       | 100000  | 16.901        | 31.173   | +84.4% |
| 1       | 1000000 | 295.583       | 574.878  | +94.5% |
| 1       | 5000000 | 2774.673      | 3781.552 | +36.3% |
| 2       | 100000  | 16.077        | 15.048   | -6.4%  |
| 2       | 1000000 | 153.060       | 155.554  | +1.6%  |
| 2       | 5000000 | 1423.176      | 1422.337 | -0.1%  |
| 4       | 100000  | 23.347        | 13.497   | -42.2% |
| 4       | 1000000 | 123.791       | 92.074   | -25.6% |
| 4       | 5000000 | 964.009       | 970.114  | +0.6%  |

The initial one-worker N=1,000,000 median rose from 295.583 to 574.878 ms, while serial N=5,000,000 rose 43%. The identical serial kernel in the baseline itself drifted from approximately 1883 to 2777 ms across its samples. Two-worker N=5,000,000 stayed essentially unchanged, and four-worker results were close or faster. Process CPU time drifted too, so this cannot be explained purely as additional waiting. Frequency, thermal and JIT effects were not individually measured. The unchanged emitted execution path and drifting serial controls motivate an alternating follow-up rather than blaming or dismissing the change.

The follow-up used baseline/candidate/candidate/baseline order, fresh processes, one warmup and three timed samples per process: six samples per version/size/count. [All control samples, scalar probes and host snapshots](../benchmarks/results/cpu-regression-v0.3.json).

| Workers | N       | v0.2 control ms | v0.3 control ms | Change |
| ------- | ------- | --------------- | --------------- | ------ |
| serial  | 100000  | 11.125          | 10.957          | -1.5%  |
| serial  | 1000000 | 276.080         | 276.354         | +0.1%  |
| serial  | 5000000 | 2733.705        | 2755.527        | +0.8%  |
| 1       | 100000  | 20.450          | 19.458          | -4.9%  |
| 1       | 1000000 | 304.322         | 310.509         | +2.0%  |
| 1       | 5000000 | 2880.581        | 2814.750        | -2.3%  |
| 4       | 100000  | 17.346          | 22.780          | +31.3% |
| 4       | 1000000 | 151.971         | 181.219         | +19.2% |
| 4       | 5000000 | 1087.747        | 818.428         | -24.8% |

The initial large one-worker slowdown did **not** reproduce: the N=1,000,000 control difference was +2.0%, and N=5,000,000 was -2.3%. Serial controls were within 1%. Four-worker small/medium CPU medians were +31.3%/+19.2%, reversing the initial run's -42.2%/-25.6%; the largest case was -24.8%. The baseline's four-worker 100,000 samples themselves ranged from 8.3 to 25.2 ms. These overlapping, reversing outcomes are evidence of unstable measurement conditions, not a consistent ordinary-path regression. The unchanged emitted runtime path further limits any causal attribution to the helper.

The 200 scalar probe observations per version/count provide a closer ordinary small-message control: one-worker medians were 0.1253 ms baseline / 0.1308 ms candidate; four-worker medians were 0.2088 / 0.1471 ms. No consistent dispatch regression was reproduced. This is not proof of zero overhead or a tight performance bound: smaller effects require controlled, repeated sessions. All slower rows remain in the report.

## Unexpected findings and remaining bottlenecks

- Shared construction lost to clone for one-worker one-shot range sums; SAB is not free and not a universal replacement for clone.
- The 512 matrix shared one-shot row lost at four workers, while its reuse row won. The size of that reversal exceeds a simple B-copy explanation; host/JIT/GC variation needs controlled profiling before attribution.
- More workers did not always help the light shared scan: the standalone two-worker reused scan beat four workers. Memory bandwidth, dispatch granularity and host contention can dominate; these measurements do not separate them.
- Shared/transfer matrix RSS was nearly equal in one reused two-worker configuration. Logical allocation savings do not imply a fixed RSS difference.
- Worker startup and isolate overhead remain; helper construction, A slicing, independent output transport/assembly and metadata dispatch remain. The matrix arithmetic still dominates many cases.
- Sequential CPU phase drift was large enough to require the alternating control. No compiler, scheduler or general Piscina performance advantage is inferred.

## Open questions

Measure on additional CPUs and supported Node 22/24 hosts, with repeated interleaved sessions and stable power/load conditions. Profile allocation/GC and hardware memory bandwidth before explaining the full time ratios. Test longer-lived input reuse, uneven chunk sizes and kernels with genuinely irregular common-data access. Memory budgets, explicit revocation and stronger immutability enforcement remain separate design problems; there is currently no evidence requiring a resource registry. AsyncResource diagnostics and cooperative cancellation remain future work, independent of SAB construction.

## Recommended v0.4

Proceed to **runtime-owned partitioning** as the next design milestone. The structural elimination of per-worker B copies and observed reuse memory improvements justify keeping shared inputs. A partitioner can attach the same native shared view to each generated range while owning chunk generation, result ordering and bounded child admission. It must preserve cancellation occupancy and avoid parent/child capacity deadlock; choose grain sizes from evidence and compare compact transferable partitions where possible.

Start with bounded range partitioning over the existing FIFO and trusted module tasks. Define error propagation and ordering before committing public parallel.for/map APIs. Do not add work stealing, resource registries, synchronization libraries, NUMA/affinity or dynamic worker populations to explain these measurements. No v0.4 implementation is included here.
