# Stage C option occurrence audit

Mechanical appendix to the [authoritative migration plan](v1-api-migration-plan.md).
This file records locations, not another execution plan or an instruction to
replace every match. Baseline: `35f2aacfe431516ed559409a3cba6bf2ccd2e6b7` (integrated B4).
Only tracked text at that commit is counted; generated output, ignored evidence
and this later planning patch are excluded. Each exact token is counted, including
multiple tokens on one line. The historical S1 audit in the migration plan remains
historical.

Reproduce from a checkout containing the baseline:

```sh
git grep -n -I -E 'experimental(DispatchBatchSize|MaxBufferedResults|OutputConstructor|ResultBytes|MaxResultBytes|MaxReservedResultBytes)' 35f2aacfe431516ed559409a3cba6bf2ccd2e6b7 --
```

## Totals

| Current name                       | Tokens | Matching lines | Files |
| ---------------------------------- | ------ | -------------- | ----- |
| experimentalDispatchBatchSize      | 130    | 128            | 53    |
| experimentalMaxBufferedResults     | 110    | 110            | 54    |
| experimentalOutputConstructor      | 42     | 42             | 22    |
| experimentalResultBytes            | 83     | 83             | 46    |
| experimentalMaxResultBytes         | 62     | 62             | 33    |
| experimentalMaxReservedResultBytes | 95     | 95             | 45    |

## Migration handling

Production source, active consumers/tests, runnable examples, guides and current
benchmark code need deliberate C2/C3/C4 review when those units are authorized.
Current R2/R3 adapters use these spellings too; update only the option input names
required by migration while retaining independent models, seeds, actions, bounds,
checks and raw provenance. This planning task changes none of them.

Frozen RC JSON/declarations, RC-specific consumers/tooling, recorded benchmark
results, historical reports/inventories, proposals, ADR decision history and
release notes retain their bytes/meaning. Research is labeled historical/proposed
for review, not all immutable: the current canonical inventory and migration
specification must be updated as each implementation lands. Existing historical
report methods and conclusions must not be retroactively rewritten. Version-specific
RC selection belongs to Stage F. Old names intentionally survive in history,
migration tables, audit patterns and rejection tests after C4; a repository-wide
zero-match rule would be wrong. Scope each future edit explicitly.

## Full per-file index at the baseline

### experimentalDispatchBatchSize

