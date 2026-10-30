# v0.4 proposal: runtime-owned numeric ranges

## Research and scope

v0.3 established native reusable shared input but leaves partition generation,
bounded submission and assembly to applications. Its noisy measurements argue
for matched controls, not a different scheduler. Existing FIFO, task settlement,
worker occupancy, transfer reservations, GC lifetime and restart behavior stay.

[Rayon's indexed iterator](https://docs.rs/rayon/latest/rayon/iter/trait.IndexedParallelIterator.html)
separates logical indices from execution order and offers grain controls. Its
shared-heap and nested-execution machinery is not a drop-in Node design.
[Piscina backpressure](https://github.com/piscinajs/piscina#backpressure) motivates
bounded production over a pool, independently of whether the pool owns range
division. [Node workers](https://nodejs.org/api/worker_threads.html) execute in
isolates: PJS's registered modules remain the task representation; host payload
factories will not be serialized as closures.

## Proposed experimental contract

`runtime.partitionRange(task, { start, end, grainSize }, createInput, options)`
returns one `Promise<Output[]>`. It is experimental, not a stable parallel.for,
map or reduce API. `createInput(partition)` runs synchronously in the main
isolate and returns `{ input, transferList? }`. Only the registered worker task
executes the compute kernel. This lets applications combine common shared views,
compact exclusive transfers and cloned metadata without a resource registry.

The range is half-open with safe integer endpoints, end >= start, a safe integer
span, and an explicit positive safe integer grainSize. Negative endpoints are
valid. Descriptors are immutable `{ index, start, end }`, generated in ascending
order. The final chunk may be shorter. Empty ranges succeed with `[]` without
calling the factory. One-element and grain-larger-than-range cases yield one
chunk. Reject more than 2^32-1 chunks because the collected result is a JS array.
Do not allocate that array or any descriptor list up front; completed outputs
grow the result array lazily. Output memory necessarily scales with results and
is not bounded by maxQueue.

An explicit grain is preferable initially to a requested chunk count: it is an
exact maximum chunk width, independent of worker count. A chunk-count API needs
a rounding/distribution rule and duplicates an easily computed caller choice.
No default/adaptive grain heuristic is implied. Benchmark approximate 1, 2, 4,
8 and 32 chunks per worker to establish granularity tradeoffs.

## Operation ownership and state

The host owns an operation ID, range plan, next index, at most worker-count live
children, child IDs/descriptors, ordered completed outputs and counters. State:
created -> running -> completed | failed | cancelled | timed_out. Running here
means a logically accepted operation, including waiting for startup/capacity.
Parents occupy no worker and no task-queue slot. Worker-created partition
operations are rejected: general nested parallelism and worker-to-host child
submission are unsupported. Tasks must not spawn hidden pools to emulate it.

Each accepted child is an ordinary task in the same FIFO. Success is placed at
its logical partition index. The parent resolves only when every chunk has
completed. First observed meaningful failure wins; stop production, cancel all
pending siblings, discard accumulated/late outputs and reject once. Active
sibling callers are cancelled but their workers remain occupied until normal
completion/crash. No task retry and no failure-triggered worker termination.
Worker crashes retain the existing replacement policy; unrelated operations
can use replacement workers. Worker task exceptions remain PjsTaskError with
operationId/partitionIndex/rangeStart/rangeEnd added. Factory exceptions are
local PjsError with the original cause and partition context.

## Bounded admission and reentrancy

Use a fixed per-operation window of worker-count unsettled children, also
limited by actual global idle/queue capacity. Generate a descriptor/payload
only when capacity is available. Do not keep a Promise per ungenerated chunk.
Globally waiting tasks <= maxQueue and occupied worker slots <= worker count.
Production visits eligible operations round-robin; dispatch remains FIFO.
Existing queued ordinary tasks dispatch before new children. No fairness claim
against an application continuously saturating the runtime is made.

Bound active parent records separately to min(MAX_SAFE_INTEGER,
workers + maxQueue). Exceeding this bound rejects with PjsQueueFullError and an
operation ID; it is not counted as a rejected child task. This bounds the small
logical producers even when every caller describes billions of indices. Parent
acceptance does not reserve all child capacity. A parent may wait during startup
or queue saturation, including maxQueue=0; only its bounded record exists then.
This is explicitly different from ordinary run(), which still rejects overflow.

A synchronous factory can re-enter run(), cancellation or shutdown. Reserve one
admission credit before calling it and hold the credit through transfer-list
validation/admission. Reentrant submissions cannot steal that capacity. Recheck
parent/runtime state after user callbacks/getters. Never retry a factory or
detach a prepared buffer merely because cancellation occurred before dispatch.
Use a pump guard so reentrant callbacks cannot recursively produce chunks.

## Cancellation, deadlines and shutdown

One AbortSignal listener and one end-to-end deadline belong to the parent.
The deadline includes startup, capacity waiting, factory work, task queueing,
execution and result collection; it is never reset per chunk. Check elapsed
time at production/settlement boundaries as well as using the timer. Synchronous
factories cannot be preempted; they must be short and finish their own work.

Cancellation/timeout closes production, removes queued children and settles
running child callers. Busy workers retain ownership; no new child uses their
slots early. Release factory closures, signal listeners, timers and collected
outputs on failure. Shared bytes remain valid; transferred ownership cannot be
restored after successful posting, including reentrant abort during serialization.

Graceful shutdown closes new public admission but finishes the **entire range**
of every accepted operation, including as-yet ungenerated chunks. Its internal
children may continue entering the FIFO while draining. Shutdown checks live
operations as well as tasks and busy workers. Non-draining shutdown cancels
parents first, then remaining tasks, and terminates workers by existing rules.
Fatal runtime failure rejects all parents; first meaningful child failure still
wins if observed first. An accepted operation can therefore extend graceful
shutdown significantly; this is explicit, not an implicit partial-range success.

## Metrics

Existing tasks.* and timing statistics include every admitted child execution
exactly as an ordinary run. Parents do not increment tasks._. Add operations._
for accepted/rejected/terminal/pending parent counts and the producer limit;
partitions.* counts generated descriptors, admitted children and child outcomes.
Generated may exceed admitted by a factory rejected/cancelled before admission.
Parent timeout cancels its children (tasks.cancelled), while operations.timedOut
records the parent reason. Snapshots of active operations derive queued/running
children from live task records. Scheduled children count as running there.
Late execution timing retains existing meaning after caller settlement; no
completed-parent history or fabricated byte/idle metrics are retained.

## Validation and evidence gate

Use independent index coverage oracles across seeded random ranges, awkward
boundaries and safe-integer edges. Test ordering, lazy generation over ten
million chunks, queue/parent saturation, reentrant factories/getters, failures,
abort/deadline races, crash recovery, both shutdown modes, shared data and
transferred inputs/outputs. Retain all v0.3 tests and repeat stress.

Compare bounded manual PJS, runtime-owned PJS and bounded manual Piscina using
identical descriptors, payloads, kernels, grain sizes and output ordering.
Range sums compare full clone/shared reference data and compact transferred
slices. Matrix rows combine compact transferred A with shared B. Add a skewed
integer kernel with increasing per-index work and independent expected results.
Retain wall/CPU/RSS, child counts, queue/execution timings, worker participation
and execution occupancy proxies; distinguish proxies from actual idle sampling.
No work stealing, adaptation, public algorithm family or v0.5 implementation.
