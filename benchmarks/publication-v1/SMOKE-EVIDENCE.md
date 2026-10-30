# Executed evidence and comparison limits

The delivered campaign is **runnable but not a publication performance result**.
The Windows host's background activity, thermal/power stability and effective
job-object CPU quota were not verified. The retained timings are reduced
correctness smoke observations, with one measured sample per cell. They support
no winner, speed claim, practical loss or break-even inference. Use the exact
quiet-host publication command in [README.md](README.md) for ten-trial results.

## What passed

- **78/78 fresh-process smoke cells**: all six contenders across all 13 reduced
  primary, batching and scaling configurations.
- Every cell retained cold execution, **two warmups**, one warm observation,
  input preparation, timer observations and sampled whole-process RSS.
- All numerical/checksum/image-byte validations and input clone/transfer
  ownership checks passed. Intentional task rejection and subsequent recovery
  passed for every contender. All 78 children completed awaited cleanup and
  exited naturally, with **zero timeouts**.
- Host and worker probes resolved the exact consumer-installed public packages;
  no workspace package/build was executed. Registry metadata, lock integrity,
  entry realpaths/hashes and installed-file hashes are retained.
- Nine focused tests pass: historical helper preservation, independent image
  oracle, uneven numerical batching, Monte Carlo coverage, ordering/partition
  fairness, serial blocking visibility, matching analysis denominators,
  incomplete-data inference suppression, duplicate/tamper rejection.
- ESLint and Prettier pass for the added source. Generated evidence is excluded
  from formatting to preserve its manifest hashes.

The smoke timer has only **one to three observations per trial**. Its p95/max
exercise instrumentation, not a stable latency distribution. The 80ms blocking
fixture independently verifies that serial blocked time reaches the timer after
flush. One-trial variability/intervals are labelled not estimable in the report
and charts. No outlier was removed and no performance cell was selectively rerun.

## Identities

Fetched base main: `9a4d0ba857e2a22f3374f00461e9afa7268a8996`.
Clean executed harness: **`b21594e5564388c8fc85d81388aad310a3ee6491`**, tree
`1b82559c559a013854dab3b030ff71e33e0bab26`.
Execution: 30 October 2026, 09:29:11–09:29:59 UTC (11:29 Cairo).

The final report/plot pass adds incomplete-campaign inference guards and omits
meaningless one-trial error bars. Its source hashes are in
`summary.json.analysisSources` and `graphics/plot-manifest.json.scriptSha256`.
The adapter, kernel, workload configuration, specification, installation,
measurement and environment-collection sources are unchanged from the clean
executed commit; [verification.json](verification.json) records their hash reconciliation.

| Item                   | Executed identity                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Node                   | 24.22.1 win-x64; executable SHA-256 `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5` |
| npm                    | 11.19.0; CLI SHA-256 `8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7`                |
| PJS                    | `@pjavascript/runtime@1.0.0` from public npm                                                           |
| Competitors            | `piscina@5.3.2`, `tinypool@2.2.0`, `workerpool@10.0.3`, persistent raw threads, serial                 |
| Plotting               | Python 3.11; Matplotlib 3.10.3; NumPy 2.1.3                                                            |
| CPU                    | Intel Core i3-10100F at advertised 3.60GHz; observed 4 physical cores / 8 logical CPUs                 |
| Capacity               | availableParallelism=8, affinity mask 255; primary p=4; scaling p=1,2,4                                |
| Memory / OS            | 17,037,594,624 bytes RAM; Windows 10.0.19045 x64                                                       |
| Virtualization / power | HypervisorPresent=true; Gigabyte H410M S2H V3; observed Balanced power plan                            |

Exact registry SHA-512 integrities and tarball URLs are in the isolated
[lockfile](sandbox/package-lock.json), [package receipt](evidence/packages.json)
and retained registry responses. Full observations, including query commands,
are in [environment.json](evidence/environment.json). A reported power plan is
an observation; no plan, affinity or system setting was changed.

