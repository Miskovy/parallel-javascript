# v0.12 proposal: upper-bound binary result reservations and refunds

## API decision

Add `UpperBoundBinaryStreamRangeOptions` for `streamRange()`:

```ts
{
  experimentalMaxResultBytes: number | ((partition: RangePartition) => number);
  experimentalResultBytes?: never;
  experimentalMaxReservedResultBytes: number;
  experimentalMaxBufferedResults?: number;
}
```

The existing exact options retain their required `experimentalResultBytes`,
with `experimentalMaxResultBytes?: never`. Both declarations together are an
error, including in untyped JavaScript. A capacity requires exactly one
declaration. Count-only options exclude both declarations and byte capacity.
Fixed values and synchronous callbacks must produce nonnegative safe integers.
Callbacks run on the host in the parent AsyncResource, may throw or call
`runtime.run()`, and are cached while awaiting credit. Async callbacks fail.
A declaration exceeding capacity fails before factory invocation, task creation,
or execution. No application bounds are inferred.

A contract-object public option would group mode and declaration and facilitate
future extension, but introduces a third declaration spelling beside the exact
API and requires more conflict rules. Separate declarations preserve source
compatibility and provide mutually exclusive types and readable diagnostics.
There are only two modes; a mode on operation configuration keeps branching
localized. A future contract expansion requires a separate design decision.

## Contract and ownership

Exact mode remains `actual === declared`, including undersize failures, and
never refunds. Upper-bound mode requires `0 <= actual <= maximum`. Both accept
only live direct ArrayBuffer and ArrayBuffer-backed typed arrays, Buffer, and
DataView. Visible byteLength governs subviews and slabs. Detached values,
arbitrary objects, nested graphs, raw SAB, and SAB-backed views fail. Ordinary
stream SAB diagnostics remain unchanged. Shared backing has no exclusive
transfer ownership and may outlive the operation, so it cannot participate.

The contract bounds successfully returned visible payload, not worker heap,
temporary allocation, backing allocation, clone temporaries, RSS, inputs, or
consumer-retained results. A worker may allocate 100 MiB internally under a
1 MiB maximum and return a valid 512 KiB result. This contract cannot prevent
that internal allocation.

Credit capacity remains per stream. Every admission requires independent count
and byte credit. Zero-byte results retain count credit and reservation identity.
Collected operations, typed map, completion-only work, and `run()` do not gain
byte-capacity semantics. No global pool or scheduling policy changes.

## Protocol and result-arrival ordering

Keep protocol v2: workers and host are from the same build; mixed package builds
are unsupported. Retain `expectedResultBytes` for exact messages. Add optional
`resultByteContract: { mode: 'upper-bound', bytes: number }` for upper-bound
messages, mutually exclusive with the exact field, including per batch item.
Validate mode and safe byte count. Successful upper-bound responses carry
`actualResultBytes`, measured by the worker before postMessage/transfer. Exact
and opt-out responses need no new success field. Binary failure detail gains
optional upper-bound mode for failures arriving after caller cancellation.
No arbitrary host traversal or extra payload clone is needed.

The existing dispatcher marks physical execution ended before forwarding the
response. Preserve this ordering deliberately:

1. Remove the physical execution correlation; release cancelled owners.
2. Process logical response items in batch order. Suppress late results. Check
   parent deadline/eligibility before upper-bound reconciliation.
3. Reconcile deliverable upper-bound success in ResultCreditManager.
4. Settle the logical task, then push into the stream.
5. If a consumer waits, deliver and release actual credit synchronously;
   otherwise retain actual credit until yield.
6. Request the existing guarded pump after all response items settle.

This makes all refunds available to the next admission decision without
reentering production partway through batch settlement. Physical termination
before reconciliation is legal: successful reservations remain retained until
logical delivery, whereas cancelled ones release at termination. Crash and
posting-failure paths retain the same execution-ended sequence.

## State transitions and responsibilities

ResultCreditManager owns declared amount, credited amount, mode, reconciliation,
refund metrics, physical correlation, and release. Add only credited bytes and
reconciled state alongside the existing declaration and lifecycle flags.
RangeCoordinator owns declaration selection, caching, and operation mode; it
uses canReserve/reserved without accessing reservation internals.
TaskCoordinator calls reconciliation immediately before successful settlement.
Dispatcher remains unaware of range/refund semantics. PjsRuntime gains only
public overload/type integration, no refund lifecycle code or scheduling loop.

