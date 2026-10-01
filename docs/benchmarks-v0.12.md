# PJS v0.12 validation, performance, and adoption report

## IMPLEMENTATION SUMMARY

**Decision: ADOPT, with the API remaining experimental.** v0.12.0 adds explicit
upper-bound binary stream declarations and successful credit refunds, while
preserving exact mode and the v0.11 ownership boundaries. It adds no algorithm,
global byte pool, scheduling policy, automatic sizing, or cooperative preemption.
The proposal preceded runtime semantic changes. The separate cross-platform
campaign is prepared; no unrun platform is claimed as validated.

## WHY UPPER-BOUND MODE EXISTS

Variable encoders cannot cheaply declare exact output without duplicating worker
work on the host. The RLE control measured 2.19x upper-bound
throughput over host-sized exact mode with the same worker transform. Removing
host sizing is the measured benefit. Bounds still must be structurally safe.

## PUBLIC / EXPERIMENTAL API

`UpperBoundBinaryStreamRangeOptions` declares
`experimentalMaxResultBytes: number | ((partition) => number)` together with
`experimentalMaxReservedResultBytes`. Existing exact options retain required
`experimentalResultBytes`. Both declarations together fail in types and at
runtime. Count-only options exclude both. Callbacks are synchronous, host-run,
cached while waiting, and may throw or submit ordinary work. No async declaration
or implicit bound estimation is supported.

## EXACT MODE COMPATIBILITY

Exact validation remains actual === declared. Smaller and larger outputs still
fail before successful transport. Exact messages retain expectedResultBytes and
need no actual-size success field or reconciliation call. Exact never refunds.
The complete existing suite remains a control alongside dedicated failure tests.

## UPPER-BOUND CONTRACT

Successful actual visible bytes satisfy 0 <= actual <= maximum. Live direct
ArrayBuffer and ArrayBuffer-backed typed arrays, Buffer, and DataView qualify.
Visible byteLength governs subviews and Buffer slabs. Zero-length live values
qualify; detached zero-length values fail. Nested graphs and arbitrary objects
do not participate. The bound governs returned visible payload, not temporary
worker allocation, full backing allocation, inputs, RSS, or consumer-owned values.
A worker may internally allocate 100 MiB under a 1 MiB return bound.

## ARCHITECTURE IMPACT

PjsRuntime adds only public option typing. RangeCoordinator selects/caches the
declaration and mode. TaskCoordinator suppresses non-deliverable results and
calls reconciliation before successful settlement. Dispatcher preserves physical
correlation ownership and does not interpret range/refund semantics. Telemetry
projects the credit owner's counters through the existing range snapshot.

## RESULT CREDIT MANAGER CHANGES

The manager retains declared bytes, mode, current credited bytes, and one
reconciled flag with the existing lifecycle flags. It owns all subtraction,
refund metrics, operation totals, execution correlation, and release. It retains
no historical per-reservation records after release. Internal creditDiagnostics
splits unreconciled from reconciled credit; unchanged exact reservations are
included in the unreconciled category because they never reconcile.

## PROTOCOL CHANGES

Internal protocol v2 gains exclusive
`resultByteContract: { mode: 'upper-bound', bytes }` per single/logical batch
item, actualResultBytes on successful upper-bound responses, and optional mode
on compact binary failures. Safe byte values and declarations are validated.
Exact expectedResultBytes stays intact. Mixed-build workers are unsupported, so
a protocol-number bump would not create a supported compatibility boundary.

## WORKER VALIDATION

After user execution and transfer-envelope inspection, the worker validates kind,
liveness, backing, and equality/upper bound before successful postMessage.
Oversized output produces compact contract failure; no oversized successful
payload is transported. The worker supplies the measured size; the host does
not traverse result graphs or clone again to reconcile.

## RESERVATION STATE MACHINE

Reserve maximum before admission -> dispatch -> physical end -> reconcile
deliverable successful actual -> buffer actual -> deliver/release.
Queued cancellation releases immediately. Posted cancelled owners remain charged
until their physical execution ends. Logical reservation identity survives zero
credited bytes until delivery or terminal cleanup.

## RECONCILIATION STATE MACHINE