| File                                                                    | Lines                                                  | Review class                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`                                | 69, 83                                                 | Current benchmark code                 |
| `benchmarks/binary-results/measure.mjs`                                 | 142, 173                                               | Current benchmark code                 |
| `benchmarks/binary-results/regression-measure.mjs`                      | 59, 69, 113                                            | Current benchmark code                 |
| `benchmarks/completion-only/fairness.mjs`                               | 56, 62                                                 | Current benchmark code                 |
| `benchmarks/completion-only/measure.mjs`                                | 187, 198, 223                                          | Current benchmark code                 |
| `benchmarks/completion-only/regression-measure.mjs`                     | 51                                                     | Current benchmark code                 |
| `benchmarks/dispatch-efficiency/fairness.mjs`                           | 55                                                     | Current benchmark code                 |
| `benchmarks/dispatch-efficiency/measure.mjs`                            | 206                                                    | Current benchmark code                 |
| `benchmarks/mapping/fairness.mjs`                                       | 34, 47, 71                                             | Current benchmark code                 |
| `benchmarks/mapping/measure.mjs`                                        | 143, 151, 160, 177, 202                                | Current benchmark code                 |
| `benchmarks/mapping/pipeline-measure.mjs`                               | 70                                                     | Current benchmark code                 |
| `benchmarks/mapping/regression-measure.mjs`                             | 48, 58                                                 | Current benchmark code                 |
| `benchmarks/reservation-audit/measure.mjs`                              | 53                                                     | Current benchmark code                 |
| `benchmarks/reservation-audit/pipeline.mjs`                             | 85, 148                                                | Current benchmark code                 |
| `benchmarks/reservation-audit/regression-measure.mjs`                   | 68, 96                                                 | Current benchmark code                 |
| `benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.json` | 22723, 23070, 23417, 23764, 49083, 49430, 49777, 50124 | Historical/frozen record or RC tooling |
| `benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.json` | 22690, 23037, 23384, 23731, 49050, 49397, 49744, 50091 | Historical/frozen record or RC tooling |
| `benchmarks/runtime-architecture/measure.mjs`                           | 95, 105, 117, 155, 166                                 | Current benchmark code                 |
| `benchmarks/streaming/fairness.mjs`                                     | 38, 53                                                 | Current benchmark code                 |
| `benchmarks/streaming/regression-measure.mjs`                           | 58                                                     | Current benchmark code                 |
| `benchmarks/upper-bound-results/run.mjs`                                | 106                                                    | Current benchmark code                 |
| `docs/adr/0011-batched-partition-dispatch.md`                           | 13                                                     | Historical/proposed research           |
| `docs/adr/0021-physical-execution-containment.md`                       | 61                                                     | Historical/proposed research           |
| `docs/benchmarks-v0.5.md`                                               | 6                                                      | Historical/proposed research           |
| `docs/benchmarks-v0.7.md`                                               | 36                                                     | Historical/proposed research           |
| `docs/cross-platform-v0.11.md`                                          | 505 (2 tokens)                                         | Historical/proposed research           |
| `docs/guide/lifecycle.md`                                               | 67                                                     | Current reference documentation        |
| `docs/partitioning.md`                                                  | 71, 91, 110, 135, 148                                  | Current reference documentation        |
| `docs/proposal-v0.6.md`                                                 | 108                                                    | Historical/proposed research           |
| `docs/research/v0.15-public-api-inventory.md`                           | 117, 146                                               | Historical/proposed research           |
| `docs/research/v0.15-stabilization.md`                                  | 78                                                     | Historical/proposed research           |
| `docs/research/v1-api-contract-inventory.md`                            | 428, 457, 470, 490, 954, 989, 999                      | Historical/proposed research           |
| `docs/research/v1-api-migration-plan.md`                                | 16, 34, 41                                             | Historical/proposed research           |
| `packages/runtime/src/partition/range.ts`                               | 31                                                     | Production source                      |
| `packages/runtime/src/partition/validation.ts`                          | 47, 48                                                 | Production source                      |
| `packages/runtime/src/tasks/coordinator.ts`                             | 138                                                    | Production source                      |
| `packages/runtime/test/batch.test.mjs`                                  | 30, 48                                                 | Current tests                          |
| `packages/runtime/test/binary-result.test.mjs`                          | 230, 260, 451                                          | Current tests                          |
| `packages/runtime/test/completion.test.mjs`                             | 72, 93, 120, 138, 162, 185, 312                        | Current tests                          |
| `packages/runtime/test/containment.test.mjs`                            | 375, 383                                               | Current tests                          |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`                    | 284                                                    | Current tests                          |
| `packages/runtime/test/map.test.mjs`                                    | 73, 187, 212, 271                                      | Current tests                          |
| `packages/runtime/test/memory-lifecycle.test.mjs`                       | 394, 402, 446                                          | Current tests                          |
| `packages/runtime/test/partition.test.mjs`                              | 159, 162                                               | Current tests                          |
| `packages/runtime/test/physical-boundary.test.mjs`                      | 166, 276                                               | Current tests                          |
| `packages/runtime/test/runtime-boundaries.test.mjs`                     | 461                                                    | Current tests                          |
| `packages/runtime/test/stream.test.mjs`                                 | 64, 103, 136, 161, 289                                 | Current tests                          |
| `packages/runtime/test/types.test.ts`                                   | 82, 113, 137, 419                                      | Current tests                          |
| `packages/runtime/test/upper-bound-result.test.mjs`                     | 351                                                    | Current tests                          |
| `scripts/cross-platform-v011/binary.mjs`                                | 29                                                     | Historical/frozen record or RC tooling |
| `scripts/cross-platform-v011/report.mjs`                                | 119, 768 (2 tokens)                                    | Historical/frozen record or RC tooling |
| `scripts/r3/child.mjs`                                                  | 308                                                    | Current tooling/consumers              |
| `scripts/reservation-soak.mjs`                                          | 293, 379                                               | Current tooling/consumers              |

### experimentalMaxBufferedResults

