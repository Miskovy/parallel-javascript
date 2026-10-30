# PJS v0.9 strict binary-result credit report

## IMPLEMENTATION SUMMARY

v0.9 adds an opt-in exact binary-result contract to `streamRange()`. The host
reserves declared visible payload bytes before admitting a logical partition;
the worker validates the direct result before successful transport; and the
reservation survives until consumer delivery or physical execution termination.
The existing logical-result count capacity remains independent. Ordinary
streams and every v0.1-v0.8 operation retain their prior contracts. No reduce,
ordered stream, work stealing, cooperative preemption, generic graph sizing,
automatic sizing, or global byte pool was added.

## BINARY RESULT CONTRACT

Strict mode accepts a live direct `ArrayBuffer`, or an ArrayBuffer-backed typed
array, Node Buffer, or DataView. For views, the contract measures visible
`byteLength`, not backing allocation. A live zero-length value is valid. Nested
graphs, scalars, ordinary arrays/objects, detached values, raw
SharedArrayBuffer, and SAB-backed views do not qualify. The worker requires
actual visible bytes to equal the declaration exactly.

## PUBLIC / EXPERIMENTAL API

The new exported `BinaryStreamRangeOptions` requires both
`experimentalResultBytes` and `experimentalMaxReservedResultBytes`:

```ts
interface BinaryStreamRangeOptions extends PartitionOptions {
  experimentalMaxBufferedResults?: number;
  experimentalResultBytes: number | ((partition: RangePartition) => number);
  experimentalMaxReservedResultBytes: number;
}
```

The strict overload constrains output to exported `PjsBinaryResult`. The
count-only overload excludes the two strict fields, and runtime validation also
rejects partial combinations. Both names and the range API remain experimental.

## DECLARATION MODEL

A fixed nonnegative safe integer handles equal result blocks. A synchronous
per-partition callback handles uneven or variable known sizes. PJS calls the
callback lazily in the parent operation's AsyncResource, before the input
factory. A declaration waiting for credit is cached so it is not recomputed.
Invalid declarations fail locally; a declaration larger than capacity fails
before factory work or worker execution.

## EXACT VS UPPER-BOUND DECISION

v0.9 chooses exact size. An upper bound would need refund timing, metrics for
reserved versus used slack, batching rules, and a policy for chronic
over-declaration. Exactness makes capacity predictable and turns over- and
undersize results into symmetric contract errors. Compression-like output with
unknown exact size stays outside this API.

## BYTE CAPACITY MODEL

Capacity is per strict stream operation. It bounds the sum of declared bytes
for buffered and admitted-unsettled logical results. The runtime-wide current
and peak metrics aggregate all strict streams, so a global peak can exceed one
operation's capacity when streams overlap. The model is payload credit, not a
promise about RSS, JavaScript heap, whole backing allocations, worker
temporaries, structured-clone/transfer machinery, inputs, or yielded values.

## COUNT + BYTE BACKPRESSURE

Both invariants must hold: result count cannot exceed
`experimentalMaxBufferedResults`, and declared bytes cannot exceed
`experimentalMaxReservedResultBytes`. Zero-byte results still consume count
credit. Fixed 256 KiB results at count capacity one peaked at 0.25 MiB and one
busy worker under every byte capacity. At count capacities 8 and 16, a 1 MiB
byte cap peaked at exactly 1 MiB and recorded 36 and 33 waits respectively.
Larger byte caps shifted control back to count credit.

## RESERVATION LIFECYCLE

Reservation occurs immediately before logical child admission. Successful
results retain it while buffered and release it on yield, including direct
delivery to an already waiting consumer. Queued cancellation releases at once.
Cancellation or timeout after dispatch settles the caller but keeps credit
until the worker result, task failure, crash, or worker termination proves that
execution ended. Cleanup is keyed per logical task and is idempotent across
parent failure and late physical completion.

## WORKER-SIDE VALIDATION

