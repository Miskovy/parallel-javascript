# Execution resilience

Status: architecture and admission refinement approved. Implemented in development
source from latest main `c9b070e`; no release or version change is included.

## 1. Source baseline and existing architecture

Reviewed GitHub `main` at
[`c9b070e`](https://github.com/Miskovy/parallel-javascript/tree/c9b070e03a6e71d71dc9e9768190a7e96562ff02)
(24 October 2026 review), initially compared with the older `54bb3cf` checkout.
Implementation starts from the freshly fetched main baseline above. The core
dispatcher, pool, worker, protocol, bootstrap and credit owner
are unchanged between these revisions; task coordination additionally recognizes
both batch-option spellings. The important newer boundary is S1: lifecycle and
composition have moved out of `PjsRuntime`. Proposed paths below refer to current
`main` and its S1 component boundaries.

The reviewed [architecture](https://github.com/Miskovy/parallel-javascript/blob/c9b070e03a6e71d71dc9e9768190a7e96562ff02/docs/architecture.md),
[ADR 0022](https://github.com/Miskovy/parallel-javascript/blob/c9b070e03a6e71d71dc9e9768190a7e96562ff02/docs/adr/0022-runtime-api-boundaries.md),
[containment ADR](../adr/0021-physical-execution-containment.md),
[cancellation ADR](../adr/0004-cancellation-and-deadlines.md), and
[transfer ADR](../adr/0005-transfer-ownership.md) explain the ownership boundaries.
Source is authoritative: an error notification does **not** end physical ownership,
even where older documentation loosely describes a crash as releasing credit.

| Existing owner                           | Relevant implementation and gap                                                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PjsRuntime`, `api/run.ts`               | Typed facade and direct submission adapter; no recovery policy.                                                                                                                                                                                           |
| `RuntimeController`, composition builder | Lifecycle, guarded pump, fatal failure, drain/escalation and callback wiring.                                                                                                                                                                             |
| `TaskCoordinator` / `PendingTask`        | Accepted logical records, input/transfer claims, one timer/listener, error translation and exactly-once settlement. Currently every attempt failure settles the caller; `dispatched()` drops input.                                                       |
| `ExecutionDispatcher`                    | Direct/queued admission, production reservations, posting, batches and physical metrics. Ends credit correlations before forwarding validated results or confirmed exits. Exit callbacks currently discard correlation before reaching task coordination. |
| `PjsPool`                                | Worker population, one failure decision per worker, repair promises and lifetime/rolling restart budgets. `replace()` awaits `stop()` before spawning; startup failure or budget exhaustion is fatal.                                                     |
| `PjsWorker`                              | One occupied correlation, protocol phase, lease timer and Node termination. Failed/stopped workers retain the correlation until `exit`; failed workers ignore later messages.                                                                             |
| `ResultCreditManager`                    | Separate dispatching/dispatched, caller-settled and execution-ended transitions. Binary reservations survive logical cancellation until validated completion or confirmed exit. Ordinary `run()` has no binary reservation.                               |
| `RangeCoordinator`                       | Parent deadlines, lazy children, fail-fast sibling cancellation, batching and result policy. A batch can have partial effects. Keep recovery out of this engine initially.                                                                                |

Protocol v2 already supplies `execute`, `started`, final success/failure, batch
messages and shutdown. It has no interrupt message; a message cannot interrupt a
synchronous CPU loop. `executionLease` starts after successful posting, before
`started`; expiry fails the worker and invokes governed replacement. Ordinary
abort/timeout instead deletes the logical record while physical execution continues.
Transferred input cannot be reclaimed. Shared backing remains shared across failure.

Recommendation: extend these existing owners for **exclusive ordinary `run()`**.
Reject new recovery/cancellation properties on range/map/stream options before
factories run, including inherited or explicitly undefined properties, as with
`executionLease`. Reject either batch-option spelling on runs using the new controls.
No batch replay, range restart, new scheduler or recovery service is proposed.

### Competitor-informed gaps

[Piscina](https://github.com/piscinajs/piscina#method-runtask-options) stops the
worker for an aborted running task. Its
[worker error path](https://github.com/piscinajs/piscina/blob/master/src/index.ts)
restores worker capacity and reports errors to unfinished tasks; this is **not**
automatic general-purpose task retry. [Workerpool](https://github.com/josdejong/workerpool#api)
also documents termination-based task cancellation. PJS's gap is explicit physical
cancellation beyond its existing logical abort and independent execution lease.
The other gaps addressed here are opt-in, bounded task retries and one registered-task
fallback; worker replacement alone implements neither.

PJS's existing result-byte credits bound declared result ownership, **not total
RSS**. Inputs, shared backing, worker heaps, scratch/native allocations and
consumer-retained values remain outside that bound.

Dynamic pool resizing and task progress events (such as Workerpool's
[worker events](https://github.com/josdejong/workerpool#events)) are separate potential
product improvements. Neither is a dependency or implementation task for this work;
the existing fixed pool and execution protocol remain the foundation.

## 2. Physical cancellation

Add `cancellation: "settle" | "terminate"`, default `"settle"`. The option governs
both signal abort and expiration of the call's `timeout`. This avoids a second
physical-timeout option and makes the same stop policy apply throughout recovery.

| Cancellation point                 | Behavior                                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Already aborted                    | Existing rejection before admission; no worker or input ownership change.                                                                                                                                   |
| Queued or waiting for recovery     | Settle once, remove queued work/release reserved admission, clear recovery timer; no worker termination.                                                                                                    |
| Posting                            | Record termination intent against the exact attempt. Finish/rollback posting first; a successful post still establishes physical ownership before termination. A failed post has no execution to terminate. |
| Posted, including before `started` | Settle immediately with `PjsCancelledError` or `PjsTimeoutError`, then retire only the worker still occupying that attempt. Await exit internally before replacement.                                       |

`TaskCoordinator` initiates cancellation. A narrow dispatcher operation routes an
attempt correlation to `PjsPool`; the pool uses the existing `PjsWorker.stop()` and
`replace()` mechanics. Introduce an explicit intentional-retirement reason alongside
unexpected failure. Do not manufacture a worker-crash error to trigger replacement.
Use the existing once-per-worker handling guard and repairs set for both paths.

Intentional abort/timeout retirement **does not consume** `maxRestarts` or the
rolling failure budget, and does not increment crash/failure counters. It still
counts as a replacement spawn. Replacement bootstrap or termination failure remains
fatal. Restore one worker only after old exit and only while the pool remains active,
including an accepted graceful drain. Forced shutdown suppresses replacement.
This preserves the live-thread bound, though frequent cancellations can cause churn.
Each retirement pays for worker recreation, module imports and cache warmup; module
globals are lost and external/shared-memory side effects may be incomplete. A future
cooperative cancellation mechanism could let participating tasks poll a shared flag
and preserve workers. It is outside this implementation and cannot preempt code that
does not cooperate.

Lease and cancellation share the same retirement guard, matching worker and attempt.
The first recorded retirement reason wins: cancellation clears the lease; a lease
expiry already recorded retains its existing budget charge. A later abort can still
settle a pending logical call and cancel its planned recovery, but cannot relabel
an existing worker failure. A lease remains useful with default logical cancellation:
it bounds continued execution after the caller has gone away. Each later attempt
gets a fresh lease after posting; the call timeout is never reset.

If validated success settles first, the abort listener is removed and cancellation
cannot kill that worker's next assignment. If cancellation records first, its caller
error wins; discard later output. An already-retiring worker ignores final messages
and keeps occupancy until exit. Termination intent, a failed status, and a rejected
termination promise are never proof of completion.

Keep input transfer claims through the synchronous posting boundary, including a
reentrant abort from a structured-clone getter. Successful transfers stay detached;
late transferred output is discarded. Shared writes may be partial and Atomics locks
may be abandoned. Existing result-credit transitions remain authoritative: release
queued claims immediately, retain posted reservations until physical end, and never
refund an unsuccessful result. The returned rejection acknowledges logical
cancellation, **not** confirmed quiescence; awaited shutdown remains the existing
runtime-wide physical-cleanup boundary. Node termination latency is not bounded.

## 3. Configurable retries

### Permission, eligibility and limits

Require `repeatable: true` whenever retry or fallback is configured. It is the
application's assertion that partial or repeated execution is
acceptable: pure computation, idempotent operations or application-enforced durable
deduplication. A crash, including one before `started` arrives, proves no absence of
side effects. Neither this declaration nor a fresh worker provides exactly-once
effects. Application operation IDs belong in input and remain the same across attempts.

`retry.maxAttempts` includes the initial primary execution; default is one when
retry is omitted. Require a positive safe integer. `backoffMs` is a fixed delay,
default zero, integer 0–2147483647. `on` defaults to `["worker-crash"]`; accept only
the following nonempty enumerated list, snapshotted at submission.

| Outcome                                                                                                                  | Retry / fallback eligibility                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Unexpected occupied-worker exit or uncaught worker error                                                                 | `"worker-crash"`; previous execution must end physically first.                            |
| Execution lease expiry                                                                                                   | `"execution-lease"`, explicit opt-in; also consumes the existing pool restart budget.      |
| Worker-reported task exception                                                                                           | `"task-error"`, explicit retry opt-in. Worker normally remains usable.                     |
| Input/output serialization, invalid transfer list, binary contract failure                                               | Terminal. Output serialization may follow side effects; never retry automatically.         |
| Queue admission failure, invalid options/registration                                                                    | Terminal; recovery cannot bootstrap rejected work.                                         |
| Abort, call timeout, forced shutdown or runtime failure                                                                  | Terminal; no retry or fallback.                                                            |
| Protocol/deserialization violation, initial/replacement bootstrap failure, exhausted restart budget, termination failure | Terminal for the call; preserve existing pool replacement/fatal rules. No recovery bypass. |

Carry an internal failure reason from `PjsWorker.fail()` through existing callbacks.
Do not infer eligibility from the message string or merely `instanceof PjsWorkerError`:
lease errors subclass it, and it also represents fatal/configuration/protocol faults.
No application callback predicate, exponential policy or retry of admission is needed.

### Logical call versus physical attempts

`TaskCoordinator` owns policy, remaining primary attempts, fallback-used flag,
original input, original deadline, last primary error, current attempt and at most
one recovery timer. Extend `PendingTask`; do not recursively call public `run()` or
create a second caller promise. Keep the abort listener and deadline timer across
all attempts. Retain input until final settlement only for recovery-enabled calls;
ordinary calls retain their existing early input release.

Use one stable logical task ID and a fresh physical execution correlation for each
posting attempt. A small coordinator lookup maps the current correlation to the
logical record; the dispatcher uses it as protocol `taskId`, while queue removal,
public error `taskId` and caller metrics retain logical identity. Keep the existing
first correlation equal to the logical ID if convenient for compatibility.
Translate errors back to logical context, retaining attempt/worker context for
diagnostics. No wire format/version change is required: `taskId` is already an
opaque correlation. Clear lookups when an attempt ends or the caller settles;
the worker independently retains physical ownership after logical cleanup.
Pass the physical correlation and logical task IDs separately to existing
`markDispatching`/`markDispatched` calls, as batching already does; rollback, lease
arming and execution completion use the physical correlation.

Count a primary attempt when posting is initiated, so even a failed serialization
cannot loop outside the limit. Queue admission and backoff do not count. The
fallback, if selected, has one additional attempt: maximum execution postings are
`maxAttempts + 1`. Increment accepted/completed/failed caller counters once per
logical call; physical dispatch counters still count every actual post. Expose the
current attempt, selected implementation and a `recovering` task status in diagnostics
without retaining an unbounded attempt history. No-options calls create no recovery
timer or retained replay input.

Failure notification records a possible next action; it does not authorize posting.
A worker error/lease may precede exit. Wait for the exact correlation's confirmed
exit; normal task failure arrives with validated final completion. Forward correlated
exit notification from dispatcher to coordinator **after** credit completion and
**before** pumping capacity. Recheck policy, signal, original deadline and runtime
dispatch permission at that point. Pool replacement is independent: the next
attempt can use any healthy worker, after the old attempt ends. It need not wait
for the particular replacement, but cannot bypass a pool fatal decision.

### Backoff, admission and shutdown

**Approved admission design.** Retain an accepted
call's existing execution admission claim for recovery, rather than requiring fresh
queue admission. After physical end, atomically turn its occupied slot into a
dispatcher-owned recovery slot claim, before pumping other work. The old execution
and its successor claim never count twice. Claims are bounded by configured worker
slots, consume capacity unavailable to new admissions, and survive replacement/backoff.

Prefer converting a recovery slot claim into one available queue credit, releasing
the slot. Hold that queue reservation through backoff, then append to the FIFO tail.
When the queue is full, serve its runnable head first: atomically give that entry
the reserved execution slot and give recovery one of the dequeue's freed queue
credits. Thus retry never jumps runnable FIFO work or exceeds `maxQueue`, including
with weighted range entries. The existing scheduler still orders ready entries;
the dispatcher owns these admission exchanges and reservation-aware worker selection.

With `workers: 1, maxQueue: 0`, retain the single slot through confirmed exit,
replacement readiness and backoff, then run the next attempt. New calls reject
while it is reserved; no hidden queue is added. If no queue credit can be obtained,
holding a slot can deliberately leave a worker idle during backoff. This throughput
cost buys bounded recovery for already accepted work. Queue entries plus queue
reservations remain within `maxQueue`; occupied/reserved execution slots remain
within `workers`. There is no extra unbounded waiter list.

Use the same claim for fallback. Release/convert it exactly once on dispatch or
terminal cleanup; abort/deadline/forced shutdown cannot retain recovery capacity.
All claims participate in `prepareAdmission`, `availableAdmission`,
`claimProduction` and queued dispatch, so ordinary work and range production cannot
spend the same capacity. Task policy stays in `TaskCoordinator`; this refinement
extends the existing dispatcher accounting, without changing pool size or FIFO policy.

Backoff starts after physical end. The call's admission-time monotonic deadline
includes exit wait, replacement, backoff, queueing and fallback. Before a recovery
decision, dispatch or result delivery on recovery-enabled calls, check elapsed time
as well as the original timer; a delayed timer must not grant another attempt or
deliver past that deadline. If backoff outlasts remaining time, the original timeout
ends the wait; never reset/extend it. Preserve existing timer-based behavior for
calls without recovery.

Graceful shutdown closes external admission but permits continuations of already
accepted logical calls through a narrow controller permission, like accepted range
children. They remain in `TaskCoordinator.size`, so the existing drain test includes
exit/backoff waits. Forced shutdown/escalation and fatal failure settle all callers,
clear recovery timers/claims, and stop workers. Every continuation rechecks the
one-way runtime state; no callback may enqueue after forced mode. A termination
failure prevents replacement and replay even if a later exit eventually arrives.

## 4. Execution fallback

| Candidate                              | Trade-off                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One alternative registered worker task | Reuses registry, pool, cancellation, transport and typing; requires registering both implementations before construction. Recommended.                           |
| Host function, even `async`            | Convenient closure access, but synchronous CPU work can stall the main event loop and its cancellation/deadline timers. Adds a second execution/ownership model. |
| Strategy array                         | Expresses many alternatives but expands attempt counting, error ordering and policy surface beyond the single recovery need.                                     |

Choose `fallback: { task: alternativeTask, on?: [...] }`. Default eligibility is
`["task-error"]`; infrastructure fallback requires explicit `"worker-crash"` or
`"execution-lease"`. Use the same cause names and exclusions as retries. Both handles
must belong to the runtime's registry snapshot; reject invalid or identical fallback
handles before admission. TypeScript anchors input/output to the primary handle:
fallback must accept that input and return an assignable output. Registration still
cannot verify an export's real schema, and PJS supplies no implicit result conversion.
This is **algorithmic fallback within the existing pool**: a different implementation
of the same operation. It provides no independent execution backend and cannot
recover from total pool failure.

`TaskCoordinator` selects fallback once when the current primary failure has no
eligible remaining retry (exhaustion or an excluded retry cause), and that failure
matches fallback eligibility. Selection uses the **last primary failure**, not any
earlier eligible crash. Complete the prior physical attempt before dispatching it.
Fallback uses the same retained input, bounded continuation claim, signal, timeout,
lease and cancellation mode. It has no retry policy or further fallback. It may run
on the same healthy worker after a task exception; it is not a fresh-isolate promise.
It cannot rescue a globally failed runtime or broken bootstrap.

On success resolve the original caller. On fallback execution failure reject once with
`AggregateError([lastPrimaryError, fallbackError])`; each contained PJS error has
the logical task ID and its worker context. Cancellation/deadline/runtime failure
during fallback retains its normal terminal error instead of an aggregate.
Without fallback, return the last normal PJS error; do not retain every retry error.

## 5. Proposed public API

Illustrative declarations; keep `RunOptions` an interface with generic defaults so
existing annotations and interface extensions continue to work. Validate explicit
repetition permission at runtime for both TypeScript and JavaScript callers.
The default `Output = never` keeps non-generic legacy options assignable to each
task schema; typed fallback option variables specify both generics.

```ts
type RecoveryCause = "worker-crash" | "execution-lease" | "task-error";

interface RetryOptions {
  maxAttempts: number; // Includes the first primary attempt.
  backoffMs?: number; // Default 0; fixed delay.
  on?: readonly RecoveryCause[]; // Default ["worker-crash"].
}

interface RunOptions<Input = unknown, Output = never> {
  signal?: AbortSignal;
  timeout?: number;
  transferList?: readonly ArrayBuffer[];
  executionLease?: number;
  cancellation?: "settle" | "terminate"; // Default "settle"; abort AND timeout.
  repeatable?: true; // Required at runtime with retry or fallback.
  retry?: RetryOptions;
  fallback?: {
    task: PjsTask<Input, Output>;
    on?: readonly RecoveryCause[]; // Default ["task-error"].
  };
}

run<Input, Output>(
  task: PjsTask<Input, Output>,
  input: Input,
  options?: RunOptions<NoInfer<Input>, NoInfer<Output>>,
): Promise<Output>;
```

Reject a nonempty input transfer list with `maxAttempts > 1` or any fallback,
before admission/detachment. Reject unsupported options and invalid policy values
before accepting work, then recheck runtime state and signal after application
getters/iterators. Snapshot policy lists and scalars once. Absence of all new options
preserves existing cancellation, failure, ownership and default restart behavior.

Examples assume these module exports are registered before runtime construction:
`countPrimes` is a long pure CPU loop, `sha256` hashes caller bytes without mutating
them, and two parsers return the same `Parsed` schema; the fast parser can throw
for unsupported input. These are proposed usages, not runnable against today's API.

```ts
const registry = new PjsTaskRegistry();
const module = new URL('./compute-tasks.js', import.meta.url);
const primes = registry.register<number, number>(
  'primes',
  module,
  'countPrimes',
);
const hash = registry.register<Uint8Array, string>('hash', module, 'sha256');
const fast = registry.register<string, Parsed>('fast', module, 'fastParse');
const portable = registry.register<string, Parsed>(
  'portable',
  module,
  'portableParse',
);
const runtime = new PjsRuntime({ registry, workers: 2, maxQueue: 32 });
await runtime.ready();
// Surround application use with try/finally and awaited runtime.shutdown().

// Cancel CPU computation; rejection precedes confirmed worker exit/replacement.
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 200);
try {
  await runtime.run(primes, 2_000_000_000, {
    signal: controller.signal,
    timeout: 3000, // Expiration also requests termination.
    cancellation: 'terminate',
  });
} catch (error) {
  if (!(error instanceof PjsCancelledError || error instanceof PjsTimeoutError))
    throw error;
} finally {
  clearTimeout(timer);
}

// A worker crash can safely repeat this pure hash; the input stays attached.
const digest = await runtime.run(hash, bytes, {
  repeatable: true,
  timeout: 5000,
  retry: { maxAttempts: 3, backoffMs: 100, on: ['worker-crash'] },
});

// A failed fast parser invokes one portable worker implementation.
const parsed = await runtime.run(fast, text, {
  repeatable: true,
  fallback: { task: portable },
});

// Retry primary crashes; after exhaustion use the fallback once.
// A primary task error skips crash-only retries and selects fallback immediately.
const recovered = await runtime.run(fast, text, {
  repeatable: true,
  signal: requestSignal,
  timeout: 5000,
  cancellation: 'terminate',
  retry: { maxAttempts: 3, backoffMs: 100 },
  fallback: { task: portable, on: ['worker-crash', 'task-error'] },
});
```

### HTTP request cancellation

Reuse the process-wide runtime and registered `primes` handle above; never shut
the shared runtime down per request. Detect disconnect while computation is running
on the **response** `close` event and guard normal completion with `writableFinished`.
Node's [HTTP lifecycle](https://nodejs.org/docs/latest-v24.x/api/http.html#event-close_2)
distinguishes this from request `close`, which can occur when request input simply
finishes. Listener cleanup and socket checks prevent leaking request state or
writing a response after the client leaves.

```ts
import { createServer } from 'node:http';
import { PjsQueueFullError, PjsTimeoutError } from '@pjavascript/runtime';

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'GET' || url.pathname !== '/primes') {
    res.writeHead(404).end();
    return;
  }
  const limit = Number(url.searchParams.get('limit') ?? '10000000');
  if (!Number.isSafeInteger(limit) || limit < 2 || limit > 100000000) {
    res.writeHead(400).end('Invalid limit');
    return;
  }
  const controller = new AbortController();
  const disconnected = () => {
    if (!res.writableFinished)
      controller.abort(new Error('HTTP client disconnected'));
  };
  res.once('close', disconnected);
  if (res.destroyed) disconnected();
  try {
    const count = await runtime.run(primes, limit, {
      signal: controller.signal,
      cancellation: 'terminate',
      timeout: 2000,
    });
    if (!res.destroyed)
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ count }));
  } catch (error) {
    if (res.destroyed || controller.signal.aborted) return;
    const status =
      error instanceof PjsTimeoutError
        ? 504
        : error instanceof PjsQueueFullError
          ? 503
          : 500;
    res.writeHead(status).end('Computation unavailable');
  } finally {
    res.off('close', disconnected);
  }
}).listen(3000);
```

Disconnect rejects the request's caller and requests targeted termination; physical
exit/replacement can finish later. Application shutdown closes the HTTP server and
awaits the shared runtime's shutdown separately.

## 6. Combined transitions and ownership decisions

```text
one accepted caller / one deadline / one signal
  primary attempt -> validated result OR confirmed exit
    success -> settle once
    failure -> eligible remaining primary retry?
                 yes -> bounded admission + backoff -> next primary attempt
                 no  -> eligible unused fallback?
                          yes -> bounded admission -> one fallback attempt
                          no  -> settle failure

