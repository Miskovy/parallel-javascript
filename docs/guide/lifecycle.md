# Lifecycle, cancellation and failure

**Promotion status:** Development P1 containment contracts are promoted following benchmark review; caller settlement still does not release physical ownership before validated completion or confirmed exit.

Construction snapshots the registry and starts workers. `ready()` resolves after
initial imports; `run` and range operations may be accepted during startup.
Startup submissions occupy queue capacity, so with `maxQueue: 0` await ready and
submit only into idle capacity. Missing/non-callable exports, import errors and
startup deadlines fail startup with PjsWorkerError. Compile TS task modules first.

```text
runtime: starting → running → stopping → stopped
                        fatal failure → failed → shutdown → stopped
caller:  accepted → queued → dispatched → settled
worker:                     occupied ─────────────→ idle or failed
```

## Caller settlement is not physical completion

**Cancellation or timeout can reject the caller while the worker remains busy.**
Default cancellation/timeout does not interrupt synchronous JS/native code or provide
cooperative polling. Explicit `cancellation: 'cooperative'` supplies TaskContext
only to participating invocations; CPU code polls throwIfCancelled(), async code
uses its local signal, and cleanup must finish before physical ownership ends. `run()` and all four range APIs with `cancellation: 'terminate'` request targeted
worker termination on signal abort or call timeout; the independent physical lease
also initiates containment. Queued/waiting cancellation removes only that caller's
work and admission claims. Abort during posting defers targeted termination until
the post succeeds, preserving transfer ownership throughout serialization.
An eventual late result is discarded, without a second settlement. The worker
slot is reusable only after execution returns or the worker ends. Side effects
and completed shared writes are not undone. A posted batch can finish all its
items after cancellation; queued batches can be removed.

With range termination enabled, parent cleanup targets distinct batch correlations
before any worker is reused. Fail-fast sibling cancellation and stream `return()`/
`throw()` use that same policy. Batches only contain children of one parent, so
unrelated operations are not interrupted. Credit and physical occupancy end only
on validated final completion or confirmed exit. Opt-in range recovery keeps
unresolved partitions and their result reservations across successive attempts.

| Event                           | Caller/parent                               | Queue / physical work / credit                                                                   |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Already-aborted signal          | Reject PjsCancelledError before admission   | No work accepted, no transfer                                                                    |
| Queued cancellation             | Reject once and remove queued work          | Release transfer claims and result reservations immediately                                      |
| Active cancellation             | Reject once                                 | Keep physical occupancy and binary reservation until execution ends; transfer cannot be reversed |
| Parent failure/abort/deadline   | Fail/cancel parent, cancel sibling callers  | Ungenerated children stop; active siblings may finish; clear undelivered outputs                 |
| Stream break or iterator return | Close stream and cancel remaining operation | Drop buffered ownership; active work and reservations end physically later                       |
| Late success/failure            | No second caller settlement                 | Release remaining physical ownership once; discarded success does not earn a refund              |

Do not mutate published shared inputs after cancellation: active workers may still
read them. `tasks.pending === 0` alone does not establish quiescence; workers can
remain busy and result credits can remain reserved. The
[cancellation example](../../examples/cancellation.mjs) uses a deterministic
shared gate to show this distinction without racing a short task against a timer.

## Timeouts

All deadlines are integer milliseconds from 1 through 2147483647. Omit timeout
to disable it; zero is invalid. Host event-loop progress is required for delivery.

| API                                             | Start and included time                                                                                                                                      | Excluded / limitations                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| run({ timeout })                                | Timer installed during successful admission, before dispatch; includes remaining startup, queue, task execution and result transport until caller settlement | Does not include user work after resolution, nor pre-admission option validation; timer is not CPU preemption                                 |
| partitionRange / parallelFor / parallelMapRange | One parent deadline measured from operation start, including validation elapsed time, startup, lazy factory work, queue, execution and host result assembly  | No per-child deadline reset; event-loop blockage delays observation                                                                           |
| streamRange                                     | Parent deadline includes startup, generation, queue, execution and waiting for every result to be delivered to the consumer                                  | After final yield, caller-retained processing is outside the operation; intermediate slow consumer work can delay later delivery and time out |
| startupTimeout                                  | Per initial/replacement worker creation through ready/import completion                                                                                      | Separate from operation deadlines; cannot terminate blocked host code promptly                                                                |

Parent progression also checks elapsed deadlines before delivering/reconciling
results. Ordinary run uses its host timer; recovery-enabled runs additionally check
their original monotonic deadline before dispatch, continuation and delivery. Neither
is a hard real-time guarantee.

<a id="experimental-physical-execution-leases-r1-development"></a>

## Physical execution leases (development)

