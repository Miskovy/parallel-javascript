# v0.5 proposal: dispatch efficiency and bounded batching

## Evidence and scope

v0.4 established a correct host-owned range lifecycle over the existing bounded
FIFO. Its four-worker no-op case reached 27.7 ms for 128 logical partitions,
while median worker kernel and execution time were approximately 0.0016 ms and
0.0278 ms per child. Queue latency remained about 0.006 ms. That evidence points
to the end-to-end child and message path; it does not identify one dominant
stage and does not justify replacing the scheduler.

v0.5 first measures the current implementation, then tests whether fewer physical
messages improve small/shared workloads. It preserves registered module tasks,
the central FIFO, explicit grain, parent/child settlement, deterministic ordering,
worker occupancy after caller cancellation, crash replacement without retry,
shared backing, and transfer ownership. It does not add work stealing, adaptive
grain, nested execution, streaming, reduction, or stable parallel algorithms.

Node documents that worker messages use structured clone with explicit transfer
lists, and recommends `AsyncResource` for associating worker-pool callbacks with
the submitting async context. `monitorEventLoopDelay()` and
`performance.eventLoopUtilization()` measure different aspects of main-loop
pressure. These are research inputs: v0.5 measures event-loop impact and records
the AsyncResource opportunity, but does not add context propagation to the hot
path without separate correctness and overhead evidence.

Primary references:

