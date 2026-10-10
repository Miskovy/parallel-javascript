# ADR 0021: Physical execution containment and governed recovery

Status: Accepted for implementation; all new containment API surfaces are experimental.

## Context

Caller settlement does not prove that a worker has stopped executing. R1A established
one physical owner per correlation, ended only by a validated final response or
confirmed worker exit. Non-returning CPU work can otherwise hold capacity after a
caller timeout or cancellation. Queue time and physical execution need separate bounds.

Starting point: `ac7572f2f670a3d583c10e1a35b7c91d12a7e34e`, containing the merged
registry convergence prerequisite. The existing [engineering record](../research/r1-engineering-log.md)
remains historical evidence.

## Decision

Use the existing worker correlation and credit completion path. Add an optional
per-run physical lease, a pool-wide rolling restart budget, and one shutdown escalation
form. No global execution lease and no task replay.

```text
accepted logical task → bounded queue / direct admission
  → dispatching credit claim → worker correlation claimed → successful postMessage
  → dispatched credit claim → optional lease armed → started acknowledgement
  → validated final response OR confirmed exit
  → physical correlation ends → credit reconciliation → capacity reusable

caller timeout / abort → logical settlement only
lease expiry → typed logical failure if pending → worker failed → termination requested
  → confirmed exit → governed replacement → ordinary bootstrap → idle capacity

graceful shutdown → accepted work drains
forceAfter expires → one-way forced mode → cancel callers → terminate → await exits
  → final credit cleanup → shutdown resolves
```

`run(task, input, { executionLease })` accepts an integer number of milliseconds
from 1 through 2^31-1. The lease starts after successful posting and establishment
of dispatched ownership, before the worker's started acknowledgement. Queue acceptance
starts no lease. Posting failure rolls back its claim and arms no timer. Structured-clone
getters may settle the caller reentrantly; successful physical posting still gets a lease.
If reentrant containment has already changed worker state, no additional lease is armed.
Otherwise the successful post receives its lease and subsequent shutdown clears it.

An allocated lease token contains only correlation, monotonic deadline and timer handle;
its closure retains no input payload. The timer must match the same worker, token,
busy state and correlation. Early timer wakes reschedule the remaining monotonic duration.
Completion, failure, exit and shutdown clear lease state. Recorded final completion
wins over stale expiry; recorded expiry/failure makes later messages ineligible.

Pending callers reject once with `PjsExecutionLeaseError`, a subclass of
`PjsWorkerError`, with existing task/worker context. Already-settled callers keep
their timeout/cancellation error. Infrastructure containment continues. A failed worker
is never reused. Reservations remain held during requested termination, including
exact and upper-bound binary reservations. Abnormal exit produces no invented refund.

Leases are supported only for exclusive ordinary `run()`. All range, map, stream
and physical batch options containing `executionLease` reject before input factories
or execution; TypeScript declares the range field `never`. Combining a leased run
with `experimentalDispatchBatchSize` also rejects. Unleased batching is unchanged.

`restartPolicy: { maxRestarts, windowMs }` is an opt-in pool-wide rolling budget,
mutually exclusive with historical lifetime `maxRestarts`. Both fields are integers:
maxRestarts >= 0, windowMs >= 1. The runtime snapshots the policy. Each unexpected
worker failure, including lease containment, makes at most one restart decision.
A restart record is added at the decision, before awaiting the old exit. Records
expire lazily at age >= windowMs using monotonic time; no history timer exists and
at most maxRestarts live records are retained. The replacement spawns only after
confirmed old exit and only while the pool is active. Intentional forced/normal
shutdown creates no failure or restart record. A graceful drain deliberately permits
recovery for previously accepted work. Exhaustion fails the runtime and pending work
through the existing fatal path. Startup and replacement bootstrap errors are fatal
configuration failures without another restart. Omitted policy retains lifetime behavior.

`shutdown({ drain: true, forceAfter })` counts integer milliseconds from the first
shutdown call, including startup, using monotonic time. Omitted forceAfter preserves
unbounded graceful draining. The first call owns options and the shared promise;
later calls cannot override it. forceAfter with drain:false rejects. Escalation changes
drain mode only once, rejects queued and active pending callers with
`PjsCancelledError`, stops production and begins pool termination. It cannot revert.
The promise resolves only after confirmed exits and final cleanup. A rejected
termination does not release still-owned credits or report successful shutdown.
This is a bound on when containment is requested, not on the Node exit latency.

`stats().containment` exposes actual lease expirations, lease termination requests,
confirmed lease exits, worker replacement spawns, restart-window utilization
(undefined for lifetime policy), budget exhaustion and shutdown escalation counts.
It does not imply freed resources before exit; workers.busy remains physical.

## Consequences and limits

[Node Worker.terminate](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate)
is asynchronous; its promise is fulfilled when exit is emitted. Host event-loop delays
can delay timers. Leases provide containment initiation, not synchronous preemption,
hard realtime deadlines, bounded native-code termination, process isolation, sandboxing
or OOM protection. A host or process failure is outside this contract.

Successfully transferred input remains detached after worker termination.
SharedArrayBuffer writes and other side effects can be partial. Abrupt termination
while user code holds Atomics locks can leave application state inconsistent.
There is no rollback, transaction, shared-memory isolation or recovery of detached buffers.

No lease timer or per-task lease token is allocated for an omitted lease. No new
scheduler or runtime dependency is introduced. Experimental options and telemetry may
change after experience with R2 generated model-based testing.

Qualification uses controlled clocks and held termination gates, actual infinite
workers, a four-worker scenario and bounded recreate/fault-injection cycles.
Ordinary feature qualification is distinct from immutable RC4 source/package freezes.
A future release needs a separately reviewed version and baseline.