These additions are not present in the immutable published RC4 package.
C1-A/Q adds focused acceptance and installed-package qualification without
changing these contracts; P1 status is recorded above. See the
[C1 engineering report](../research/c1-containment-acceptance.md) for source-bound
evidence and the separate promotion decision.

```js
await runtime.run(task, input, { timeout: 1000, executionLease: 5000 });
await runtime.shutdown({ drain: true, forceAfter: 10_000 });
```

`executionLease` starts only after successful physical posting, before the started
acknowledgement; queue time is excluded. Integer milliseconds range from 1 through 2147483647. Omission leaves physical execution unbounded. Only exclusive ordinary
run dispatches support leases. Range/map/stream options containing the field, even
undefined, and leased runs with either `dispatchBatchSize` or deprecated
`experimentalDispatchBatchSize` present reject before execution, even when that
batch property is inherited or explicitly undefined. Ordinary run does not gain
batching support.

Expiry checks the worker, correlation and unique token, fails a pending caller once
with PjsExecutionLeaseError, then initiates asynchronous termination. A caller that
already timed out/aborted retains its original outcome. Without an eligible opt-in retry/fallback, no task repeats. The worker
and binary reservations remain physically occupied until confirmed exit; a stale timer
cannot affect a later dispatch. Normal validated completion clears the lease.

This bounds when containment is initiated, subject to host event-loop progress.
[Node termination](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate)
is asynchronous. This is not a sandbox, hard realtime preemption, bounded native-code
termination or OOM protection. Transferred input stays detached; shared memory and
side effects can be partial, including abandoned Atomics locks. There is no rollback.

Use constructor `restartPolicy: { maxRestarts: 3, windowMs: 60_000 }` to opt into a
pool-wide rolling restart window. A defined policy is mutually exclusive with a
defined lifetime maxRestarts value; JavaScript maxRestarts: undefined does not
select a lifetime budget. This is a defined-value rule, not a property-presence
alias rule. With no policy, lifetime maxRestarts defaults to workers × 4 and zero
is valid. TypeScript retains its existing optional number properties; with
exactOptionalPropertyTypes, explicit undefined is not part of that optional
number declaration.
Both values are integers (maxRestarts >= 0, windowMs >= 1). Unexpected failures and
lease containment consume one restart decision each; records expire at age >= windowMs
using monotonic time. Shutdown termination consumes none. Bootstrap failure remains
fatal without a retry. Exhaustion fails accepted work and stops the pool.

On a non-failed runtime, `forceAfter` measures from the first graceful shutdown
call, including startup. The first call's options and promise govern concurrent
callers; later calls return that same promise without reading their option getters.
Omission keeps graceful
shutdown unbounded; forceAfter with drain:false is invalid. Deadline expiry changes
permanently to forced mode, cancels queued and active pending callers, stops production
and initiates termination. Resolution still awaits exits. Graceful drain can replace
failed workers to finish accepted work; forced mode cannot spawn replacements.
Timers clear on completion. Termination rejection cannot signal successful shutdown
or justify release of physically held credits.

A lease-driven replacement whose termination request rejects fails the runtime
without spawning a replacement or replaying queued work. The already-settled
leased caller keeps its lease error; cleanup rejects and the physical correlation
remains occupied until actual exit. A later confirmed exit ends that ownership
but does not turn a previously rejected, cached shutdown promise into success.

`stats().containment` counts lease expirations, lease termination requests, confirmed
lease exits, replacement spawns, rolling-window utilization (a decision count, not
a fraction; required with undefined for lifetime
policy), budget exhaustion and shutdown escalations. Busy occupancy reflects actual
physical correlation. See [ADR 0021](../adr/0021-physical-execution-containment.md).

## Streams

Streams start eagerly at `streamRange()` call, not first next(). Use a single
consumer. Concurrent pending next() calls reject with Error. Count/byte capacity
can pause production independently of worker availability. `for await` break
calls return() and closes the operation. If using an iterator manually, close it
in finally. Producer failures reject next(); already yielded outputs stay yours,
while buffered results are discarded. See [backpressure](backpressure.md).

## Worker failures and replacement

An unexpected exit (including exit code zero), protocol violation or uncaught
worker error fails affected work with PjsWorkerError. A terminal failed range cancels its
siblings. There is no replay by default; run/range retries and fallback require
explicit repeatable permission. Confirmed successful partitions never replay.
While the pool remains active, it waits for the old thread to exit before creating
a replacement with fresh module globals and worker ID. Unaffected queued work can
continue. Initial/replacement bootstrap failure is fatal; exhausting the lifetime
maxRestarts budget fails remaining work and stops workers. Future submissions to
a failed runtime reject; construct a new runtime after fixing the cause.

