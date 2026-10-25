# Checkpoint 2: execution recovery

Status: approved architecture implemented in development, including producer-based
range recovery admission and the cooperative-only calling-convention correction.
Reviewed 25 October 2026 after fetching `origin`. Remote `main` remains
[`747f4455a21fcff6ac94fd9ba9c922f6d2419e7e`](https://github.com/Miskovy/parallel-javascript/tree/747f4455a21fcff6ac94fd9ba9c922f6d2419e7e);
there are no intervening changes. Only this proposal changes in this task.

## Current implementation and recommended owners

The [resilience proposal](execution-resilience.md), [architecture](../architecture.md),
[core API](../guide/core-api.md), [lifecycle](../guide/lifecycle.md) and
[ownership guide](../guide/memory-ownership.md) establish the existing boundaries.
Source, rather than older scope statements in the first proposal, governs this design.
Paths below are relative to `packages/runtime/src/`.

| Owner / implementation                                                           | Current behavior and Checkpoint 2 responsibility                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TaskCoordinator`, `tasks/coordinator.ts`, `tasks/task.ts`                       | Own logical records, recovery policy, attempt correlations, transfers and exactly-once child/caller settlement. Extend the existing recovery decision to children; run reconstruction here.      |
| `RangeCoordinator`, `partition/coordinator.ts`, `partition/operation.ts`         | Own accepted parents, lazy production, shared deadline, child window, output assembly and stream delivery. Snapshot parent recovery options; schedule unfinished children through this producer. |
| `ExecutionDispatcher`, `dispatch/dispatcher.ts`, `scheduler/fifo.ts`             | Own admission, weighted FIFO batches, posting and ordinary recovery slot/queue exchanges. Reuse production claims for range continuations and protect workers before invoking reconstruction.    |
| `PjsPool`, `pool/pool.ts`; `PjsWorker`, `workers/worker.ts`                      | Pool owns population and restart budgets; worker owns the Node transport, occupied correlation, leases and confirmed exit. Route cooperative requests to the matching physical execution.        |
| `workers/bootstrap.ts`, `workers/protocol.ts`                                    | Invoke registered functions, execute batch items sequentially, validate final envelopes. Add invocation context, cancellation transport and an explicit cancelled final outcome.                 |
| `ResultCreditManager`, `results/credit.ts`; `RangeStream`, `partition/stream.ts` | Preserve logical count/byte ownership across attempts; stream buffering and yield semantics stay here. Add a narrow credit transition for a new physical attempt.                                |
| `RuntimeController`, `lifecycle/runtime-controller.ts`; composition              | Preserve guarded pumping, accepted graceful continuations, forced/fatal cleanup and narrow callbacks. No new recovery manager.                                                                   |

Today a batch reports one final envelope: successful prefix, at most one final
failure, and skipped suffix. A crash before that envelope confirms no item outcome.
`TaskCoordinator.result()` currently handles reported items; parent failure cancels
skipped children. `failTask()` routes through the leader, not every batch member.
Map validation happens in `RangeCoordinator.settled()` after child settlement;
binary validation happens before worker output posting. Preserve these distinct
contracts and existing diagnostic meanings. Read evidence includes the existing
[resilience](../../packages/runtime/test/resilience.test.mjs),
[batch](../../packages/runtime/test/batch.test.mjs),
[map](../../packages/runtime/test/map.test.mjs),
[binary](../../packages/runtime/test/binary-result.test.mjs),
[upper-bound](../../packages/runtime/test/upper-bound-result.test.mjs) and
[Checkpoint 1](../../packages/runtime/test/checkpoint-one.test.mjs) tests.

## Proposed API and defaults

**All declarations and examples below are proposed APIs.** Declarations show the
extensions; retain all existing fields/overloads and range option-alias unions.
Existing calls keep their defaults: no recovery and logical-only cancellation.

```ts
interface TaskContext {
  readonly signal: AbortSignal; // Worker-local async cancellation notification.
  throwIfCancelled(): void; // Also polls shared state; usable in CPU loops.
}
interface RecoveryAttempt {
  readonly attempt: number; // Next execution number, starting at 2 for recovery.
  readonly implementation: 'primary' | 'fallback';
}

interface RunOptions<Input = unknown, Output = never> {
  // Existing fields retained.
  cancellation?: 'settle' | 'cooperative' | 'terminate';
  rebuildInput?: (next: RecoveryAttempt) => PartitionInput<Input>;
}
type PartitionOptions<Input = unknown, Output = never> = {
  // Existing range controls and alias unions retained.
  cancellation?: 'settle' | 'cooperative' | 'terminate';
  repeatable?: true;
  retry?: RetryOptions;
  fallback?: { task: PjsTask<Input, Output>; on?: readonly RecoveryCause[] };
  rebuildInput?: (
    partition: RangePartition,
    next: RecoveryAttempt,
  ) => PartitionInput<Input>;
};
```

`rebuildInput` is a **synchronous recovery-attempt factory**, not the initial input
source. Initial `run()` input/transferList and range `createInput(partition)` remain
unchanged. When provided, invoke it for every subsequent execution, including the
single fallback, even if its transfer list is empty. Require a function and a
configured retry/fallback policy; the existing `repeatable: true` requirement applies.
Without it, clone/shared recovery reuses retained input; replay-capable calls with
nonempty input transfer lists still reject before detachment.

Reuse `RetryOptions` and `RecoveryCause` unchanged: maxAttempts includes the first
primary execution; fixed backoff defaults to zero; retry causes default to
`['worker-crash']`, fallback to `['task-error']`. One different registered fallback
follows eligible primary retries and is never retried. Fallback matches the last
primary failure and runs in the existing pool; it cannot rescue total pool failure.
Worker-reported fallback failure retains the existing AggregateError convention;
host map-validation errors remain parent PjsMapContractError after child success.
Cancellation, deadline, admission, serialization, reconstruction, map/binary contract,
protocol, bootstrap and runtime-fatal failures are terminal, not new recovery causes.
Range `executionLease` remains unsupported; accepting the shared cause enum does
not create a range lease. Ordinary lease behavior is unchanged.

Propagate Input/Output generics through range options and API adapters, with
`NoInfer` anchored to the primary task as in `run()`. Keep non-generic defaults and
existing typed-map constructor parameter compatibility. Fallback must accept the
same input and return an assignable **partition output**: readonly element arrays
for generic map, the selected typed-array block for typed map, direct ordinary-backed
binary values for strict streams. Preserve strict/count-only option exclusions.
For `parallelFor`, output is discarded; only input compatibility matters. Runtime
validation still checks actual map cardinality/kind and binary size/backing; task
registration does not verify schemas.

## 1. Range and batch recovery

Batch here means range dispatchBatchSize; ordinary run() remains single-task.

### Logical partitions recover; successful partitions do not replay

Keep one logical child ID per partition and independent primary-attempt/fallback
state on its `PendingTask`. A physical batch is a transport optimization, not an
atomic operation or the recovery unit. Parent options are validated/snapshotted
once, before any input factory; children inherit them without their own deadline
or AbortSignal listeners. `TaskCoordinator.canContinue()` must also consult the
parent's live status/deadline before continuation, posting and delivery.

| Evidence                                     | Action while parent is live                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validated success/completion                 | Commit once at its logical index, assemble its map block, or stream it in completion order. Never retry it because a sibling fails.                                                                    |
| Task failure in a valid batch envelope       | Apply that partition's retry/fallback policy; successful prefix stays committed. If ineligible/exhausted, fail parent and cancel siblings as today.                                                    |
| Explicit skipped suffix after that failure   | Retain original prepared inputs and resume those children on primary. They did not execute: no failure, backoff, fallback selection or consumed attempt.                                               |
| Crash/uncaught error before a valid envelope | Every unresolved member is ambiguous, including an apparent successful prefix inside the worker. Charge its attempted execution and apply worker-crash eligibility independently after confirmed exit. |
| Serialization or malformed protocol          | Preserve terminal classification; do not treat skipped IDs in the serialization-error envelope as proof of no execution. That envelope can follow execution of every item.                             |
| Invalid retry/fallback map or binary output  | Fail the original operation's contract; no further recovery. A valid child response may still count completed before host map validation, as today.                                                    |

On batch posting, provisionally account attempts for members. A validated genuine
skipped suffix restores those members' unused execution allowance; an ambiguous
crash does not. All later posts get fresh correlations, even a skipped child's
first actual execution. This is the necessary batch-specific distinction from
ordinary posting-based accounting. Maximum executed attempts per partition remains
maxAttempts plus at most one fallback; skips cannot create an unbounded failure loop
because every failed invocation spends its own bounded allowance.

Extend the existing attempt lookup with physical batch membership independently of
leader liveness. Give each later post a fresh physical batch/single correlation
and each batch member a fresh wire attempt ID, mapped to its stable logical ID.
Route failure/exit to all unresolved members and item results by attempt ID; bind
result credits using physical correlation plus stable logical child IDs. Validate the complete envelope before changing logical
outcomes. Retire the old membership only at final response/confirmed exit; do not
use binary reservation records as the all-task attempt registry. Clear stale batch
leader/array links before resubmission. Cancellation of one parent cannot target a
worker's later assignment.

For simplicity, **resume retries, fallback and skipped children as single-item
physical dispatches**. Initial work still batches normally. This avoids mixed
implementations in a batch or new per-item task-name protocol fields. Recovery
throughput can be lower; successful normal batches retain their fast path.

`repeatable: true` applies to every potentially repeated partition, including
`parallelFor` side effects. Worker exit proves termination, not absence of effects.
Shared writes, locks and external requests may be partial; require idempotence,
disjoint overwrite-safe regions or application deduplication keyed by stable
operation/partition identity. Reconstruction does not repair that protocol.
Already yielded values remain caller-owned even if the parent later fails; buffered
values can be discarded under the existing fail-fast contract.

### Admission: reuse the accepted range producer

Do **not** call ordinary `retainRecovery()` once per failed batch member: one
occupied worker cannot yield sixteen reserved worker slots. Instead, after physical
end, retain unfinished children in the parent's existing bounded child window as
production-deferred continuations. Keep their logical records/results credits;
release the ended physical attempt's admission. They are not queued physical entries
or new slot reservations, and no public submission/admission rejection is repeated.

`RangeCoordinator.produce()` first considers ready continuations for the selected
parent, then new partitions. Use `claimProduction(1)` and the existing guarded
pump/round-robin parent rotation. A continuation consumes fresh available execution
or queue capacity before resubmission. Retain its original logical record; do not
increment generated/admitted/accepted counters or allocate a second child promise.
Continuation eligibility must not require ungenerated partitions, a spare child/count
position or a new byte reservation: that child already owns its position/credit.
Use TaskCoordinator's existing backoff timer mechanism, bounded by live children;
its wakeup only makes the child eligible and requests the pump. TaskCoordinator
selects retry/fallback and owns that timer; RangeCoordinator scans its existing
children for ready continuation state. It does not duplicate recovery policy.

The bounds remain explicit: each parent has at most configured worker capacity ×
batch size live children, further limited by stream count capacity; parent count
has the existing operation limit. Deferred children consume those windows and
cannot trigger unlimited replacement generation. Queued logical weight plus queue
reservations stays <= maxQueue; occupied/reserved worker slots stay <= worker
capacity. Deferred logical records/retained replay inputs can total up to
operationLimit × per-parent window, a larger bound than ordinary slot/queue records
alone. There is no per-range-sized promise list or input-byte/RSS cap.

With `workers: 1, maxQueue: 0`, an ended child can resume through the next available
idle production claim. Older runnable FIFO work dispatches first. New ordinary
calls may use capacity during range backoff; unlike ordinary recovery, a range
continuation does **not** reserve a worker throughout that wait. This deliberately
reuses the accepted parent's production guarantee, not ordinary per-call slot
retention. It makes recovery eligible when capacity becomes available, without a
new starvation guarantee under endless competing submissions.

Ready continuations can request elastic growth through existing lazy demand;
sleeping backoffs do not count as runnable demand or protect idle workers. Pool
replacement, min/max bounds, resource limits and failure budgets remain independent.
One crashed batch consumes one worker restart decision, not one per child; task
exceptions consume none. Budget exhaustion/bootstrap/termination failure is fatal
and cannot be bypassed by range recovery.

### Count and byte ownership across attempts

Keep each unfinished child in `operation.children` through backoff, reconstruction
and redispatch, so it retains exactly one stream count position. Keep its original
exact/max byte declaration and full reservation; do not rerun the declaration
callback, reserve twice, refund failed work or free credit for new children.

After old physical completion, `ResultCreditManager` needs a narrow next-attempt
transition: retain the logical reservation, reset posting/dispatched/executionDone
flags, and bind it to the new correlation. Require the old correlation to have
ended and the reservation to be unreconciled/live; rollback applies only to the
new post. Otherwise cancellation during a second posting could incorrectly treat
old executionDone as permission to release credit. A new attempt never overlaps
old physical ownership.

On final deliverable success, exact credit stays until yield; upper-bound credit
reconciles/refunds once to actual bytes before buffering/yield. Fallback has the
original declaration, constructor and cardinality contract. Cancellation before a
new post releases deferred credit immediately; cancellation during/after posting
retains it until rollback, validated final response or confirmed exit. Discarded
late successes earn no refund. Credits bound result ownership, not input memory,
worker heaps, native allocations or RSS.

## 2. Cooperative cancellation

Add `cancellation: 'cooperative'` alongside unchanged settle/terminate modes. Caller
rejection remains immediate on abort/timeout; participating task code can finish
cleanup and preserve its worker. Parent fail-fast cleanup and stream return/throw
use the same selected policy. Queued work is removed without invocation.

A message/local AbortSignal alone cannot interrupt a CPU loop. A periodic worker
polling timer has the same event-loop limitation; forcing all tasks to yield changes
the task contract. Recommend one private Int32 cancellation flag in a fresh
SharedArrayBuffer **per physical execution**, polled by Atomics.load. Node supports
[shared backing between workers](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#portpostmessagevalue-transferlist),
and the [ECMAScript atomic load operation](https://tc39.es/ecma262/multipage/structured-data.html#sec-atomics.load)
provides the cross-thread read. Send the private flag as execution metadata,
never in transferList or the application input schema. Never reset/reuse an old
flag for later attempts.

Only explicit cooperative mode invokes `execute(input, context)`. Settle and
terminate modes preserve exactly `execute(input)`: argument count, rest parameters
and second-parameter behavior are observable compatibility boundaries. Each invocation gets its own context/worker-local AbortController,
not a module-global current task. `throwIfCancelled()` polls the flag, aborts that
local controller if necessary, and throws its AbortError. CPU code calls it at a
work-appropriate interval. Context is available only in cooperative mode; allocate shared cancellation
backing only for that mode.

Host cancellation atomically sets the flag and sends a correlated wakeup message.
The worker handles that message even while awaiting an async task and aborts the
current invocation's local signal. Handle control messages before the existing
busy/overlap execution guard. Async code can pass `context.signal` to abortable APIs
or observe its abort event. `signal.aborted` alone is not CPU-loop polling; use
`throwIfCancelled()` there. Signal listener promises are not implicitly awaited:
the task must await cleanup and all spawned work before returning. Use a worker-local
AbortError reason; the caller retains its original abort/timeout error without
requiring arbitrary signal.reason values to be cloneable.

For sequential batches, one physical flag covers the single parent; create separate
invocation contexts per item. Check before every item and after each awaited result.
On observed cancellation, skip the remaining suffix and send an explicit cancelled
final outcome only after the task promise (including cleanup) settles, or an
item is confirmed uninvoked; cancellation delivery itself is not completion.
This is not task-error. Extend envelope validators to allow that stop marker
with a skipped suffix while preserving exact item order/coverage. Do not serialize
an output after cancellation is observed. A user-thrown AbortError without a runtime
request remains an ordinary task exception. Late outcomes after logical cancellation
are discarded and never select recovery.

PjsWorker retains the token/correlation until validated final response or exit,
even after TaskCoordinator deletes the logical record. Install the flag before
posting; reentrant cancellation can set it during cloning. Defer the wakeup message
until successful posting; failed posting discards the token. Ignore stale control
messages by exact correlation. Close invocation controllers/listeners after their
own invocation; contexts cannot affect another item or later task. This explicit
argument also avoids an ambient-context problem if async concurrency is added later;
no concurrent execution is introduced now.

Ignoring cancellation leaves the worker busy indefinitely. There is **no automatic
cooperative-to-terminate grace timer** initially. Existing ordinary executionLease
can independently contain it, and forced shutdown/forceAfter still terminates;
ranges retain only their selected cooperative policy until forced shutdown.
Cooperative completion consumes no restart budget; crashes/lease expiry retain their
existing charges. Host event-loop delays affect publication; native blocking code,
an infinite unpolled loop or Atomics.wait on unrelated memory is not preempted.
No acknowledgement/request alone releases occupancy or credits, and no effects roll
back. Healthy success winning first removes caller cancellation hooks; cancellation
winning first keeps its caller outcome through cleanup, late success or later crash.

## 3. Explicit transferable-input reconstruction

Compare the small options:

| Approach                                         | Trade-off                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory for initial and every later attempt      | Uniform, but needs another initial submission form/discriminant and changes existing range-factory timing/meaning.                                    |
| Recovery-only rebuildInput factory (recommended) | Preserves initial APIs, adds one explicit hook used for both retry and fallback, and avoids retaining consumed input as a replay source.              |
| Hidden backup clone or replay of transfer list   | Can copy large buffers or reuse detached data; reject this. Application-level resubmission also loses the single deadline/admission/settlement model. |

`rebuildInput` returns the existing `{ input, transferList? }` envelope synchronously;
Promise returns reject. Ordinary callback receives RecoveryAttempt; range callback
also receives the original frozen partition descriptor. The initial range factory
is not silently invoked again. A confirmed unexecuted skipped item resumes its
retained initial input without calling rebuildInput or changing implementation.
For a retry/fallback, use the hook consistently when present, not only after crashes.

Invoke reconstruction only after old physical end and backoff, **when an actual
worker has been claimed for posting**, not when a failure is first reported or while
waiting indefinitely in the queue. Dispatcher must protect that worker before
TaskCoordinator's prepareDispatch callback: today preparation precedes Worker.execute,
so an unprotected reentrant factory could steal the still-idle worker. This is a
small extension of production-claim protection, not another scheduling layer.
Run range callbacks in their parent's AsyncResource scope. Recheck logical/attempt
identity, parent status, deadline and dispatch permission after every application
callback/getter/list snapshot and immediately before posting.

Validate/snapshot/reserve the fresh transfer list with existing helpers and recheck
it at post. Reject detached, duplicate, reserved or untransferable buffers. A new
list containing the same consumed backing is not reconstruction. Never overlap two
attempts for one partition. Factory exceptions are terminal PjsError with original
cause/context; malformed envelopes/transfer errors are terminal serialization errors.
If cancellation wins reentrantly, discard the preparation and keep cancellation's
outcome; no retry of factory errors. If this happens during fallback, preserve normal
fallback error aggregation except for cancellation/deadline/runtime termination.

With configured dispatchBatchSize > 1, input transfers remain rejected, including
rebuilt inputs and singleton recovery dispatches. Choose batch size 1 for transferred
range recovery. Output transfers remain supported. Do not weaken this restriction
because the current retry happens to contain one item.

Hold prepared references and transfer claims through posting/rollback. After a
successful move the sender stays detached; existing dispatched cleanup can drop
host envelope references. For an initial physical batch, retain the prepared
inputs until its final outcome distinguishes the skipped suffix; skipped inputs
are still needed without reconstruction. Otherwise hook-based recovery retains the
callback, not the consumed payload; without a hook retain replay input as today.
Worker-side input, shared aliases, physical cancellation token and result ownership can outlive caller rejection.
Application shared data must remain valid until physical completion, not merely
logical settlement. Captured source data stays application-owned and stable for
future rebuilds; factory allocation, copying and side effects are explicit and are
not bounded by result credits. Keep host factories cheap; synchronous work blocks
the host and cannot itself be interrupted by a timeout. PJS cannot verify that
reconstruction represents the same logical input, undo factory side effects,
or restore a lost buffer.

## Proposed usage examples

Assume handles are registered before runtime construction with the indicated input
and partition-output schemas. These examples are proposed, not currently runnable APIs.

```ts
// 1. Proposed: only the eligible failed partition retries; other successes stay.
const partials = await runtime.partitionRange(
  sumFast,
  range,
  (partition) => ({ input: { partition, values: immutableValues } }),
  {
    repeatable: true,
    retry: {
      maxAttempts: 3,
      backoffMs: 50,
      on: ['task-error', 'worker-crash'],
    },
    fallback: { task: sumPortable, on: ['task-error', 'worker-crash'] },
    dispatchBatchSize: 4,
    timeout: 5000,
  },
);

// 2. Proposed task module: synchronous CPU polling, no event-loop yield needed.
export function countPrimes(limit: number, context: TaskContext): number {
  let count = 0;
  for (let n = 2; n < limit; n++) {
    if (n % 1024 === 0) context.throwIfCancelled();
    if (isPrime(n)) count++;
  }
  return count;
}
// Host: the caller rejects first; worker reuse waits for task completion.
const controller = new AbortController();
const pending = runtime.run(primes, 100_000_000, {
  signal: controller.signal,
  cancellation: 'cooperative',
  timeout: 2000,
});
const observed = pending.catch(handleCancellation);
controller.abort();
await observed;

// 3. Proposed: explicit application copies from retained immutable source.
// source is a stable Uint8Array<ArrayBuffer>; hash implementations return string.
const prepare = () => {
  const bytes = source.slice();
  return { input: bytes, transferList: [bytes.buffer] };
};
const first = prepare();
const digest = await runtime.run(hashFast, first.input, {
  transferList: first.transferList,
  repeatable: true,
  retry: { maxAttempts: 2 },
  fallback: { task: hashPortable, on: ['worker-crash'] },
  rebuildInput: (_next) => prepare(),
  timeout: 5000,
});

// 4. Proposed: same rule per partition; packInput returns fresh transferred input.
// Both encoders return Uint8Array<ArrayBuffer> within the original declared maximum.
const streamController = new AbortController();
const stream = runtime.streamRange(
  encodeFast,
  range,
  (partition) => packInput(source, partition),
  {
    repeatable: true,
    retry: { maxAttempts: 2 },
    fallback: { task: encodePortable, on: ['worker-crash'] },
    rebuildInput: (partition, _next) => packInput(source, partition),
    dispatchBatchSize: 1,
    maxBufferedResults: 4,
    maxResultBytes: (partition) => (partition.end - partition.start) * 8,
    maxReservedResultBytes: range.grainSize * 8 * 4,
    cancellation: 'cooperative',
    signal: streamController.signal,
    timeout: 5000,
  },
);
try {
  for await (const item of stream) await consume(item);
} finally {
  await stream.return();
}
```

## Combined transition and implementation order

```text
live logical child + original parent deadline/count/byte position
  attempt -> validated final response OR confirmed exit
    success -> existing child settlement and output validation/commit, once
    eligible failure -> bounded backoff -> parent's production claim
      -> claim worker -> optional rebuild -> fresh attempt
    confirmed skip -> parent's production claim -> same unused attempt allowance
    terminal failure -> settle child -> fail parent -> cancel siblings
abort/deadline/stream close/forced shutdown/fatal failure, from any live state
  -> settle parent once, clear deferred children/timers/claims
  -> selected action on owned correlations; forced/fatal stop always terminates
  -> physical ownership ends separately
```

TaskCoordinator retains the existing task deletion guard; parent status becomes
terminal before sibling cleanup. Intermediate failures never call settle() or advance
parent completion counters. Graceful shutdown accepts continuation of the already
accepted parent, including deferred children and stream delivery; forced/fatal cleanup
prevents factories, timer resurrection, redispatch and replacement. Forced shutdown
still terminates regardless of cancellation mode. No cancelled attempt can start
fallback, and no retry overlaps an old attempt still awaiting exit.

Practical order, with focused regressions added during later implementation:

1. **Transfer reconstruction for ordinary recovery.** Extend `types/index.ts`,
   `tasks/task.ts`, `tasks/coordinator.ts`, dispatcher posting protection and existing
   transfer-helper use. Propagate types through `api/run.ts`, `runtime.ts`, `index.ts`.
   Establish liveness checks and one reconstruction per selected recovery posting.
2. **Partition recovery, then physical batches.** Extend `partition/range.ts`,
   `partition/validation.ts`, `partition/operation.ts`, both coordinators, attempt
   routing, dispatcher production reuse, `results/credit.ts` next-attempt transition
   and composition callbacks. Propagate generics through `api/range/` and facade.
   Start with size 1 using the same design, then handle envelope successes/skips/crashes;
   recovery dispatch stays singleton. Map assembly and stream storage remain existing
   owners, with no new output conversion or recovery-cause framework.
3. **Cooperative mode.** Extend cancellation types/state and coordinator routing;
   add TaskContext construction in worker bootstrap (a small local helper is sufficient),
   flag/control-message transport and final-outcome validation in `workers/worker.ts`
   and `workers/protocol.ts`. Route requests through dispatcher/pool without moving
   Node transport into scheduling. Preserve lifecycle forced/fatal containment.

Update relevant API/lifecycle/ownership/error documentation and the generated API
inventory alongside implementation. Existing pool scaling/budget algorithms and
FIFO scheduler policy need no redesign. No dependencies, qualification campaign,
release stage, backend, priorities or progress/concurrency feature is proposed.

## Focused acceptance cases for implementation

Extend existing resilience, batch, checkpoint-one, map, binary/upper-bound, stream,
public-option and type tests; these are behavioral cases, not a separate campaign:

- Every range API/form: recovered partition commits once; middle-of-batch failure
  keeps the successful prefix and resumes skipped suffix without spending attempts.
  Crash after a shared side-effect marker but before the final envelope treats all
  unconfirmed members as ambiguous and obeys per-partition caps/repeatability.
- Both map forms and all stream modes: invalid retry/fallback output is terminal;
  order/cardinality/constructor/backing remain enforced. Already yielded values do
  not duplicate. Failed/backoff attempts hold one count/full-byte position; successful
  upper-bound reconciliation/refund occurs once. Cancellation during a second post
  holds credits until the correct physical end, including zero-byte reservations.
- Multi-item failure both with workers:1/maxQueue:0 and, separately, a full weighted FIFO queue:
  no multiplied slot claims, overflow, replay of successes or factory calls without
  a claim; existing runnable entries precede ready continuations. Recovery works
  when its window is full or all partitions have already been generated.
- Real CPU polling and async cancellation with awaited cleanup preserve the worker;
  ignored cooperation stays busy until return/lease/forced shutdown. Cover cancelled
  batch suffix, default settle behavior, posting reentrancy and stale signals/messages
  after completion, retry or worker reuse. No cancellation-triggered retry/fallback.
- Ordinary and range rebuilds after crash/task error/fallback: fresh buffers, one
  invocation per selected attempt, original initial factory called once, detached or
  reserved backing rejected, async/throwing factory terminal, batching transfer ban
  intact. Abort/timeout/shutdown from factory/getters prevents posting and cleans claims.
- Backoff/exit waits across elasticity, restart exhaustion, resource-limit exits and
  graceful/forced shutdown: unchanged budgets, single settlement, no premature
  ownership release or timer resurrection. Type checks reject incompatible fallback
  input/block outputs and async reconstruction while preserving legacy option types.

## Maintainer decision

The maintainer approved producer-based recovery: range backoff releases physical
capacity and resumes through the accepted parent's bounded producer; ordinary run
recovery retains its existing slot/queue policy. This avoids multiplying one batch
slot into per-partition reservations, at the cost of no reserved-worker latency
guarantee. Singleton continuation posts, recovery-only synchronous rebuildInput and
cooperation without an automatic escalation timer are retained.

The accepted compatibility correction is explicit: only cooperative mode calls
execute(input, context). Every existing mode preserves execute(input), including
arguments.length, rest parameters and second-parameter behavior.
