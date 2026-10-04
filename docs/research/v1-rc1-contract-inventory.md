# v1 RC1 frozen contract inventory

Baseline: v0.15.0 `58a3ce056d8ef9b7cf6991a37fcc7fcffc018e7c`.
[Explicit export/source/declaration snapshot](../../scripts/rc/frozen-v015.json)
contains 38 named exports: 16 values and 22 type-only symbols. The
[freeze check](../../scripts/rc/api-freeze.mjs) requires byte-identical runtime
source and declarations plus unchanged manifest export/type/engine contracts.
Byte identity is stronger than a formatting-insensitive declaration comparison.
No export, option, error class, type or lifecycle change is proposed. Classification
remains exactly [v0.15 stability](../stability.md); no experimental promotion.

The table maps promises to the existing 184 individual regression tests and new
[bounded harness](../../scripts/rc/soak.mjs). Every profile covers the listed
scenario families. Fresh exact-candidate Windows qualification passes on Node 22.13.0, 22.23.3
and 24.21.0, including installed consumers and standard soaks. Fresh Fedora/Linux
x64 qualification also passes on exact Node 22.13.0 and installed Node 24.13.1,
including both standard soaks and clean extended reproduction. The
[readiness matrix](v1-rc1-readiness.md) records final release gates.
Installed JS and TS projects also exercise the package root without workspace links.

| Contract / public surface        | Frozen behavior                                                       | RC scenario / existing protection                                       | Fresh platform coverage / RC status               |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Runtime construction / options   | Integer validation, fixed pool/queue/startup/restart budget           | Existing startup/options; repeat construction                           | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Registry.register / task handles | Unique nonempty ID, local file export, registry membership            | public-error-identities-and-recovery; registry tests                    | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| run admission                    | Accept bounded work or reject; no hidden waiting                      | lifecycle-mixed; deep-queue-FIFO-overflow-recovery                      | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Queue capacity                   | Waiting logical tasks obey maxQueue; overflow is recoverable          | Deep queue 128, explicit overflow, post-drain run                       | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Queue order                      | Existing FIFO single-worker behavior, no lost/duplicated jobs         | Deep-queue sequence 0..127                                              | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Worker execution                 | Registered trusted module export; no closure/source evaluation        | CPU smoke, installed fixtures, production source scan                   | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Caller settlement                | Exactly once on success/failure/abort/deadline                        | lifecycle-mixed; late-result split; existing lifecycle tests            | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Physical execution               | Caller rejection does not free a busy worker                          | caller-physical-split; gated queued sentinel                            | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Queued cancellation              | Body never starts; input remains attached; ownership claim released   | queued-cancel-timeout; reuse transferred buffer                         | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Active cancellation              | No preemption/rollback; late result discarded                         | caller-physical-split; active iterator return                           | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Deadlines                        | Include queue/execution/parent/consumer waiting as documented         | queued-cancel-timeout; split; consumer timeout; existing tests          | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| AbortSignal cleanup              | Listener removed on settlement; no warning suppression                | mixed run signals, abort/deadline/worker failure, getEventListeners     | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Worker failure                   | Affected work rejects, no replay                                      | bounded-worker-crashes-and-storm                                        | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Worker replacement               | Await old exit; fixed target; bounded lifetime restart budget         | Individual exits, two-worker storm, exhausted budget                    | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Task failure                     | Throw/rejection is task error, healthy future work                    | mixed lifecycle; installed all-error smoke                              | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Streams / iterator               | Single consumer, completion order, range metadata                     | completion-order/no-missing-or-overlap                                  | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Slow consumer                    | Count and byte credits gate production                                | streams-refunds-ownership, 1 ms yield delay                             | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Consumer break/return/throw      | Cancel production, release buffers; posted work can finish            | consumer-break-return-throw-and-timeout                                 | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Count credit                     | Buffer plus admitted-unsettled children <= per-stream cap             | Live invariant inspection; capacities 1, 2, 4; zero-byte values         | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Byte credit                      | Visible output bytes, per stream; not RSS/backing/native/input memory | Live credit composition and per-stream capacity checks                  | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Exact results                    | Worker validates equality before transport                            | Mixed valid lengths, smaller and larger mismatch, recovery              | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Maximum results                  | Actual <= declared maximum; reconcile before retention                | Maximum stream, deliberate overflow, healthy followup                   | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Refund                           | Success refunds M-A; equal success reconciles with zero refund        | Actual 0/1/2/8/16/64, expected refund sum and event delta               | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Active strict credit             | Hold maximum until physical end after caller cancellation             | caller-physical-split: retain 1024 for actual 1                         | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Transfer input/output            | Entire eligible backing detaches when posted; no restoration          | queued ownership reuse, echo detach/output, existing transfer tests     | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Shared readonly                  | Copy once, concurrent immutable reuse; no runtime freezing            | concurrent sum against clone/transfer control; shared tests             | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Mixed transport                  | No cross-task result/ownership contamination                          | streams-refunds-ownership; mixed concurrent transports                  | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Numeric boundaries               | Empty/one/tail/grain>span/divisible/nondivisible supported ranges     | range-boundaries-map-discard                                            | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| parallelFor                      | Suppress worker output before serialization                           | Deliberately uncloneable discarded results                              | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| parallelMapRange                 | Validated block kind/length, ordered typed assembly, tails            | Boundary map; 10,001 elements; wrong block error                        | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Shutdown                         | First call fixes drain mode; shared promise; close admission          | Eight-state shutdown matrix, concurrent calls, during/after submissions | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Forced shutdown                  | Cancel accepted callers and stop active workers                       | Queued/stream/pool isolation controls                                   | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Graceful shutdown                | Wait physical work and accepted stream delivery                       | Active/stream/cancelled/replacement controls                            | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Runtime independence             | No shared worker, queue or shutdown state                             | multiple-runtimes-isolated                                              | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Resource cleanup                 | Terminal zero actual owned bookkeeping; listeners/ports/timers end    | All terminals, repeated lifetimes, natural process exit watchdog        | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Errors                           | Twelve exported identities, contextual fields, recoverability         | [Error matrix](v1-rc1-error-matrix.md); installed all-error smoke       | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Package import/types             | ESM root, typed declarations, blocked internal subpaths               | Real separate JS/TS tarball consumers, full type regressions            | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |
| Worker resolution                | From installed artifact, independent of cwd and spaces                | External consumer paths with spaces / unrelated cwd                     | Windows PASS; Fedora/Linux 22.13.0 / 24.13.1 PASS |

Stats and internal maps are observed as diagnostics only. Aggregate memory fields
do not define a new public guarantee. No additional scheduler or fairness claim.