Task exceptions and result-contract mistakes normally leave the worker usable.
They are distinct from crashes. Cleanup is guarded against duplicate error/exit
notifications and late results; accepted callers settle once, reservations release
once, and listeners/timers/task/operation records are removed on their terminal
paths. Existing cross-platform suites test these invariants. This does not imply
immediate RSS return from Node or native allocators.

Failure notification can reject callers before a thread exits. During that
interval, `workers.busy` still counts the occupied physical correlation, even if
the worker detail status is `failed` or `stopped`. Those statuses describe worker
usability or termination intent, not confirmed exit. Active result reservations
remain held until a valid final response or confirmed thread exit. A failed
worker's subsequent messages cannot settle callers, refund credit, or restore
its usability. Replacement starts only after exit.

`@pjavascript/runtime@1.0.0-rc.2` contains a correctness and resource-governance
defect in this abnormal-failure interval: binary `streamRange()` reservations
(exact or upper-bound, including batches) and busy accounting can release before
confirmed exit. R1A repairs that boundary without adding execution leases or
changing the lifetime restart policy. Security impact has not been established;
workers continue to execute trusted application modules.

## Recovery and shutdown

Opt-in retries and the single registered-task fallback remain one accepted logical
call. Each post has a distinct correlation; a failed worker's successor attempt waits
for confirmed old exit. Caller outcomes count once, even across multiple executions.
See [the run controls](core-api.md#ordinary-execution-resilience-development).

Backoff/replacement waits retain a bounded queue or execution-slot claim. Graceful
shutdown permits accepted continuations and waits for them, including with zero queue
capacity. Forced shutdown, escalation, abort, deadline and fatal runtime failure clear
recovery waits/claims; no later timer may reenqueue. Intentional cancellation restores
capacity without charging failure budgets; crash/lease containment retains its existing
budget. All replacements await old exit, and termination rejection remains fatal.

One call timeout includes all attempts and recovery waits. Neither shared writes nor
external effects roll back, and a caller rejection does not establish physical
quiescence. Worker recreation discards module state/caches. Cooperative cancellation preserves
the worker if task cleanup returns; ignored requests leave it busy with no automatic
cooperative escalation. Existing leases (ordinary calls) and forced shutdown remain
independent termination mechanisms.

Range continuations reuse accepted parent production, not one reserved execution
slot per failed batch member. Backoff releases physical capacity but retains the
bounded child window and stream credits. New ordinary work can run meanwhile;
ready continuations obtain fresh production claims after runnable FIFO entries.
Confirmed uninvoked suffixes resume their unused primary attempt; crash-ambiguous
members spend attempts and require explicit crash eligibility. Serialization-failure
skipped IDs never authorize replay. Singleton recovery does not relax the configured
batching transfer prohibition. One parent deadline includes reconstruction and waits.

In cooperative mode only, bootstrap calls execute(input, context); default settle
and terminate modes keep execute(input). A shared flag makes CPU polling possible;
a correlated message aborts the local async signal. Contexts/flags do not carry over
to another execution, and a delivered request is not a completion acknowledgement.

## Shutdown

`shutdown()` closes admission synchronously and defaults to `{ drain: true }`.
It finishes accepted tasks, whole accepted ranges including ungenerated children,
active cancelled executions and stream delivery, then stops workers. An abandoned
open stream or task that never returns can hold it indefinitely. Consume or close
your streams before awaiting graceful shutdown.

`shutdown({ drain: false })` cancels callers/parents and terminates workers,
including active work; await it for physical cleanup. It cannot undo side effects.
Task-created async finalizers are not shutdown hooks. **The first shutdown call
fixes the options**; repeated calls return the same promise. R1 development allows
forceAfter on that first graceful call; later calls cannot add escalation. Submissions during/after shutdown reject
PjsRuntimeStateError. Use try/finally around the runtime lifetime.

## Concurrent invocations and progress (development)

With concurrency greater than one, caller settlement and physical ownership are
tracked independently for every invocation on a worker. Terminate-mode and leased
work is placed exclusively; a waiting exclusive job drains one worker without
interrupting its existing work. Every terminal waiter path releases that placement
pin and restores shared admission. A queued deadline includes that wait. Cooperative
cancellation targets only its own context/flag; a synchronous loop can still delay
other async work in that isolate. There is no targeted native-thread termination.

A shared worker's crash/protocol/resource-limit exit affects all its outstanding
physical correlations. Each caller follows its own recovery policy, one thread
failure consumes one restart decision, and no correlation/credit releases before
validated final response or confirmed exit. Graceful shutdown waits for all of them;
forced shutdown terminates each thread once. Progress is discarded on logical
settlement/stream closure/failure, never delays shutdown and never proves completion.
