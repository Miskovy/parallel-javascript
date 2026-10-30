# Checkpoint 3: scheduling, asynchronous concurrency and progress

Status: approved design implemented in development, including unconstrained progress
generics and the bounded-encoder/drain-cleanup review corrections. Reviewed 26 October 2026 after
fetching `origin`. Current `main` is
[`f41f811eaeb36a5d0bf523e167179bf41dacef11`](https://github.com/Miskovy/parallel-javascript/tree/f41f811eaeb36a5d0bf523e167179bf41dacef11),
the PR #33 merge of implementation `f920b83`; there are no subsequent changes.
The implementation follows this reviewed proposal; historical baseline statements
below describe main before Checkpoint 3.

## Baseline and owners

Read together with the [architecture](../development/architecture.md),
[Checkpoint 2 proposal](checkpoint-2-execution-recovery.md),
[API](../guide/core-api.md), [lifecycle](../guide/lifecycle.md),
[backpressure](../guide/backpressure.md), [ownership](../guide/memory-ownership.md)
and [statistics](../guide/telemetry.md) guides. Source governs where historical
proposal text describes an earlier implementation. Paths below are relative to
`packages/runtime/src/`.

| Existing owner                                        | Relevant implementation and required extension                                                                                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PjsRuntime`, API adapters, configuration/composition | `runtime.ts`, `api/run.ts`, `api/range/`, `configuration/runtime-options.ts`, `composition/create-runtime-components.ts`: propagate typed options and normalize configuration before startup.                                             |
| `PjsScheduler`                                        | `scheduler/fifo.ts`: a Map supplies FIFO, direct removal and logical queue weight. `next()` currently requires an idle worker. Keep storage/accounting internal; add ranking over eligible entries.                                       |
| `ExecutionDispatcher`                                 | `dispatch/dispatcher.ts`: whole-worker `reservedWorkers`, production claims, ordinary recovery slot/queue claims, posting protection and thread-count demand currently assume one execution per worker. Extend claims and placement here. |
| `TaskCoordinator`                                     | `tasks/coordinator.ts`, `tasks/task.ts`: logical records, per-attempt IDs, physical execution membership, recovery policy and exactly-once settlement already exist. Own progress subscriptions and logical routing here.                 |
| `RangeCoordinator`                                    | `partition/coordinator.ts`, `partition/operation.ts`: bounded round-robin production, singleton recovery, assembly and streams. Snapshot parent priority/progress options and adapt the child window.                                     |
| `PjsPool`, `PjsWorker`                                | `pool/pool.ts`, `workers/worker.ts`: pool owns population/restart decisions; worker owns transport and physical occupancy. Replace the worker's singular execution record with a bounded map.                                             |
| Bootstrap and protocol                                | `workers/bootstrap.ts`, `workers/protocol.ts`: one global busy guard, one awaited execution, sequential batches and correlated cancellation contexts. Permit multiple independent physical messages and add bounded progress transport.   |
| Results, lifecycle and telemetry                      | `results/credit.ts`, `partition/stream.ts`, `lifecycle/runtime-controller.ts`, `telemetry/runtime.ts`, `diagnostics.ts`: keep result ownership/output ordering; drain all physical attempts and expose thread/attempt counts separately.  |

The singular worker record includes `currentTaskId`, execution phase, batch item
IDs, cancellation flag and lease. `PjsPool.busy`, dispatcher eligibility/demand,
failure/exit callbacks and shutdown checks also assume one occupied correlation.
Changing only bootstrap would break admission and physical ownership.

Existing tests read include `checkpoint-two.test.mjs` (argument count, batch
recovery, cooperative cleanup, weighted FIFO), `resilience.test.mjs` (recovery
claims and confirmed exit), `checkpoint-one.test.mjs` (elasticity/resource limits),
`batch.test.mjs`, `physical-boundary.test.mjs`, `runtime-boundaries.test.mjs`,
`diagnostics.test.mjs` and `types.test.ts`. These establish compatibility cases;
no test campaign is part of this architecture task.

## Proposed API and defaults

**All declarations and examples in this document are proposed APIs.** These are
additions, not replacement declarations; retain existing overloads, option aliases,
`NoInfer` constraints and compatibility with non-generic option annotations.

```ts
interface PjsRuntimeOptions {
  // Existing options retained.
  concurrency?: number; // Physical async executions per worker; default 1.
  scheduling?: (
    a: Readonly<SchedulingTask>,
    b: Readonly<SchedulingTask>,
  ) => number;
}
interface SchedulingTask {
  readonly taskId: string; // Logical ID; batch leader for a physical batch.
  readonly taskName: string;
  readonly priority: number;
  readonly queuedAt: number; // Epoch milliseconds for this runnable entry.
  readonly weight: number; // Logical maxQueue cost, not execution slots.
  readonly exclusive: boolean;
  readonly operationId?: string;
  readonly partitionIndex?: number; // First partition for a batch.
}
type ProgressValue =
  | null
  | boolean
  | number
  | string
  | readonly ProgressValue[]
  | { readonly [key: string]: ProgressValue };
interface TaskProgress<P = ProgressValue> {
  readonly value: P;
  readonly taskId: string; // Stable logical child/call ID.
  readonly taskName: string; // Original registered task.
  readonly executionId: string; // This item's attempt ID.
  readonly correlationId: string; // Physical single/batch ID.
  readonly implementation: string; // Actual registered primary/fallback name.
  readonly attempt: number; // Starts at 1; includes fallback.
  readonly sequence: number; // Increasing within this invocation; gaps allowed.
  readonly workerId: number;
  readonly operationId?: string;
  readonly partitionIndex?: number;
}
interface TaskContext<P = ProgressValue> {
  readonly signal: AbortSignal;
  throwIfCancelled(): void;
  reportProgress(value: P): boolean;
}
interface RunOptions<Input = unknown, Output = never, P = ProgressValue> {
  // Existing fields retained.
  priority?: number; // Default 0; higher dispatches first.
  onProgress?: (event: TaskProgress<P>) => void; // Synchronous observer.
}
// The same fields extend every range option form.
// Add an unconstrained optional third Progress generic, default ProgressValue, to PjsTask,
// registry.register, RunOptions and range options; preserve existing parameters.
```

Validate priority as a signed 32-bit integer, including zero. Validate concurrency
as a positive safe integer, with safe products for configured execution/window
bounds. Validate scheduling/onProgress as functions when supplied. Snapshot options
once; recheck cancellation/runtime state after application getters as today.
Default priorities are equal, so the default scheduler remains FIFO. Default
concurrency remains one; progress allocates no channel without `onProgress`.

Registration's optional Progress generic declares a schema and infers caller
payload types, just as Input/Output do today. It does not inspect module exports
or validate application fields. Keep this generic unconstrained throughout: an
ordinary interface such as DownloadProgress below needs no index signature.
ProgressValue is the default declared type, not a constraint on application schemas.
Every actual payload must still satisfy the bounded JSON wire contract; even a
declared type can contain unsupported values, for which reportProgress returns false.
Fallback progress must remain assignable to the primary progress schema; applications
can declare a union. Anchor inference to the primary handle so a fallback cannot
widen it. Unannotated handles use ProgressValue, requiring caller narrowing.
Propagate the third generic
without changing typed-map constructor-first parameters or weakening fallback,
binary-output, reconstruction or option-exclusion checks. Runtime validates the
bounded JSON representation, not a TypeScript schema.

## 1. Priority and custom scheduling

### Ranking changes dispatch, not admission or production

Use descending priority, then stable enqueue sequence. Keep the Map and weighted
size/removal accounting; a bounded scan is sufficient initially. Never evict an
accepted task to admit a higher-priority submission. `maxQueue: 0` still rejects
ordinary work unless compatible execution capacity is immediately claimable.
Priority cannot interrupt running JavaScript or undo an existing claim.

A range parent snapshots one priority; every child and initial physical batch
inherits it. A batch remains indivisible for scheduling, with weight equal to its
logical item count. Both map forms and every stream mode retain their existing
result ordering and count/byte windows.

Retry/fallback retains priority, but **does not retain its old queue position**.
Assign a new sequence when the continuation becomes runnable. A confirmed skipped
suffix also resumes as existing singleton continuations. Backoff is ineligible.
Ordinary recovery claims keep their slot/queue exchange mechanism: rank ready
slot-backed continuations alongside runnable queued entries without pretending
they consume queue weight. If queued work wins the slot, exchange its freed queue
credit with recovery as today. With equal priorities this preserves existing FIFO
precedence; a higher-priority ready recovery may win without overflowing the queue.

Deliberately keep lazy range production round-robin and queued work ahead of new
production. Priority/custom ordering applies only to runnable physical dispatch
entries, not to parent admission, ungenerated partitions or deferred range recovery.
Ready range children first obtain the parent's normal bounded production claim.
They can then be ranked if queued. With no queue, producer order governs their
direct posts. This avoids a second priority system in the producer, at the cost of
no end-to-end priority guarantee for ranges. Document that limitation explicitly.
Strict priority can starve lower ranks under sustained load; custom policies can
also starve work. Aging, quotas and priority inheritance are deferred.

### One comparator, not a public queue adapter

A custom queue adapter would expose enqueue/removal/lifetime obligations and risk
losing weighted admission or cancellation. A selection callback adds invalid/stale
ID choices and whole-queue snapshots. Recommend only the synchronous comparator
above: negative means `a` first, positive `b`, zero uses PJS's enqueue sequence.
It replaces priority ranking; policies that want priority must compare that field.

Pass frozen scalar descriptors, never input, internal records, queue mutation
methods or dispatch authorization. Dispatcher determines eligible placements;
scheduler chooses among that set. A comparator cannot manufacture a task or pick
an ineligible ID. Use a deterministic scan, at most one comparison per remaining
candidate; inconsistent comparisons produce unspecified ordering, not duplication.
For exclusive work, eligibility for selection includes obtaining the single drain
pin described below; eligibility for posting still requires an empty worker. After
pinning, select other placeable work without repeatedly reconsidering that waiter.

Callbacks must be cheap and side-effect free. Catch throws and non-finite/non-number
returns (including Promises); observe rejected Promise returns. On failure, disable
that runtime's custom comparator, increment `scheduling.policyErrors`, and use
built-in priority/FIFO for this and later selections. Do not fail tasks or alter
worker restart budgets. The counter makes this documented fail-open behavior visible.

Protect selection from reentrancy: no nested policy invocation or direct dispatch
while a comparison is in progress. A reentrant submission still obeys admission;
abort/shutdown still takes effect. If callbacks mutate queue/lifecycle state,
invalidate the snapshot, disable the custom policy as above, and reselect against
live state. Recheck eligibility before removing/claiming the winner. Claims remain
protected through factories, reconstruction and posting, including nested calls.

## 2. Asynchronous concurrency and containment

### Physical attempts, not JavaScript threads

With concurrency `C`, a healthy worker may host up to `C` shared physical
executions. This overlaps awaited work on **one JavaScript thread**; a synchronous
CPU loop still blocks that worker's other invocations and control messages.
Modules/globals/caches are shared within that isolate. Opting into `C > 1` requires
task code and its module dependencies to tolerate asynchronous interleaving.

`PjsWorker` owns `Map<correlationId, PhysicalExecution>` containing phase, member
attempt IDs, cancellation/context metadata and optional lease. A valid final
response removes only that entry. Failed/stopped workers retain all entries until
confirmed exit. Bootstrap mirrors the active map, checks capacity/duplicate IDs
before invocation and removes each entry in its own `finally`; it no longer flips
one global busy flag after any completion. Startup/shutdown remain thread state.
Pass configured capacity in validated bootstrap data and extend the internal
protocol together; this is not a public protocol compatibility promise.

Each physical batch still invokes its items **sequentially**, occupies one slot
and sends one final envelope. Several batches/singletons may overlap at await
points. Do not parallelize items within a batch. Batch success/skipped-prefix
validation, ambiguous crash handling, terminal combined-serialization failure,
singleton recovery and the configured-batching input-transfer ban remain intact.

### Admission and elasticity

Replace `reservedWorkers` with dispatcher claims for a shared slot or an exclusive
worker. Reserve before invoking host factories/getters; posting rollback frees
only its own claim. Shared admission can use partially occupied compatible workers,
packing into the most occupied compatible worker first (stable worker ID tie)
to avoid unnecessary elastic growth. Existing queued entries still block a direct
bypass. A queued batch costs `B` logical credits, then one execution slot when posted.

An ordinary shared recovery retains **one** slot or queue credit per failed
physical invocation, including `workers: 1, maxQueue: 0`. An exclusive ordinary
recovery retains one whole-worker claim if no queue credit can replace it; that
claim prevents sharing during backoff. Converting to a queue reservation releases
its worker claim. Do not multiply existing recovery claims by `C`, and never grant
one slot claim per failed batch member. Range recovery continues releasing
physical capacity during backoff and uses the parent's bounded producer.

Let `W` be fixed worker count, or maxWorkers for an elastic pool. Shared ranges
may have at most `W * C * dispatchBatchSize` live children; exclusive ranges use
`W * dispatchBatchSize`. These are upper windows, not pre-reserved slots. Streams
additionally enforce buffered-plus-live count and existing byte limits. Keep the
parent operation limit `W + maxQueue`, default stream buffer count `W`, and host
factory-work budget `W` batches per turn unchanged. A stream needing overlap beyond
that count explicitly raises maxBufferedResults. Increasing concurrency opts into
more possible live input/scratch memory; result credits still do not bound RSS.

Dispatcher calculates demand from actual occupancy, compatible free slots,
outstanding physical entries and claims: pack shared demand into remaining shared
capacity, count exclusive demand as whole workers, then request additional threads
up to maxWorkers. Do not use `busyWorkers + queueEntries` or blindly divide all
work by `C`. Pool alone grows/retires/replaces threads. Retire only a completely
empty, unclaimed worker after idleTimeout; idle spare slots do not make a worker
idle. Starting, failed and retiring threads retain population slots until exit.
Apply identical capacity/resourceLimits to every initial/grown/replacement worker.
Limits remain per-isolate JS-engine limits, not per-invocation or total RSS limits.

### Destructive containment always requires exclusive placement

Automatically mark any physical execution with `cancellation: 'terminate'` or
an ordinary `executionLease` as exclusive, even without a signal or with cooperative
cancellation plus a lease. It may post only to an empty worker and blocks every
other physical execution there until validated completion or confirmed exit.
All children/batches of a terminate-mode range are exclusive; a batch contains
only that parent's work. No new public isolation option is needed.

For an accepted exclusive entry that wins ranking but has no empty worker:

1. Dispatcher pins one compatible healthy worker to drain, selecting the least
   occupied unclaimed worker (stable ID tie). At most one worker is _waiting to
   drain_ pool-wide. Keep the job's existing queue/recovery/parent ownership;
   the pin is a placement restriction, not another queue credit.
2. Stop new shared posts to that worker. Existing invocations finish normally;
   continue eligible dispatch on all other workers. Elastic demand may request
   another thread within bounds. Do not repeatedly move the pin as ranks change.
3. Once empty, post the pinned exclusive job first, rechecking liveness/deadline.
   Consume the pin into its exclusive execution claim on successful placement.
   Clear it on every terminal/abandoned path: cancellation, timeout, parent failure
   or stream close, preparation/post failure, shutdown/fatal failure and loss of
   eligibility. If the worker fails, discard the pin before choosing a replacement
   placement. Cleanup is idempotent and checks the owning ticket, so stale cleanup
   cannot clear a successor's pin. Removing a waiting job's pin immediately restores
   shared admission and requests the guarded pump; existing executions are untouched.

For `maxQueue: 0`, an ordinary exclusive call without an empty claimable worker
rejects; do not invent a hidden ordinary waiter. An already accepted range may
request the same single drain pin through its producer before constructing input;
tie that pin to its next production/continuation ticket, never one per partition.
Release it if the parent becomes blocked on result credits/count capacity.

Pinning prevents an endless stream of new shared arrivals from starving a selected
exclusive job. Higher-ranked work can still delay selection, and an existing
invocation that never physically ends can prevent draining indefinitely. Deadlines
cancel the waiting job; no unrelated invocation is terminated to make space. With
one worker, pausing new sharing while it drains is unavoidable. Once pinned, that
placement has precedence over later arrivals; other workers keep normal ranking.

Cooperative cancellation targets only the matching physical flag and active local
context; it can share. Sequential batch items share their parent's physical flag
but have separate invocation contexts. Physical cancellation is budget-exempt;
lease expiry retains its existing restart charge. Both terminate an exclusive
thread. No automatic cooperative escalation is added. Forced/fatal shutdown may
terminate all hosted work under existing shutdown authorization.

### Worker-wide failure and shutdown

On one unexpected worker error/exit/resource-limit failure, freeze its active
correlation list before callbacks. Pool makes **one** failure/restart decision for
that thread. Dispatcher fans the failure to TaskCoordinator for every correlation,
which applies each logical task/partition's own policy and settlement guard. A
batch's unconfirmed members remain ambiguous: shared writes/external effects may
have occurred. No successful or already-delivered partition is replayed.

Failure notification does not free slots/credits or allow replay. Confirmed exit
ends every remaining correlation, marks each credit execution ended, and then
enables eligible recovery with the original deadlines. Process this fan-out before
pumping new work; do not let reentrant callbacks spend released capacity twice.
Protocol failure still contains the worker and can affect all hosted attempts;
those failures remain terminal under existing eligibility rules. A task exception
normally affects only its invocation. Restart exhaustion/bootstrap failure remains
runtime-fatal, not a fallback trigger for a dead pool.

Graceful shutdown admits accepted recovery/parent continuations and waits for all
logical owners plus **all** physical entries, including caller-settled invocations.
Forced shutdown clears queues/claims/drain pins/progress and terminates each thread
once. Termination rejection cannot report successful cleanup or release ownership.

Keep `workers.busy` as occupied **thread** count. Add `workers.activeExecutions`
and worker-detail `concurrency` and `currentTaskIds` (physical correlations).
Keep `currentTaskId` populated only when exactly one entry exists, preserving the
default view without inventing a representative ID for several attempts. Expose
exclusive/draining placement in defensive worker details. Sum execution timing as
invocation durations; overlap means that sum is not thread utilization or wall time.

## 3. Invocation-local progress

### Explicit context and subscription

One `onProgress` callback per ordinary logical call or range parent; children,
retries and fallback inherit it. Keep callback references host-side. Exact rules:

| Options                                                    | Invocation                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| No onProgress, cancellation omitted/settle/terminate       | `execute(input)` — exactly one argument.                                                                                             |
| Cooperative cancellation, with or without onProgress       | `execute(input, context)` with its existing cancellation flag/signal.                                                                |
| onProgress supplied, cancellation omitted/settle/terminate | `execute(input, context)`; signal stays un-aborted and throwIfCancelled is a no-op. Cancellation follows the selected existing mode. |

Allocate one context per invoked item. Closures capture its exact attempt and
physical ID, controller and reporter; never use a module-global current task.
A progress-only context does not silently enable cooperation. Without a subscribed
reporter, reportProgress returns false. Close each context on invocation return;
calls from stray unawaited work then return false. Such work is still a task bug.

### Small payloads and a bounded, deliberately lossy channel

Recommend JSON values only: finite numbers, strings, booleans, null, dense arrays
and plain records of these. No functions, undefined, cycles, accessors, class
instances, binary/shared buffers or transfer lists. Encode a snapshot into a JSON
string with a **16 KiB UTF-8 payload limit** and depth limit 16. Use a bounded walk/
encoder that stops on the limit, without invoking getters/toJSON or first making
an unbounded serialized copy. Account for escaping and UTF-8 bytes while encoding
into bounded storage, including individual strings and nested values. Serializing
the whole payload with JSON.stringify() and then checking its size is insufficient.
Catch inspection/encoding errors; return false and
send nothing. An invalid progress payload does not become a task/result failure.
The representation is narrower than ordinary structured clone on purpose.

Bound transport at the source, not just the host callback queue:

```text
per physical execution:
  one posted, unacknowledged frame + one latest encoded pending frame
  host: at most one queued callback for that execution
  report -> bounded encode -> take atomic permit ? post : replace pending
  host consumes/discards -> return permit + correlated wakeup
```

Use a fresh private shared atomic permit per progress-enabled physical execution
(separate from the cancellation flag), initially available. Only a successful
compareExchange consumes it. Host returns it after consuming/discarding the frame;
a correlated acknowledgement wakes an awaiting worker to flush its latest pending
frame. A CPU loop can see the returned permit on its next report without processing
its event loop. New reports replace older pending values; asynchronous ack handling
flushes the pending value if no newer report arrives. Use the same permit discipline
for both paths, so they cannot double-post. A second atomic word latches whether a
wakeup is already outstanding: host sends only on the unlatched-to-latched transition,
and worker clears that latch when handling the wakeup. Otherwise a CPU loop could
keep taking returned permits while accumulating unprocessed acknowledgement messages.
One physical batch shares this window across its sequential items, retaining the
originating item ID with pending data.

Host schedules delivery outside protocol/result transitions using one bounded
drain, at most 64 callbacks per host turn, rather than scheduling one job per report.
There is at most one pending wakeup per physical execution, independently of how
many frames a CPU loop reports. Progress cannot gate a final response; close the
permit and discard unsent pending data at physical completion. Closing uses a distinct atomic state so a late
ack cannot reopen it. Drop queued host progress when its logical child settles.
Memory is bounded per physical execution by the small frames plus transport/parse
overhead, not by the number of reports. It is separate from final-result byte credit.
Encoding/reporting still costs CPU; applications should report at useful intervals.

reportProgress returning true means accepted for possible delivery, **not delivered**.
Intermediate and final progress updates may be coalesced/dropped, including when
completion beats the callback drain. There is no guaranteed 100% event. The task's
actual result is authoritative. Retaining values or starting other work in the
application callback is outside PJS's buffering bound.

### Correlation, observers and terminal races

Wire frames carry physical correlation, item attempt ID, increasing invocation
sequence and encoded payload. PjsWorker checks bounded envelope size and current
membership; TaskCoordinator enriches from host-owned logical/implementation/parent
metadata. Do not trust worker-supplied logical IDs or treat progress as evidence
of a confirmed item outcome. Progress never increments result-message counts,
ends an execution, refunds credits, settles a caller or selects recovery.

Delivered sequences increase within one invocation, with gaps. There is no global
ordering across invocations/partitions/workers. A retry starts a new executionId
and sequence; attempt/implementation identifies repeated work or fallback, so a UI
must not blindly add every attempt's progress. Keep already-observed notifications;
there is no rollback. Retire the old attempt's queued notifications before starting
its successor. Late/stale progress and acks are ignored by exact correlation,
without an unbounded completed-ID history. Invalid progress frames are discarded
and their channel closed where identifiable; they do not fail unrelated executions.
Existing strict validation of starts/final-result protocol remains unchanged.

Before every callback, recheck logical liveness, original deadline, current attempt,
parent state and stream closure. Cancellation/timeout/terminal failure/completion
disables delivery immediately; physical ownership continues independently. A worker
failure closes its progress channels at failure notification, while execution slots
and result credits stay owned until exit. Successful sibling progress remains valid
until that child settles; closing a stream stops all its parent's notifications.

Callbacks must be synchronous and cheap. Catch exceptions, increment
`progress.callbackErrors`, and disable that logical subscription (the whole parent
subscription for ranges); leave computation/recovery/results unchanged. A returned
Promise/thenable is an observer error: disable likewise, consume its eventual
rejection, and never await it or start further callbacks for that subscription.
TypeScript's void return type alone cannot enforce this. No exception is rethrown
into the host event loop. Reentrant abort/run/shutdown uses normal public admission
and settlement guards; no internal transition is held open across the observer.
Disabling a subscription or cancelling its logical owner also closes its active
progress permits immediately, so discarded notifications do not keep producing
transport traffic. This does not touch cancellation flags or physical occupancy.

Graceful drain may continue live notifications, but never waits for progress to be
acknowledged. Forced/fatal shutdown clears callback queues and closes channels before
termination. Ack/completion/shutdown races cannot reopen a reporter, resurrect a
logical record or release a different invocation's slot.

## Proposed examples

```ts
// 1. Proposed: priorities alone use higher-first, stable FIFO ties.
const runtime = new PjsRuntime({ registry, workers: 2, maxQueue: 32 });
const low = runtime.run(task, backgroundInput, { priority: -1 });
const urgent = runtime.run(task, interactiveInput, { priority: 10 });
await Promise.all([low, urgent]); // Already-running low is not preempted.

// Proposed custom policy: same priority ordering, then smaller queued batches.
const custom = new PjsRuntime({
  registry,
  workers: 2,
  maxQueue: 32,
  scheduling: (a, b) => b.priority - a.priority || a.weight - b.weight,
});
// Zero from the comparator still uses PJS's stable enqueue sequence.

// 2. Proposed: fetchTask awaits I/O and returns a serializable value.
const io = new PjsRuntime({
  registry,
  workers: 1,
  concurrency: 2,
  maxQueue: 0,
});
await io.ready();
const [first, second] = await Promise.all([
  io.run(fetchTask, firstUrl),
  io.run(fetchTask, secondUrl),
]); // Two async invocations in one isolate, not two JavaScript CPU threads.

// 3. Proposed task module. Context appears because the caller opts into progress.
interface DownloadProgress {
  done: number;
  total: number;
}
export async function download(
  urls: string[],
  context: TaskContext<DownloadProgress>,
): Promise<string[]> {
  const values: string[] = [];
  for (const url of urls) {
    values.push(await (await fetch(url)).text());
    context.reportProgress({ done: values.length, total: urls.length });
  }
  return values;
}
// Host: declared schema, not verification that the module has this signature.
const downloadTask = registry.register<string[], string[], DownloadProgress>(
  'download',
  new URL('./download.js', import.meta.url),
  'download',
); // Register before constructing the runtime that uses this handle.
const downloads = new PjsRuntime({ registry, workers: 1, concurrency: 2 });
const values = await downloads.run(downloadTask, urls, {
  onProgress: ({ value, attempt }) =>
    updateDisplay(attempt, value.done, value.total),
});

// 4. Proposed task module: CPU polling still observes shared cancellation state.
export function crunch(limit: number, context: TaskContext): number {
  let result = 0;
  for (let n = 0; n < limit; n++) {
    if (n % 4096 === 0) context.throwIfCancelled();
    result += compute(n);
  }
  return result;
}
// A cooperative CPU task can share, but blocks that thread between polls/yields.
const cooperative = new AbortController();
const stopped = io
  .run(crunchTask, limit, {
    signal: cooperative.signal,
    cancellation: 'cooperative',
  })
  .catch(handleCancellation);
cooperative.abort();
await stopped; // Physical reuse still waits for the task's final response.

// Destructive work receives an empty worker exclusively, or waits in this queue.
const contained = new PjsRuntime({
  registry,
  workers: 2,
  concurrency: 2,
  maxQueue: 8,
});
const abort = new AbortController();
const killed = contained
  .run(legacyCpuTask, limit, {
    signal: abort.signal,
    cancellation: 'terminate',
    executionLease: 2000,
  })
  .catch(handleCancellation);
// legacyCpuTask still receives exactly one argument: no onProgress/cooperation.
abort.abort();
await killed; // If posted, its thread exits; unrelated hosted calls are isolated.
```

The snippets use illustrative inputs/handlers and separately exported task modules.
An asynchronous cooperative task passes context.signal to abortable operations
and awaits its own cleanup. Progress alone does not add that cancellation behavior.

## Combined invariants and practical implementation order

```text
logical owner + original deadline + priority + optional observer
  -> bounded queue/production/recovery claim
  -> rank eligible work -> shared slot OR empty exclusive worker
  -> protected preparation/rebuild -> physical correlation
       progress -> bounded informational channel -> live observer
       final response OR confirmed exit -> end only those physical claims
       eligible failure -> existing recovery owner, fresh attempt/queue position
```

One logical ID settles once. Several attempt records on a thread never share
controllers/reporters or final-response phases. A batch consumes one physical slot
and its existing logical weight. Result ownership stays keyed to physical
correlations until validated completion/exit; progress/abort/error/termination intent
is not completion. Shared attempts on a failed thread recover independently, but
thread replacement/budget accounting occurs once. Successful/delivered outputs,
map assembly, completion-order streaming and original deadline/repeatability rules
retain their Checkpoint 2 behavior. No hidden transfer backups or widened replay
eligibility are introduced.

Implement in this order after review, with focused tests alongside each change:

1. **Priorities and comparator.** Change `types/index.ts`, `tasks/task.ts`,
   `scheduler/fifo.ts`, dispatcher selection/recovery integration, range option
   validation/operation snapshots and public API propagation. Keep claims and
   default producer ordering intact; add policy-error diagnostics.
2. **Concurrency and exclusive placement.** Extend configuration/composition,
   dispatcher claims/demand/drain pins, pool capacity views, worker/bootstrap maps
   and protocol validators. Fan out thread failure/exit through existing coordinator
   callbacks, adapt range windows and lifecycle/telemetry physical counts. Preserve
   result-credit transitions per correlation, including partially completed threads.
3. **Progress.** Extend `tasks/registry.ts` declarations and public types/overloads,
   task/parent subscription state, invocation contexts, worker protocol and bounded
   reporter/host drain within the existing worker and TaskCoordinator owners.
   Add observer-error diagnostics; leave RangeStream and result-credit policy intact.

Likely public propagation also touches `index.ts`, `runtime.ts`, `api/run.ts`,
`api/range/contracts.ts`, all four range adapters, `partition/range.ts` and
`partition/validation.ts`. Update the relevant API/lifecycle/backpressure/ownership/
telemetry guides and canonical generated API inventory during implementation.
Use existing behavioral/type suites and normal checks for changed code; no new
manager, dependencies, workflow, qualification campaign or release stage.

Focused acceptance cases for later implementation:

- Default FIFO, argument counts and one-execution behavior unchanged. Higher ranks,
  stable ties, weighted batch removal, ready recovery claims and reentrant/throwing/
  invalid comparators preserve queue bounds and choose only live eligible records.
  Cover deliberate lazy-producer limitation and pinned-exclusive precedence.
- One worker/C=2/Q=0 overlaps two gated async tasks, rejects the third, routes
  reversed outcomes correctly, and holds a logically cancelled slot through cleanup.
  Test all range APIs/forms, sequential batches and actual count/byte backpressure.
- An exclusive job drains one shared worker while others continue; new arrivals
  cannot refill it. Every terminal pin cleanup restores shared admission without
  interrupting existing work; stale cleanup cannot clear a successor pin.
  Cover one-worker limits, cancellation of a pin, Q=0 lazy range
  recovery, transfer/rebuild reentrancy, lease expiry and cooperative targeting.
- A thread exit with several singles/batches fans out once per correlation and
  charges one restart decision. Mixed retry/fallback/terminal policies, partial
  shared side effects and delayed exit preserve credits, deadlines and one caller
  outcome. Cover elasticity, resource-limit exit and graceful/forced shutdown.
- Progress from interleaved async tasks/batch items stays correlated. A CPU report
  flood cannot exceed the frame/host bounds; coalescing, oversized/invalid payloads,
  callback throws/Promise returns, late reports/acks, retry/fallback sequence reset,
  timeout/stream close and shutdown neither settle nor refund task results.
  Oversized strings and nested payloads stop encoding before a large serialized
  copy is produced, rather than relying on a post-serialization size check.
- Type checks accept ordinary interfaces without index signatures, infer declared
  progress and reject incompatible fallback progress,
  while legacy option annotations, typed-map generics and existing transfer/output
  exclusions remain valid. Diagnostic copies preserve thread versus attempt meaning.

## Review decisions

The maintainer recommends accepting the three trade-offs with the public-type
correction incorporated above: progress generics are unconstrained, default to
ProgressValue, and retain runtime wire validation. No additional API choice is
required before implementation review. The retained trade-offs are dispatch-only priority
(round-robin lazy production remains), automatic exclusive placement for destructive
containment (possible drain/backoff latency), and bounded lossy JSON progress
(16 KiB payloads, observer errors disable reporting). Async concurrency is an explicit
application promise about module interleaving, not extra CPU parallelism or protection
against shared side effects. Automatic aging and cooperative escalation remain deferred.
