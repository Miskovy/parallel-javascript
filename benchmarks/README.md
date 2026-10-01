# Benchmark methodology

## Exact-reference v0.11 platform validation

The portable campaign runner is `scripts/cross-platform-v011/run.mjs`.
It extracts commit `716e86d48987ae838c421ff22ade2b7a469e8242`, installs the
lockfile with `npm ci`, validates each supplied existing Node executable, and
uses fresh processes in balanced Node 22/24 order. It records source hashes,
machine/power/load context, correctness, invariant/stress/soak output, CPU
worker sweeps, established v0.11 cases and controlled binary mode sweeps.
It never changes Node installations or historical repository evidence.

Use `node scripts/cross-platform-v011/run.mjs --help` for executable-path
options. New campaign JSON and adjacent metadata go to `benchmarks/results/`;
existing campaign filenames are refused. For another session use `--output`
with a new directory. Only supply runtimes already installed on the machine.
The Windows and Fedora machines can run independently. Aggregate their original
campaign JSON with `scripts/cross-platform-v011/report.mjs`.
See [the campaign report and platform workflows](../docs/cross-platform-v0.11.md).

Run `npm run benchmark:cpu`, `npm run benchmark:matrix`, and `npm run benchmark:transfer` separately on an otherwise idle machine. Each runner builds first. Each worker count runs in a fresh child process; the pool is reused across sizes. Serial is measured first, followed by descending worker counts. This is a reproducible baseline, not a randomized multi-session statistical study. Background load, power policy, clock/thermal changes, JIT, GC, and ordering can affect results.

Configurations: serial, PJS 1/2/4 workers, and availableParallelism, filtered to available hardware concurrency. Duplicate worker counts run once, with the actual machine count recorded. All timings are retained. Each size has a first-run sample, two untimed warmups, then five timed samples. Startup is measured once per configuration; only the first size follows that fresh startup. No startup cost is folded into warm-pool speedup. For a cold scenario, inspect startup plus the first size's first-run cost. No forced GC or discarded outliers.

`PJS_BENCH_SIZES` (comma-separated), `PJS_BENCH_TRIALS`, and `PJS_BENCH_WARMUPS` override workload defaults. Current reports are written to `results/cpu-v0.5.json` and `results/matrix-v0.5.json`; subsequent invocations overwrite only those current reports. `PJS_BENCH_OUTPUT` can choose an alternate safe filename for CPU/matrix runs. Existing v0.1–v0.4 artifacts are preserved.

CPU: trial-division prime search over [0, N), partitioned into a fixed 32 contiguous chunks independent of worker count. The serial reference runs the same kernel monolithically. A separate serial-with-32-chunks control exposes chunking/JIT differences; it runs after each monolithic size's samples, so it is diagnostic and can further warm the main isolate for subsequent sizes. Correctness uses an independent sieve. Results include exact count and observed thread IDs. Small inputs can be slower under PJS. `cpu-initial.json` retains the preliminary run before the independent sieve and chunked-serial diagnostic were added; it is not the final comparison.

Matrix: dense square Float64 multiplication, i-k-j traversal in both serial and worker code. PJS uses one row block per worker (fewer only when rows < workers). Inputs are deterministic signed integers, keeping tested arithmetic exact. An independent i-j-k oracle validates every output element outside timing. Timed work includes left-row slicing, repeated structured cloning of the right matrix, scheduling, kernel execution, output cloning, and assembly. Input generation/oracle work is excluded. Right-matrix replication grows with worker count and is deliberately visible in the report.

Each sample records wall time, process CPU time, process-wide RSS before/after, and RSS sampled every 5 ms plus endpoints. RSS includes all worker isolates; it is not summed from per-thread RSS. Sampling can miss brief peaks and a serial blocking loop prevents intermediate samples. CPU percentage treats 100% as one logical CPU, so multithreaded values can exceed 100%; normalized machine percentage divides by availableParallelism. Short Windows CPU samples can be coarse. Measurements include harness/messaging overhead. No hardware cache/bandwidth or event-loop-latency counters are collected.

Reports also retain worker startup/shutdown, real runtime stats, 100 warmed scalar round-trip samples, and ten warmed 8 MiB clone round trips. Probes run after workloads and are diagnostics, not subtractions from wall time. Execution means in stats cover the whole configuration, including probes; use caution when interpreting them as workload-specific.

Speedup = median serial wall time / median parallel wall time. Efficiency = speedup / worker count. The denominator uses logical worker count, not physical core count. Superlinear-looking ratios can reflect JIT, cache, chunking, or noise and are not evidence that the scheduler creates extra compute capacity. Amdahl's sequential fraction, messaging, data movement, bandwidth, and CPU topology limit scaling. The separate v0.3 runner below adds a pinned Piscina comparison.

