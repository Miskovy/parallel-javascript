# v0.10 proposal: reservation durability and performance evidence

## Decision summary

v0.10 is an evidence milestone over the committed v0.9 exact binary-result
contract. It adds no public algorithm, reservation model, scheduler, byte pool,
or declaration semantics. The work will audit reservation ownership, add a
development-only invariant checker, exercise terminal paths for sustained
periods, isolate the reported strict-transfer anomaly, and retain reproducible
machine-specific evidence. Runtime changes are allowed only for demonstrated
correctness defects or small measured hot paths whose semantics remain
unchanged.

The completion claim is deliberately limited: **after a workload's operations
and physical worker executions have terminated, PJS must retain no result
reservation record or execution-correlation entry, runtime and per-operation
reserved-byte totals must be zero, and no reservation-related listener, timer,
task mapping, partition mapping, or buffered result reference may remain. RSS
or allocator high-water retention alone is not evidence of a leak.**

## Architecture audit

The task ID owns a reservation from child admission. Dispatch marks it and adds
the physical single-task or batch-leader correlation. Successful physical
completion removes the execution correlation and marks each logical reservation
execution-complete; the reservation remains through buffering until yield.
Queued cancellation releases immediately. Running cancellation marks caller
settlement but releases only after the physical correlation ends. Operation
termination releases buffered, queued, skipped, and already-ended records while
retaining live dispatched executions. Worker crash ends the physical
correlation; worker termination is the final fallback.

The audit will verify these structures together:

```text
resultReservations
resultReservationExecutions
RangeOperation.reservedResultBytes
RangeOperation.resultReservationTaskByPartition
streamResults.currentReservedResultBytes
```

No private structure becomes public API. Tests and soak code may inspect the
compiled internal object, and a gated private assertion routine may scan maps
when `PJS_DEBUG_RESERVATION_INVARIANTS=1`. The disabled production path must not
perform map scans.

## Reservation invariants

At every debug checkpoint:

```text
currentReservedResultBytes >= 0
each operation.reservedResultBytes >= 0
each operation.reservedResultBytes <= operation.resultByteCapacity
currentReservedResultBytes == sum(resultReservations.bytes)
currentReservedResultBytes == sum(unique referenced operations' reserved bytes)
```

Each reservation must match its operation partition-to-task entry. Each live
execution-correlation task ID must name one dispatched, not-yet-ended
reservation, without duplicates across correlations. A reservation whose
execution has ended may remain only for a successful buffered result awaiting
yield. After shutdown or a fully quiescent soak checkpoint:

```text
currentReservedResultBytes == 0
resultReservations.size == 0
resultReservationExecutions.size == 0
all retained operation reservation totals and partition mappings == 0
```

Assertions run only after complete state transitions, not between the component
updates that form one transition.

## Leak criteria

A reservation leak is reachable PJS state remaining after both caller and
physical execution termination: reservation/correlation records, nonzero byte
totals, operation partition mappings, runtime task/operation records, buffered
outputs, abort listeners, or deadline timers that no longer have an owner. A
monotonic trend in these reachable counts is evidence. RSS, heap capacity, or
external allocation remaining high after references are gone is allocator/GC
behavior until reachability or continued monotonic growth demonstrates
otherwise.

## Soak matrix

One deterministic-seed runner will rotate these scenarios:

- cancellation before admission, while credit-blocked, queued, dispatched,
  executing, buffered, consumer-waiting, and after yields;
- deadlines around queue, execution, buffering, and consumer-delay boundaries;
- single and batched task failure/crash, including queued siblings and parent
  cancellation;
- graceful and non-draining shutdown during declaration, queueing, execution,
  buffering, consumer wait, and intentional crash;
- `break`, consumer throw, explicit `return()`, and explicit `throw()`;
- successful clone and transferred-output controls between fault cases.

Modes are configurable rather than embedded in default tests:

```text
smoke       about 5 seconds, suitable for an optional CI job
quick       about 30 seconds, local default
standard    about 3 minutes
extended    explicit PJS_SOAK_DURATION_MS or iteration limit
```

Environment/CLI controls cover seed, duration, maximum iterations, workers,
result size, count capacity, byte capacity, sampling interval, and optional
forced-GC diagnostics. Ordinary runs never invoke GC. `--expose-gc` plus an
explicit flag records before/after-GC samples without turning GC into a pass
criterion.

## Resource trend methodology

Periodic samples retain elapsed time, scenario/iteration, `rss`, `heapUsed`,
`heapTotal`, `external`, `arrayBuffers`, worker population/failures/restarts,
active thread IDs, task and operation counts, current/peak reserved bytes,
private reservation/correlation counts, and `process.getActiveResourcesInfo()`
type counts where available. The report compares early and late windows and
records linear direction without declaring a memory leak from one endpoint.

Intentional crash cases must keep live worker population bounded. Handle data
is diagnostic because Node resource names and internal composition are not a
stable assertion surface.

## Performance hypotheses

The v0.9 strict-transfer slowdown may be caused by phase/order noise, short
measurement windows, output transfer setup, count/batch differences,
declaration callback invocation, reservation map/accounting, protocol metadata,
worker validation, result release, or metrics. No cause is assumed.

Controlled hypotheses are:

1. Fixed and callback declarations have indistinguishable cost at sustained
   payload sizes, but callbacks can affect tiny-result host throughput.
2. Binary kind/liveness/length validation is O(1) in payload size.
3. Reservation bookkeeping is visible mainly for zero/tiny results rather than
   256 KiB-8 MiB transfers.
4. The 30.6% result will not remain stable under balanced interleaving and
   longer windows; if it does, internal stage profiles must identify a causal
   stage before optimization.