- [Node worker threads](https://nodejs.org/api/worker_threads.html)
- [Node AsyncResource and worker pools](https://nodejs.org/api/async_context.html#using-asyncresource-for-a-worker-thread-pool)
- [Node performance hooks](https://nodejs.org/api/perf_hooks.html)
- [Piscina 5.3.2](https://github.com/piscinajs/piscina), pinned in the lockfile

## Current execution path

```text
partitionRange()
  -> UUID + range validation + parent Promise/listener/timer
  -> PartitionOperation stored in operations Map
  -> guarded producer selects an eligible parent
  -> partitionAt() allocates and freezes { index, start, end }
  -> synchronous createInput()
  -> transfer-list snapshot/validation/reservation
  -> child UUID + Promise + PendingTask/snapshot/cleanup closures
  -> tasks Map + parent children Map + logical counters
  -> direct idle dispatch or FIFO Map insertion
  -> scheduling timestamps/metrics + PjsWorker.execute()
  -> host postMessage structured-clones input (or transfers buffers)
  -> worker message event + protocol validation
  -> started postMessage + host message event/state transition
  -> registered task lookup/invocation/await
  -> output envelope lookup + transfer validation
  -> result postMessage serialization/transfer
  -> host message event + protocol correlation
  -> worker/pool state transition + execution metric
  -> task Map/FIFO removal + cleanup + Promise settlement
  -> parent children Map removal + counters + indexed output insertion
  -> producer pump, or parent cleanup and Promise settlement
```

### Allocations and retained records per logical child

- frozen public `RangePartition` object;
- factory result and application payload graph;
- UUID string and child ownership record;
- Promise and resolve/reject/cleanup closures;
- `PendingTask`, mutable `TaskSnapshot`, transfer-list snapshot, and usually an
  empty transfer array;
- entries in the runtime task Map and parent child Map;
- FIFO Map entry while queued;
- host and worker protocol message objects;
- worker result/envelope objects and the returned output;
- a retained output-array element until successful parent settlement.

Parent-only allocations include its UUID, Promise, operation record, range plan,
signal callback, optional timer, output array, and operations Map entry. Pool and
task module records are persistent and amortized across operations.

### Asynchronous and serialization boundaries

The parent Promise, each child Promise, `setImmediate` producer continuation,
optional timer, abort event, Worker message events, registered task `await`, and
caller continuation are asynchronous boundaries. Each child normally sends one
host execute message, one worker started message, and one worker result message.
Input structured clone/transfer occurs at host `postMessage`; output clone/transfer
occurs at worker `postMessage`. The worker `started` acknowledgement has no user
payload but still crosses isolates.

The current benchmark's `submittedNs -> kernel start` span combines host
admission, queueing, input serialization, transport, worker message delivery,
protocol handling, the started acknowledgement, lookup, and instrumentation.
It cannot attribute those stages independently.

## Measurement before optimization

Create a current-build manual producer matching owned range grain, payload,
bounded unsettled window, worker count, memory strategy, and ordered assembly.
Compare it to `partitionRange()` batch size one. Archived v0.3 remains historical
context but is not the coordinator-overhead control.

Use an internal benchmark timing channel, disabled by default, to timestamp:

- descriptor creation and `Object.freeze`;
- application factory time and transfer-list preparation;
- logical child construction/admission and FIFO wait;
- host `postMessage` call duration;
- worker message arrival, task invocation start/end, and output preparation;
- worker `postMessage` call duration;
- host result receipt, logical settlement, indexed collection, and parent
  settlement.

Raw worker monotonic timestamps are comparable across Node worker threads in one
process, but each stage definition is still documented rather than treated as an
exact profiler. Aggregate timings only; do not expose them as stable runtime
metrics. Run the no-op with and without instrumentation. If timing probes change
wall time materially, use the uninstrumented results for performance claims.

Add focused host microbenchmarks for frozen descriptors versus numeric triples,
UUID generation, Map insert/remove, Promise construction, listener setup, and
the combined current child record. Microbenchmarks describe isolated costs and
cannot be summed into an operation predictor because JIT, allocation, and
contention differ from the integrated path.

The public descriptor remains frozen. A compact internal representation will be
adopted only if integrated measurements show a repeatable benefit after the
factory still receives its immutable public object.

## Experimental bounded dispatch batching

Add an explicitly experimental per-operation dispatch batch size, initially
1/2/4/8/16. `1` follows the v0.4 single-child protocol. Grain and batch remain
independent:

```text
grainSize: logical range represented by one partition
dispatch batch size: logical partitions executed sequentially in one worker turn
```

Only partition children from the same operation and registered task may share a
batch. Ordinary `run()` never batches. A batch holds the same public payloads
that individual execution would send; it does not serialize a closure or change
the task export. Items run sequentially on one worker.

Batching is experimental rather than a promised long-term option. The benchmark
will compare current manual, owned batch=1, owned batches, Piscina manual, and a
manual Piscina batching adapter. Matching Piscina batching distinguishes the
generic value of fewer messages from PJS-specific implementation quality.

## Logical and physical admission

Admission remains defined in logical items:

```text
queued logical tasks <= maxQueue
running logical tasks <= workers * configured batch size
active parent records <= workers + maxQueue
```

The FIFO stores one physical execution record with a logical admission weight.
Its observable `queue.size` is the sum of queued logical weights, not physical
entries. A queued batch therefore consumes one queue credit per item. An idle
worker can accept one bounded batch directly. Host staging reserves the selected
idle worker or the required logical queue credits before invoking factories, so
reentrant `run()` cannot steal promised capacity.

Per-operation unsettled children are bounded by `workers * batchSize`. No whole
range, unbounded batch list, or unbounded Promise list is generated. Parent
rotation occurs per physical batch. Existing queued work dispatches first.
Larger batches can occupy workers longer and weaken fairness; benchmark tail
latency before considering an automatic policy.

`maxQueue=8` can represent at most eight queued logical children, whether those
are eight one-item messages or one eight-item message. It never means eight
batches of arbitrary hidden size. Running-batch capacity is separately visible
and explicitly derived from worker count and experimental batch size.

## Protocol and identity

Keep ordinary protocol messages unchanged. Add versioned internal batch execute,
started, and result variants. A physical batch ID is correlated to one occupied
worker. Every item retains its task ID plus the parent operation/partition
context in host records. Protocol validation rejects duplicate, missing, unknown,
or out-of-batch task IDs; malformed responses fail the worker under existing
replacement rules.

One batch execute message and one batch result message represent N logical
partitions; the existing started acknowledgement is also one physical message.
Experimental dispatch metrics record execute messages, result messages, batch
messages, and logical tasks transported. Historical task/operation/partition
counters keep their meanings and count logical work.

Outputs from a successful batch settle by task ID and are inserted at logical
partition index. Completion order between batches remains irrelevant. The final
array is byte-for-byte equivalent to batch size one for the same task outputs.

## Failure and crash semantics

Within a batch, items run in order. If item 21 throws after item 20 succeeded:

```text
20 reports logical success
21 reports the original task failure and partition context
22..end do not execute and settle cancelled
the parent rejects exactly once and cancels other siblings
```

The parent's accumulated outputs, including 20, are discarded. Metrics record
20 completed, 21 failed, and unexecuted admitted items cancelled. Remaining
queued batches are removed. Other workers already executing batches remain
occupied and their late results are ignored.

A worker crash makes execution progress unknowable. The parent fails without
retry, all logical items owned by that physical batch settle through the normal
first-failure/sibling-cancellation path, and replacement follows the existing
bounded restart policy. The error carries the operation and the first unresolved
partition as attribution plus the physical batch ID; documentation must not
claim this proves which item caused a process exit or side effect.

Combined result serialization can likewise make the exact offending successful
output unknowable. Treat it as a batch transport failure attributed to the first
unresolved logical item, fail the parent, and execute no retry.

## Cancellation and shutdown

Parent cancellation before physical dispatch removes the queued batch and leaves
all inputs host-owned. Cancellation after dispatch settles logical callers but
does not notify or preempt the worker. The worker finishes the full already-posted
batch unless a task fails. Late outputs are discarded; the worker remains busy
until its one batch result or crash. This is the direct extension of v0.4's
execution-occupancy invariant and can increase worst-case cancellation latency
by up to one batch. Measure that cost explicitly. Cooperative flags are out of
scope.

The whole-operation timeout uses the same rule. Graceful shutdown finishes every
logical partition, including ungenerated work; non-draining shutdown cancels
parents and terminates workers. The first shutdown mode still wins.

## Transfer ownership

Initial protocol batching rejects every non-empty child input `transferList` when
batch size is greater than one. This is deliberate. Posting a batch would detach
all buffers together even when an earlier item later prevents the rest from
executing. Silent early ownership transfer is too large a semantic change for
the first experiment.

Batch size one preserves all v0.4 input/output transfer behavior. SharedArrayBuffer
and cloned metadata are the primary batching targets. Batched worker outputs may
be cloned or transferred back together because those buffers are worker-owned;
if combined output serialization fails, the parent fails without retry. Matrix A
input blocks therefore remain batch size one in the primary matrix comparison.
An explicit future ownership rule may revisit batched input transfer only if the
measured benefit justifies its complexity.

## Output retention and non-collecting research

Measure undefined, scalar, small object, small typed-array, and larger outputs at
fixed logical/physical counts. Compare owned collection with a bounded manual
completion-only harness that discards results as they settle. This isolates some
retention/assembly cost without promising a new runtime API. `partitionRange()`
continues returning ordered outputs and retaining them until success. Streaming,
consumer backpressure, partial success, and a stable `parallel.for()` remain out
of scope.

## Fairness and event-loop study

Run two long partition parents plus continuous ordinary submissions. Record time
to first execution, per-parent progress, ordinary latency, completion tail, and
physical batch occupancy for batch 1/2/4/8. This evaluates the existing producer
rotation and the additional non-preemptive batch interval; it does not authorize
a scheduler rewrite.

For no-op/shared production, record `monitorEventLoopDelay()` percentiles/max,
event-loop utilization, and an independent short-interval timer's delay while
operations run. Histograms need a warm sampling turn before work and use
nanoseconds; ELU is a cumulative/delta main-loop measure. These signals describe
host responsiveness, not end-user HTTP latency or future framework performance.

## Benchmark matrix and evidence gate

- First-class no-op: workers 1/2/4; logical counts 1/2/4/8/16/32/128/512;
  current manual, owned batch 1, owned batch 2/4/8/16 where bounded, Piscina
  manual and Piscina manually batched; undefined/scalar/object output controls.
- Shared scan: independent grain factors 1/2/4/8/32 and batch 1/2/4/8, with the
  same reusable shared array and scalar results.
- Matrix: shared B, transferred A/output, several grains, batch 1. Any clone-only
  batching experiment is labeled as a different ownership layout.
- Skew: preserve the v0.4 accumulator workload and add a bounded Uint32/Math.imul
  or xorshift control whose representation stays fixed. Test grain and batch
  independently; report per-worker kernel intervals.
- Ordinary run: same-build pre/post candidate controls for small messages and
  medium/large CPU work, interleaved in independent sessions.

Important comparisons run in multiple fresh sessions with balanced order and no
outlier deletion. Retain Node, OS, CPU, worker count, order, raw wall/CPU/RSS,
logical items, physical execute/result messages, event-loop measurements, and
instrumentation state in new `*-v0.5.json` artifacts. Historical files are never
overwritten.

An approximate interpretation may use:

```text
T ~= production + dispatch(messages) + serialization + compute
   + result transport + settlement + collection + contention
```

The terms overlap and are not expected to form an exact predictive equation.
Keep batching only if it measurably reduces fine shared/no-op cost without
breaking admission, failure, cancellation, ordering, or ordinary-run behavior.
If profiling points elsewhere, remove or retain batching only as documented
research evidence. v0.6 will be selected after these results; it is not part of
this implementation.