Validation happens after task return and transfer-envelope unwrap, but before
`postMessage()` and before transfer detaches worker storage. A mismatch produces
a compact binary-contract failure with declared bytes, observable actual bytes,
and actual kind. The host exposes `PjsBinaryResultContractError` with normal
task, worker, operation, partition, and range context. The mismatched payload is
never posted as successful output.

## TRANSFER OWNERSHIP

Clone and transfer both use the same strict kind/size validation. Transfer still
moves worker-owned output backing to the host only after validation. Once
yielded, the consumer owns the host result and its bytes leave the reservation
model. Cancellation cannot restore transferred input or output ownership, and
dropping a buffered transferred result does not guarantee immediate RSS return.

## SHAREDARRAYBUFFER DECISION

Strict mode rejects raw SharedArrayBuffer and SAB-backed views. Shared storage
may predate the operation, remain reachable elsewhere, and cannot transfer
exclusive ownership, so counting it as newly retained binary output would
misstate pressure. Count-only streams still accept direct shared values and
retain the v0.8 diagnostic byte accounting.

## BATCHING INTERACTION

Expected bytes travel per logical batch item. Every logical item reserves
before the physical batch is dispatched; batching never creates one aggregate
reservation. A failing item stops later execution, and skipped item
reservations release when the batch terminates. Input transfers still require
batch size one under the existing ownership rule. The fixed transferred
benchmark therefore used 64 messages; its cloned batch-four control used 58.

## FAILURE SEMANTICS

Invalid declarations become `PjsBinaryResultContractError`; impossible single
declarations become `PjsResultCapacityError`; worker kind/size/liveness
mismatches become contextual `PjsBinaryResultContractError`. First parent
failure stops production, cancels sibling callers, discards buffered output,
and preserves reservations for still-running executions. No partial collected
result or retry is introduced.

## CANCELLATION / DEADLINE

One signal and deadline cover declaration, factory work, queueing, execution,
buffering, and consumer waiting. Tests distinguish queued release from running
retention and cover abort, timeout, consumer break/throw, batch failure, and
crash races. Cancellation remains caller settlement rather than synchronous CPU
preemption.

## SHUTDOWN

Graceful shutdown drains accepted strict streams through consumer delivery, so
credit releases normally. As before, an abandoned unclosed stream can prevent a
graceful drain. Non-draining shutdown cancels parents, terminates workers, then
releases reservations whose physical executions can no longer produce output.
Both modes finish with zero current reserved bytes in targeted tests.

## METRICS

`streamResults` now includes `currentReservedResultBytes`,
`peakReservedResultBytes`, `resultByteReservationWaits`,
`resultByteReservationRejected`, and `binaryResultContractFailures`. Strict
active-operation snapshots expose `reservedResultBytes`,
`bufferedKnownPayloadBytes`, and `resultByteCapacity`. At stable points,
buffered known payload is no greater than reserved bytes, which is no greater
than the operation capacity. Existing v0.8 diagnostic fields retain their
meaning for all streams.

## TEST RESULTS

The full suite passes 154/154 tests. The 11 new test groups cover protocol
compatibility, ArrayBuffer/typed array/Buffer/DataView/subview/zero output,
clone/transfer, uneven and variable declarations, exact count-plus-byte credit,
invalid/impossible declarations, wrong/nested/shared/detached/over/undersized
output, batching, cancellation, timeout, crash, consumer failure, fairness,
shutdown, saturation, metrics, and terminal leak checks. Build, declaration
tests, ESLint, and Prettier checks also pass.

## STRESS RESULTS

Ten full-suite repetitions pass without intermittent failures: 1,540 test
executions in fresh Node test processes after one build. This exercises worker
startup/replacement and reservation terminal paths repeatedly; it is not a
long-duration memory soak.

## FIXED-SIZE BINARY BENCHMARK