abort / timeout / forced shutdown / runtime fatal, from any pending state
  -> delete logical record once; cancel recovery; release waiting claims
  -> optional targeted termination; physical ownership ends separately
```

Decision pseudocode inside `TaskCoordinator`, after physical completion:

```text
if logical record absent or event is not current attempt: return
if signal aborted or deadline expired: cancel/timeout; return
if controller disallows accepted continuation: terminal runtime outcome; return
if successful: settle once; return
if primary AND repeatable AND retry matches AND attempts < maxAttempts:
    retain/convert admission claim; wait backoff; dispatch fresh correlation
else if primary AND repeatable AND fallback unused AND fallback matches:
    retain/convert admission claim; dispatch fallback with fresh correlation
else:
    settle final error
// Reuse accepted capacity; fresh submission admission failures remain terminal.
```

Mark the planned action/selected strategy before invoking anything reentrant.
Keep physical failure/retirement state separate from logical terminal state.
All final paths pass through the existing `tasks.delete(id)` settlement guard;
intermediate failures do not call `settle()` or remove the deadline listener.
Check current attempt on starts/results/exits and recovery timer tokens. Completion,
abort, timeout and exit callbacks cannot resurrect a removed record or settle twice.

Tasks must await their spawned work before returning. PJS serializes its own worker
attempts; external requests may continue after worker exit. Deduplication must cover
those effects as well as repeated JavaScript execution.

| Risk                               | Concrete decision / limit                                                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate external effects         | No overlapping PJS attempts; require explicit repetition permission. Partial writes/external requests survive crashes. Durable application deduplication is still necessary where duplicates matter.                                                      |
| Detached input                     | No built-in recovery with input transfer lists. No hidden clone, reconstruction factory or transfer reversal. Output transfers remain supported.                                                                                                          |
| Retained clone input               | Retain the original reference through recovery and prohibit mutation/resizing/external transfer until logical settlement. Each post clones it again; getters can vary or have effects. No deterministic snapshot guarantee or byte-memory bound is added. |
| Shared memory                      | Reuse only under an application protocol safe after partial work. `sharedReadonly` is an agreement, not protection. Termination does not undo writes or repair abandoned locks.                                                                           |
| Worker termination race            | Match exact worker/correlation, latch one reason, defer containment until posting finishes, await old exit before replacement. If termination rejects, fail runtime and retain physical claims.                                                           |
| Retry accumulation                 | Recovery retains one bounded execution-slot or queue claim. Slot/queue exchanges honor runnable FIFO work; no extra waiter capacity, result-byte allowance or RSS bound is created.                                                                       |
| Deadline exhaustion                | One deadline covers the entire call; recheck before continuation and delivery. Timers and termination are subject to host event-loop/Node delays.                                                                                                         |
| Late result / duplicate settlement | Unique attempt correlations plus logical deletion guard. No recovery after caller termination; physical cleanup can outlive it.                                                                                                                           |
| Fallback stalls host               | Only registered worker tasks execute fallback; no host function execution. They share the existing bounded pool and may still wait for capacity.                                                                                                          |
| Shutdown                           | Graceful drain includes accepted recovery; forced mode clears timers/claims and prevents enqueue/spawn. Pool fatal errors override local recovery plans.                                                                                                  |

## 7. Practical implementation order

Paths below are under `packages/runtime/src/`, relative to reviewed `main`.
Each item is feature implementation work after this design is approved.

1. **Physical cancellation.** Extend `types/index.ts`, `runtime.ts`, `api/run.ts`,
   `tasks/task.ts` and `tasks/coordinator.ts` for the option and targeted intent;
   extend `dispatch/dispatcher.ts`, `pool/pool.ts` and `workers/worker.ts` for
   posting-safe retirement, reason latching and budget-exempt replacement. Wire
   narrow callbacks in `composition/create-runtime-components.ts`. Add range
   exclusions in `partition/range.ts` and `partition/validation.ts`. Keep
   `ResultCreditManager`'s ownership algorithm and protocol/bootstrap unchanged.
   Cover queued/running/reentrant abort, timeout, completion races, lease races,
   delayed/rejected termination, budget accounting and capacity restoration.

2. **Retries.** Extend `PendingTask`/`TaskCoordinator` with permission validation,
   retained input, attempt identity, correlated event routing and bounded recovery
   decisions. Extend dispatcher slot/queue admission claim exchanges and exit callbacks;
   carry typed failure reasons through worker/pool callbacks. Update
   composition to reuse `RuntimeController.dispatchAllowed()` for accepted-continuation
   permission and existing cleanup during forced/fatal transitions. Propagate generic run
   options through `runtime.ts`, `api/run.ts`, `types/index.ts` and `index.ts`;
   update `diagnostics.ts`/`telemetry/runtime.ts` for attempt projection without
   changing logical counter meanings. Extend range exclusions. Depends on the
   posting/retirement guards from cancellation and reuses existing exit/lease
   containment. Cover crashes/leases/task exceptions, exclusions, transfer
   rejection, side-effect opt-in, capacity competition, deadlines and shutdown.

3. **Fallback.** Extend the same run types/adapters and `TaskCoordinator` with
   fallback handle validation, cause matching, one-way selection and error
   aggregation; add the range exclusion. Reuse retry input retention, attempt
   correlation, admission and shutdown paths. No pool, worker, protocol, credit
   or scheduler algorithm change is needed for fallback itself. Cover type
   compatibility, retry-before-fallback ordering, ineligible final causes,
   cancellation, one fallback failure and transfer restrictions.

Update relevant core/lifecycle/error/memory guides with each feature. Use focused
runtime regressions and existing public type checks during implementation; this
proposal adds no campaign, dependencies, release process or unrelated refactoring.
`RangeCoordinator` changes only to reject unsupported request fields if needed;
`PjsScheduler` and `ResultCreditManager` need no new recovery state. Never use the
credit manager's reservation map as a general attempt registry: it intentionally
contains only executions with binary result reservations.

## 8. Maintainer decisions

The maintainer approved the architecture and bounded admission design:

- Retain `cancellation` applying to both signal and timeout, and exempting
  intentional termination from failure restart budgets. This permits cancellation
  churn while preserving fixed concurrent worker population.
- Retain explicit `repeatable: true`, recovery limited to ordinary `run()`, and
  rejection of recovery with input transfers. This favors auditable ownership over
  automatic reconstruction or copying.
- Retain the execution-slot/queue-credit exchange described above,
  especially `workers: 1, maxQueue: 0`. It permits bounded accepted-task recovery
  without exceeding queue limits or skipping runnable FIFO work, at the cost of
  possibly idle reserved slots during backoff. Keep exactly one worker fallback
  after primary retries; eligibility defaults and explicit cause lists are unchanged.

Implementation preserves these approved choices; dynamic resizing, progress events
and cooperative cancellation remain separate future considerations.