Dispatcher ends the correlation before forwarding logical results. Cancelled
owners release there. TaskCoordinator processes responses in logical batch order,
checks upper-bound parent eligibility/deadline, reconciles, then settles and
pushes. The existing guarded pump is requested after the entire response.
Duplicate, unknown, cancelled, released, and exact reconciliation calls are no-ops.
Invalid actual size or reconciliation before dispatch fails without changing credit.

## REFUND SEMANTICS

Refund = maximum - actual on deliverable successful size reconciliation, before
consumer waiting. Equal actual/bound records reconciliation with zero refund;
zero actual refunds the entire maximum. Failures and discarded late successes
do not refund. A successfully buffered result later discarded by parent failure
may already have refunded; cancellation then releases its remaining actual credit.

## RELEASE SEMANTICS

Yield releases actual retained credit, including direct delivery to a waiting
consumer after reconciliation. Failure, cancellation, crash, skipped items, and
termination release outstanding credit through existing terminal paths. Release
never increments refund counters. Idempotent removal prevents double release.

## COUNT + BYTE BACKPRESSURE

Every admission independently satisfies logical count and occupied byte capacity.
Zero-byte results still consume result count. Byte capacity remains per stream;
runtime aggregate peaks can exceed one operation's cap when streams overlap.
Collected operations and typed maps retain their existing lifetime economics.

## BATCHING INTERACTION

Each logical item owns a declaration, reservation, actual report, and refund.
The batch is only a transport/execution unit. First/middle failures stop later
execution. Earlier successful items may reconcile normally; failed and skipped
owners release without refund. Posting/input-transfer restrictions remain intact.

## TRANSFER OWNERSHIP

Validation and size measurement occur before detachment. Cloned and transferred
results reconcile identically. Output envelopes remain worker-owned until posting,
PJS-owned until yield, then consumer-owned. Cancellation cannot restore a transfer.
ArrayBuffer, typed arrays, Buffer, DataView, subviews, clone, and transfer are covered.

## SHAREDARRAYBUFFER DECISION

Strict exact and upper-bound contracts exclude raw SAB and SAB-backed views.
Shared backing may preexist or outlive the operation and has no exclusive transfer
ownership. Ordinary streams keep their existing SAB diagnostics. Immutable shared
input is used in the RLE benchmark and does not enter the result-byte budget.

## CANCELLATION

Queued caller cancellation releases full maximum. Running cancellation settles
the caller while physical work continues; termination releases remaining credit
without reconciling discarded success. Tests use physical gates to cover this
race explicitly. Consumer break/throw and iterator return/throw discard buffered
actuals and cancel outstanding children through the same manager.

## TIMEOUT

Deadlines cover startup/admission, queueing, execution, and consumer waiting.
Queued timeout releases immediately; running timeout retains credit until physical
end. The host checks parent deadline before upper-bound reconciliation even when
the timer callback has not run. No preemption is introduced.

## WORKER CRASH

Crash closes physical execution and releases each remaining logical owner once.
There is no retry. Replacement follows the existing pool policy, including fatal
restart-budget exhaustion. The final soak recorded 111 failures and
111 replacements in its main runtime, with zero terminal credit.

## SHUTDOWN

Graceful shutdown drains accepted work and consumer delivery. Non-draining/fatal
shutdown cancels parents and terminates workers before releaseAll. Buffered
reconciled actuals and unreconciled maxima both clean correctly, without counting
release as refund. Abandoned open iterators can still hold a graceful drain.

## INVARIANTS

Credited bytes are safe and nonnegative, never exceed declaration, equal declaration
before reconciliation, and remain equal for exact mode. Reconciled actual + computed
slack equals declared maximum. Reservation sum equals currentReservedResultBytes
and operation totals; each operation's partition sum agrees with its total and fits
capacity. Execution correlations reference only active dispatched owners. Debug
scans cover multi-item terminal transitions and all refund/release paths.

## METRICS

Existing current/peak reservation, wait, rejection, and aggregate contract-failure
meanings are preserved. Current reserved bytes mean currently occupied credit:
unreconciled maxima plus reconciled actuals plus exact credit. New counters are
upperBoundResultsReconciled, resultByteRefunds (positive slack events),
refundedResultBytes, and upperBoundContractFailures. The manager owns every counter.
The final main-runtime soak reconciled 854 upper-bound
successes, recorded 335 positive refunds, and refunded
656927 bytes. Shutdown-scenario runtimes are separate.