The primary matrix streams 64 transferred 256 KiB results through four workers,
one warmup, and three retained trials per fresh configuration process. Median
throughput at count capacity one was 69.97-76.75 MiB/s. Count capacity four
reached 146.97-169.15 MiB/s, and capacities 8/16 reached
116.18-170.48 MiB/s. Extra result credit beyond enough worker occupancy did not
produce a monotonic gain.

## VARIABLE-SIZE BINARY BENCHMARK

The variable pipeline cycles 4, 16, 64, and 256 KiB direct results. With a fast
consumer, a 512 KiB cap recorded 29 waits, peaked at exactly 0.5 MiB, and
delivered 106.53 MiB/s; a 4 MiB cap recorded no waits, peaked at 1.492 MiB, and
delivered 120.87 MiB/s. With a 1 ms CPU consumer, the corresponding throughputs
were 44.48 and 43.74 MiB/s, showing that more byte credit does not overcome a
dominant host consumer.

## FAST CONSUMER BENCHMARK

Fast fixed-result throughput rose sharply from count one to four as sampled
worker occupancy moved from 1.00 to about 3.6-3.9. The best retained matrix
median was 170.48 MiB/s at count 16 and a 4 MiB byte cap, but nearby rows span
116.18-169.15 MiB/s. Configuration and run noise matter more than the nominal
capacity once four workers remain fed.

## SLOW CONSUMER BENCHMARK

The 1 ms variable consumer delivered 44.48 MiB/s at 512 KiB and 43.74 MiB/s at
4 MiB, with first results at 0.61 and 0.48 ms. Sampled busy workers fell to 1.61
and 1.49. The consumer serialized much of the pipeline, so higher byte capacity
increased retained headroom without increasing throughput in this run.

## COUNT VS BYTE CAPACITY

For fixed 256 KiB results, `(count, byte cap)` of `(1, 64 MiB)` still peaked at
0.25 MiB, while `(16, 1 MiB)` peaked at 1 MiB and waited 49 times. `(16, 16
MiB)` peaked at 2.0 MiB rather than filling either maximum because execution
and consumption progressed concurrently. Count and bytes therefore constrain
different workloads and cannot safely be derived from each other.

## TYPED MAP CONTROL

The existing typed-map control produced the same 16 MiB of numeric output in
135.12 ms (118.41 MiB/s), used 16 physical messages, and exposed no stream
reservation bytes. Map retains one final preallocated result and has different
lifetime semantics; it remains a sizing/correctness control, not an alternative
bounded stream.

## REAL BINARY PIPELINE

Every streamed block is deterministically transformed in a worker, SHA-256
hashed on the host, passed through controlled CPU work, and crosses a
`setImmediate()` sink boundary. Correct counts and checksums are required. This
includes actual worker allocation, result transport, consumer processing, and
credit release rather than measuring a bare semaphore loop.

## OBJECT PIPELINE CONTROL

The count-only object stream processed 4,096 small structured records in
536.34 ms (7,636.96 results/s). It reported no reserved or known direct-binary
bytes and used 4,090 physical messages under batch size four. This confirms that
v0.9 does not force arbitrary object output into a speculative byte model.

## PISCINA COMPARISON

Piscina 5.3.2 used a harness-managed count-plus-declared-byte semaphore held
through one serialized downstream consumer. In the matched fixed transferred
case it delivered 126.39 MiB/s versus PJS strict mode's 93.23 MiB/s. In the
matched 512 KiB slow variable case it delivered 50.66 MiB/s versus PJS's 44.48
MiB/s. PJS integrates
validation, batching identity, cancellation, shutdown, and metrics; these
numbers compare the pipeline mechanism, not full library capability or general
superiority.

## EVENT LOOP IMPACT

Median maximum event-loop delay across the fixed PJS matrix was 3.66-15.60 ms.
The fast variable cases observed 2.56-3.97 ms and slow cases 4.10-4.73 ms. The
typed-map control reached 13.03 ms; Piscina controls reached 4.14 and 12.27 ms.
These short Windows measurements include harness hashing, sampling, and timer
work and are not application tail-latency promises.