5. Clone/transfer crossover depends on result size and host, not one universal
   threshold.

## Benchmark matrix

The sustained binary benchmark uses the same worker task and checksum-validated
consumer for all modes. It sweeps direct results of 0 B, 64 B, 1 KiB, 4 KiB,
16 KiB, 64 KiB, 256 KiB, 1 MiB, and 8 MiB for clone and transfer. Modes include
count-only, strict fixed declaration, and strict callback declaration. Tiny
sizes repeat enough results to reach useful windows; large sizes use fewer
results while targeting hundreds of milliseconds. Zero-byte count-only versus
strict isolates lifecycle cost without payload bytes.

Critical comparisons use balanced A/B/B/A process ordering with the same source
tree, one warmup and at least eight retained samples per mode/size in the full
run. Every sample is retained. Reports include median, mean, p95 when sample
count supports it, minimum, maximum, standard deviation/coefficient of
variation, wall/CPU time, first-result latency, results/s, MiB/s, worker
occupancy, messages, waits, execution/profile stages, event-loop delay,
utilization, timer drift, and memory endpoints/peaks.

Direct internal micro-controls measure declaration calls, safe-integer capacity
checks, Map insert/delete, binary inspection for every accepted kind, and error
construction. Existing benchmark-only stage profiling measures factory,
admission, posting, worker ingress/output preparation, host settlement, parent
collection, and release paths. No public feature toggle will disable contract
semantics. If a same-source toggle is required for causality, it must be
internal, benchmark-only, off by default, and must never appear in package
exports.

## Long-run application pipelines

The deterministic binary task becomes a sustained pipeline. Fixed-size runs
exercise exact declarations and credit utilization. A separate research trace
uses genuinely data-dependent RLE and records actual size distribution. Strict
mode is used honestly by repeating the RLE sizing scan in the host declaration,
making the exact-contract application cost observable. It does not fake a
declaration or implement upper-bound refunds.

Four concurrent strict streams record per-operation peak reservations, runtime
aggregate peak, external/array-buffer/RSS trends, throughput, and completion.
Weighted variants contrast multi-MiB and KiB results. A head-of-line case blocks
one operation's next declaration while proving another eligible operation can
continue. Cheap, moderate CPU, throwing, reentrant `runtime.run()`, and immutable
metadata callbacks measure synchronous main-thread impact; async declarations
remain unsupported.

## Protocol and fault evidence

Protocol tests add negative, fractional, unsafe, and missing expected bytes;
missing/invalid binary failure detail; inconsistent kinds; duplicate batch task
IDs; duplicate or malformed skipped IDs; and malformed batch correlation.
Existing gates, payload getters, deliberate task failures, crashes, worker
messages, cancellation, and shutdown serve as lifecycle fault points. A general
shipping fault-injection API is unnecessary unless the audit finds an
unreachable transition.

## Regression matrix

Committed v0.9 and the v0.10 candidate run in v0.9/v0.10/v0.10/v0.9 order for
ordinary `run()`, clone, transfer, shared input, `partitionRange()`,
`parallelFor()`, count-only stream, strict clone, strict transfer, generic map,
and typed map. Each tree is built separately. A regression is causal only when
repeatable beyond within-mode variance and attributable to a candidate change.

## Hardware, operating-system, and Node matrices

Every artifact records CPU model, logical parallelism, best-effort physical-core
count, total RAM, OS/platform/kernel/build, architecture, Node and V8 versions,
PJS commit/tree state, worker count, settings, and power information when known.
The locally available Windows/i3-10100F/Node 24 environment is mandatory.
Node 22, Linux, macOS, AMD, newer Intel, and ARM64 are run only where actually
available. Unavailable cells are reported explicitly; historical runs from
different methods are not presented as reproductions.

The scripts accept output paths or machine labels so contributors can submit
`*-v0.10.json` artifacts without overwriting another machine. All v0.1-v0.9
artifacts remain byte-for-byte unchanged.

## Statistical methodology

Critical windows target at least hundreds of milliseconds. Samples are
interleaved, not grouped by mode. All observations and order are retained. The
report emphasizes median and coefficient of variation; mean/min/max and p95 are
supporting context. A p95 from fewer than eight samples is not interpreted.
No outlier is deleted, no forced GC occurs in normal timing, and environmental
anomalies are described rather than normalized away.

## Decision gates

- Fix a correctness bug immediately only when an invariant, targeted test, or
  soak reproduces it; add a regression test and before/after evidence.
- Optimize only a repeated causal stage with unchanged semantics and a small,
  measurable improvement. “Faster once” is insufficient.
- Consider upper-bound/refund semantics for v0.11 only if the variable-output
  trace shows important workloads excluded by exact declarations.
- Consider a global byte pool only if concurrent valid per-stream capacities
  create unacceptable measured aggregate pressure.
- Consider caller-provided destinations only if host-copy evidence dominates
  typed workloads.
- Consider cooperative cancellation only if retained running reservations are a
  sustained operational problem.
- If no defect or stable hot path appears, make no runtime optimization and
  select another proven need. v0.11 does not begin in this milestone.

## Deliverables and validation

Create `scripts/reservation-soak.mjs`, focused v0.10 benchmark/reproduction
scripts, v0.10 raw JSON artifacts, and `docs/benchmarks-v0.10.md`. Add an ADR
only if the audit changes architecture. Update general documentation only for
actual runtime/support guidance changes. Before completion, build, correctness,
stress, type tests, TypeScript compatibility, lint, format, diff checks, the new
soak, regression controls, and retained benchmarks must pass.