```text
reserve maximum -> dispatch -> physical end -> reconcile successful actual
                 -> refund maximum - actual -> buffer actual -> yield/release
```

Equal actual and maximum reconcile once with zero refund. Smaller actual refunds
slack immediately. Zero actual refunds the entire maximum while retaining a
logical result. Over-bound results fail in the worker before success transport;
the full reservation releases through failure, with no refund.

Queued cancellation (including pre-dispatch timeout) releases full credit.
Running cancellation/timeout settles the caller, retains credit until physical
end, then releases it without reconciliation. Late success cannot retain a
discarded result or inflate refund metrics. Normal failure, worker crash, and
skipped batch items have no successful reconciliation and release remaining
credit through existing lifecycle paths. No retry or preemption is introduced.
Earlier successful batch items may reconcile before a later failure cancels
the operation; each logical reservation remains independent.

Consumer break/throw, iterator return/throw, and parent cancellation release
buffered and queued owners and mark running owners for release at termination.
Graceful shutdown requires consumer delivery and drains normally. Non-draining
shutdown and fatal failure cancel parents, terminate workers, then release all
remaining owners/correlations. Unreconciled maxima are not refunded on shutdown.

## Metrics and invariants

`currentReservedResultBytes` means currently occupied credit: unreconciled maxima
plus reconciled actual bytes (and unchanged exact reservations).
`peakReservedResultBytes`, waits, rejected declarations, and aggregate binary
failures retain their meanings. Add `upperBoundResultsReconciled`,
`resultByteRefunds` (positive-slack events only), `refundedResultBytes`, and
`upperBoundContractFailures`. Release decreases current credit without adding
refund metrics. Internal diagnostics expose unreconciled and reconciled credit
for benchmark sampling; historical released reservations are not retained.

Debug invariants require safe nonnegative credited bytes, credited <= declared,
unreconciled credited === declared, exact credited === declared, and reconciled
upper-bound declared === credited + slack. Sum of credited reservations equals
current reserved bytes and the sum of operation credit. Each operation sum
fits capacity and agrees with its partition mapping. Correlations reference
only dispatched non-ended owners. Duplicate reconciliation is an idempotent
no-op; unknown/released/cancelled owners are no-ops. Invalid actual size or
reconciliation before dispatch fails without modifying credit. Release before
reconciliation is legal after cancellation/termination, and later reconciliation
is a no-op. Release while physical execution is active is not consumer delivery.

## Evidence and decision gate

Add direct credit tests for refund timing, duplicates, cancellation/termination
races, independent batch owners, zero actual, and terminal cleanup. Extend
integration coverage across binary kinds, transfers, subviews, wrong kinds,
declaration errors, batching, all cancellation/deadline/consumer/shutdown paths,
crashes, fatal failures, fairness, and exact undersize/oversize compatibility.
Run build, type/compatibility checks, lint, format, diff checks, ten complete
fresh-process stress rounds, and a randomized final soak of at least 30 seconds.

Measure a data-dependent RLE transform with a structural worst case of twice
input bytes (one count/value pair per input byte). Compare host sizing plus
worker encoding against cheap maximum plus worker encoding. Sweep actual/max
utilization near 100/75/50/25/10/1 percent and byte capacities relative to worker
count/max block size. Record throughput, occupancy, waits, refunds, peaks,
first-result latency, wall time, event-loop delay, and credit decomposition.
Fast and slow consumers test prompt reuse and actual buffered credit. A
benchmark-only delayed-refund control retains maxima until yield without adding
a shipping feature toggle. Compare exact with upper-bound maximum==actual,
and v0.11 with v0.12 established API controls in interleaved same-machine runs.
Profile only if repeatable overhead justifies it.

Historical reports/artifacts stay unchanged; new evidence uses v0.12 filenames.
Use local controlled comparisons; historical battery/Power saver cross-platform
numbers are reproduction evidence, not portable performance claims. Prepare a
separate reduced/full v0.12 cross-platform campaign after implementation and
commit, without repeatedly running the v0.11 campaign.

Adopt only if correctness, localized architecture, useful variable-output
benefit, and regressions support it. Otherwise retain as experimental and not
recommended, or reject. Do not begin v0.13.
