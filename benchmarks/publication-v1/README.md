# PJS 1.0 publication benchmark

This is a separate public-package comparison campaign. The RC2 flagship source,
frozen campaign and results, and the development benchmark-health campaign are
preserved. Read [SPEC.md](SPEC.md) for the frozen matrix and decision rules.

The campaign includes a runnable harness and labelled correctness smoke
artifacts. The managed Windows execution has unverified background activity,
thermals and effective CPU quotas; it cannot support publication speed claims.
The committed PNG/SVG files are visibly marked **SMOKE ONLY**. A quiet local run
using the command below produces the actual publication report and graphics.

## Reproduce

Use exactly **Node 24.22.1**, Python 3.11, Git, npm, and network access to the npm
registry. No root `npm install`, build, release qualification or runtime edits
are needed. Plot dependencies are independent of the JavaScript workspace:

```sh
python -m venv .node-tools/publication-plot-venv
# Linux/macOS:
.node-tools/publication-plot-venv/bin/python -m pip install -r benchmarks/publication-v1/requirements.txt
# Windows:
.node-tools/publication-plot-venv/Scripts/python.exe -m pip install -r benchmarks/publication-v1/requirements.txt
```

After selecting Node 24.22.1 on a quiet local host, run this **one command**
(choose the matching Python path on Linux/macOS):

```sh
node benchmarks/publication-v1/campaign.mjs --profile=publication --output=.node-tools/publication-local-01 --python=.node-tools/publication-plot-venv/Scripts/python.exe --host-note="Quiet local host; record actual power, background and thermal observations here"
```

Replace the host-note text with actual observations. This is metadata, not a
system-setting change. Keep the source checkout clean and committed. If npm is
not next to the selected Node executable, add `--npm-cli=/absolute/npm-cli.js`.
The runner records the exact npm version and CLI digest; it never changes npm
globally. Each output directory must be new. A repeated campaign gets a new name;
never selectively rerun a cell or overwrite raw evidence.

That command verifies plotting prerequisites, runs the functional fixtures,
installs/checks all six contenders in a fresh external consumer, executes the
reduced smoke first, then runs ten fresh-process trials per frozen full cell,
analyzes all results, and generates both PNG and SVG chart pairs. At p=4 the
publication stage contains 780 child trials; every trial retains cold execution,
two warmups, one warm sample and cleanup. It does not run release checks.

For correctness/cleanup only, use the same command with `--profile=smoke` and
a new output directory. A smoke run has one trial per reduced cell. Its plots
are watermarked automatically; sample counts and intervals cannot be mistaken
for ten-trial performance evidence.

Individual steps, with existing plot prerequisites and selected Node:

```sh
node --test --test-timeout=20000 benchmarks/publication-v1/harness.test.mjs
node benchmarks/publication-v1/run.mjs --profile=smoke --output=.node-tools/publication-smoke-01
node benchmarks/publication-v1/analyze.mjs .node-tools/publication-smoke-01 .node-tools/publication-analysis-01
python benchmarks/publication-v1/plot.py .node-tools/publication-analysis-01/summary.json .node-tools/publication-graphics-01
```

## Evidence and outputs

The campaign retains `freeze.json` (complete pre-run plan/source/environment),
registry availability/engine/integrity receipts, exact install lock digest and
installed-file hashes, external consumer path, deterministic reference outputs,
every child's config/result/process receipt, all cold/warmup/measured data,
failures/timeouts, and an append-only `raw.jsonl`. `manifest.json` covers every
retained raw file. Analysis verifies those hashes and reconciles records against
the complete planned matrix before calculating statistics.

`analysis/REPORT.md`, `summary.json` and `results.csv` include all primary,
batching and scaling cells, preparation, cold latency, variability, timer sample
counts and observational whole-process RSS. `graphics/throughput.{png,svg}` and
`responsiveness.{png,svg}` show every primary/batching case; scaling is in the
table. `plot-manifest.json` records input/chart digests and plotting versions.
The full campaign has a final recursive manifest as well.

Source and package identities are distinct: repository SHA identifies the
**harness**, while registry URL/integrity and resolved host/worker entries identify
the **executed packages**. An unchanged runtime tree does not make this a
workspace-runtime benchmark.

Committed example evidence and reproduction receipts are described in
[EVIDENCE.md](EVIDENCE.md). Large raw archives, if separated from Git, must have
a committed size/hash/access manifest. No runtime defect should be silently
fixed as part of this benchmark: retain its reproduction and failure receipt.

## Source references

- [PJS 1.0.0 registry metadata](https://registry.npmjs.org/@pjavascript%2fruntime/1.0.0)
- [Piscina 5.3.2 registry metadata](https://registry.npmjs.org/piscina/5.3.2)
- [Tinypool 2.2.0 registry metadata](https://registry.npmjs.org/tinypool/2.2.0)
- [workerpool 10.0.3 registry metadata](https://registry.npmjs.org/workerpool/10.0.3)
- [Piscina public options/transfer documentation](https://github.com/piscinajs/piscina/tree/v5.3.2)
- [Tinypool public runtime/API documentation](https://github.com/tinylibs/tinypool/tree/v2.2.0)
- [workerpool registered workers/transfers](https://github.com/josdejong/workerpool/tree/v10.0.3)

Installed README/type declarations from the locked packages were also inspected
for adapter API choices. There is no throughput-based feature or reliability
assessment in this report.
