# v0.1 architecture proposal

PJS starts as a bounded task runtime on persistent Node.js workers. Its public facade does not expose threads or message ports. No compiler, framework integration, automatic partitioning, or work stealing is included.

| Component       | Responsibility                                                                             |
| --------------- | ------------------------------------------------------------------------------------------ |
| PjsRuntime      | Admission, dispatch coordination, task state, cancellation/deadlines, metrics, shutdown    |
| PjsPool         | Fixed worker population, startup, replacement budget, termination                          |
| PjsWorker       | One isolate, typed protocol, readiness, one execution slot, worker metrics                 |
| PjsScheduler    | Bounded FIFO queue, dequeue, removal; no worker transport                                  |
| PjsTaskRegistry | Typed handles mapped to explicit local module URLs and exports; immutable runtime snapshot |

Workers import all registered exports before announcing readiness. This catches invalid task configuration before execution, avoids closure serialization/eval, and amortizes imports. Dynamic registration and generated manifests are deferred.

Protocol: main sends `execute(taskId, taskName, input)` or `shutdown`; worker sends `ready`, `started(taskId)`, `success(taskId, output, executionMs)`, `failure(taskId, error, executionMs)`, or `bootstrapFailure(error)`. Validate inbound messages and correlate every execution response with the occupied worker slot.

Runtime: created → starting → running → stopping → stopped; infrastructure failure → failed. Worker: starting → idle ↔ busy; unexpected exit → failed → stopped; replacement gets a new identity. Task: created → queued → scheduled → running → completed/failed; queued/scheduled/running → cancelled/timed_out. Every accepted task settles at most once.

Graceful shutdown closes admission, drains accepted work, then terminates threads. Explicit non-draining shutdown cancels accepted work and terminates threads. Repeated calls share completion. Failure cleanup is awaited by shutdown.

Errors distinguish task exceptions, worker loss, queue overflow, deadlines, cancellation, serialization, registration, and runtime state; task/worker IDs accompany execution errors.

Primary concurrency risks: duplicate error/exit notifications, late results after cancellation, crashes during shutdown, startup rejection, serialization exceptions during dispatch, and queue removal during dispatch. The main isolate owns scheduling and settlements; workers own execution only. Running cancellation never releases a slot early. Replacement is bounded to prevent permanent bootstrap/crash loops.

Layout: `packages/runtime/src/{pool,scheduler,tasks,workers,errors,telemetry,types}`, `packages/runtime/test`, `benchmarks/{cpu-baseline,prime-search,matrix-multiplication}`, `examples`, `docs/{adr,research}`.
