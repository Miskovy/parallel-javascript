# PJS v0.10 reservation durability and performance report

## IMPLEMENTATION SUMMARY

v0.10 is an evidence and hardening release over the v0.9 exact binary-result
contract. It adds a debug-only reservation invariant scanner, stricter malformed
batch-protocol rejection, a deterministic failure soak, isolated size/cost
benchmarks, application traces, and v0.9/v0.10 regression controls. It adds no
public API, algorithm, scheduler, memory model, or broader binary-result
semantics. Runtime package versioning moves to 0.10.0; historical artifacts are
unchanged. The full 154-test suite passes normally and with invariant scans;
ten fresh-process stress rounds pass 1,540/1,540 executions. Build, declaration
tests, both TypeScript compilers, lint, formatting, and diff checks pass.

## V0.9 ARCHITECTURE AUDIT

The v0.9 ownership model is coherent. Admission creates one reservation per
logical task and indexes it by operation partition. Dispatch attaches one or
more logical reservations to a physical execution correlation. Caller
settlement releases queued or execution-complete work, but running cancellation
retains credit until physical execution ends. Successful execution may retain
credit through buffering; yield releases it. Crash and worker termination close
the physical correlation. Operation cancellation releases non-running and
already-ended records, while runtime termination is the final owner.

The audit found no ownership event without a release path and no double release.
It did identify that invariant scans must run only after an entire multi-record
transition: a batch correlation is removed before all sibling records are
updated, and global shutdown clears correlations before releasing all records.
The scanner therefore suppresses intermediate scans in those two loops and
checks the completed transition.

## RESERVATION INVARIANTS

`PJS_DEBUG_RESERVATION_INVARIANTS=1` enables private scans after reservation,
release, settlement, cancellation, execution completion, dispatch, and global
cleanup. They prove nonnegative safe-integer totals, global metric/map equality,
unique execution correlation, partition mapping consistency, active-dispatch
state, per-operation sum equality, and `reservedResultBytes <= capacity`.

The full suite passes 154/154 both with and without the scanner, including all
11 focused binary groups. Both 30-second soaks ended with
`currentReservedResultBytes`, reservation-map size, execution-correlation size,
pending tasks, and pending operations all zero. Private maps remain private;
the soak inspects compiled internals only as test instrumentation.

## SOAK METHODOLOGY

`scripts/reservation-soak.mjs` uses a deterministic xorshift seed and rotates
success, cancellation, timeout, crash, abandonment, and shutdown families.
Smoke, quick, and standard modes default to about 5, 30, and 180 seconds;
duration, iterations, seed, workers, result size, both capacities, sampling,
and explicit forced GC are configurable. Every scenario waits for quiescence
and healthy worker replacement. The retained normal run executed 640 operations
in 31.0 seconds; the forced-GC diagnostic executed 738 in 30.6 seconds.

## CANCELLATION SOAK

The normal run covered pre-abort 18 times, byte-credit wait 13, fully queued 20,
running 11, buffered 19, consumer wait 17, and after-yield 9. The queue fixture
occupies all four workers, so “queued” is a real queue state. Abort listeners
return to zero and every phase reaches quiescence.

## TIMEOUT SOAK

Queue timeout ran 27 times, execution timeout 24, buffered timeout 35, and
consumer-wait timeout 21. Near-boundary timing is retained rather than mocked.
The first attempted long run exposed a harness defect: only one worker had been
blocked in the queue case, allowing valid success on the other workers. The
fixture was corrected to saturate the pool; this was not a runtime defect.

## CRASH SOAK

The normal run forced 61 single-item crashes and 46 batch-four crashes at item
positions 0, 1, and 3, including transferred predecessors and abort races. It
recorded 107 worker failures and exactly 107 replacements while keeping the
configured four-worker population healthy and ending with no correlations.

## SHUTDOWN SOAK

