# Stage C: proposed migration and controlled promotion

**Proposed, pending review and Stage B/C implementation.** Current consumers must
use existing declarations and experimental spellings. Nothing in these examples
is a runnable current-source replacement. The [inventory](v1-api-contract-inventory.md)
is authoritative for today's behavior; [B](v1-api-corrections.md) specifies the
four corrections before promotion. See [ADR 0023](../adr/0023-v1-api-stability-decisions.md).

## Spelling and occurrence audit

Recommend these six minimal renames. Do not rename methods, result wrappers,
partition fields, error classes or diagnostic aliases merely for consistency.

| Current                            | Proposed stable        | Declared option shapes / dependencies                                         |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| experimentalDispatchBatchSize      | dispatchBatchSize      | PartitionOptions and all derived stream/binary/typed-map options; C2          |
| experimentalMaxBufferedResults     | maxBufferedResults     | StreamRangeOptions, exact/upper-bound options, count-only reachable shape; C2 |
| experimentalResultBytes            | resultBytes            | BinaryStreamRangeOptions; excluded in upper-bound and count-only; C3          |
| experimentalMaxResultBytes         | maxResultBytes         | UpperBoundBinaryStreamRangeOptions; excluded in exact and count-only; C3      |
| experimentalMaxReservedResultBytes | maxReservedResultBytes | Both strict-binary shapes; excluded in count-only; C3                         |
| experimentalOutputConstructor      | outputConstructor      | TypedMapRangeOptions; C2                                                      |

The extraction tool discovers current runtime-source occurrences and root member
inheritance; the following cross-repository audit covers tests, docs, benchmarks,
scripts and runnable examples too. Counts include prose and repeated uses, and
are not an API count. Frozen declarations/release JSON, historical inventories,
reports, ADR decision history and release notes remain history; annotate scope or
link forward, never rewrite immutable baseline bytes.

Audit of **all tracked text at S1 `f93fb9cb249a54ee625a19a20b5a6d7f7d68647f`; excludes generated output, ignored evidence and new Stage A migration references.** Complete per-file/line index follows; frozen JSON can contain many tokens on one line.

| Name                                 | Token occurrences | Matching lines | Files |
| ------------------------------------ | ----------------- | -------------- | ----- |
| `experimentalDispatchBatchSize`      | 120               | 118            | 51    |
| `experimentalMaxBufferedResults`     | 96                | 96             | 49    |
| `experimentalMaxReservedResultBytes` | 82                | 82             | 40    |
| `experimentalMaxResultBytes`         | 53                | 53             | 30    |
| `experimentalOutputConstructor`      | 35                | 35             | 19    |
| `experimentalResultBytes`            | 70                | 70             | 41    |

### experimentalDispatchBatchSize baseline occurrence index

