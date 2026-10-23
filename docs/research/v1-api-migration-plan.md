# Stage C: proposed migration and controlled promotion

**Stage C engineering plan — proposed, pending unit-specific maintainer decisions.**
S1, corrected Stage A and B1–B4 are integrated; this does not accept every roadmap
proposal. C2's three development spellings and deprecated aliases are implemented
as described below. C3 examples using proposed byte spellings remain unavailable.
The [inventory](v1-api-contract-inventory.md)
is authoritative for today's behavior; [B](v1-api-corrections.md) specifies the
four corrections before promotion. See [ADR 0023](../adr/0023-v1-api-stability-decisions.md).

## C2 development implementation status

The C2 handoff explicitly authorizes the shared alias-transition design from
baseline main `3e0381317fde3438e1a3008dc8c4e84257ff066a` (PR #26).
`dispatchBatchSize`, `maxBufferedResults` and `outputConstructor` now coexist
with deprecated legacy aliases. Both-presence rejects, including equal values,
inherited properties and explicit undefined. The
[range reference](../partitioning.md#c2-development-option-transition) describes
presence/getter order and transitional type compatibility; the
[engineering report](c2-range-option-transition.md) records implementation,
acceptance and source-bound qualification procedure. All feature-level
experimental annotations remain; C2/P2 promotion is a separate approval.
C3/C4 remain unimplemented. C2 and C3 must land before the same eventual
transition prerelease, which has not been selected or published. This work does
not start the alias release window or authorize a partial migration publication.
The historical planning-base ledger, occurrence audit and handoff below retain
their original attribution. Separately tracked holds remain open and untouched.

## C1-A/Q implementation status

The C1 handoff has now been invoked after this plan was integrated through PR #25
at main `7533fbad82c3d80df80a6f6b633398b21dbcf827`. The
[C1 engineering report](c1-containment-acceptance.md) records the acceptance,
installed-consumer and comment/documentation changes, plus the clean-candidate
qualification procedure. Source/environment/package receipts in delivery bind
actual results to the final candidate. The planning-base ledger/findings and
handoff text below remain their original reference; they are not newly executed
B4 results or a second authorization. C1-A/Q does not remove experimental status,
implement C2–C4 or decide unresolved release-hold applicability. C1-P remains a
separate maintainer approval/action after evidence and eligibility review.

## Verified starting state and qualification ledger

Planning base: fetched main `35f2aacfe431516ed559409a3cba6bf2ccd2e6b7`, the
[PR #24](https://github.com/Miskovy/parallel-javascript/pull/24) merge of B4.
The reviewed B4 candidate is `e78b773587c2f6f58ce9ef8f26d2b97de35251a5`.
Both have tree `48bb493a6717dfbd2259af017937ca623110b044`, also verified for
the CI synthetic merge `c8c1576ffc255e4550463d5664c810b61afb4235` through
GitHub's commit metadata. The main-to-candidate tree diff is empty. Thus the
merged implementation matches the reviewed/tested source tree; these remain
historical B4 executions, not fresh runs at main or this documentation candidate.

The current inventory records **61 roots, 17 runtime values, 44 type-only names,
322 members, zero additional named reachable types and 158 diagnostic leaves**.
B1 exposes existing closeable stream behavior; B2 constrains strict binary backing;
B3 internalizes registry snapshots; B4 names diagnostic/error contracts. No proposed
C2/C3 stable option spelling exists yet and no feature has been promoted. Preserve S1's facade,
configuration/composition/controller boundaries and existing state owners.

The [B4 CI run 39837158296](https://github.com/Miskovy/parallel-javascript/actions/runs/39837158296)
completed successfully. Its retained reports actually identify **synthetic merge
c8c1576**, not the candidate head. All twelve artifact archives were downloaded,
verified against GitHub's archive SHA-256 digests and inspected after extraction
during planning. Per-cell ordinary reports, contract children, R2 histories/actions,
real-worker/negative/replay/cleanup records, and every R3 config/result reconciled.
The raw children agree on source, clean tree, exact environment, measurements,
quiescent owners and confirmed thread exits. This re-inspection corroborates the
supplied independent review; it does not execute a new campaign.

| Evidence source                       | Tested source       | Platform    | Exact Node | Runtime npm | Accepted results                                                |
| ------------------------------------- | ------------------- | ----------- | ---------- | ----------- | --------------------------------------------------------------- |
| B4 CI, ubuntu / 22.13.0               | c8c1576, tree above | Linux x64   | 22.13.0    | 10.9.2      | 314 contracts; 162 R2 histories / 2,746 actions; 11 R3 children |
| B4 CI, ubuntu / 24                    | c8c1576, tree above | Linux x64   | 24.21.0    | 11.19.0     | Same counts, independently reconciled                           |
| B4 CI, windows / 22.13.0              | c8c1576, tree above | Windows x64 | 22.13.0    | 10.9.2      | Same counts, independently reconciled                           |
| B4 CI, windows / 24                   | c8c1576, tree above | Windows x64 | 24.22.1    | 11.19.1     | Same counts, independently reconciled                           |
| Retained local B4 final-node22 report | e78b773             | Windows x64 | 22.13.0    | 10.9.2      | 314 contracts and ordinary B4 gates; no new R2/R3 campaign      |
| Retained local B4 final-node24 report | e78b773             | Windows x64 | 24.21.0    | 11.18.0     | 314 contracts and ordinary B4 gates; no new R2/R3 campaign      |

All four CI cells pass build, types, compatibility, installed declarations and
emitted TS consumers under both locked compilers, release dry-run regressions,
lint/format/docs/diff. Primary compiler is 7.0.2; compatibility checker is 6.0.3
(wrapper 6.0.2). Release npm is independently selected at 11.19.0. Each retained
CI package has 188 files and SHA-256
`e6b2e9a40d13b11fe6add6b31a5bcab9f9e9e4bc680b692347d1d850226934b0`;
the four actual archives match their reports. Local reports and their archived
packages remain separate evidence, even where the package hashes agree.
That hash identifies B4, not this later documentation candidate: this plan also
updates the packed package README. No new package/campaign qualification is
claimed for those documentation edits.

Earlier [S1](s1-runtime-api-boundaries.md), [B2](b2-strict-binary-output-types.md),
[B3](b3-internal-registry-snapshots.md) and [B4](b4-explicit-diagnostic-contracts.md)
reports retain their original source/environment/availability conclusions. B1's
local engineering/delivery record identifies 5e5625bb97b12c3e5ed18fbc58177787cbb9c7b5;
its attributed independent review is recorded in the B2 report. Historical B2
Linux remains incomplete: Node 22 used separately successful runs without an
end-to-end ordinary qualifier, and Node 24 was incomplete/failed. Later B4 success
does not repair that record. No Node 24.0.0 floor or final-release qualification
follows from these later-patch B4 results.

Separately tracked release holds remain **open and untouched**. The available
status records do not establish which C units are independent of those holds.
Record that applicability dependency as **unresolved**, without investigation or
technical discussion. Independent planning and the proposed C1 acceptance work
can proceed; a promotion recommendation requires a maintainer's explicit
applicability/eligibility decision. No blanket clearance is inferred from CI.

## C1 next: contract closure and qualification, then a separate promotion decision

Code inspection identifies **no required C1 behavior change**. This is a scoped
finding about the named contract, not proof that every possible defect is absent.
Distinguish the work precisely:

executionLease and forceAfter remain optional integer milliseconds in
**1 through 2³¹ − 1**, disabled when undefined; they are elapsed monotonic
deadlines, not CPU-time budgets. On a non-failed runtime, forceAfter starts at the
first valid graceful shutdown request, including startup, with drain defaulting true; defined
forceAfter with drain false is invalid. restartPolicy.maxRestarts is a nonnegative
safe-integer decision budget and windowMs a positive safe-integer millisecond
window. With no rolling policy, lifetime maxRestarts defaults to workers × 4.
Defined restartPolicy and defined maxRestarts conflict; an explicitly undefined
lifetime option is permitted. Do not replace those existing defined-value rules
with the new property-presence alias rules intended only for C2/C3. Cancellation,
logical timeout and lease expiry are distinct; termination is asynchronous.

| Concern                                       | Actual code and existing evidence                                                                                                                                                                                                                                                                                                                       | Planned gap / change class                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary executionLease                       | `api/run.ts` delegates unchanged; `tasks/coordinator.ts` validates a defined lease before timeout/signal/transfer work and rejects children/batch-property presence; `dispatch/dispatcher.ts` arms only after successful post and physical credit claim; `workers/worker.ts` owns correlation, monotonic deadline, stale-token checks and timer cleanup | Contract documentation and installed emitted TS coverage; no lease algorithm or adapter refactor                                                                                                                                                                                                                                |
| Rolling restartPolicy vs lifetime maxRestarts | `configuration/runtime-options.ts` normalizes/copies the policy before registry capture; `pool/pool.ts` owns the rolling timestamps, removes entries at or before cutoff, counts approved restart decisions and waits for exit before replacement. Lifetime fallback defaults to workers × 4, with zero valid                                           | Existing deterministic expiry/exhaustion/mutation tests suffice; clarify mutually exclusive defined values, defaults, units and decision-count vs replacement-count diagnostics                                                                                                                                                 |
| First graceful shutdown / forceAfter          | `lifecycle/runtime-controller.ts` returns the cached promise before reading later options, uses monotonic remaining time and awaits dispatcher stop before releaseAll/stopped. Worker stop and pool repair preserve physical occupancy until actual exit                                                                                                | Existing first-call, startup, early-wake, transfer/credit, real infinite-work and termination-rejection cases suffice for those paths. Add an installed active-escalation scenario; idle shutdown with forceAfter alone does not demonstrate escalation                                                                         |
| Error and diagnostics                         | `errors/index.ts`, `diagnostics.ts`, `telemetry/runtime.ts` already expose the B4 contracts; `types/index.ts` and runtime options still mark containment controls experimental                                                                                                                                                                          | Documentation/type-comment clarification and focused fixtures; preserve hierarchy, all seven containment fields and required number-or-undefined utilization count                                                                                                                                                              |
| Failed lease-driven replacement termination   | Production worker/pool/controller paths retain ownership and fail closed; the existing explicit rejection case injects non-draining shutdown termination failure                                                                                                                                                                                        | A focused deterministic acceptance case for lease-expiry → failed repair termination is missing in the inspected cases. Add proof of no replacement/replay, one caller settlement, rejected cleanup and retained physical ownership until actual exit; this is missing path-specific evidence, not a planned runtime correction |

These are the exact C1 production modules to inspect and compare, not a mandate to
edit them. Also retain `composition/create-runtime-components.ts`,
`tasks/registry.ts`, `results/credit.ts` and the facade's ready/run/shutdown
delegation as read-only boundary references. Registry behavior is already closed
by B3; C1 does not reopen registry design or range/binary promotion.

### C1 work packages

1. **C1-A contract record and focused acceptance.** Update current containment,
   lifecycle, telemetry/error and stability guidance, plus corresponding inventory
   dispositions. Clarify existing declaration comments where needed, preserving
   every experimental annotation. Reuse `containment.test.mjs` (queue/post failure,
   early/stale lease timers, already-settled callers, rolling cutoff at 100 ms,
   shutdown/escalation/failed termination), `physical-boundary.test.mjs`,
   `runtime.test.mjs`, `public-options.test.mjs`, `runtime-boundaries.test.mjs`,
   `registry.test.mjs`, `diagnostics.test.mjs` and relevant memory-lifecycle cases.
   Use the existing containment clock/exit gates and bounded helpers. Add only
   the missing lease-repair termination-rejection path; do not duplicate the
   tested non-draining-shutdown failure or rewrite the independent model.
2. **C1-A installed package closure.** Extend `scripts/package-consumer/consumer.ts`
   and existing fixtures with emitted ordinary-run lease, rolling policy and
   forceAfter use; explicitly import/use RunOptions, RestartPolicy,
   ShutdownOptions, PjsExecutionLeaseError and PjsContainmentStats. Keep the
   existing full `types.test.ts` under both compilers and add focused wrong-value/
   unsupported-range negatives only where absent. Runtime-only exclusions remain
   runtime checks; do not silently redesign the option interfaces as unions.
   Extend installed `containment.mjs`/`containment-tasks.mjs` with synchronized
   active graceful escalation and a lifetime-budget/default-mode comparison to
   the existing rolling-policy lease/replacement case. Observe shared start
   signals, one caller outcome, confirmed cleanup and no replay; preserve the
   existing watchdog. Verify shared shutdown promise/options identity using an
   instrumented later getter, and run from the packed package outside the repo
   through `package-smoke.mjs`, without skipLibCheck.
3. **C1-Q source-bound qualification.** Commit the acceptance candidate and run
   the C1 row of the matrix below. Preserve failed attempts and reconcile every
   retained child/package. Compare production JS and supported declarations with
   the B4 base: absent intentionally reviewed comments, expect unchanged runtime
   code and no supported shape change. Any behavioral discrepancy is a scope
   decision: stop, preserve the repro, and propose a separate correction rather
   than widening C1 or weakening an assertion/timeout.
4. **C1-P explicit promotion action, after evidence review.** A maintainer must
   approve the named C1 candidate and release-hold eligibility. Only a separately
   authorized patch then removes the relevant experimental annotations from
   RunOptions.executionLease, ShutdownOptions.forceAfter, RestartPolicy,
   PjsRuntimeOptions.restartPolicy and PjsExecutionLeaseError, and updates current
   docs/inventory P1 dispositions. PjsContainmentStats already has an explicit
   public shape; preserve it. Review emitted comment/declaration/package diffs
   and apply the matrix's source-change rule. No option spelling changes, version
   selection, publication or acceptance of ADR 0023 as a whole follows.

### C1 acceptance checklist

- [ ] Leases remain supported ordinary-run dispatch only, with successful-post
      start, no queue-time charge, distinct caller deadline and no second
      settlement after timeout/abort; no range/batch lease support is added.
- [ ] Rolling monotonic policy and defined lifetime budget exclusion, copied
      construction options, exact expiry boundary, zero budget, lifetime fallback,
      fatal/bootstrap behavior and bounded configured live-worker population retain
      their existing results.
- [ ] First shutdown owns options/shared promise; graceful drain or escalation
      preserves credits/occupancy until validated result or confirmed exit.
      Rejected termination rejects cleanup, retains physical ownership and never
      reports successful cleanup or spawns an early replacement.
- [ ] Error inheritance/name/context, diagnostic counters/units/lifetimes and
      writable copied records agree with B4. Restart utilization is a count,
      with undefined without a rolling policy.
- [ ] Installed JS and both emitted TS consumers exercise all controls and
      legacy fallback; focused contracts use synchronization, with no new sleeps,
      GC deadlines, performance bounds or production test hooks.
- [ ] Exact candidate/platform/Node/package evidence passes the C1 matrix;
      failed/incomplete/unavailable cells remain visible and excluded.
- [ ] Maintainer explicitly decides promotion/hold applicability; until then
      experimental status remains. No task replay, rollback, restored transferred
      inputs or hard realtime interruption guarantee is promised.

## Spelling and occurrence audit

Recommend these six minimal renames. Do not rename methods, result wrappers,
partition fields, error classes or diagnostic aliases merely for consistency.

| Current                            | Proposed stable        | Declared option shapes / dependencies                                                     |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| experimentalDispatchBatchSize      | dispatchBatchSize      | PartitionOptions and all derived stream/binary/typed-map options; C2                      |
| experimentalMaxBufferedResults     | maxBufferedResults     | StreamRangeOptions, exact/upper-bound options, root-named CountOnlyStreamRangeOptions; C2 |
| experimentalResultBytes            | resultBytes            | BinaryStreamRangeOptions; excluded in upper-bound and count-only; C3                      |
| experimentalMaxResultBytes         | maxResultBytes         | UpperBoundBinaryStreamRangeOptions; excluded in exact and count-only; C3                  |
| experimentalMaxReservedResultBytes | maxReservedResultBytes | Both strict-binary shapes; excluded in count-only; C3                                     |
| experimentalOutputConstructor      | outputConstructor      | TypedMapRangeOptions; C2                                                                  |

The refreshed [tracked occurrence appendix](stage-c-option-occurrence-audit.md)
is pinned to planning base 35f2aac and covers production source, tests, examples,
tooling, current/historical docs and benchmarks. Counts are exact tokens / matching
lines / files: DispatchBatchSize **130/128/53**; MaxBufferedResults **110/110/54**;
OutputConstructor **42/42/22**; ResultBytes **83/83/46**; MaxResultBytes
**62/62/33**; MaxReservedResultBytes **95/95/45**, all with the experimental prefix.
The appendix gives every file/line and its review class; this planning patch and
ignored/generated files are outside that fixed-baseline count. Do not bulk-replace
historical/RC records or treat deliberate audit/rejection-test uses as leaks.

### Historical S1 occurrence audit — retained unchanged

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

The refreshed audit shows live use in production, type/runtime fixtures, installed
consumers, examples and operational tooling, beyond historical prose. The existing
package consumers already exercise both strict modes and all range entry points;
preserving an overlap window lets those callers migrate without an immediate
spelling break. It does not prove the future alias implementation correct.
**Continue recommending the shared transition**, subject to approval: it adds
presence selection, exclusive unions, JSDoc deprecations, cross-spelling matrices
and an eventual removal guard. A single explicit breaking prerelease eliminates
that temporary normalization/type complexity and declaration-merging interruption,
but requires callers to update all six spellings atomically. Choose it only if
maintainers accept that documented pre-v1 compatibility cost; then amend C4 to
contract closure rather than pretending an alias window occurred. Neither path
selects a version, starts a window or authorizes a partial migration publication.

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

## Integrated B1–B4 migration and proposed C examples

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

B4 intentionally names all diagnostic/error contracts without changing runtime
behavior. Its seventeen type-only root exports and the preserved 158 diagnostic
leaves are integrated through PR #24. Current diagnostic/error guides and the
canonical inventory describe that source; older engineering reports retain their
original validation scope. C1 does not rename those types or prune their fields.

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

## C1–C4 dependency and decision table

| Unit / intended supported surface                                                                                                                                     | Dependencies and actual owners                                                                                                                                                                                                                                                  | Proposed changes / compatibility                                                                                                                                                                                                                                       | Existing evidence and missing proof                                                                                                                                                             | Objective exit                                                                                                                                                                                                             | Required decision / independent progress                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1 containment:** ordinary executionLease, rolling restartPolicy vs lifetime maxRestarts, graceful forceAfter, lease error and containment diagnostics              | B4 complete. Task coordinator validates; dispatcher posts/claims; worker owns lease and physical exit; pool owns recovery; controller owns shutdown; telemetry copies                                                                                                           | No identified algorithm change. C1-A/Q adds focused contracts, installed scenarios and docs/type-comment clarity; C1-P separately removes approved annotations. No spelling or shape break                                                                             | Reconciled B4 ledger plus the precise existing/missing cases above. New C1 acceptance/qualification and promotion approval remain missing                                                       | C1 checklist, installed controls, unchanged semantics and C1 matrix pass at the named candidate                                                                                                                            | Authorize A/Q separately from P1 approval. Can proceed without C2/C3 implementation. Hold applicability remains unresolved, not presumed independent                                                                                     |
| **C2 ranges, count streams, mapping, batching:** partitionRange/parallelFor/streamRange/parallelMapRange, closeable iterator, batch/count/outputConstructor spellings | B1/B3/B4 complete. API range adapters and validation; RangeCoordinator owns parents/production; map assembly validates/copies; dispatcher/scheduler own existing admission. No C1 promotion prerequisite                                                                        | Add three stable names and approved deprecated aliases at existing read boundaries; adapt option interfaces to explicit unions/intersections as necessary; update active docs/examples/consumers. JS changes are intended normalization changes, not an engine rewrite | B4 range/closeable-stream/map/batch and installed coverage exists. New spelling/presence/getter/proxy/reentrancy matrix, transition assignability and source-bound qualification are missing    | Ordered collect/map and full retention, completion-only discard, eager completion-order stream, cleanup, count bounds; batch 1/16/invalid/singleton transfer exclusions; no range leases; C2 matrix passes                 | Approve P2 and migration strategy separately. Plan/implement independently of C1; coordinate C3's shared transition and boundary semantics before any migration publication                                                              |
| **C3 strict binary results:** exact/upper-bound visible payload credits, ordinary-backed outputs, declaration callbacks and byte aliases                              | B1/B2/B4 complete; requires C2's agreed count/batch normalization and shared option-shape conventions, not blanket C2 promotion. Stream adapter selects mode; credit manager owns reservations/reconciliation; worker validates actual output; coordinator owns parent delivery | Add three stable byte names and approved aliases, retain cross-spelling exact/maximum/capacity exclusions and count-only never members; update active docs/installed consumers. Preserve physical-credit semantics and B2 backing constraint                           | B4 binary/upper-bound/credit/physical suites, 104 installed positives and 29 rejection cases exist. Mixed-spelling mode/exclusion, lazy callback/getter ordering and fresh C3 proof are missing | Oversize before factory, numeric/callback/zero/visible-byte contracts, one-time waits, positive-slack refunds, no failure refund, cancellation credit through physical end; C3 matrix passes, no RSS/backing-store promise | Approve P3 and shared migration boundary. Binary planning can proceed now; final normalization integration and transition publication depend on the C2 convention decision                                                               |
| **C4 alias removal and closure:** stable spellings only in supported option shapes, legacy presence explicitly rejected                                               | Under alias strategy, both C2/C3 integrated and their single transition actually released, followed by separately approved next prerelease boundary. Same validation owners; public shape/docs/inventory closure                                                                | Delete deprecated acceptance/type members, retain old-name presence guards and negative tests; restore explicit stable interfaces where appropriate. Deliberate pre-v1 removal, no silent ignore/default fallback                                                      | No C4 candidate exists and no alias window has begun. Needs evidence of the actual shared transition, approved removal boundary, current stable-only installed consumers and semantic diff      | All six legacy properties reject even inherited/undefined, current consumers use stable names, no diagnostic/root/internal leak; C4 matrix passes before F                                                                 | Approve removal timing explicitly, never by elapsed time. Planning can proceed; execution is blocked by the real transition dependencies. If the breaking alternative is chosen, amend C4 to closure with no invented alias prerequisite |

### C2/C3 boundary assignments and migration acceptance

Change only the selected names at their existing boundaries:
`partition/validation.ts` reads batch after timeout/signal; `api/range/stream-range.ts`
reads count before declaration mode/capacity and preserves rejection accounting;
`api/range/parallel-map-range.ts` reads the constructor before parent submission;
`tasks/coordinator.ts` must recognize either batch spelling when rejecting a
defined ordinary-run lease combination. `partition/range.ts` and existing facade/
adapter signatures own the public option shapes. Keep any shared name-selection
helper private and small; select a property name by presence and read its value
only at that boundary. Do not centralize all reads, spread options, wrap methods
as async or introduce a new configuration/state framework.

Each pair needs JS and both-compiler fixtures for old-only, new-only, neither,
both equal/different/undefined, inherited properties and getter/proxy has/read
order. Strict mode tests must cross exact/maximum/capacity spellings; count-only
must exclude all byte keys in both spellings. Check invalid calls before input
factories/admission/transfer effects, reentrant abort/shutdown and the existing
map validation-before-target lookup seam. New presence probes are observable;
document those deliberate checks without changing valid single-spelling getter
order or accounting. Transition notes must explain interface-to-union declaration
merging costs, and TypeScript's limits without exactOptionalPropertyTypes.

### Qualification matrix and evidence rules

| Unit / stage                 | Deterministic contracts and type/package gates                                                                                                                                                                                                                                            | Campaign scope                                                                                                                                                                                                                                           | Required outcome                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| This documentation plan      | Documentation links, locked Prettier formatting, diff cleanliness; verify documentation-only paths and unchanged protected inputs                                                                                                                                                         | None manually run; re-inspect existing B4 artifacts only. Normal repository CI may run automatically on push/PR                                                                                                                                          | Reviewable plan; no fresh runtime qualification or promotion claim                                                                          |
| C1-A/Q and P1 recommendation | Reuse the named containment/physical/boundary/diagnostic suites plus full ordinary contracts; both locked public fixtures and production compatibility; installed JS plus emitted TS controls; build, inventory/declaration/JS comparison, dry-run release tooling, lint/format/docs/diff | Standard R2 for caller/lease/restart/shutdown ordering. Standard R3 is relevant because containment touches transfer/shared input, reservation and shutdown lifetimes; use the unchanged standard profile, not invented reduced or extended GC scenarios | Fresh C1 source-bound four-cell evidence, including missing acceptance paths, before recommending P1; C1-P still requires explicit approval |
| C2 / P2 recommendation       | Full ordinary gates; range/completion/stream/closeable/map/batch and getter-boundary cases; both compiler overload/alias negatives; installed every method, overload and three stable names                                                                                               | Relevant standard R2/R3 with original independent model, seeds/actions/bounds retained                                                                                                                                                                   | Reviewed migration semantics and P2 contract, no accidental physical/admission/async-context changes                                        |
| C3 / P3 recommendation       | Full ordinary gates; binary/upper-bound/result-credit/physical/transfer cases; both strict modes/backing negatives under both compilers; installed byte modes and cross-spelling guards                                                                                                   | Relevant standard R2/R3, including cancelled-owner retention/reconciliation and confirmed exits                                                                                                                                                          | Visible-byte/ownership semantics and combined C2/C3 normalization accepted; no process-memory claim                                         |
| C4 closure                   | Full ordinary gates; stable-only public declarations and installed consumers; legacy own/inherited/undefined presence negatives at all old boundaries; intended semantic inventory delta                                                                                                  | Reuse explicitly identified, input-equivalent accepted promotion evidence when justified; run affected standard R2/R3 if guard/admission/accounting paths change. This is not an automatic waiver and not a new campaign for a documentation-only edit   | All six supported shapes closed, removal boundary approved, input/source differences explained; final F remains required                    |
| Stage F final candidate      | Select new source/version/baseline/artifact; full required checks, installed/rehearsed exact tarball, semantic review and two clean build reproduction                                                                                                                                    | Full required standard and separately specified extended/final campaigns; qualify supported floors and selected current patches on both OSes                                                                                                             | Candidate-specific release qualification, with release holds still governed separately; no publication permission                           |

The proposed starting C1 promotion cells deliberately match verified B4 coverage:
**Linux x64 Node 22.13.0 and 24.21.0; Windows x64 Node 22.13.0 and 24.22.1**.
These are exact initial test targets, not a claim of today's latest patch or a
new support floor. Confirm patch selections/availability before running; record
and approve replacements explicitly rather than treating the floating CI `24`
selector as evidence for an untested patch. A common selected Node 24 patch
across OSes is preferable if deliberately chosen and qualified. Node 24.0.0,
selected current patches in both majors, deduplicated floor/current cells, other
final gates and reproducibility remain Stage F obligations. No macOS/ARM or
family-wide every-patch result is inferred.

Use `runtime:qualify` for an actual promotion candidate with the independently
selected release CLI and fresh exclusive output paths. In existing CI, R2/R3 run
once before that qualifier and their reports are supplied; do not launch a second
copy merely to aggregate. Supplement with the full compatibility compiler type
fixture, inventory parity/tool regressions and intentional emitted/API comparison.
Keep compiler/runtime npm/release npm identities separate. Both installed compilers
check declarations without skipLibCheck and execute consumers against the exact
retained tarball outside the repo.

Every accepted receipt records actual SHA **and tested tree**, clean status,
platform/architecture, exact Node patch, tools/command/environment, source inputs
and package SHA-256. Reconcile contract children; R2 raw histories/actions,
observations, real-worker, negative, replay and cleanup records; each R3 child
config/result, source/environment, measurements, ownership checkpoints and confirmed
exits. Verify archived/extracted copies and package bytes, not aggregates alone.
If source changes after qualification, rerun affected gates or obtain an explicit
review of exact relevant-input equivalence; retain original execution SHAs and
never relabel receipts as fresh runs of the new commit. An annotation-only
promotion patch still needs a reviewed declaration/comment/package diff and
new package identity where bytes change.

Failed, incomplete and unavailable cells remain in the ledger and cannot count
as passed. Retain failures and original timeouts/checks; a corrected rerun gets
fresh paths and source attribution. A failed named feature gate delays that
unit's promotion. Do not silently change semantics, broaden this plan into a
correction/refactor, repair unrelated holds, or use another group's green result
as a substitute. No full campaign is manually run solely to write this plan.

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

### Open maintainer decisions

1. Authorize C1-A/Q as the next scoped acceptance/documentation/qualification
   task; confirm that no new behavior or experimental-status removal is included.
2. State which separately tracked holds apply to each unit and whether the named
   C1 candidate is eligible for promotion review. Applicability is unresolved here;
   no investigation or clearance is delegated by this plan.
3. After the C1 checklist/evidence, approve or defer P1 for an exact candidate and
   authorize the separate C1-P annotation/status patch. C2/P2 and C3/P3 remain
   their own contract and promotion decisions.
4. Approve the shared alias transition recommendation or explicitly choose/amend
   to one breaking prerelease. Approve six mappings, presence/exclusion semantics,
   transition type compatibility cost and the no-partial-publication boundary.
   Choose actual unused release versions later; no alias window starts here.
5. Approve C4's later removal boundary after a real transition, or its amended
   closure scope under the breaking alternative. Separately approve F's exact
   platform/patch/floor and source/artifact selection; G remains publication-only
   authorization after all release gates, not an automatic consequence of C.

### Ready-to-copy C1-A/Q prompt — future task, not executed by this plan

```text
Prepare PJS C1-A/Q acceptance and qualification from current verified main.
Read AGENTS.md and the reviewed docs/research/v1-api-migration-plan.md, including
its C1 work packages, qualification matrix and unresolved hold applicability.
Fetch refs, preserve unrelated work and use an isolated branch/worktree.

Existing code appears to meet the containment contract. Do not refactor runtime
algorithms, rename options, change defaults or remove experimental annotations.
Preserve ordinary-run successful-post leases, distinct caller deadlines, one
settlement, monotonic rolling/lifetime budgets, first-shutdown promise/options,
confirmed-exit replacement, failure-retained physical ownership, no replay,
rollback, transfer restoration or hard realtime guarantee.

Implement C1-A's scoped docs/type-comment and missing acceptance work: reuse
existing deterministic suites; add the lease-driven repair termination-rejection
path without duplicating the existing non-draining rejection test. Extend packed
JS and both emitted TS consumers for all containment controls, active graceful
escalation and lifetime fallback, preserving gates/watchdogs and public shapes.
Keep separately tracked holds open; do not investigate them or assume eligibility.
If a behavioral mismatch appears, retain the repro and stop for a scope decision.

Commit and qualify the clean candidate using the C1 matrix's exact proposed OS/
Node cells, reconfirmed before execution. Run ordinary gates, both locked compiler
consumers, installed-package and inventory/JS comparisons plus standard R2/R3 at
promotion recommendation. Reconcile raw children, exact source/tested tree and
tarball hashes; retain failed/incomplete/unavailable attempts without weakening
checks/timeouts. Historical B4 evidence is baseline evidence, not fresh C1 runs.

Deliver the candidate, report and a reviewable scoped change. A normal push/draft
PR targeting main is authorized for this future C1-A/Q task only when this prompt
is explicitly invoked. Do not merge, auto-merge, promote P1, select versions,
publish, tag, implement C2-C4/Stage F, investigate release holds or perform Rust/
unrelated work. Recommend or defer promotion; C1-P needs separate maintainer
approval and authorization after the evidence and eligibility review.
```

S1 integration → reviewed A decisions → B corrections → C controlled promotions
and alias removal → F final-candidate qualification/rehearsal → G separately
authorized publication. Conditional internal type/state cleanup and optimization
need independent justification and must finish before F; they are not automatic
prerequisites. F must select a new version and explicit source/artifact baseline,
qualify Node floors plus chosen current patches on Linux/Windows x64, review
semantic compatibility separately from exact two-build reproduction, and rehearse
the actual installed candidate. Existing immutable RC4 gates remain unchanged.
See [stability](../stability.md) and [release procedure](../releasing.md).