## TEST RESULTS

Normal and invariant suites pass 178/178. Build, declaration tests,
TypeScript 6 compatibility, lint, format, and diff checks pass. Direct manager
tests cover 8 -> 3 refund, duplicate/unknown reconciliation, zero/equal/batch
actuals, invalid metadata, exact zero refunds, caller/execution races, and cleanup.
Integration covers declarations, wrong/nested/shared/detached/oversized results,
binary kinds, transfer/subviews, count independence, refund-before-yield, batches,
failure/skipped items, reentrancy, consumers, deadlines, crashes, fatal failure,
and both shutdown modes. The validation artifact preserves all check output.

## STRESS RESULTS

Ten fresh-process complete invariant-enabled stress rounds pass: 1780 test
executions, no intermittent failure. These are the final rounds after the buffered
shutdown regression test was added; earlier development rounds are supplemental.

## SOAK RESULTS

Final soak: 30.95 seconds, 630 randomized iterations.
It varies maximum/actual, callback/fixed declaration, transport, batching, consumer
speed, cancellation phase, timeout, crash, and shutdown. Terminal state is stopped,
with zero reservation records, execution correlations, operation credit records,
reserved bytes, reconciled/unreconciled credit, pending tasks, and pending parents.
Raw scenarios and memory/resource samples are retained. This proves covered
owned-state cleanup, not an RSS ceiling or absence of native allocator retention.

## EXACT REGRESSION CONTROL

Built v0.11 commit 8fcd0fd9e9e3a6987198fce80a338b02c076b0d7 separately and
compared against the implementation working tree on the same machine. Each case
uses eight balanced fresh-process positions, two warmups, and 24 retained samples
per version; forced GC occurs only between samples. All twelve controls stayed
within the previous 5% threshold. Improvements are observations, not attributed
optimizations. Source semantics measured precede final formatting/version labeling.

| Case                   | v0.11 ms | v0.12 ms | Delta |
| ---------------------- | -------: | -------: | ----: |
| run-noop               |   31.301 |   32.453 | +3.7% |
| run-medium-cpu         |    8.604 |    8.512 | -1.1% |
| run-clone-input        |   15.088 |   15.211 | +0.8% |
| run-transfer-input     |    9.180 |    9.541 | +3.9% |
| run-shared-input       |    4.355 |    4.316 | -0.9% |
| partition-range        |   18.206 |   18.480 | +1.5% |
| parallel-for           |   18.533 |   18.778 | +1.3% |
| stream-count-only      |   47.016 |   46.320 | -1.5% |
| stream-strict-clone    |   13.564 |   13.861 | +2.2% |
| stream-strict-transfer |    5.979 |    5.867 | -1.9% |
| map-generic            |    4.726 |    4.773 | +1.0% |
| map-typed              |    5.152 |    5.054 | -1.9% |

## UPPER-BOUND OVERHEAD CONTROL

Maximum == actual at 512 KiB isolates no-refund upper-bound behavior.
Clone rates: exact 4149, upper 3940 results/s
(-5.1% rate change).
Transfer: exact 8344, upper 8027 results/s
(-3.8% rate change).
Per-case rate CV spans about 7-12%; these modest differences do not establish a
stable causal penalty. Separate stage attribution measured reconciliation at
0.137-0.503 microseconds/call including timer overhead.
Worker preparation and host settlement stages overlap; their totals are not additive.
No speculative optimization was applied.

## SLACK SWEEP

Value/count RLE controls target actual/max of 100/75/50/25/10/1 percent.
Each input block is 256 KiB with a safe 512 KiB maximum. Four workers, batch 1,
count capacity 64, six interleaved trials, two warmups, and timed windows >=180 ms.
All observations and CV are retained; no six-sample p95 is interpreted.
Rates also reflect encoding/output-copy/transport costs, so differences across
utilization are not attributed solely to refund. Capacity comparisons within a
row preserve the workload.

