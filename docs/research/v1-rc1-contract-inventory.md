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
scenario families. Fresh Windows and Linux qualification remain pending at source
preparation; the [readiness matrix](v1-rc1-readiness.md) records actual results.
Installed JS and TS projects also exercise the package root without workspace links.

| Contract / public surface        | Frozen behavior                                                       | RC scenario / existing protection                                       | Platform / status at preparation                            |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Runtime construction / options   | Integer validation, fixed pool/queue/startup/restart budget           | Existing startup/options; repeat construction                           | Windows development smoke PASS; qualification pending       |
| Registry.register / task handles | Unique nonempty ID, local file export, registry membership            | public-error-identities-and-recovery; registry tests                    | Windows smoke PASS; Linux pending                           |
| run admission                    | Accept bounded work or reject; no hidden waiting                      | lifecycle-mixed; deep-queue-FIFO-overflow-recovery                      | Windows smoke PASS; Linux pending                           |
| Queue capacity                   | Waiting logical tasks obey maxQueue; overflow is recoverable          | Deep queue 128, explicit overflow, post-drain run                       | Windows smoke PASS; Linux pending                           |
| Queue order                      | Existing FIFO single-worker behavior, no lost/duplicated jobs         | Deep-queue sequence 0..127                                              | Windows smoke PASS; Linux pending                           |
| Worker execution                 | Registered trusted module export; no closure/source evaluation        | CPU smoke, installed fixtures, production source scan                   | Windows smoke PASS; Linux pending                           |
| Caller settlement                | Exactly once on success/failure/abort/deadline                        | lifecycle-mixed; late-result split; existing lifecycle tests            | Windows smoke PASS; Linux pending                           |
| Physical execution               | Caller rejection does not free a busy worker                          | caller-physical-split; gated queued sentinel                            | Windows smoke PASS; Linux pending                           |
| Queued cancellation              | Body never starts; input remains attached; ownership claim released   | queued-cancel-timeout; reuse transferred buffer                         | Windows smoke PASS; Linux pending                           |
| Active cancellation              | No preemption/rollback; late result discarded                         | caller-physical-split; active iterator return                           | Windows smoke PASS; Linux pending                           |
| Deadlines                        | Include queue/execution/parent/consumer waiting as documented         | queued-cancel-timeout; split; consumer timeout; existing tests          | Windows smoke PASS; Linux pending                           |
| AbortSignal cleanup              | Listener removed on settlement; no warning suppression                | mixed run signals, abort/deadline/worker failure, getEventListeners     | Windows smoke PASS; Linux pending                           |
| Worker failure                   | Affected work rejects, no replay                                      | bounded-worker-crashes-and-storm                                        | Windows smoke PASS; Linux pending                           |
| Worker replacement               | Await old exit; fixed target; bounded lifetime restart budget         | Individual exits, two-worker storm, exhausted budget                    | Windows smoke PASS; Linux pending                           |
| Task failure                     | Throw/rejection is task error, healthy future work                    | mixed lifecycle; installed all-error smoke                              | Windows smoke PASS; Linux pending                           |
| Streams / iterator               | Single consumer, completion order, range metadata                     | completion-order/no-missing-or-overlap                                  | Windows smoke PASS; Linux pending                           |
| Slow consumer                    | Count and byte credits gate production                                | streams-refunds-ownership, 1 ms yield delay                             | Windows smoke PASS; Linux pending                           |
| Consumer break/return/throw      | Cancel production, release buffers; posted work can finish            | consumer-break-return-throw-and-timeout                                 | Windows smoke PASS; Linux pending                           |
| Count credit                     | Buffer plus admitted-unsettled children <= per-stream cap             | Live invariant inspection; capacities 1, 2, 4; zero-byte values         | Windows smoke PASS; Linux pending                           |
| Byte credit                      | Visible output bytes, per stream; not RSS/backing/native/input memory | Live credit composition and per-stream capacity checks                  | Windows smoke PASS; Linux pending                           |
| Exact results                    | Worker validates equality before transport                            | Mixed valid lengths, smaller and larger mismatch, recovery              | Windows smoke PASS; Linux pending                           |
| Maximum results                  | Actual <= declared maximum; reconcile before retention                | Maximum stream, deliberate overflow, healthy followup                   | Windows smoke PASS; Linux pending                           |
| Refund                           | Success refunds M-A; equal success reconciles with zero refund        | Actual 0/1/2/8/16/64, expected refund sum and event delta               | Windows smoke PASS; Linux pending                           |
| Active strict credit             | Hold maximum until physical end after caller cancellation             | caller-physical-split: retain 1024 for actual 1                         | Windows smoke PASS; Linux pending                           |
| Transfer input/output            | Entire eligible backing detaches when posted; no restoration          | queued ownership reuse, echo detach/output, existing transfer tests     | Windows smoke PASS; Linux pending                           |
| Shared readonly                  | Copy once, concurrent immutable reuse; no runtime freezing            | concurrent sum against clone/transfer control; shared tests             | Windows smoke PASS; Linux pending                           |
| Mixed transport                  | No cross-task result/ownership contamination                          | streams-refunds-ownership; mixed concurrent transports                  | Windows smoke PASS; Linux pending                           |
| Numeric boundaries               | Empty/one/tail/grain>span/divisible/nondivisible supported ranges     | range-boundaries-map-discard                                            | Windows smoke PASS; Linux pending                           |
| parallelFor                      | Suppress worker output before serialization                           | Deliberately uncloneable discarded results                              | Windows smoke PASS; Linux pending                           |
| parallelMapRange                 | Validated block kind/length, ordered typed assembly, tails            | Boundary map; 10,001 elements; wrong block error                        | Windows smoke PASS; Linux pending                           |
| Shutdown                         | First call fixes drain mode; shared promise; close admission          | Eight-state shutdown matrix, concurrent calls, during/after submissions | Windows smoke PASS; Linux pending                           |
| Forced shutdown                  | Cancel accepted callers and stop active workers                       | Queued/stream/pool isolation controls                                   | Windows smoke PASS; Linux pending                           |
| Graceful shutdown                | Wait physical work and accepted stream delivery                       | Active/stream/cancelled/replacement controls                            | Windows smoke PASS; Linux pending                           |
| Runtime independence             | No shared worker, queue or shutdown state                             | multiple-runtimes-isolated                                              | Windows smoke PASS; Linux pending                           |
| Resource cleanup                 | Terminal zero actual owned bookkeeping; listeners/ports/timers end    | All terminals, repeated lifetimes, natural process exit watchdog        | Windows smoke PASS; Linux pending                           |
| Errors                           | Twelve exported identities, contextual fields, recoverability         | [Error matrix](v1-rc1-error-matrix.md); installed all-error smoke       | Windows minimum development package PASS; Linux pending     |
| Package import/types             | ESM root, typed declarations, blocked internal subpaths               | Real separate JS/TS tarball consumers, full type regressions            | Windows minimum development package PASS; candidate pending |
| Worker resolution                | From installed artifact, independent of cwd and spaces                | External consumer paths with spaces / unrelated cwd                     | Windows minimum development package PASS; candidate pending |

Stats and internal maps are observed as diagnostics only. Aggregate memory fields
do not define a new public guarantee. No additional scheduler or fairness claim.