| File                                                                    | Lines (multiple tokens on one line count separately above) |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`                                | 69, 83                                                     |
| `benchmarks/binary-results/measure.mjs`                                 | 142, 173                                                   |
| `benchmarks/binary-results/regression-measure.mjs`                      | 59, 69, 113                                                |
| `benchmarks/completion-only/fairness.mjs`                               | 56, 62                                                     |
| `benchmarks/completion-only/measure.mjs`                                | 187, 198, 223                                              |
| `benchmarks/completion-only/regression-measure.mjs`                     | 51                                                         |
| `benchmarks/dispatch-efficiency/fairness.mjs`                           | 55                                                         |
| `benchmarks/dispatch-efficiency/measure.mjs`                            | 206                                                        |
| `benchmarks/mapping/fairness.mjs`                                       | 34, 47, 71                                                 |
| `benchmarks/mapping/measure.mjs`                                        | 143, 151, 160, 177, 202                                    |
| `benchmarks/mapping/pipeline-measure.mjs`                               | 70                                                         |
| `benchmarks/mapping/regression-measure.mjs`                             | 48, 58                                                     |
| `benchmarks/reservation-audit/measure.mjs`                              | 53                                                         |
| `benchmarks/reservation-audit/pipeline.mjs`                             | 85, 148                                                    |
| `benchmarks/reservation-audit/regression-measure.mjs`                   | 68, 96                                                     |
| `benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.json` | 22723, 23070, 23417, 23764, 49083, 49430, 49777, 50124     |
| `benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.json` | 22690, 23037, 23384, 23731, 49050, 49397, 49744, 50091     |
| `benchmarks/runtime-architecture/measure.mjs`                           | 95, 105, 117, 155, 166                                     |
| `benchmarks/streaming/fairness.mjs`                                     | 38, 53                                                     |
| `benchmarks/streaming/regression-measure.mjs`                           | 58                                                         |
| `benchmarks/upper-bound-results/run.mjs`                                | 106                                                        |
| `docs/adr/0011-batched-partition-dispatch.md`                           | 13                                                         |
| `docs/adr/0021-physical-execution-containment.md`                       | 61                                                         |
| `docs/benchmarks-v0.5.md`                                               | 6                                                          |
| `docs/benchmarks-v0.7.md`                                               | 36                                                         |
| `docs/cross-platform-v0.11.md`                                          | 505                                                        |
| `docs/guide/lifecycle.md`                                               | 67                                                         |
| `docs/partitioning.md`                                                  | 71, 91, 110, 135, 148                                      |
| `docs/proposal-v0.6.md`                                                 | 108                                                        |
| `docs/research/v0.15-public-api-inventory.md`                           | 117, 146                                                   |
| `docs/research/v0.15-stabilization.md`                                  | 78                                                         |
| `packages/runtime/src/partition/range.ts`                               | 31                                                         |
| `packages/runtime/src/partition/validation.ts`                          | 47, 48                                                     |
| `packages/runtime/src/tasks/coordinator.ts`                             | 138                                                        |
| `packages/runtime/test/batch.test.mjs`                                  | 30, 48                                                     |
| `packages/runtime/test/binary-result.test.mjs`                          | 230, 260, 451                                              |
| `packages/runtime/test/completion.test.mjs`                             | 72, 93, 120, 138, 162, 185, 312                            |
| `packages/runtime/test/containment.test.mjs`                            | 375, 383                                                   |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`                    | 284                                                        |
| `packages/runtime/test/map.test.mjs`                                    | 73, 148, 173, 232                                          |
| `packages/runtime/test/memory-lifecycle.test.mjs`                       | 394, 402, 446                                              |
| `packages/runtime/test/partition.test.mjs`                              | 159, 162                                                   |
| `packages/runtime/test/physical-boundary.test.mjs`                      | 166, 276                                                   |
| `packages/runtime/test/runtime-boundaries.test.mjs`                     | 463                                                        |
| `packages/runtime/test/stream.test.mjs`                                 | 64, 103, 136, 161, 289                                     |
| `packages/runtime/test/types.test.ts`                                   | 68, 99, 123, 206                                           |
| `packages/runtime/test/upper-bound-result.test.mjs`                     | 348                                                        |
| `scripts/cross-platform-v011/binary.mjs`                                | 29                                                         |
| `scripts/cross-platform-v011/report.mjs`                                | 119, 768                                                   |
| `scripts/r3/child.mjs`                                                  | 308                                                        |
| `scripts/reservation-soak.mjs`                                          | 293, 379                                                   |

### experimentalMaxBufferedResults baseline occurrence index