## FAIRNESS RESULTS

Six mixed trials concurrently ran a 32-result 256 KiB strict stream, a 64-result
4 KiB strict stream, ordinary `run()`, shared-output `parallelFor()`, and typed
map. No trial flagged starvation; all counts were exact and all terminal current
reservations were zero. With a 256 KiB large-stream cap, median ordinary,
parallel, map, small-stream, and large-stream completion times were 15.21,
29.23, 31.06, 41.27, and 160.63 ms. At 1 MiB they were 23.95, 53.12, 57.57,
101.34, and 106.87 ms. Higher large-stream credit improved its completion while
other operations still progressed; this is evidence for the current rotation,
not a proof of formal weighted fairness.

## REGRESSION CONTROLS

Committed v0.8 (`adf81434135b03923a0654316936930ed780a392`) and v0.9 ran in
v0.8/v0.9/v0.9/v0.8 fresh-process order, with one warmup and ten retained
samples per version/case. Candidate/baseline ratios were 1.025 for ordinary
no-op, 1.001/1.020 for collecting batch 1/8, 0.953/1.023 for count-only stream
batch 1/8, and 0.961/0.836 for completion batch 1/8. The 8 MiB transfer probe
was 1.193 while shared was 0.871; generic and typed map were 0.868 and 0.777.
The noisy improvements are not credited to v0.9, but the set shows no broad
opt-out regression. The transfer probe deserves repetition on more hosts.

## MEMORY FINDINGS

Measured reservation peaks followed declared credits exactly where constrained:
0.25 MiB at count one, 1 MiB under the fixed small cap, and 0.5 MiB under the
variable small cap. Buffered peaks were lower or equal because running results
also hold reservations. Sampled RSS was much coarser: fixed PJS rows ranged
roughly 151.4-182.4 MiB; cloned output reached 189.4 MiB versus transferred
167.0 MiB. RSS includes isolates, JIT, allocators, source data, hashing, and
sampling history, so it does not validate or invalidate the payload invariant.

## THROUGHPUT COST

At count 8 and a 4 MiB cap, strict transfer delivered 93.23 MiB/s versus the
count-only control's 134.26 MiB/s, a 30.6% lower retained median. This conflicts
with the wider fixed matrix and the earlier harness-validation run, so it is an
unresolved phase/noise observation rather than a proven validation cost. Clone
strict mode delivered 128.53 MiB/s but had 15.77 ms first-result latency and
189.4 MiB RSS, versus transfer's 5.81 ms and 167.0 MiB. Transport, batching,
process order, and three-sample variance prevent isolating one reliable
reservation-overhead percentage; the transfer control should be repeated.

## BOTTLENECKS

Count one underused workers. A 1 MiB cap throttled count 8/16 fixed streams.
Fast variable output benefited from additional byte headroom, while the slow
consumer dominated regardless of headroom. Hashing and host CPU work contribute
to event-loop pressure. Transfer requires batch size one for the benchmark's
ownership model; clone can batch but pays memory copying. Generic object
serialization remains outside exact byte budgeting.

## OPEN QUESTIONS

The evidence does not settle upper-bound declarations and refunds, a runtime-
global byte pool across operations, shared-result accounting, destination
buffers supplied by callers, compression-aware pipelines, formal weighted
fairness, or cross-platform defaults. Reservation declarations are trusted for
admission until worker validation, and user code can allocate too much before
that validation. More machines and longer memory soaks are needed before any
default capacity guidance.

## RECOMMENDED V0.10

Do not broaden the v0.9 contract yet. First repeat the transfer regression and
binary matrix on Linux and additional CPUs, add a longer cancellation/crash
memory soak, and gather application traces that reveal whether exact
declarations exclude important workloads. If evidence supports another
milestone, evaluate one narrowly scoped choice—upper-bound refund semantics or
a caller-provided destination—not work stealing, reduce, ordered streaming, or
automatic sizing in the same release.
