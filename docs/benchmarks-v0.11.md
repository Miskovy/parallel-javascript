# v0.11 validation and performance report

## Scope

v0.11 is a behavior-preserving decomposition of the host runtime. The evidence
below checks that the new ownership boundaries do not add a meaningful
regression to ordinary tasks, transfer/shared inputs, range production,
completion-only work, streams, strict binary result credits, or maps. It does
not introduce or benchmark a new public algorithm.

## Environment

- Commit: `ed8b5b2d34d206f00fd2b75624988b98d7c739e2`, with the v0.11 working tree
- Node.js: 24.21.0; V8 13.6.233.17-node.53
- OS: Windows 10.0.19045 x64
- CPU: Intel Core i3-10100F at 3.60 GHz, 8 logical CPUs
- Memory: 17,037,594,624 bytes
- Power mode: unknown

Node 22 and current Linux/macOS environments were unavailable for this run and
remain CI coverage requirements.

## Method

The baseline was built from the committed v0.10 tree in an isolated temporary
directory. The candidate was built from the v0.11 working tree. Every case ran
in its own fresh runtime process four times per version, using a balanced
baseline/candidate/candidate/baseline/candidate/baseline/baseline/candidate
order. Each process received two warmups. Every retained sample repeated the
case enough times to sustain roughly 100--300 ms of work and reports time per
operation. Collection was forced between samples, outside the timed region;
allocation and collection during each sustained sample remained natural. The
table reports the median of 24 retained samples per version. Positive delta
means the candidate was slower. The raw samples, repetition counts, and machine
record are in
[`benchmarks/results/runtime-architecture-v0.11.json`](../benchmarks/results/runtime-architecture-v0.11.json).

| Case                     | v0.10 median | v0.11 median | Delta |
| ------------------------ | -----------: | -----------: | ----: |
| `run-noop`               |    30.039 ms |    29.647 ms | -1.3% |
| `run-medium-cpu`         |     8.012 ms |     8.113 ms | +1.3% |
| `run-clone-input`        |    13.786 ms |    13.869 ms | +0.6% |
| `run-transfer-input`     |     8.256 ms |     8.283 ms | +0.3% |
| `run-shared-input`       |     3.949 ms |     4.029 ms | +2.0% |
| `partition-range`        |    17.247 ms |    17.423 ms | +1.0% |
| `parallel-for`           |    17.103 ms |    17.485 ms | +2.2% |
| `stream-count-only`      |    42.910 ms |    44.148 ms | +2.9% |
| `stream-strict-clone`    |    12.339 ms |    12.717 ms | +3.1% |
| `stream-strict-transfer` |     4.975 ms |     5.188 ms | +4.3% |
| `map-generic`            |     4.356 ms |     4.474 ms | +2.7% |
| `map-typed`              |     4.525 ms |     4.632 ms | +2.4% |

Early runs with short samples and shared case processes crossed the threshold
in both directions. The investigation isolated cases, increased sustained work,
balanced four independent processes per version, and controlled between-sample
heap pressure. In the comparison of record no case crossed the five-percent
threshold. The largest measured regression was strict binary transfer
streaming at 4.3%.
Improvements are observations, not attributed to the refactor, because the
implementation was not intended to optimize these paths and system noise can
favor either build.

## Correctness and stress

- Full normal suite: 159/159 passing.
- Full suite with `PJS_DEBUG_RESERVATION_INVARIANTS=1`: 159/159 passing.
- Ten additional fresh-process full-suite rounds: 10/10 passing, 1,590 test
  executions.
- Type tests, current TypeScript build, TypeScript 6 compatibility check,
  ESLint, Prettier check, and `git diff --check`: passing.

The reservation soak ran for 30.48 seconds and completed 834 randomized
iterations across success, cancellation, timeout, crash, abandonment, graceful
shutdown, and non-draining shutdown scenarios. It ended stopped with zero
pending tasks, zero pending operations, zero reservations, zero execution
correlations, and zero reserved result bytes after 139 worker failures and
replacements. Samples and scenario counts are in
[`benchmarks/results/reservation-soak-v0.11.json`](../benchmarks/results/reservation-soak-v0.11.json).

## Reproduction

Build both source trees, then run the interleaved comparator with the absolute
path to the built v0.10 checkout:

```sh
npm run build
node benchmarks/runtime-architecture/compare.mjs /absolute/path/to/pjs-v0.10
```

Use `PJS_BENCH_QUICK=1` for a four-sample smoke run. The full run is the
comparison of record. Reservation soak commands remain `npm run
soak:reservations:smoke` and `npm run soak:reservations`.

## Conclusion

The measured candidate stays within the milestone's five-percent regression
threshold while preserving all tested behavior and reservation invariants. The
architecture refactor is therefore accepted on this machine, subject to the
explicit cross-platform CI gap above.