| File                                                  | Lines (multiple tokens on one line count separately above) |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`              | 42                                                         |
| `benchmarks/binary-results/measure.mjs`               | 143                                                        |
| `benchmarks/binary-results/regression-measure.mjs`    | 70                                                         |
| `benchmarks/completion-only/measure.mjs`              | 199                                                        |
| `benchmarks/mapping/fairness.mjs`                     | 48                                                         |
| `benchmarks/mapping/measure.mjs`                      | 178                                                        |
| `benchmarks/mapping/pipeline-measure.mjs`             | 71                                                         |
| `benchmarks/mapping/regression-measure.mjs`           | 59                                                         |
| `benchmarks/real-world/compression/lifecycle.mjs`     | 35, 158, 241                                               |
| `benchmarks/real-world/compression/run.mjs`           | 182                                                        |
| `benchmarks/reservation-audit/measure.mjs`            | 54                                                         |
| `benchmarks/reservation-audit/pipeline.mjs`           | 34                                                         |
| `benchmarks/reservation-audit/regression-measure.mjs` | 97                                                         |
| `benchmarks/runtime-architecture/measure.mjs`         | 118, 140                                                   |
| `benchmarks/streaming/fairness.mjs`                   | 39                                                         |
| `benchmarks/upper-bound-results/profile.mjs`          | 47                                                         |
| `benchmarks/upper-bound-results/refund.mjs`           | 34                                                         |
| `benchmarks/upper-bound-results/run.mjs`              | 105                                                        |
| `docs/adr/0014-streaming-result-semantics.md`         | 13                                                         |
| `docs/architecture.md`                                | 180                                                        |
| `docs/benchmarks-v0.7.md`                             | 37, 57                                                     |
| `docs/benchmarks-v0.9.md`                             | 30, 69                                                     |
| `docs/guide/backpressure.md`                          | 8, 50                                                      |
| `docs/memory.md`                                      | 132                                                        |
| `docs/partitioning.md`                                | 136, 219, 263                                              |
| `docs/proposal-v0.12.md`                              | 12                                                         |
| `docs/proposal-v0.7.md`                               | 14, 90, 98                                                 |
| `docs/proposal-v0.9.md`                               | 63                                                         |
| `docs/research/v0.15-public-api-inventory.md`         | 118, 147, 164                                              |
| `docs/research/v0.15-stabilization.md`                | 79                                                         |
| `examples/streaming-binary.mjs`                       | 27, 45                                                     |
| `packages/runtime/src/api/range/stream-range.ts`      | 66, 67                                                     |
| `packages/runtime/src/partition/range.ts`             | 37, 49, 57                                                 |
| `packages/runtime/test/binary-result.test.mjs`        | 259, 468, 485, 548                                         |
| `packages/runtime/test/containment.test.mjs`          | 321, 844                                                   |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`  | 285                                                        |
| `packages/runtime/test/memory-lifecycle.test.mjs`     | 51, 391, 445                                               |
| `packages/runtime/test/memory-observability.test.mjs` | 58, 107, 125, 139, 159, 175, 188, 219                      |
| `packages/runtime/test/physical-boundary.test.mjs`    | 124                                                        |
| `packages/runtime/test/public-options.test.mjs`       | 115                                                        |
| `packages/runtime/test/runtime-boundaries.test.mjs`   | 449                                                        |
| `packages/runtime/test/stream.test.mjs`               | 65, 104, 124, 137, 161, 237, 276, 315                      |
| `packages/runtime/test/types.test.ts`                 | 124, 134                                                   |
| `packages/runtime/test/upper-bound-result.test.mjs`   | 191, 216, 349, 454, 543, 575                               |
| `scripts/compression-supplement-v014.mjs`             | 92, 143, 182                                               |
| `scripts/cross-platform-v011/binary.mjs`              | 30                                                         |
| `scripts/r3/child.mjs`                                | 307                                                        |
| `scripts/rc/soak.mjs`                                 | 261, 417, 531                                              |
| `scripts/reservation-soak.mjs`                        | 91, 378                                                    |

### experimentalMaxReservedResultBytes baseline occurrence index

| File                                                  | Lines (multiple tokens on one line count separately above) |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`              | 44                                                         |
| `benchmarks/binary-results/measure.mjs`               | 147                                                        |
| `benchmarks/real-world/compression/lifecycle.mjs`     | 37, 157, 240                                               |
| `benchmarks/real-world/compression/run.mjs`           | 184                                                        |
| `benchmarks/reservation-audit/measure.mjs`            | 59                                                         |
| `benchmarks/reservation-audit/pipeline.mjs`           | 36                                                         |
| `benchmarks/reservation-audit/regression-measure.mjs` | 101                                                        |
| `benchmarks/runtime-architecture/measure.mjs`         | 142                                                        |
| `benchmarks/upper-bound-results/profile.mjs`          | 46                                                         |
| `benchmarks/upper-bound-results/refund.mjs`           | 33                                                         |
| `benchmarks/upper-bound-results/report.mjs`           | 89                                                         |
| `benchmarks/upper-bound-results/run.mjs`              | 110                                                        |
| `docs/benchmarks-v0.12.md`                            | 23                                                         |
| `docs/benchmarks-v0.9.md`                             | 26, 32, 70                                                 |
| `docs/guide/backpressure.md`                          | 9, 35, 52                                                  |
| `docs/memory.md`                                      | 204                                                        |
| `docs/partitioning.md`                                | 226, 262                                                   |
| `docs/proposal-v0.12.md`                              | 11                                                         |
| `docs/proposal-v0.9.md`                               | 67                                                         |
| `docs/research/v0.15-public-api-inventory.md`         | 121, 150                                                   |
| `docs/research/v0.15-stabilization.md`                | 82                                                         |
| `examples/streaming-binary.mjs`                       | 29, 48                                                     |
| `packages/runtime/src/api/range/stream-range.ts`      | 22, 77, 80, 92, 93, 115                                    |
| `packages/runtime/src/partition/range.ts`             | 52, 60                                                     |
| `packages/runtime/src/runtime.ts`                     | 29                                                         |
| `packages/runtime/test/binary-result.test.mjs`        | 44                                                         |
| `packages/runtime/test/containment.test.mjs`          | 322, 845, 921                                              |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`  | 286                                                        |
| `packages/runtime/test/memory-lifecycle.test.mjs`     | 53, 393, 447                                               |
| `packages/runtime/test/physical-boundary.test.mjs`    | 125, 218, 523, 556                                         |
| `packages/runtime/test/public-options.test.mjs`       | 123, 127, 137, 162, 176                                    |
| `packages/runtime/test/runtime-boundaries.test.mjs`   | 235, 452                                                   |
| `packages/runtime/test/types.test.ts`                 | 133, 143, 161, 171, 253, 262                               |
| `packages/runtime/test/upper-bound-result.test.mjs`   | 36, 296                                                    |
| `scripts/compression-supplement-v014.mjs`             | 91, 145, 184                                               |
| `scripts/cross-platform-v011/binary.mjs`              | 35                                                         |
| `scripts/r3/child.mjs`                                | 309                                                        |
| `scripts/rc/consumer.ts`                              | 46                                                         |
| `scripts/rc/soak.mjs`                                 | 263, 421, 683, 696, 706                                    |
| `scripts/reservation-soak.mjs`                        | 95, 186, 294, 377                                          |