## v0.2 transfer comparison

The original v0.2 `npm run benchmark:transfer` first ran one-worker round-trip probes, then full clone and transfer matrix suites sequentially. Reports: `transfer-v0.2.json`, `matrix-clone-v0.2.json`, and `matrix-transfer-v0.2.json`. The matrix environment overrides apply to both modes. Probe sizes and repetition counts are fixed: scalar, 1 KiB, 1 MiB, and 8 MiB; five warmups and twenty recorded samples per mode. Probe mode order alternates each iteration, and both modes reuse the returned buffer. Allocation and full-byte validation are outside timing in both modes. RSS for probes uses endpoints only and is not a peak measurement. Scalar rows use identical no-transfer operations, so differences there are noise/warmup effects.

Matrix transfer uses exactly the same kernel and independent correctness oracle as clone mode. Its compact left row blocks and dedicated right-matrix copies are allocated inside timing. Both input buffers and the output buffer are transferred. The original right matrix stays available for other workers and trials. Reports distinguish preparation-copy bytes, cloned input bytes, transferred input bytes, and transferred output bytes. Transfer moves ownership; it does not remove the copies needed for multi-worker reuse. No shared-memory optimization is mixed into this comparison.

Each matrix mode obtains its own serial baseline in fresh processes. The complete clone phase precedes transfer, so thermal/background drift can affect a direct mode ratio. Compare raw serial observations and retained outliers before attributing differences to transfer. The targeted probes isolate transport more closely than the full matrix workload. These measurements do not measure compiler performance or imply that the TypeScript 7 upgrade speeds up CPU tasks.

## v0.3 shared-input comparison

The v0.3 run wrote `transfer-v0.3.json`, `matrix-clone-v0.3.json` and `matrix-transfer-v0.3.json`. Current runners write corresponding v0.5 filenames and preserve all historical artifacts. Shared/matrix-shared/Piscina runners also now target v0.5 filenames.

- `npm run benchmark:shared`: a 16 MiB Float64 array, disjoint sums, full common input per task, small independent outputs.
- `npm run benchmark:matrix:shared`: existing matrix kernel at sizes 128 and 512, clone/transfer/shared, full independent reference validation. Shared B is constructed once per sample session; A row blocks and outputs transfer independently.
- `npm run benchmark:piscina`: PJS and exact Piscina 5.3.2; same prime-search kernel (32 chunks, N=1,000,000) and 16 MiB range-sum input in all three memory modes.

Each configuration has a fresh process, fixed worker count, one first-run sample, two warmups and five retained samples. Modes rotate with worker count; engine order alternates between configurations. Actual configuration order is retained in JSON. Trials/warmups accept the existing environment overrides; sizes are fixed in the new runner for reproducibility. No benchmark suites should run concurrently.

Every one-shot sample includes shared construction or required transfer copies, dispatch, compute, result transport and matrix assembly. Five-iteration reuse sessions prepare shared storage once inside the sample. `wallMs` includes this preparation, `amortizedMsPerIteration` divides full session cost by five, and `executionMsPerIteration` excludes the separately recorded one-time shared preparation. Clone/transfer still prepare each dispatch because receivers do not cache common input. Original input generation and all independent oracle checks are excluded equally.

Shared mode and transfer mode both transfer independent matrix A blocks and outputs; clone mode clones both. Thus clone-to-shared matrix ratios include output transport differences; transfer-to-shared isolates removal of replicated B preparation more closely. New matrix sessions retain row outputs and assembled matrices until validation, including all five iterations; this differs from the older harness and affects RSS. Do not compare RSS across harnesses as an isolated sharing effect.

Known source, shared, temporary preparation, clone/transfer input and output/assembly byte budgets accompany every configuration. These count numeric backing bytes, not arbitrary serialized object sizes. RSS uses 5 ms sampling plus endpoints; synchronous allocation can hide peaks. No forced GC or baseline subtraction; raw RSS reflects JIT, GC, retained buffers, isolates and allocator history. It cannot establish exact physical-memory savings.

For range sums, every task receives the full source to model common reference data. A transfer of only a compact disjoint range is a valid different workload and could be cheaper. Matrix B reuse is the stronger demonstration of genuinely common reference data.

Piscina uses minThreads=maxThreads, concurrentTasksPerWorker=1, maxQueue=1024 and its default synchronous Atomics path. Both pools dispatch small CPU probes before timing, so startup includes imports/probes and is not a readiness ranking. All outputs use matching semantics. This baseline does not compare cancellation, instrumentation, failure behavior, fairness or all Piscina features. Raw reports: `shared-v0.3.json`, `matrix-shared-v0.3.json`, `piscina-v0.3.json`. See [interpretation](../docs/benchmarks-v0.3.md).