The run covered graceful shutdown 21 times, non-draining shutdown with active
execution 31, buffered-result shutdown 25, and crash-followed-by-graceful
shutdown 29. Graceful cases delivered all accepted results. Non-draining cases
settled consumers, terminated physical owners, and released every reservation.

## CONSUMER-ABANDONMENT SOAK

Consumer `break` ran 31 times, consumer throw 21, explicit iterator `return()`
26, and iterator `throw()` 28. Each path closed its operation, discarded
buffered output, and reached the same zero-state assertions.

## RESOURCE / MEMORY TRENDS

Thirty one-second samples from the normal crash-heavy run showed RSS from 103.0
to 190.3 MiB; first-quarter versus last-quarter mean rose by 41.6 MiB. Heap-used
window means rose 5.3 MiB, external 1.5 MiB, and ArrayBuffer 0.75 MiB. PJS-owned
counts repeatedly returned to zero throughout and were zero at termination.

In the separate explicit-GC run, the terminal forced collection reclaimed about
0.96 MiB heap, 0.19 MiB external, and 0.14 MiB ArrayBuffer data, but RSS remained
about 183 MiB. This is consistent with V8/native allocator and worker-churn
high-water retention, but one 30-second Windows run cannot prove that. It is
reported as unresolved resource retention, not as either a leak or proof of no
native leak.

## STRICT TRANSFER INVESTIGATION

The decisive 256 KiB transfer comparison used eight retained samples per cell,
two mirrored rounds, fresh processes per configuration, four workers, and 256
MiB per measured sample. Count-only median was 104.15 ms; fixed strict was
117.05 ms (+12.4%); callback strict was 109.69 ms (+5.3%). CVs were 7.3%, 9.3%,
and 7.2%. The earlier v0.9 30.6% point estimate therefore overstates the stable
effect, but a measurable strict cost remains.

The isolated v0.9/v0.10 regression showed candidate fixed and callback transfer
at 0.842x and 0.882x the v0.9 medians in that run. The anomaly is not introduced
by the v0.10 checker or protocol changes.

## STRICT COST BREAKDOWN

At 256 KiB transfer, mean summed stage durations for count/fixed/callback were:
child admission 11.78/13.15/13.01 ms, host post 10.94/12.05/12.47 ms, worker
output preparation 1.19/6.63/6.58 ms, worker-to-host transport intervals
166.51/189.07/189.98 ms, and host settlement 5.27/6.49/6.08 ms. Worker-stage
totals overlap across four workers and are diagnostic, not additive wall time.

Micro-controls measured safe-integer checks at 2.5 ns/op, reservation Map
insert/get/delete at 104 ns/op, mixed direct-binary inspection at 319 ns/op,
worker-message shape validation at 17 ns/op, and contract-error construction at
12.8 microseconds/op. Errors are cold-path. No single production hot path
explains the whole delta, so no speculative optimization was shipped.

## TRANSFER SIZE SWEEP

Fixed strict/count median ratios were: 0 B 1.029x, 64 B 1.074x, 1 KiB 1.013x,
4 KiB 1.000x, 16 KiB 1.022x, 64 KiB 1.040x, 256 KiB 1.124x, 1 MiB 0.982x,
and 8 MiB 1.100x. Callback ratios were 0.994x, 1.057x, 1.063x, 1.015x,
1.153x, 1.013x, 1.053x, 1.071x, and 1.248x respectively.

The 8 MiB transfer row remains only 7.7-9.7 ms because transferred lazily
initialized buffers avoid a payload copy; CV is 18-27%. It is retained but not
used for a strong percentage claim.

## CLONE SIZE SWEEP

Fixed strict/count median ratios were: 0 B 1.091x, 64 B 1.206x, 1 KiB 1.016x,
4 KiB 1.099x, 16 KiB 1.042x, 64 KiB 1.198x, 256 KiB 1.044x, 1 MiB 1.041x,
and 8 MiB 1.022x. Callback ratios were 1.115x, 1.160x, 1.033x, 1.100x,
1.069x, 1.037x, 0.991x, 1.047x, and 1.022x. Clone payload work increasingly
dominates at large sizes; the 8 MiB rows had about 6% CV.