### experimentalMaxResultBytes baseline occurrence index

| File                                                 | Lines (multiple tokens on one line count separately above) |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `benchmarks/real-world/compression/lifecycle.mjs`    | 36, 144, 239                                               |
| `benchmarks/real-world/compression/run.mjs`          | 191                                                        |
| `benchmarks/upper-bound-results/profile.mjs`         | 45                                                         |
| `benchmarks/upper-bound-results/refund.mjs`          | 32                                                         |
| `benchmarks/upper-bound-results/report.mjs`          | 88                                                         |
| `benchmarks/upper-bound-results/run.mjs`             | 128                                                        |
| `docs/adr/0019-upper-bound-result-reservations.md`   | 11                                                         |
| `docs/benchmarks-v0.12.md`                           | 22                                                         |
| `docs/guide/backpressure.md`                         | 33                                                         |
| `docs/memory.md`                                     | 204                                                        |
| `docs/partitioning.md`                               | 260, 270                                                   |
| `docs/proposal-v0.12.md`                             | 9, 17                                                      |
| `docs/research/v0.15-public-api-inventory.md`        | 120, 149                                                   |
| `docs/research/v0.15-stabilization.md`               | 81                                                         |
| `examples/streaming-binary.mjs`                      | 46                                                         |
| `packages/runtime/src/api/range/stream-range.ts`     | 21, 71, 85, 89, 114                                        |
| `packages/runtime/src/partition/range.ts`            | 51, 58                                                     |
| `packages/runtime/src/runtime.ts`                    | 28                                                         |
| `packages/runtime/test/containment.test.mjs`         | 325, 848                                                   |
| `packages/runtime/test/helpers/lifecycle-runner.mjs` | 289                                                        |
| `packages/runtime/test/memory-lifecycle.test.mjs`    | 52, 450                                                    |
| `packages/runtime/test/physical-boundary.test.mjs`   | 128, 221, 522                                              |
| `packages/runtime/test/public-options.test.mjs`      | 126, 161                                                   |
| `packages/runtime/test/runtime-boundaries.test.mjs`  | 234, 451                                                   |
| `packages/runtime/test/types.test.ts`                | 141, 159, 165, 169                                         |
| `packages/runtime/test/upper-bound-result.test.mjs`  | 35, 295                                                    |
| `scripts/compression-supplement-v014.mjs`            | 90, 144                                                    |
| `scripts/r3/child.mjs`                               | 312                                                        |
| `scripts/rc/soak.mjs`                                | 262, 420                                                   |
| `scripts/reservation-soak.mjs`                       | 93, 376                                                    |

### experimentalOutputConstructor baseline occurrence index