| File                                                  | Lines                                 | Review class                           |
| ----------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`              | 42                                    | Current benchmark code                 |
| `benchmarks/binary-results/measure.mjs`               | 143                                   | Current benchmark code                 |
| `benchmarks/binary-results/regression-measure.mjs`    | 70                                    | Current benchmark code                 |
| `benchmarks/completion-only/measure.mjs`              | 199                                   | Current benchmark code                 |
| `benchmarks/mapping/fairness.mjs`                     | 48                                    | Current benchmark code                 |
| `benchmarks/mapping/measure.mjs`                      | 178                                   | Current benchmark code                 |
| `benchmarks/mapping/pipeline-measure.mjs`             | 71                                    | Current benchmark code                 |
| `benchmarks/mapping/regression-measure.mjs`           | 59                                    | Current benchmark code                 |
| `benchmarks/real-world/compression/lifecycle.mjs`     | 35, 158, 241                          | Current benchmark code                 |
| `benchmarks/real-world/compression/run.mjs`           | 182                                   | Current benchmark code                 |
| `benchmarks/reservation-audit/measure.mjs`            | 54                                    | Current benchmark code                 |
| `benchmarks/reservation-audit/pipeline.mjs`           | 34                                    | Current benchmark code                 |
| `benchmarks/reservation-audit/regression-measure.mjs` | 97                                    | Current benchmark code                 |
| `benchmarks/runtime-architecture/measure.mjs`         | 118, 140                              | Current benchmark code                 |
| `benchmarks/streaming/fairness.mjs`                   | 39                                    | Current benchmark code                 |
| `benchmarks/upper-bound-results/profile.mjs`          | 47                                    | Current benchmark code                 |
| `benchmarks/upper-bound-results/refund.mjs`           | 34                                    | Current benchmark code                 |
| `benchmarks/upper-bound-results/run.mjs`              | 105                                   | Current benchmark code                 |
| `docs/adr/0014-streaming-result-semantics.md`         | 13                                    | Historical/proposed research           |
| `docs/architecture.md`                                | 180                                   | Current reference documentation        |
| `docs/benchmarks-v0.7.md`                             | 37, 57                                | Historical/proposed research           |
| `docs/benchmarks-v0.9.md`                             | 30, 69                                | Historical/proposed research           |
| `docs/guide/backpressure.md`                          | 8, 50                                 | Current reference documentation        |
| `docs/memory.md`                                      | 132                                   | Current reference documentation        |
| `docs/partitioning.md`                                | 136, 219, 263                         | Current reference documentation        |
| `docs/proposal-v0.12.md`                              | 12                                    | Historical/proposed research           |
| `docs/proposal-v0.7.md`                               | 14, 90, 98                            | Historical/proposed research           |
| `docs/proposal-v0.9.md`                               | 63                                    | Historical/proposed research           |
| `docs/research/v0.15-public-api-inventory.md`         | 118, 147, 164                         | Historical/proposed research           |
| `docs/research/v0.15-stabilization.md`                | 79                                    | Historical/proposed research           |
| `docs/research/v1-api-contract-inventory.md`          | 429, 458, 471, 955, 1000              | Historical/proposed research           |
| `docs/research/v1-api-migration-plan.md`              | 17, 35, 97, 452                       | Historical/proposed research           |
| `examples/streaming-binary.mjs`                       | 27, 45                                | Runnable examples                      |
| `packages/runtime/src/api/range/stream-range.ts`      | 61, 62                                | Production source                      |
| `packages/runtime/src/partition/range.ts`             | 37, 74, 82                            | Production source                      |
| `packages/runtime/test/binary-result.test.mjs`        | 259, 468, 485, 548                    | Current tests                          |
| `packages/runtime/test/closeable-stream.test.mjs`     | 43, 246                               | Current tests                          |
| `packages/runtime/test/containment.test.mjs`          | 321, 844                              | Current tests                          |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`  | 285                                   | Current tests                          |
| `packages/runtime/test/memory-lifecycle.test.mjs`     | 51, 391, 445                          | Current tests                          |
| `packages/runtime/test/memory-observability.test.mjs` | 58, 117, 135, 149, 169, 185, 198, 229 | Current tests                          |
| `packages/runtime/test/physical-boundary.test.mjs`    | 124                                   | Current tests                          |
| `packages/runtime/test/public-options.test.mjs`       | 115                                   | Current tests                          |
| `packages/runtime/test/runtime-boundaries.test.mjs`   | 447                                   | Current tests                          |
| `packages/runtime/test/stream.test.mjs`               | 65, 104, 124, 137, 161, 237, 276, 315 | Current tests                          |
| `packages/runtime/test/types.test.ts`                 | 138, 144, 208                         | Current tests                          |
| `packages/runtime/test/upper-bound-result.test.mjs`   | 191, 219, 352, 457, 546, 578          | Current tests                          |
| `scripts/compression-supplement-v014.mjs`             | 92, 143, 182                          | Historical/frozen record or RC tooling |
| `scripts/cross-platform-v011/binary.mjs`              | 30                                    | Historical/frozen record or RC tooling |
| `scripts/package-consumer/consumer.ts`                | 51                                    | Current tooling/consumers              |
| `scripts/package-consumer/stream.mjs`                 | 90                                    | Current tooling/consumers              |
| `scripts/r3/child.mjs`                                | 307                                   | Current tooling/consumers              |
| `scripts/rc/soak.mjs`                                 | 261, 417, 531                         | Historical/frozen record or RC tooling |
| `scripts/reservation-soak.mjs`                        | 91, 378                               | Current tooling/consumers              |