### Same-machine CPU regression control

Historical v0.2 artifacts were recorded on another OS/CPU. For the v0.3 check, a temporary checkout of commit `a2c784d` was built with the same installed compiler. Its runtime source and kernels were unchanged; only the first comparison's launcher output name, worker-count filter and child-close collection were aligned. `cpu-v0.2-local.json` preserves that full run beside `cpu-v0.3.json`.

To investigate visible phase drift, run `node benchmarks/cpu-baseline/compare.mjs /path/to/built-v0.2-checkout`. Both checkouts must resolve their own `@pjs/runtime` package and dependencies. The control calls their original `benchmarks/measure.mjs` with identical configuration, in baseline/candidate/candidate/baseline order at serial, one worker and up to four workers. Each run records one first execution, one warmup and three samples per size; six timed observations per version/size/count are retained. CPU count, host load and reported frequency snapshots accompany the raw data in `cpu-regression-v0.3.json`. These observations diagnose drift; they do not replace a controlled multi-machine performance study.

## v0.4 runtime-owned partitioning

See the [reproduction instructions and metric definitions](partitioning/README.md) and [measurement report](../docs/benchmarks-v0.4.md). The new runner compares archived v0.3 manual production, v0.4 runtime-owned ranges and bounded manual Piscina 5.3.2 across five grain sizes. Range input compares full clone, reused shared backing and compact transfers; matrix uses shared B and transferred A/outputs. Increasing-cost skew and no-op control expose balance and dispatch tradeoffs. Raw results use `*-partition-v0.4.json`. The CPU comparison runner now writes `cpu-regression-v0.4.json`; its supplied checkout determines the baseline version.

## v0.5 dispatch efficiency

Run `npm run benchmark:dispatch` for the retained no-op, shared-scan, matrix,
increasing-cost skew, fixed-width skew, output-retention, Piscina, CPU/RSS and
event-loop sweep. See the dedicated [methodology](dispatch-efficiency/README.md)
and [report](../docs/benchmarks-v0.5.md). Raw samples are in
`results/dispatch-efficiency-v0.5.json`; profiling and fairness use separate
v0.5 artifacts. The key no-op endpoint repeats in fresh processes using
manual/batched balanced order. No historical result is overwritten.

`node benchmarks/dispatch-efficiency/profile.mjs` runs disabled/enabled internal
profiling in off/on/on/off process order and retains host microbenchmarks.
`node benchmarks/dispatch-efficiency/fairness.mjs` competes two range parents
with a continuous bounded ordinary producer at batch sizes 1, 4 and 8.

For the ordinary-task regression control, build archived commit `1f3e647` in an
isolated directory and run
`node benchmarks/cpu-baseline/compare.mjs /path/to/built-v0.4`. The runner uses
baseline/candidate/candidate/baseline order and writes
`cpu-regression-v0.5.json`.

## v0.6 completion-only ranges

Run `npm run benchmark:completion` for collecting/completion comparisons,
32 MiB output retention, disjoint shared vector and matrix output, CPU controls,
event-loop measurements, a bounded Piscina completion harness, AsyncResource
micro-controls, and mixed completion/collecting/ordinary fairness. See the
[dedicated methodology](completion-only/README.md) and
[measurement report](../docs/benchmarks-v0.6.md). Raw samples are retained in
`results/completion-only-v0.6.json` and
`results/completion-fairness-v0.6.json`; historical artifacts are unchanged.

## v0.7 bounded result streams

Run `npm run benchmark:stream` for fresh-process 32 Ã— 1 MiB collection,
completion, and fast/slow stream measurements; capacities 1/4/8; slow-first
completion-order versus userland ordered delivery; stream-plus-collect versus
`partitionRange()`; disjoint shared output; and bounded Piscina 5.3.2 manual
collect/incremental/completion controls. See the
[dedicated methodology](streaming/README.md) and
[measurement report](../docs/benchmarks-v0.7.md).

The runner records first and last result latency, wall/CPU time, sampled RSS,
logical buffer occupancy, physical messages, event-loop delay/utilization, and
timer drift. One warmup and three retained trials run per configuration with no
outlier deletion or forced GC. `node benchmarks/streaming/fairness.mjs` records
mixed slow/fast streams, ordinary `run()`, and `parallelFor()`.

For the causal control, build committed v0.6 (`988ac16`) separately and run
`node benchmarks/streaming/regression.mjs /path/to/built-v0.6`. It uses
baseline/candidate/candidate/baseline process order for ordinary clone,
transfer, shared, partition, and completion paths. Raw v0.7 files are
`result-streaming-v0.7.json`, `stream-fairness-v0.7.json`, and
`runtime-regression-v0.7.json`; historical artifacts are unchanged.

## v0.8 element-block mapping and result memory