| File                                                   | Lines (multiple tokens on one line count separately above) |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`               | 82                                                         |
| `benchmarks/binary-results/measure.mjs`                | 172                                                        |
| `benchmarks/binary-results/regression-measure.mjs`     | 115                                                        |
| `benchmarks/mapping/measure.mjs`                       | 152                                                        |
| `benchmarks/runtime-architecture/measure.mjs`          | 167                                                        |
| `docs/benchmarks-v0.8.md`                              | 49                                                         |
| `docs/guide/core-api.md`                               | 81                                                         |
| `docs/partitioning.md`                                 | 111                                                        |
| `docs/proposal-v0.8.md`                                | 68                                                         |
| `docs/research/v0.15-public-api-inventory.md`          | 122, 151                                                   |
| `docs/research/v0.15-stabilization.md`                 | 83                                                         |
| `examples/range-work.mjs`                              | 23                                                         |
| `packages/runtime/src/api/range/parallel-map-range.ts` | 48, 49                                                     |
| `packages/runtime/src/partition/range.ts`              | 95                                                         |
| `packages/runtime/src/partition/validation.ts`         | 59                                                         |
| `packages/runtime/test/map.test.mjs`                   | 119, 125, 147, 161                                         |
| `packages/runtime/test/runtime-boundaries.test.mjs`    | 184, 201, 202, 217, 370, 419, 444, 445                     |
| `packages/runtime/test/types.test.ts`                  | 205, 219, 280                                              |
| `scripts/rc/soak.mjs`                                  | 490, 509, 670                                              |

### experimentalResultBytes baseline occurrence index

| File                                                  | Lines (multiple tokens on one line count separately above) |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `benchmarks/binary-results/fairness.mjs`              | 43                                                         |
| `benchmarks/binary-results/measure.mjs`               | 146                                                        |
| `benchmarks/real-world/compression/lifecycle.mjs`     | 145                                                        |
| `benchmarks/real-world/compression/run.mjs`           | 189                                                        |
| `benchmarks/reservation-audit/measure.mjs`            | 58                                                         |
| `benchmarks/reservation-audit/pipeline.mjs`           | 35                                                         |
| `benchmarks/reservation-audit/regression-measure.mjs` | 100                                                        |
| `benchmarks/runtime-architecture/measure.mjs`         | 141                                                        |
| `benchmarks/upper-bound-results/profile.mjs`          | 44                                                         |
| `benchmarks/upper-bound-results/report.mjs`           | 90                                                         |
| `benchmarks/upper-bound-results/run.mjs`              | 113                                                        |
| `docs/adr/0019-upper-bound-result-reservations.md`    | 12                                                         |
| `docs/benchmarks-v0.12.md`                            | 24                                                         |
| `docs/benchmarks-v0.9.md`                             | 26, 31                                                     |
| `docs/guide/backpressure.md`                          | 32, 51                                                     |
| `docs/memory.md`                                      | 205                                                        |
| `docs/partitioning.md`                                | 225, 271                                                   |
| `docs/proposal-v0.12.md`                              | 10, 16                                                     |
| `docs/proposal-v0.9.md`                               | 64                                                         |
| `docs/research/v0.15-public-api-inventory.md`         | 119, 148                                                   |
| `docs/research/v0.15-stabilization.md`                | 80                                                         |
| `examples/streaming-binary.mjs`                       | 28                                                         |
| `packages/runtime/src/api/range/stream-range.ts`      | 20, 61, 70, 86, 90, 113                                    |
| `packages/runtime/src/partition/coordinator.ts`       | 132                                                        |
| `packages/runtime/src/partition/range.ts`             | 50, 59                                                     |
| `packages/runtime/src/runtime.ts`                     | 27                                                         |
| `packages/runtime/test/binary-result.test.mjs`        | 43                                                         |
| `packages/runtime/test/containment.test.mjs`          | 324, 847, 920                                              |
| `packages/runtime/test/helpers/lifecycle-runner.mjs`  | 288                                                        |
| `packages/runtime/test/memory-lifecycle.test.mjs`     | 392, 449                                                   |
| `packages/runtime/test/physical-boundary.test.mjs`    | 127, 220, 555                                              |
| `packages/runtime/test/public-options.test.mjs`       | 122, 125, 136, 175                                         |
| `packages/runtime/test/runtime-boundaries.test.mjs`   | 233, 278, 302, 450                                         |
| `packages/runtime/test/types.test.ts`                 | 132, 157, 185, 257, 261                                    |
| `packages/runtime/test/upper-bound-result.test.mjs`   | 294                                                        |
| `scripts/compression-supplement-v014.mjs`             | 183                                                        |
| `scripts/cross-platform-v011/binary.mjs`              | 34                                                         |
| `scripts/r3/child.mjs`                                | 313                                                        |
| `scripts/rc/consumer.ts`                              | 46                                                         |
| `scripts/rc/soak.mjs`                                 | 419, 682, 696, 706                                         |
| `scripts/reservation-soak.mjs`                        | 94                                                         |

Before C, rerun `rg -n 'experimental(DispatchBatchSize|MaxBufferedResults|ResultBytes|MaxResultBytes|MaxReservedResultBytes|OutputConstructor)'`
over tracked files and compare all six names and inherited option shapes with the
inventory JSON. The script itself and this decision package intentionally retain
old spellings for migration/history. Generated `dist` is inspection output.

## Alias decision and prerelease boundaries

Default recommendation: one documented transition prerelease accepting deprecated
aliases, followed by one separately versioned prerelease that removes them **before
the final v1 candidate freeze**. Maintainer chooses the actual unused prerelease
versions when implementing C, after registry checks. Do not reuse or overwrite
RC4; Stage A changes no versions. An alternative single breaking prerelease with
no aliases reduces normalization complexity but gives existing consumers no
overlap window. Accept that alternative only by explicit ADR amendment before C.

C2 and C3 are separately reviewed implementation units that land before the
same transition prerelease; they do not each start a new alias window. C4 removes
all six aliases in the following selected prerelease. Do not publish an
intermediate partial migration without amending this release boundary.

In the transition, type each alias as deprecated and use an exclusive pair union
per renamed field (other spelling `?: never`). Preserve inherited exact/upper-bound
and count-only exclusions, including cross-spelling combinations. Runtime rule
uses property presence (`in`), **including inherited and explicit undefined**:
if both spellings occur, reject even when values are equal or undefined. Never
silently prefer one. Read only the selected property's value at its existing
validation point; do not spread options, invoke all getters up front, move
normalization to an async wrapper or read a getter twice to warn. TypeScript
without exactOptionalPropertyTypes cannot enforce every undefined case; runtime
checks remain authoritative.

Implement the transition option shapes as explicit intersection/union type
aliases where interfaces cannot express exclusive pairs. This deliberately
removes interface declaration-merging capability for those transitional names;
call out that pre-v1 type compatibility cost in notes and installed fixtures.
After alias removal, use explicit stable interfaces with only the six new
spellings where appropriate; do not promise declaration merging as an extension
mechanism or retain deprecated `never` members in the final public shape.

No runtime warning in hot paths. Use prerelease notes, migration table, JSDoc
deprecation and example updates when each spelling actually exists. Removing
aliases deletes deprecated type members and acceptance paths in the following
prerelease; **reject any old property presence after removal**, including inherited
and undefined. Test this rejection explicitly instead of silently falling back to
defaults. Keep old names in migration/history prose. Freeze only after a clean
installed consumer uses stable names alone and aliases are absent from supported
declarations/source paths. Approval of the alias window and its removal boundary
is required; elapsed time alone never authorizes removal.

The future normalizer lives at existing API/config validation boundaries; do not
add a catch-all runtime context. Getter/proxy `has` is observable, so C introduces
only the documented spelling presence checks and rejection paths. Existing valid
single-spelling access order, accounting, eager submission, pre-abort checks and
context remain. Add synchronized reentrancy tests before claiming equivalence.

## Invalid combinations and ownership boundaries

- Batch size stays integer 1–16, default 1; no automatic batching. Configured >1
  rejects child input transfers even if a physical envelope has one item. Leases
  remain unsupported for ranges/batches. Sequential items can make partial side
  effects; first failure skips later items and nothing is replayed or rolled back.
- Count capacity stays workers by default, a positive safe integer. Count-only
  cannot contain any byte-declaration/capacity property in either spelling, even
  undefined/inherited. Exact versus maximum declarations are exclusive across
  all aliases; a selected declaration requires selected reserved-byte capacity,
  and capacity without a declaration fails. Every field pair also obeys the
  both-spellings rejection rule. Byte capacity/literals are nonnegative safe
  integers; per-partition callback is synchronous and can fail lazily. Oversize
  declaration fails before that factory; a callback may reenter/abort.
- Map output constructor stays one of eleven built-ins; no subclass acceptance.
  The relevant property getter can throw/reenter before range submission; block
  validation must still precede target lookup, preserving S1's cancellation seam.
- Run lease with a defined executionLease rejects batching-property presence;
  run never gains batch support via stable spelling. Rolling restartPolicy and
  defined lifetime maxRestarts remain mutually exclusive. forceAfter requires
  graceful shutdown; first call wins without reading later options.
- Validate invalid option combinations before admitting factories, claiming or
  detaching new buffers, and posting. Preserve the current relative validation
  order for valid calls; queued cancellation releases logical claims, posted
  buffers remain detached. No rejected alias request may invoke a user factory
  or detach its would-be transfer. Parent settlement precedes sibling cancellation;
  physical credits/occupancy last until validated response/confirmed exit.

No change to timeout units, worker defaults, maxQueue, result ordering, full
collect/map retention, stream eagerness or byte units is bundled with renaming.

## B1–B3 development migration and proposed C examples

Stream cleanup: B1 now exposes the existing methods in development declarations;
published RC4 still has the old AsyncIterable declaration. B2's ordinary-backed
strict output declarations are also implemented in development. The C option
renames below remain proposed and unavailable until separate implementation.

```ts
// BEFORE B1 / published RC4: cleanup through the optional iterator return.
const iterable = runtime.streamRange(task, range, createInput);
const iterator = iterable[Symbol.asyncIterator]();
try {
  await iterator.next();
} finally {
  await iterator.return?.();
}

