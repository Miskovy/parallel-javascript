# v0.4 partition study

Build an isolated committed v0.3 baseline with the same compiler. The archived
runtime must resolve its own `@pjs/runtime` package. For this report the baseline
is commit `f6cd689` (v0.3 shared input). From the repository root on Linux:

```sh
mkdir -p /tmp/pjs-v03-partition-baseline
git archive f6cd689 | tar -x -C /tmp/pjs-v03-partition-baseline
mkdir -p /tmp/pjs-v03-partition-baseline/node_modules/@pjs
ln -s "$PWD/node_modules/@types" /tmp/pjs-v03-partition-baseline/node_modules/@types
ln -s /tmp/pjs-v03-partition-baseline/packages/runtime /tmp/pjs-v03-partition-baseline/node_modules/@pjs/runtime
./node_modules/.bin/tsc -p /tmp/pjs-v03-partition-baseline/packages/runtime/tsconfig.json
PJS_V03_RUNTIME=/tmp/pjs-v03-partition-baseline/packages/runtime/dist/index.js npm run benchmark:partition
```

Use a fresh temporary directory if those links already exist. No dependencies
are downloaded for the baseline. `PJS_V03_RUNTIME` selects the host and worker
transfer-envelope module together, preserving archived bootstrap recognition.
The baseline identifier in the report describes this commit; if using another
revision, update the recorded identifier as well.

`npm run benchmark:partition -- range` (or `matrix`, `skew`, `dispatch`) runs
one suite. Defaults: first run, two warmups, five retained trials per fresh
process/configuration. `PJS_BENCH_TRIALS` and `PJS_BENCH_WARMUPS` override counts.
All configurations run sequentially; do not run tests/other benchmarks alongside
the study. Raw outputs are `*-partition-v0.4.json` in `benchmarks/results`.

Workers: 1, 2, 4 and availableParallelism, deduplicated and capped to available
hardware. Grain is `ceil(size / (workers * factor))` for factors 1/2/4/8/32.
Actual grain and chunk count are recorded (rounding may shorten the final chunk).
Each engine uses a workers-sized unsettled window and `maxQueue=workers`.
v0.3 PJS and Piscina 5.3.2 use a bounded manual producer with only workers-sized
producer promises; v0.4 uses the runtime-owned parent. Successful-work semantics
are matched, not cancellation or failure behavior. Engine order rotates.

| Workload | Input and output                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Range    | 16 MiB Float64 input; full clone, common reusable shared input, or compact transferred disjoint slices; scalar outputs |
| Matrix   | 512×512 signed-integer Float64; shared B, compact transferred A rows, transferred output blocks, timed assembly        |
| Skew     | 4096 indices; inner-loop steps `(i + 1) * 16`, increasing cost; cloned metadata and scalar outputs                     |
| Dispatch | No-op over 4096 logical indices; cloned metadata and small diagnostics                                                 |

The same kernels and payloads serve all engines. A startup SAB barrier ensures
every worker has imported the task; startup is separate and is not ranked.
Original input generation and independent arithmetic/matrix reference validation
are excluded equally. Shared input is copied **once per configuration**, with
`preparationMs` recorded separately. These are warm reuse timings, not one-shot
end-to-end shared-construction comparisons. Each wall sample includes lazy
factories, required slicing/copying, dispatch, kernel, messaging, collection and
matrix assembly. Every output from first runs, warmups and trials is validated.

Raw samples record process CPU (100% is one logical CPU), normalized machine CPU,
5 ms sampled RSS plus endpoints, factory preparation, tasks and latency means.
PJS queue and execution means use before/after cumulative-count deltas, excluding
probes and other samples. Piscina fields are null where boundaries differ.
Uniform cross-engine `averageDispatchToKernelMs` measures payload-ready to worker
kernel start, including serialization/transport; it is **not pure queue time**.
Kernel diagnostics exclude adapter envelope handling and returned-output posting.

`workerKernelMs` includes every probed thread, even if it did no timed work.
`kernelWallOccupancy` is summed kernel wall intervals / (workers × operation
wall); preemption and pauses occur inside those intervals. It is an approximate
load-balance diagnostic, not precise idle or CPU time. The no-op suite's wall per
chunk estimates amortized coordination/transport overhead, not isolated dispatch
CPU. Diagnostic timestamps add overhead to all engines, particularly tiny tasks.

RSS is process-wide, includes isolates/JIT/GC/retained allocations, and can miss
brief peaks. Numeric allocation budgets are logical bytes, not exact physical
savings. Clone input bytes grow with chunk count; compact transfers copy and
move only one source's worth per operation. Shared backing bytes do not grow
with grains. Output arrays remain proportional to results in all engines.

The ordinary CPU regression control is separate:
`node benchmarks/cpu-baseline/compare.mjs /tmp/pjs-v03-partition-baseline`.
It interleaves archived/current/current/archived runs, retaining six trials per
version/size/worker count, and writes `cpu-regression-v0.4.json`.
