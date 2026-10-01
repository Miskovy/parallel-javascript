# Upper-bound result credit experiments (v0.12)

Build first, then run `node benchmarks/upper-bound-results/run.mjs`. The full
matrix uses six interleaved trials with two warmups per fresh runtime and timed
windows of at least 180 ms. `PJS_BENCH_QUICK=1` is a smoke check only. Raw samples,
case order, credit composition, CPU/memory endpoints, event-loop delay, sizing
cost, refund bytes, occupancy, latency, and throughput go to
`benchmarks/results/upper-bound-results-v0.12.json`.

The value/count RLE worker makes one encoding pass into worst-case scratch and
compacts the result. A maximum of twice input bytes is structurally safe even
for alternating values. Immutable shared inputs keep input cloning out of the
comparison. Exact mode runs an additional host sizing scan; upper-bound mode
declares the cheap structural bound. The same worker implements both.

Slack utilization sweeps 100/75/50/25/10/1 percent at one/four/sixteen maximum
blocks of byte capacity. Variable-input and fixed binary controls include fast
and slow consumers, clone and transfer, exact vs equal-size upper bound, and
count-only streams. The held-maximum control overrides reconciliation only in a
benchmark runtime instance: worker validation still occurs, but maximum credit
persists until yield. There is no public or environment runtime toggle.

Sampled occupancy may miss short bursts. The peak from sampling is separate
from the manager's reservation high-water mark; sampling never establishes an
enforcement invariant. Native timer granularity affects the 1 ms consumer sink.
All outliers remain. No p95 is interpreted from six trials.

For opt-out and exact regression controls, archive/build v0.11 commit
`8fcd0fd9e9e3a6987198fce80a338b02c076b0d7`, then run:

```sh
node benchmarks/upper-bound-results/regression.mjs /absolute/path/to/built-v0.11
```

This reuses the established runtime-architecture measurement workloads in eight
balanced fresh-process positions, producing 24 observations per version/case.
It writes `runtime-regression-v0.12.json` without modifying v0.11 evidence.
Set `PJS_POWER_MODE` to the actual power configuration; compare versions on the
same machine and plan. See the [report](../../docs/benchmarks-v0.12.md).

`npm run benchmark:upper-bound` also runs the consumer-withheld refund control
and separate stage profile, writing `refund-benefit-v0.12.json` and
`upper-bound-profile-v0.12.json`. The timer-sink throughput comparison is noisy
on Power saver; the consumer-withheld experiment proves production/retention
benefit independently of timer granularity. Profile timing is instrumentation,
not production throughput.

Run `node scripts/validate-v012.mjs` for all checks, ten invariant-enabled stress
rounds, the final 30-second soak, and historical evidence hash preservation.
Then `node benchmarks/upper-bound-results/report.mjs` generates the full report
from retained artifacts and successful validation.