// CURRENT B1 DEVELOPMENT: required direct cleanup, same eager execution.
const stream = runtime.streamRange(task, range, createInput);
try {
  await stream.next();
} finally {
  await stream.return(); // Logical close; await runtime shutdown for physical cleanup.
}
```

Binary ownership: B2 narrows strict PjsBinaryResult views to ordinary backing.
This deliberate pre-v1 type change matches existing runtime rejection of shared
outputs; worker behavior and clone/transfer defaults do not change.

```ts
// BEFORE B2 / published RC4: compiles; invalid strict output at runtime.
const shared = new Uint8Array(new SharedArrayBuffer(16));
const current: PjsBinaryResult = shared;

// CURRENT B2 DEVELOPMENT: copy if a strict ordinary-backed output is needed.
const owned: PjsBinaryResult = new Uint8Array(shared);
const view: DataView<ArrayBuffer> = new DataView(new ArrayBuffer(16));
// @ts-expect-error Explicit SAB backing is now rejected.
const invalid: PjsBinaryResult = shared;
```

A task output schema widened to Uint8Array<ArrayBufferLike> (including a bare
Uint8Array annotation) must establish ordinary backing: retain constructor
inference, annotate Uint8Array<ArrayBuffer>, or copy to ordinary storage. Buffer
acceptance depends on its backing declaration, not its name. PjsOwnedTypedArray
does not prove unique references or transferability; transfer() keeps its own
liveness and list checks. Shared output users can copy, use count-only streams
without byte guarantees, or retain their prior prerelease. Inputs, PjsTypedArray,
constructors, sharedReadonly and mapping types are preserved. ResultByteDeclaration
is now root-exported with its unchanged number/synchronous callback signature.

B3 registry composition: the unsupported public registry.snapshot() method and
its declaration are removed in development. Introspection callers must keep their
own registration metadata. No deprecated method, public symbol, root helper or
supported internal subpath replaces it. Internal snapshotRegistry access preserves
independent descriptor copies, frozen handle identity and construction-time
isolation from later registrations; valid registration timing/errors are unchanged.
This is a deliberate pre-v1 JS/TS removal, separate from B4 and C promotion.

Option migration (B1 required for direct return; C3 required for stable options):

```ts
// BEFORE: existing spellings, exact-byte mode.
runtime.streamRange(bytesTask, range, createBytesInput, {
  experimentalMaxBufferedResults: 2,
  experimentalResultBytes: 16,
  experimentalMaxReservedResultBytes: 32,
});