## FIXED VS CALLBACK DECLARATION

Neither declaration form wins consistently. At the key 256 KiB transfer point,
callback was 6.3% faster than fixed even though both execute the same strict
worker validation. At 16 KiB transfer callback was 13% slower than fixed. The
callback microtrace shows its own cheap host invocation cost is small; process
and scheduling variation remains material.

## ZERO-BYTE CONTROL

Zero-byte results still exercise admission, reservation, validation, yield, and
release without payload transport. Clone count/fixed/callback medians were
236.59/258.23/263.92 ms for 4,096 results. Transfer-envelope medians were
264.13/271.82/262.67 ms. High transfer CV (17-36%) prevents interpreting the
small differences as a stable transfer-specific cost.

## WINDOWS RESULTS

All retained v0.10 evidence was collected on Windows 10 build 19045, x64. Build,
tests, stress, soak, performance, pipeline, and regression controls ran locally.
Power mode could not be queried and is recorded as unknown.

## LINUX RESULTS

No Linux environment was available in this workspace. Historical Linux numbers
use different versions and methods and are not presented as v0.10 reproduction.

## NODE VERSION RESULTS

Node v24.21.0 with V8 13.6.233.17-node.53 was available and used. `where node`
found one installation and no Node version manager was available. Node 22 and
other Node 24 releases were not tested; this matrix remains open.

## CPU / MACHINE RESULTS

The host is `Miskovy`, Intel Core i3-10100F at 3.60 GHz, 8 logical CPUs,
`availableParallelism()` 8, and 15.87 GiB RAM. WMI access to physical-core data
was denied, so the artifact records physical cores as unknown rather than
inferring them from the model. No AMD, ARM64, newer Intel, or second machine was
available.

## LONG-RUN BINARY PIPELINE

The mixed 4 KiB/16 KiB/64 KiB/256 KiB/1 MiB pipeline delivered 320 transferred
results in 50.77 ms with no byte-credit waits at a 4 MiB capacity. Ten
resource snapshots were retained, and terminal reserved bytes were zero. This
is a sustained application-style pipeline, not a memory-cap stress case.

## VARIABLE-OUTPUT TRACE

The RLE trace compressed 768 KiB into 19,704 bytes across 192 blocks; output
sizes ranged from 86 to 122 bytes with a 102.6-byte mean. Exact declaration
required a host-side RLE sizing pass (192 calls, 1.68 ms in the retained run)
before workers repeated the scan. This is direct evidence that exact sizing can
duplicate application work for data-dependent output.

## MULTI-STREAM PRESSURE

Four concurrent strict streams completed without starvation. Observed
per-operation peaks exactly reached their configured caps: 2 MiB, 64 KiB,
512 KiB, and 1 MiB. The sampled runtime aggregate peaked at 3,735,552 bytes,
exactly the 3.5625 MiB sum of the four configured caps. All four operation IDs
were observed and terminal state was zero.

## WEIGHTED FAIRNESS

A 4 KiB-result stream completed in 28.3 ms while a sustained 4 MiB-result stream
completed in 421.3 ms. Both completed and neither starved. This is evidence of
cross-operation progress, not a formal weighted-fair scheduler guarantee.

## HEAD-OF-LINE CREDIT RESULTS

Operation A had one 1 MiB result credit and a deliberately slow consumer, so its
next declaration repeatedly could not fit. Independent 4 KiB operation B
finished in 8.2 ms while A finished in 343.0 ms. Per-operation byte credit did
not globally block eligible work.

## DECLARATION CALLBACK COST

