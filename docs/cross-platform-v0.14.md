# v0.14 reduced cross-platform reproduction strategy

Windows research is complete in [benchmarks-v0.14.md](benchmarks-v0.14.md).
Fedora has not been run. Do not merge prior crypto or RLE evidence into v0.14.
Keep the installed Node version, power policy and UV_THREADPOOL_SIZE unchanged;
inspect any zlib version rejected by the researched bound gate before proceeding.

The existing `reproduce` profile reduces 162 exploratory cells to 71, with two
warmups/six retained trials and 32-MiB source guards. It retains:

- High/moderate/poor 64-KiB and 1-MiB level-6 matched execution models, plus the
  tiny control, to bracket useful coarse work.
- Coarse high-data clone/transfer/shared input on PJS/raw workers.
- Real maximum refunds, count/byte controls and fast/slow consumption.
- Same-block inflate across all four models with exact PJS credits.
- Native/filesystem contention and worker-resource cases.

These are strongest relationships plus negative controls, not the full grain ×
level matrix. For an even smaller first pass, use `--filter=primary-`, then
`--filter=ownership-`, `--filter=decompression-`, `--filter=refund-` and
`--filter=contention-` with distinct filenames, according to the question being
reproduced. Do not pool overlapping filtered runs as independent trials.

```sh
npm run build
node --test benchmarks/real-world/compression/harness.test.mjs
node benchmarks/real-world/compression/bounds.mjs benchmarks/results/compression-v0.14-fedora-bounds.json
PJS_DEBUG_RESERVATION_INVARIANTS=1 node benchmarks/real-world/compression/lifecycle.mjs benchmarks/results/compression-v0.14-fedora-lifecycle.json
node benchmarks/real-world/compression/run.mjs --profile=reproduce --output=benchmarks/results/compression-v0.14-fedora-node24-reproduce.json
node benchmarks/real-world/compression/report.mjs benchmarks/results/compression-v0.14-fedora-node24-reproduce.json docs/research/v0.14-fedora-measurements.md
```

The main profile's availableParallelism worker case can be constrained by four
maximum credits. To reproduce actual worker expansion and a completely supplied
64-job queue, run the seven-cell `scripts/compression-supplement-v014.mjs` control
with a new output filename. It funds one maximum per worker and checks preflight;
do not blindly interpret an unsafe or unusually large CPU count on another host.

```sh
node scripts/compression-supplement-v014.mjs benchmarks/results/compression-v0.14-fedora-supplement.json
node scripts/compression-memory-v014.mjs benchmarks/results/compression-v0.14-fedora-fresh-memory.json
```

Fresh memory is optional for performance reproduction, required before strong
memory claims. Run timing campaigns sequentially. Every retained block must
validate; preserve all warmups/trials, skips, environment and hashes. Report
within-machine ratios, timer/FS sample counts and codec version qualifications.
Confirm the causal consumer-withheld refund relationship separately from noisy
timer-sink throughput. No ordered stream or compression package is authorized.