Run `npm run benchmark:map` for serial, generic and typed
`parallelMapRange()`, clone/transfer, `partitionRange()` plus assembly,
completion-order stream collect/discard, disjoint shared output, generic object
mapping, and bounded Piscina 5.3.2 controls. It also runs a realistic transferred
binary pipeline at result capacities 1/4/8 and a mixed map/stream/
`parallelFor()`/ordinary fairness suite. See the
[dedicated methodology](mapping/README.md) and
[measurement report](../docs/benchmarks-v0.8.md).

Each main configuration runs in a fresh process with one warmup, three retained
trials, no outlier removal, and no forced GC. The harness retains wall/CPU time,
sampled RSS and busy-worker occupancy, first-result and assembly time, logical
results, known output bytes, physical messages, event-loop delay/utilization,
and timer drift. A 4,096-result
stream control tests capacities 8/64/256 before changing the internal buffer
data structure.

`node benchmarks/mapping/regression.mjs /path/to/built/control` compares two
built trees in baseline/candidate/candidate/baseline order. The retained v0.8
artifact uses an isolated same-source build with only stream payload-byte
accounting disabled because no separately committed v0.7 tree exists. It is a
causal diagnostics-overhead control, not a full historical version comparison.
Raw files are `element-map-v0.8.json`, `map-pipeline-v0.8.json`,
`map-fairness-v0.8.json`, and `runtime-regression-v0.8.json`; all historical
artifacts remain unchanged.

## v0.9 strict binary-result credits

Run `npm run benchmark:binary` for fixed and variable direct-binary streams,
count-versus-byte capacity, clone/transfer, fast/slow realistic consumers,
object-stream and typed-map controls, a Piscina 5.3.2 manual semaphore, and
mixed fairness. See the [dedicated methodology](binary-results/README.md) and
[measurement report](../docs/benchmarks-v0.9.md).

The main runner uses fresh processes, one warmup and three retained trials per
configuration. Raw results are `binary-results-v0.9.json` and
`binary-fairness-v0.9.json`. Build committed v0.8 separately and pass its root
to `node benchmarks/binary-results/regression.mjs` for established-API controls
in v0.8/v0.9/v0.9/v0.8 order; that report is
`runtime-regression-v0.9.json`. Historical artifacts remain unchanged.

## v0.10 reservation durability and cost audit

Run `npm run benchmark:reservation` for the clone/transfer size sweep and the
application pipeline, or `npm run soak:reservations` for the 30-second mixed
failure soak. `npm run soak:reservations:smoke` provides the short harness
check. See the [methodology](reservation-audit/README.md), the
[proposal](../docs/proposal-v0.10.md), and the
[measurement report](../docs/benchmarks-v0.10.md).

The retained artifacts are `reservation-performance-v0.10.json`,
`reservation-pipeline-v0.10.json`, `reservation-soak-v0.10.json`,
`reservation-soak-forced-gc-v0.10.json`, and
`runtime-regression-v0.10.json`. Build committed v0.9 separately and pass its
root to `node benchmarks/reservation-audit/regression.mjs` to reproduce the
v0.9/v0.10/v0.10/v0.9 causal control. Historical artifacts remain unchanged.

## v0.11 runtime architecture decomposition

Build committed v0.10 separately and run
`node benchmarks/runtime-architecture/compare.mjs /path/to/built-v0.10` for
the behavior-preserving decomposition control. Every workload/version pairing
runs in fresh processes with balanced ordering, sustained samples, and forced
collection only between timed samples. Set `PJS_BENCH_QUICK=1` for a smoke
run.

The matrix covers ordinary no-op, CPU, clone, transfer, and shared work plus
partition, completion-only, count-only stream, strict binary clone/transfer,
and generic/typed map paths. Raw results are
`runtime-architecture-v0.11.json`; the post-refactor mixed failure soak is
`reservation-soak-v0.11.json`. See the
[proposal](../docs/proposal-v0.11.md) and
[measurement report](../docs/benchmarks-v0.11.md). Historical artifacts remain
unchanged.

## v0.12 upper-bound result reservations and refunds

Run `npm run benchmark:upper-bound` for structural-bound RLE, slack/capacity
sweeps, fast/slow consumers, equal-size overhead, and a benchmark-only
held-maximum control. Build v0.11 separately and pass its root to
`node benchmarks/upper-bound-results/regression.mjs` for the established API
controls. The reservation soak now mixes exact and upper-bound cases and writes
`reservation-soak-v0.12.json`; historical evidence remains untouched.

See the [methodology](upper-bound-results/README.md),
[proposal](../docs/proposal-v0.12.md), and
[report](../docs/benchmarks-v0.12.md). New raw evidence is
`upper-bound-results-v0.12.json` and `runtime-regression-v0.12.json`.