For 512 results, cheap callback body time was 0.55 ms and total wall time 38.78
ms; the moderate CPU callback body was 0.83 ms and wall 37.99 ms; a callback
that submitted eight reentrant `runtime.run()` controls used 0.74 ms in its
synchronous bodies and the stream completed in 42.73 ms. A throwing callback
rejected in 1.14 ms and cleaned up. Callback cost executes
synchronously on the host and expensive/reentrant work remains the caller's
responsibility.

## EVENT LOOP IMPACT

Across the full pipeline/fairness/callback sequence, event-loop utilization was
0.385, maximum sampled delay 16.51 ms, and mean delay 5.43 ms. The reentrant
callback is visibly more expensive but did not deadlock. These process-wide
figures include benchmark orchestration and are not a service-latency promise.

## PROTOCOL / FAULT-INJECTION RESULTS

Protocol tests now reject fractional, NaN, infinite, and unsafe declarations;
duplicate host batch IDs; inconsistent task kinds; malformed binary failure
details; duplicate/malformed skipped IDs; duplicate result IDs; and result/
skipped overlap. Existing tests plus the soak inject worker errors, crashes,
batch skips, abort races, timeouts, consumer faults, and both shutdown modes.
No public fault-injection API was needed.

## REGRESSION CONTROLS

Committed v0.9 and v0.10 were separately built and run in
v0.9/v0.10/v0.10/v0.9 order with ten retained samples per case. Candidate/
baseline medians were: `run()` 1.050x, batched `parallelFor()` 0.964x,
count-only stream 0.991x, strict clone fixed 1.062x, strict transfer fixed
0.842x, and strict transfer callback 0.882x. No broad candidate regression is
demonstrated; the small `run()`/clone increases need more machines before action.

## BUGS FOUND

No reservation-accounting product bug reproduced. Two debug-scanner transition
placements were corrected before shipping, the queue soak was fixed to occupy
all workers, and protocol validation was hardened against duplicate and
overlapping batch IDs that previously passed structural validation. The latter
is a malformed-message boundary defect, not a normal worker-path leak.

## OPTIMIZATIONS MADE

No runtime optimization was made. The measured strict overhead is distributed,
callback-independent at the key point, and smaller under longer windows than
the original estimate. Changing validation or ownership without a causal hot
path would trade correctness for an uncertain gain.

## UNRESOLVED VARIANCE

Tiny-result process rows retain 5-20% CV, zero-byte transfer reaches 36%, and
the short 8 MiB transfer row reaches 27%. The 256 KiB conclusion is supported
by longer windows and 7-9% CV, but its exact percentage is machine-specific.
RSS retention after worker churn, Linux/Node 22 behavior, other CPUs, and the
small ordinary-`run()` regression-control increase remain unresolved.

## EXACT-CONTRACT COVERAGE

Coverage includes ArrayBuffer, typed arrays, Buffer, DataView, subviews, live
zero length, clone, transfer, fixed and callback declarations, count-plus-byte
credit, impossible/invalid declarations, wrong/nested/shared/detached/over/
undersized output, single and batched execution, every cancellation/timeout/
shutdown owner, consumer abandonment, fairness, and malformed protocols. The
RLE trace explicitly covers a workload for which honest exact declaration is
costly.

## OPEN QUESTIONS

- Does crash-heavy RSS plateau over multi-hour runs and on Linux?
- Does Node 22 reproduce the reservation and transport profiles?
- Is the 256 KiB strict-transfer delta stable on AMD, ARM64, and newer Intel?
- Can worker validation be isolated more causally without weakening the contract?
- What upper-bound/refund policy prevents chronic over-declaration and defines
  release timing, metrics, and batching semantics?

## RECOMMENDED V0.11

Keep exact mode intact. First add cross-platform/Node CI evidence and a longer
worker-churn RSS study. In parallel, design—not yet implement—a bounded
upper-declaration/refund experiment for data-dependent codecs such as the RLE
trace, with explicit slack metrics and release rules. Do not add another public
parallel algorithm until those semantics and costs are understood.