## Retained artifacts

- [Complete comparison table/report](evidence/REPORT.md),
  [machine-readable summary](evidence/summary.json), [CSV](evidence/results.csv).
- [Computation PNG](evidence/graphics/throughput.png) /
  [SVG](evidence/graphics/throughput.svg).
- [Responsiveness PNG](evidence/graphics/responsiveness.png) /
  [SVG](evidence/graphics/responsiveness.svg).
- [Raw archive](evidence/smoke-raw.zip), **1,253,558 bytes**, SHA-256
  `5d8cfd545af1a2ea60045c3d848c569ef988d74201383d7c9ac8389a1f8629b2`.
- [Archive-entry digests](evidence/archive-entries.json) cover all **529** raw
  files; [ARTIFACTS.json](evidence/ARTIFACTS.json) hashes the archive, summaries,
  environment, package receipts and graphics.

The campaign's `.gitattributes` disables newline conversion for evidence files,
so the committed bytes retain their recorded hashes on other platforms.

The archive includes three immutable directories: `smoke-01` records the initial
setup error (incorrect timeout API, no contender executed); `smoke-02` retains
all 78 cells, including 13 Tinypool bootstrap failures caused by an incorrect
adapter import; `final-smoke-01` contains the complete passing pipeline. The
adapter import was corrected against the pinned package's static API and the
**whole smoke matrix** reran. These were harness corrections, not performance
tuning or package substitutions. No genuine runtime defect was established.
Earlier failures remain available, rather than being relabelled successful.

The original directories remain under
`E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/`. The external consumer for
the successful run is
`C:/Users/ADMINI~1/AppData/Local/Temp/pjs-publication-v1-BO9SXw`.
Neither external path is required to analyze the committed archive.

## Executed commands and replay

From the isolated worktree, after selecting the portable executable and reviewed
npm CLI, the complete passing pipeline command was:

```powershell
$publicationNode = 'E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/toolchain/node-v24.22.1-win-x64/node.exe'
$publicationNpm = 'E:/Miskovy/Work/pjs/pjs/.node-tools/registry-convergence-npm-11.19.0/node_modules/npm/bin/npm-cli.js'
& $publicationNode benchmarks/publication-v1/campaign.mjs --profile=smoke --output=E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/final-smoke-01 --npm-cli=$publicationNpm --python=C:/Python311/python.exe
```

Its exact commands/stdout/stderr/exit receipts are in the archive's
`final-smoke-01/step-*.json`. The final analysis and plotting pass ran:

```sh
node --test --test-timeout=20000 benchmarks/publication-v1/harness.test.mjs benchmarks/publication-v1/analysis.test.mjs
node benchmarks/publication-v1/analyze.mjs E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/final-smoke-01/smoke E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/final-analysis-02
python benchmarks/publication-v1/plot.py E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/final-analysis-02/summary.json E:/Miskovy/Work/pjs/pjs/.node-tools/publication-v1/final-graphics-02
```

`retain.py` verified every raw/plot manifest before creating the committed bundle.
To independently replay analysis from the committed evidence, use new paths:

```sh
python -m zipfile -e benchmarks/publication-v1/evidence/smoke-raw.zip .node-tools/publication-replay-01
node benchmarks/publication-v1/analyze.mjs .node-tools/publication-replay-01/final-smoke-01/smoke .node-tools/publication-reanalysis-01
python benchmarks/publication-v1/plot.py .node-tools/publication-reanalysis-01/summary.json .node-tools/publication-replot-01
```

Original absolute paths in raw receipts describe what executed; analysis resolves
evidence from the supplied extracted directory and verifies relative manifests.
Historical RC2 evidence, production code, root dependency resolutions, versions
and frozen release inputs remain unchanged. No release qualification was rerun.
Benchmark commits use `[skip ci]` to avoid triggering unrelated release CI.
