# Campaign research log

## Start — 2026-10-06 (Africa/Cairo)

- Starting commit: `ebf4ce1bc3b63a8860e667605e6456bccae1f09c`.
- Starting branch: `release/npm-cd-and-post-publication-docs`.
- `git status --short`: empty. Research branch:
  `research/flagship-monte-carlo`.
- Node `v24.13.1`, npm `11.8.0`.
- Fedora Linux 44 KDE, kernel `6.19.10-300.fc44.x86_64`, AMD Ryzen 3 PRO
  3300U, four physical cores / four logical CPUs (lscpu reports one thread/core),
  total RAM 7,715,655,680 bytes. Initial available RAM about 1.58 GB; swap in use
  about 6.89 GB. Background applications and thermal conditions uncontrolled.
- Public npm next resolves to `1.0.0-rc.2`, integrity
  `sha512-JZypvx2bUlW9G1wxWmWmUM5CRF2skkzY0OLDOJlJfzsRNg2x0AEJOCQxsnVHhHbZYizKKuHWW6Fa0osSiogMRw==`.
- Inspected existing `benchmarks/harness.mjs` and `environment.mjs`. Reused
  environment capture. Existing harness lacks isolated public package resolution,
  bounded child timeouts and per-trial isolation, so this campaign supplies those.
- Read Piscina 5.3.2's distributed README for fixed-pool public options. No
  private readiness internals: untimed full-workload warmups establish readiness.
- Preregistration: README hypotheses and design written before performance
  collection. Two warmups, ten trials; seed and neutral grain frozen. No tuning
  against a worker runtime. Oversubscription excluded to limit resource pressure.

## Harness validation

The first public installation succeeded, but the provenance checker attempted
CJS resolution against an ESM-only export. Corrected the checker to resolve under
Node import conditions in the external consumer. This was a harness failure
before measured trials, not a PJS runtime defect. No runtime code changed.

Correctness uses full bitwise path comparison for the fixture in both transports
and result modes, plus exact logical-chunk aggregates. Measured aggregate trials
are checked against an independent serial evaluation after timing using path-bit
checksum, count, extrema and tightly bounded sums. Distribution trials require
all path bits to agree. Serial validation time is excluded for all contenders;
it still contributes host heating between trials, a validity limitation.

## Smoke and harness gates

All 16 smoke cells passed with zero failures, including both result modes and
both transports across all four contenders. Eight fixture contender/transport
checks passed exact per-path and ordered-aggregate comparison. Ten benchmark
unit tests passed, including watchdog and crash evidence. Lint, format check,
documentation links and diff whitespace checks passed before the full campaign.
Smoke evidence is validation only; it cannot establish throughput claims.

## Serial-only calibration freeze

Selection used the preregistered nearest log-distance to 100ms, 1s and 5s.
No parallel performance was used. All three measurements per candidate were
retained, without deletion. Two warmups per fresh serial child.

| Paths  | Serial median ms |
| ------ | ---------------- |
| 1000   | 30.267           |
| 2000   | 53.674           |
| 5000   | 127.597          |
| 10000  | 242.702          |
| 20000  | 465.681          |
| 50000  | 1177.507         |
| 100000 | 2303.388         |
| 200000 | 4673.754         |
| 500000 | 11586.931        |

Frozen counts: `{"large": 200000, "medium": 50000, "small": 5000}`.

Raw calibration: `benchmarks/results/flagship-monte-carlo/2026-10-06-linux-x64-node24.13.1-calibrate-1791276198403.jsonl`. Freeze is committed before the full parallel
campaign. Hypotheses, model, neutral grain, workers and trial policy unchanged.

## Full campaign and postprocessing repair

All 620 measured trials completed with zero trial failures. Each trial child
passed validation, closed its pool/timers and exited naturally. Raw completion
record is intact. The parent then exited with code 13 because the full analysis
completeness check dynamically imported run.mjs while run.mjs awaited analysis,
creating a circular top-level await. This is a postprocessing harness defect,
not a runtime or measured-child failure.

Moved the unchanged cell matrix into an independent campaign module and used a
static import in analysis and orchestration. Added a full-profile analysis
regression test that rejects incomplete evidence without importing the runner.
Standalone analysis now confirms 620/620 expected trials, 62/62 cells and zero
failures. Numerical kernel, measured driver, trial timing, model, hypotheses and
frozen counts were not changed; no performance campaign was rerun or deleted.

Analysis CPU ratios now use matching work windows: compute plus reduction for
steady state, and cold wall minus separately measured shared preparation for
cold (whose CPU sampling starts after preparation). Absolute CPU measurements
in raw evidence are unchanged. The full derived artifacts were first created
after this repair; earlier smoke/calibration artifacts remain untouched.

Clarified that calibration is initial registration and added a preflight guard
against accidental recalibration of the frozen config. This only changes CLI
reproduction behavior, not retained workload measurements.

## Final review and validation

Outcome B: mixed but useful. Coarse parallelism and event-loop isolation were
observed; no primary peer-runtime practical win, robust shared-throughput benefit,
serial crossover below the chosen sizes, or fine-grain collapse was established.
PJS slower peer medians remain explicit in the report, with overlapping intervals.
Fifteen of 62 cells have CV above 20%; no samples were removed.

Eleven unit tests passed, including full-analysis regression. The final smoke
rerun passed all 16 cells and automatic analysis, with eight exact fixture checks.
format:check, lint, test:docs and git diff --check passed. Regenerating full
analysis from an identical temporary raw copy produced byte-identical summary
JSON and tables.

Source freeze proof against ebf4ce1bc3b63a8860e667605e6456bccae1f09c: runtime
source diff is zero bytes; runtime package.json is identical; root/package runtime
versions remain 1.0.0-rc.2; public exports and runtime/root dependencies unchanged.
Against measured commit 5f0e669, kernel, model, PRNG, common scheduling driver,
trial timing/metrics, adapters, worker modules and config are unchanged. Only
postprocessing/orchestration completeness, recalibration guard and reporting were
changed after collection. No runtime change or npm publication is recommended.