// PROPOSED AFTER C3: all six renames appear in the table above.
const stream = runtime.streamRange(bytesTask, range, createBytesInput, {
  maxBufferedResults: 2,
  resultBytes: 16,
  maxReservedResultBytes: 32,
});
try {
  for await (const { partition, output } of stream) consume(partition, output);
} finally {
  await stream.return();
}
// { resultBytes: 16, experimentalResultBytes: 16 } rejects during transition.
// { maxResultBytes: 16, resultBytes: undefined } also rejects by presence.
```

Update current executable examples only in the implementation unit that adds the
new API. Each published example must be run against its installed candidate.
Containment examples must say a lease/escalation requests asynchronous termination,
not hard realtime interruption, sandboxing or restoration of transferred buffers.

## Reviewable promotion units and exit criteria

| Unit                                 | Dependencies / affected owners                                                                                                 | Contract and installed-consumer evidence / exit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 containment                       | B4; run adapter, configuration, controller, pool/worker contracts and docs; no option renames needed                           | Review exclusive ordinary-run lease start after successful posting, queue exclusion, already-settled caller expiry, rolling pool window vs lifetime fallback, first shutdown options, failed termination and confirmed exit replacement. Installed JS/TS imports lease error and exercises all three controls. Containment, physical-boundary and standard R2 pass with checked histories; no replay/rollback/hard deadline claims. Then explicitly approve P1 promotion                                                                                                                     |
| C2 ranges/count streams/map/batching | B1/B3/B4; range adapters/validation, map helper, existing scheduler/dispatcher interfaces; rename batch/count/constructor only | Preserve ordered collection/flat map, completion-only pre-serialization discard, eager completion-order streams, required cleanup, count limits, map constructor reentrancy, exact cardinality and empty ranges. Test batch 1/16 and invalid endpoints, singleton configured batch, transfer/lease rejection, middle-item failure/skipped siblings, cancellation/context and physical boundaries. Installed JS/TS uses every method, overload and three stable spellings; transition alias matrix passes. Standard contract/R2/R3 evidence with raw child checks; then approve P2 separately |
| C3 exact/upper-bound byte results    | B1/B2/B4 plus C2 normalizer conventions; strict stream adapter, actual credit/worker validation owners; three byte renames     | Test exact/maximum output types and actual kind/backing/visible bytes, numeric/callback/zero declarations, all incompatible spellings/shapes, oversize before factory, reservation waits, successful slack refunds, no refund on failure, cancelled parent physical retention, no object-graph/RSS claims. Installed JS rejects invalid runtime values and TS negative shared-backed outputs under both compilers. Binary/upper-bound/result-credit/physical suites and standard R2/R3 checked artifacts pass; then approve P3 separately                                                    |
| C4 alias removal / contract closure  | C2/C3 transition release and explicit selected following prerelease; root/options declarations, normalizers, fixtures/docs     | Delete aliases and reject old property presence. All six stable names only in current installed consumers and supported shape. Semantic API diff includes intentional B changes/new names; no accidental nested diagnostic or reachable-type leak. Docs/examples, build/types/package/lint pass; then select final-candidate version/baseline in F                                                                                                                                                                                                                                           |

All units preserve S1 component ownership, one controller/pump, range AsyncResource
and normal Promise context. No new tracing or broad type/state rewrite. Each unit
records exact source SHA, Node/compiler/npm/platform, commands, reports and
installed tarball identity. Raw campaign children must reconcile with aggregates;
failed/incomplete runs remain retained and excluded. Fresh standard campaigns at
promotion are evidence for those candidates; final F still reruns its full matrix
and required extended/reproduction work. No performance campaign substitutes for
contract closure or justifies promotion on its own.

If a named gate fails, default to delaying that group's inclusion and the final
release until repaired. Bounded alternative: withdraw that whole group before v1
with explicit API removal/migration to ordinary run, consumer-managed iteration
or count-only results as appropriate. It loses the group's bounds/convenience;
it cannot silently pretend equivalent safety or remain an experimental leak in
the promised experimental-free target. Select withdrawal by a separately reviewed
decision; do not delete useful APIs merely because the schedule is tight.

## Final sequence and publication boundary

S1 integration → reviewed A decisions → B corrections → C controlled promotions
and alias removal → F final-candidate qualification/rehearsal → G separately
authorized publication. Conditional internal type/state cleanup and optimization
need independent justification and must finish before F; they are not automatic
prerequisites. F must select a new version and explicit source/artifact baseline,
qualify Node floors plus chosen current patches on Linux/Windows x64, review
semantic compatibility separately from exact two-build reproduction, and rehearse
the actual installed candidate. Existing immutable RC4 gates remain unchanged.
See [stability](../stability.md) and [release procedure](../releasing.md).