| Actual/max | 1 maximum capacity results/s | 4 maxima results/s | 16 maxima results/s | Approximate refund/result |
| ---------- | ---------------------------: | -----------------: | ------------------: | ------------------------: |
| 100.0%     |                          682 |               1667 |                1630 |                   0.0 KiB |
| 75.0%      |                          955 |               2125 |                2039 |                 128.0 KiB |
| 50.0%      |                         1162 |               2584 |                2800 |                 256.0 KiB |
| 25.0%      |                         1612 |               4213 |                4142 |                 384.0 KiB |
| 10.0%      |                         2184 |               5286 |                5444 |                 460.8 KiB |
| 1.0%       |                         2728 |               6971 |                7148 |                 506.9 KiB |

## CAPACITY SWEEP

Capacity for one maximum keeps sampled worker occupancy near 25%, even at 1%
actual utilization, because each next task must reserve the full worst case.
Four/sixteen maxima permit approximately 98% occupancy in these fast-consumer
workloads. One-maximum peaks at 0.5 MiB; four/sixteen generally peak at 2 MiB
with four executing tasks. This is the intentional conservative admission cost.
The raw artifact includes waits, latency, peaks, wall/CPU time, and credit composition.

## VARIABLE-OUTPUT PIPELINE

Shared immutable inputs contain varying run lengths 1..160. The worker makes one
data-dependent encoding pass into worst-case scratch, then copies a compact result.
The scratch allocation is outside retained-result credit and is documented rather
than represented as bounded worker heap. A pair per input byte is a proven worst case.

## RLE / COMPRESSION-LIKE CONTROL

Fast variable RLE: exact 3237 results/s,
upper 7091, count-only 7032.
Exact host sizing median was 150.4 ms per retained window
(window repetition counts vary); upper performs zero host sizing scans.
Both modes use the same worker encoding, so exact incurs an extra host scan.
This is RLE evidence, not a general compression-library performance claim.

## FAST CONSUMER

Upper-bound RLE is within 0.8%
of count-only rate in this run. Direct waiting-consumer delivery reconciles then
releases in one host progression. With abundant capacity the held-maximum fast
control is close because consumer yield already releases credit promptly.

## SLOW CONSUMER

The requested 1 ms timer sink is strongly affected by Windows timer granularity
and the Power saver environment. Mean sampled event-loop delays reached roughly
8-16 ms. The held-maximum timer control was faster despite retaining more credit;
no timer-throughput benefit is claimed. Differences are retained, not removed.
Upper-bound buffered bytes reflect actual payload; sampled total credit includes
currently executing unreconciled maxima. The upper RLE run buffered roughly
0.398 MiB actual, while the held-maximum control
occupied its full 8 MiB budget with substantially less buffered actual payload.

| Timer-sink mode | Results/s | Rate CV | Sampled peak credit MiB | Sampled peak buffered actual MiB |
| --------------- | --------: | ------: | ----------------------: | -------------------------------: |
| count           |     106.6 |   14.7% |                   0.000 |                            0.398 |
| exact           |     102.4 |    5.7% |                   0.398 |                            0.398 |
| upper           |      91.4 |   14.2% |                   2.321 |                            0.398 |
| held-maximum    |     250.1 |   28.1% |                   8.000 |                            0.100 |

## REFUND BENEFIT

A separate consumer-withheld experiment removes timer throughput as the claim.
Maximum=1 MiB, actual=64 KiB, byte capacity=2 MiB, count capacity=64, four workers.
Every one of six alternating trials buffered 17 upper-bound results before any
yield, versus 2 with benchmark-only reconciliation suppression. Upper occupied
1.0625 MiB of actual credit and refunded 15.9375 MiB cumulatively; held maximum
occupied 2 MiB for 128 KiB actual. This is an 8.5x pre-delivery production window,
not an 8.5x throughput claim. Both controls ended with zero owned state.
The control preserves worker validation and exposes no public runtime toggle.
12 raw observations are in refund-benefit-v0.12.json.

## EVENT LOOP IMPACT

Fast RLE median main-loop utilization: exact 99.3%,
upper 69.7%, count-only 66.8%.
Removing the host scan reduced main-thread occupation in this workload. Matrix
samples retain mean/max event-loop delay, utilization, CPU and memory endpoints.
Profiling is separate from production throughput and no scheduling-loop change
was made.