### experimentalOutputConstructor

| File                                                   | Lines                                  | Review class                           |
| ------------------------------------------------------ | -------------------------------------- | -------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`               | 82                                     | Current benchmark code                 |
| `benchmarks/binary-results/measure.mjs`                | 172                                    | Current benchmark code                 |
| `benchmarks/binary-results/regression-measure.mjs`     | 115                                    | Current benchmark code                 |
| `benchmarks/mapping/measure.mjs`                       | 152                                    | Current benchmark code                 |
| `benchmarks/runtime-architecture/measure.mjs`          | 167                                    | Current benchmark code                 |
| `docs/benchmarks-v0.8.md`                              | 49                                     | Historical/proposed research           |
| `docs/guide/core-api.md`                               | 88                                     | Current reference documentation        |
| `docs/partitioning.md`                                 | 111                                    | Current reference documentation        |
| `docs/proposal-v0.8.md`                                | 68                                     | Historical/proposed research           |
| `docs/research/v0.15-public-api-inventory.md`          | 122, 151                               | Historical/proposed research           |
| `docs/research/v0.15-stabilization.md`                 | 83                                     | Historical/proposed research           |
| `docs/research/v1-api-contract-inventory.md`           | 432, 990                               | Historical/proposed research           |
| `docs/research/v1-api-migration-plan.md`               | 21, 38, 231                            | Historical/proposed research           |
| `examples/range-work.mjs`                              | 23                                     | Runnable examples                      |
| `packages/runtime/src/api/range/parallel-map-range.ts` | 48, 49                                 | Production source                      |
| `packages/runtime/src/partition/range.ts`              | 120                                    | Production source                      |
| `packages/runtime/src/partition/validation.ts`         | 59                                     | Production source                      |
| `packages/runtime/test/map.test.mjs`                   | 119, 125, 186, 200                     | Current tests                          |
| `packages/runtime/test/runtime-boundaries.test.mjs`    | 182, 199, 200, 215, 368, 417, 442, 443 | Current tests                          |
| `packages/runtime/test/types.test.ts`                  | 353, 418, 432, 492                     | Current tests                          |
| `scripts/package-consumer/binary.mjs`                  | 129                                    | Current tooling/consumers              |
| `scripts/rc/soak.mjs`                                  | 490, 509, 670                          | Historical/frozen record or RC tooling |

### experimentalResultBytes

| File                                                  | Lines                        | Review class                           |
| ----------------------------------------------------- | ---------------------------- | -------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`              | 43                           | Current benchmark code                 |
| `benchmarks/binary-results/measure.mjs`               | 146                          | Current benchmark code                 |
| `benchmarks/real-world/compression/lifecycle.mjs`     | 145                          | Current benchmark code                 |
| `benchmarks/real-world/compression/run.mjs`           | 189                          | Current benchmark code                 |
| `benchmarks/reservation-audit/measure.mjs`            | 58                           | Current benchmark code                 |
| `benchmarks/reservation-audit/pipeline.mjs`           | 35                           | Current benchmark code                 |
| `benchmarks/reservation-audit/regression-measure.mjs` | 100                          | Current benchmark code                 |
| `benchmarks/runtime-architecture/measure.mjs`         | 141                          | Current benchmark code                 |
| `benchmarks/upper-bound-results/profile.mjs`          | 44                           | Current benchmark code                 |
| `benchmarks/upper-bound-results/report.mjs`           | 90                           | Current benchmark code                 |
| `benchmarks/upper-bound-results/run.mjs`              | 113                          | Current benchmark code                 |
| `docs/adr/0019-upper-bound-result-reservations.md`    | 12                           | Historical/proposed research           |
| `docs/benchmarks-v0.12.md`                            | 24                           | Historical/proposed research           |
| `docs/benchmarks-v0.9.md`                             | 26, 31                       | Historical/proposed research           |
| `docs/guide/backpressure.md`                          | 32, 51                       | Current reference documentation        |
| `docs/memory.md`                                      | 205                          | Current reference documentation        |
| `docs/partitioning.md`                                | 225, 271                     | Current reference documentation        |
| `docs/proposal-v0.12.md`                              | 10, 16                       | Historical/proposed research           |
| `docs/proposal-v0.9.md`                               | 64                           | Historical/proposed research           |
| `docs/research/v0.15-public-api-inventory.md`         | 119, 148                     | Historical/proposed research           |
| `docs/research/v0.15-stabilization.md`                | 80                           | Historical/proposed research           |
| `docs/research/v1-api-contract-inventory.md`          | 430, 461, 474, 1003          | Historical/proposed research           |
| `docs/research/v1-api-migration-plan.md`              | 18, 39, 255, 453, 468        | Historical/proposed research           |
| `examples/streaming-binary.mjs`                       | 28                           | Runnable examples                      |
| `packages/runtime/src/api/range/stream-range.ts`      | 56, 65, 81, 85, 108          | Production source                      |
| `packages/runtime/src/partition/coordinator.ts`       | 132                          | Production source                      |
| `packages/runtime/src/partition/range.ts`             | 42, 75, 84                   | Production source                      |
| `packages/runtime/test/binary-result.test.mjs`        | 43                           | Current tests                          |
| `packages/runtime/test/closeable-stream.test.mjs`     | 44                           | Current tests                          |
| `packages/runtime/test/containment.test.mjs`          | 324, 847, 920                | Current tests                          |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`  | 288                          | Current tests                          |
| `packages/runtime/test/memory-lifecycle.test.mjs`     | 392, 449                     | Current tests                          |
| `packages/runtime/test/physical-boundary.test.mjs`    | 127, 220, 555                | Current tests                          |
| `packages/runtime/test/public-options.test.mjs`       | 122, 125, 136, 175           | Current tests                          |
| `packages/runtime/test/runtime-boundaries.test.mjs`   | 231, 276, 300, 448           | Current tests                          |
| `packages/runtime/test/types.test.ts`                 | 190, 206, 379, 397, 469, 473 | Current tests                          |
| `packages/runtime/test/upper-bound-result.test.mjs`   | 297                          | Current tests                          |
| `scripts/compression-supplement-v014.mjs`             | 183                          | Historical/frozen record or RC tooling |
| `scripts/cross-platform-v011/binary.mjs`              | 34                           | Historical/frozen record or RC tooling |
| `scripts/package-consumer/binary.mjs`                 | 34                           | Current tooling/consumers              |
| `scripts/package-consumer/consumer.ts`                | 33                           | Current tooling/consumers              |
| `scripts/package-consumer/stream.mjs`                 | 58                           | Current tooling/consumers              |
| `scripts/r3/child.mjs`                                | 313                          | Current tooling/consumers              |
| `scripts/rc/consumer.ts`                              | 46                           | Historical/frozen record or RC tooling |
| `scripts/rc/soak.mjs`                                 | 419, 682, 696, 706           | Historical/frozen record or RC tooling |
| `scripts/reservation-soak.mjs`                        | 94                           | Current tooling/consumers              |

### experimentalMaxResultBytes

| File                                                 | Lines                   | Review class                           |
| ---------------------------------------------------- | ----------------------- | -------------------------------------- |
| `benchmarks/real-world/compression/lifecycle.mjs`    | 36, 144, 239            | Current benchmark code                 |
| `benchmarks/real-world/compression/run.mjs`          | 191                     | Current benchmark code                 |
| `benchmarks/upper-bound-results/profile.mjs`         | 45                      | Current benchmark code                 |
| `benchmarks/upper-bound-results/refund.mjs`          | 32                      | Current benchmark code                 |
| `benchmarks/upper-bound-results/report.mjs`          | 88                      | Current benchmark code                 |
| `benchmarks/upper-bound-results/run.mjs`             | 128                     | Current benchmark code                 |
| `docs/adr/0019-upper-bound-result-reservations.md`   | 11                      | Historical/proposed research           |
| `docs/benchmarks-v0.12.md`                           | 22                      | Historical/proposed research           |
| `docs/guide/backpressure.md`                         | 33                      | Current reference documentation        |
| `docs/memory.md`                                     | 204                     | Current reference documentation        |
| `docs/partitioning.md`                               | 260, 270                | Current reference documentation        |
| `docs/proposal-v0.12.md`                             | 9, 17                   | Historical/proposed research           |
| `docs/research/v0.15-public-api-inventory.md`        | 120, 149                | Historical/proposed research           |
| `docs/research/v0.15-stabilization.md`               | 81                      | Historical/proposed research           |
| `docs/research/v1-api-contract-inventory.md`         | 430, 460, 473, 1002     | Historical/proposed research           |
| `docs/research/v1-api-migration-plan.md`             | 19, 37, 196             | Historical/proposed research           |
| `examples/streaming-binary.mjs`                      | 46                      | Runnable examples                      |
| `packages/runtime/src/api/range/stream-range.ts`     | 66, 80, 84, 109         | Production source                      |
| `packages/runtime/src/partition/range.ts`            | 43, 76, 83              | Production source                      |
| `packages/runtime/test/containment.test.mjs`         | 325, 848                | Current tests                          |
| `packages/runtime/test/helpers/lifecycle-runner.mjs` | 289                     | Current tests                          |
| `packages/runtime/test/memory-lifecycle.test.mjs`    | 52, 450                 | Current tests                          |
| `packages/runtime/test/physical-boundary.test.mjs`   | 128, 221, 522           | Current tests                          |
| `packages/runtime/test/public-options.test.mjs`      | 126, 161                | Current tests                          |
| `packages/runtime/test/runtime-boundaries.test.mjs`  | 232, 449                | Current tests                          |
| `packages/runtime/test/types.test.ts`                | 193, 222, 380, 385, 389 | Current tests                          |
| `packages/runtime/test/upper-bound-result.test.mjs`  | 35, 298                 | Current tests                          |
| `scripts/compression-supplement-v014.mjs`            | 90, 144                 | Historical/frozen record or RC tooling |
| `scripts/package-consumer/binary.mjs`                | 35                      | Current tooling/consumers              |
| `scripts/package-consumer/stream.mjs`                | 79                      | Current tooling/consumers              |
| `scripts/r3/child.mjs`                               | 312                     | Current tooling/consumers              |
| `scripts/rc/soak.mjs`                                | 262, 420                | Historical/frozen record or RC tooling |
| `scripts/reservation-soak.mjs`                       | 93, 376                 | Current tooling/consumers              |

### experimentalMaxReservedResultBytes

| File                                                  | Lines                             | Review class                           |
| ----------------------------------------------------- | --------------------------------- | -------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`              | 44                                | Current benchmark code                 |
| `benchmarks/binary-results/measure.mjs`               | 147                               | Current benchmark code                 |
| `benchmarks/real-world/compression/lifecycle.mjs`     | 37, 157, 240                      | Current benchmark code                 |
| `benchmarks/real-world/compression/run.mjs`           | 184                               | Current benchmark code                 |
| `benchmarks/reservation-audit/measure.mjs`            | 59                                | Current benchmark code                 |
| `benchmarks/reservation-audit/pipeline.mjs`           | 36                                | Current benchmark code                 |
| `benchmarks/reservation-audit/regression-measure.mjs` | 101                               | Current benchmark code                 |
| `benchmarks/runtime-architecture/measure.mjs`         | 142                               | Current benchmark code                 |
| `benchmarks/upper-bound-results/profile.mjs`          | 46                                | Current benchmark code                 |
| `benchmarks/upper-bound-results/refund.mjs`           | 33                                | Current benchmark code                 |
| `benchmarks/upper-bound-results/report.mjs`           | 89                                | Current benchmark code                 |
| `benchmarks/upper-bound-results/run.mjs`              | 110                               | Current benchmark code                 |
| `docs/benchmarks-v0.12.md`                            | 23                                | Historical/proposed research           |
| `docs/benchmarks-v0.9.md`                             | 26, 32, 70                        | Historical/proposed research           |
| `docs/guide/backpressure.md`                          | 9, 35, 52                         | Current reference documentation        |
| `docs/memory.md`                                      | 204                               | Current reference documentation        |
| `docs/partitioning.md`                                | 226, 262                          | Current reference documentation        |
| `docs/proposal-v0.12.md`                              | 11                                | Historical/proposed research           |
| `docs/proposal-v0.9.md`                               | 67                                | Historical/proposed research           |
| `docs/research/v0.15-public-api-inventory.md`         | 121, 150                          | Historical/proposed research           |
| `docs/research/v0.15-stabilization.md`                | 82                                | Historical/proposed research           |
| `docs/research/v1-api-contract-inventory.md`          | 431, 459, 472, 1001               | Historical/proposed research           |
| `docs/research/v1-api-migration-plan.md`              | 20, 36, 151, 454                  | Historical/proposed research           |
| `examples/streaming-binary.mjs`                       | 29, 48                            | Runnable examples                      |
| `packages/runtime/src/api/range/stream-range.ts`      | 72, 75, 87, 88, 110               | Production source                      |
| `packages/runtime/src/partition/range.ts`             | 44, 77, 85                        | Production source                      |
| `packages/runtime/test/binary-result.test.mjs`        | 44                                | Current tests                          |
| `packages/runtime/test/closeable-stream.test.mjs`     | 45                                | Current tests                          |
| `packages/runtime/test/containment.test.mjs`          | 322, 845, 921                     | Current tests                          |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`  | 286                               | Current tests                          |
| `packages/runtime/test/memory-lifecycle.test.mjs`     | 53, 393, 447                      | Current tests                          |
| `packages/runtime/test/physical-boundary.test.mjs`    | 125, 218, 523, 556                | Current tests                          |
| `packages/runtime/test/public-options.test.mjs`       | 123, 127, 137, 162, 176           | Current tests                          |
| `packages/runtime/test/runtime-boundaries.test.mjs`   | 233, 450                          | Current tests                          |
| `packages/runtime/test/types.test.ts`                 | 197, 207, 224, 381, 390, 464, 474 | Current tests                          |
| `packages/runtime/test/upper-bound-result.test.mjs`   | 36, 299                           | Current tests                          |
| `scripts/compression-supplement-v014.mjs`             | 91, 145, 184                      | Historical/frozen record or RC tooling |
| `scripts/cross-platform-v011/binary.mjs`              | 35                                | Historical/frozen record or RC tooling |
| `scripts/package-consumer/binary.mjs`                 | 36                                | Current tooling/consumers              |
| `scripts/package-consumer/consumer.ts`                | 34                                | Current tooling/consumers              |
| `scripts/package-consumer/stream.mjs`                 | 59, 79                            | Current tooling/consumers              |
| `scripts/r3/child.mjs`                                | 309                               | Current tooling/consumers              |
| `scripts/rc/consumer.ts`                              | 46                                | Historical/frozen record or RC tooling |
| `scripts/rc/soak.mjs`                                 | 263, 421, 683, 696, 706           | Historical/frozen record or RC tooling |
| `scripts/reservation-soak.mjs`                        | 95, 186, 294, 377                 | Current tooling/consumers              |
