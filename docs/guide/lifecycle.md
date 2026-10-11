# Lifecycle, cancellation and failure

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
Caller cancellation/timeout does not interrupt synchronous JS/native code or provide cooperative polling. The separate experimental physical lease initiates worker containment.
An eventual late result is discarded, without a second settlement. The worker
slot is reusable only after execution returns or the worker ends. Side effects
and completed shared writes are not undone. A posted batch can finish all its
items after cancellation; queued batches can be removed.

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
results. Ordinary run uses its host timer. Neither is a hard real-time guarantee.

## Experimental physical execution leases (R1 development)

These additions are not present in the immutable published RC4 package.

```js
await runtime.run(task, input, { timeout: 1000, executionLease: 5000 });
await runtime.shutdown({ drain: true, forceAfter: 10_000 });
```

`executionLease` starts only after successful physical posting, before the started
acknowledgement; queue time is excluded. Integer milliseconds range from 1 through 2147483647. Omission leaves physical execution unbounded. Only exclusive ordinary
run dispatches support leases. Range/map/stream options containing the field, even
undefined, and leased runs with experimentalDispatchBatchSize reject before execution.

Expiry checks the worker, correlation and unique token, fails a pending caller once
with PjsExecutionLeaseError, then initiates asynchronous termination. A caller that
already timed out/aborted retains its original outcome. No task is retried. The worker
and binary reservations remain physically occupied until confirmed exit; a stale timer
cannot affect a later dispatch. Normal validated completion clears the lease.

This bounds when containment is initiated, subject to host event-loop progress.
[Node termination](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate)
is asynchronous. This is not a sandbox, hard realtime preemption, bounded native-code
termination or OOM protection. Transferred input stays detached; shared memory and
side effects can be partial, including abandoned Atomics locks. There is no rollback.

Use constructor `restartPolicy: { maxRestarts: 3, windowMs: 60_000 }` to opt into a
pool-wide rolling restart window. It is mutually exclusive with lifetime maxRestarts.
Both values are integers (maxRestarts >= 0, windowMs >= 1). Unexpected failures and
lease containment consume one restart decision each; records expire at age >= windowMs
using monotonic time. Shutdown termination consumes none. Bootstrap failure remains
fatal without a retry. Exhaustion fails accepted work and stops the pool.

`forceAfter` measures from the first graceful shutdown call, including startup.
The first call's options and promise govern concurrent callers. Omission keeps graceful
shutdown unbounded; forceAfter with drain:false is invalid. Deadline expiry changes
permanently to forced mode, cancels queued and active pending callers, stops production
and initiates termination. Resolution still awaits exits. Graceful drain can replace
failed workers to finish accepted work; forced mode cannot spawn replacements.
Timers clear on completion. Termination rejection cannot signal successful shutdown
or justify release of physically held credits.

`stats().containment` counts lease expirations, lease termination requests, confirmed
lease exits, replacement spawns, rolling-window utilization (undefined for lifetime
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
worker error fails affected work with PjsWorkerError. A failed range cancels its
siblings. There is no automatic replay; arbitrary tasks are not known idempotent.
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