## FAIRNESS

Producer rotation remains unchanged. Integration tests prove a stream blocked on
its next maximum cannot prevent an eligible smaller stream and ordinary task
from completing. Slack/capacity evidence quantifies conservative progress within
one operation. No weighted fairness guarantee or cross-operation latency bound
is claimed; no scheduler was added to improve these measurements.

## PERFORMANCE REGRESSIONS

Established opt-out/exact controls stayed within 5% on this machine. Upper-bound
equal-size rates were modestly lower amid larger within-case variance. Slow timer
sinks gave contradictory throughput relationships and remain inconclusive.
No historical cross-platform rates were used for portable performance claims.
The local machine was Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz, win32
10.0.19045, Node v24.21.0, V8 13.6.233.17-node.53,
RAM 15.87 GiB, power:
Power Scheme GUID: a1841308-3541-4fab-bc81-f71556f20b4a (Power saver). No power plan was changed. Unavailable platforms
remain pending in the separate campaign.

## ARCHITECTURAL AUDIT

PjsRuntime: **7 added / 2 removed lines**, all import/options/overload typing;
**zero feature-specific executable lifecycle lines**. ResultCreditManager owns
maximum reservations, current amounts, reconciliation, refund metrics, release,
and correlation. RangeCoordinator understands declarations/eligibility only;
TaskCoordinator understands response eligibility/settlement and calls a narrow
manager method, without reservation bookkeeping. Dispatcher gains transport field
forwarding only. No dependency direction reverses. Internal types remain unexported.

## BOTTLENECKS

Worst-case capacity smaller than workerCount * maximum limits initial concurrency.
Exact host sizing can saturate the main thread. One-pass RLE still allocates
worst-case scratch and copies compact output. Output clone/transfer and consumer
speed remain costs; byte credit does not control allocator/RSS retention.
Benchmark timer granularity and burst sampling limit performance attribution.

## OPEN QUESTIONS

Complete the prepared Node 22/24 Fedora/Windows archived campaign and consider
macOS/ARM64. Repeat slow-consumer measurements with an external or controlled
sink and AC/performance-quality power settings. Test application-specific safe
bounds before treating RLE results as general recommendations. Global pools,
SAB ownership, automatic estimation, caller destinations, and preemption remain
separate decisions, with no implementation begun here.

## DECISION: ADOPT

The semantics remain explicit, refund/cancellation cleanup is robust in the
covered matrix, RLE materially removes duplicated host work, established controls
show no major regression, and ownership stays localized. Retain experimental API
status. Conservative bounds remain a documented application tradeoff, not grounds
to invent automatic estimators or loosen worker validation.

## RECOMMENDED V0.13

Complete the separate cross-platform v0.12 evidence campaign first, then evaluate
controlled async-sink behavior and real variable-output workloads. Select any
later feature from measured application bottlenecks. No v0.13 work started.

## Evidence and reproduction

Run npm run benchmark:upper-bound, the regression comparator against a separately
built v0.11 root, then node scripts/validate-v012.mjs and
node benchmarks/upper-bound-results/report.mjs. The report generator requires
successful final validation. The validation artifact hash-checks
86 historical files against the requested v0.11 head;
all are unchanged. Its runtime hashes identify the final validated source.
The new evidence files are:

- [Performance matrix](../benchmarks/results/upper-bound-results-v0.12.json)
- [Regression controls](../benchmarks/results/runtime-regression-v0.12.json)
- [Refund benefit](../benchmarks/results/refund-benefit-v0.12.json)
- [Stage profile](../benchmarks/results/upper-bound-profile-v0.12.json)
- [Final soak](../benchmarks/results/reservation-soak-v0.12.json)
- [Validation and historical hashes](../benchmarks/results/validation-v0.12.json)
- [Proposal](proposal-v0.12.md), [ADR 0019](adr/0019-upper-bound-result-reservations.md),
  [benchmark methodology](../benchmarks/upper-bound-results/README.md), and
  [prepared cross-platform campaign](cross-platform-v0.12.md).
