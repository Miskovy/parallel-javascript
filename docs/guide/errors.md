# Public errors

Import classes from `@pjs/runtime` and use `instanceof`, not exact message text.
All twelve classes inherit PjsError, which inherits Error and sets name to the
concrete class name. Messages are explanatory and contextual; their exact wording
is not a protocol. Errors contain no coordinator maps or mutable runtime records.

| Class                        | Trigger / associated API                                                       | Delivery                                                                | Recovery / retry                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PjsError                     | Base error; host range input factory throws or returns malformed payload       | Parent rejection / stream next rejection                                | Fix factory; no blind retry after partial range side effects                                             |
| PjsTaskError                 | Registered task throws or rejects                                              | run/parent/stream rejection                                             | Worker normally remains usable; retry only with application knowledge of idempotence                     |
| PjsWorkerError               | Startup/import/protocol failure, worker exit, restart exhaustion               | ready/run/parent/stream rejection                                       | A normal crash may be replaced; fatal state requires a new runtime after correction; no automatic replay |
| PjsQueueFullError            | Waiting task or parent operation capacity exhausted                            | Submission promise or stream next rejection                             | This offer was not accepted; reduce offers, shed load or use bounded backoff                             |
| PjsTimeoutError              | Task/parent deadline expires                                                   | Promise / stream next rejection                                         | Physical work may still run; retry can duplicate side effects                                            |
| PjsCancelledError            | Pre-abort, queued/active abort, sibling cleanup or non-draining shutdown       | Promise / stream next rejection; consumer return itself resolves done   | Treat cancellation as caller settlement, not rollback                                                    |
| PjsSerializationError        | Invalid/reserved transfer buffer, clone/posting failure                        | transfer() throws synchronously; run/child/output failures reject       | Fix transport; queued input usually remains attached, dispatched ownership is irreversible               |
| PjsRuntimeStateError         | Runtime not accepting work; range called from worker thread                    | Promise / stream next rejection; ready may reject if stopped in startup | Use a running runtime; nested range execution unsupported                                                |
| PjsTaskRegistrationError     | Duplicate/empty ID, invalid file URL/export name; unknown handle at submission | register throws synchronously; submission rejects                       | Fix registration before constructing runtime; no retry of unchanged input                                |
| PjsMapContractError          | Wrong map block kind/length or host assembly failure                           | Parent rejection                                                        | Correct worker block; failure is a workload contract error                                               |
| PjsBinaryResultContractError | Invalid declaration/callback or nonbinary/shared/detached/wrong-size result    | Stream next rejection                                                   | Fix declaration/output; distinct from worker crash; exact requires equality                              |
| PjsResultCapacityError       | One declared result exceeds per-stream capacity                                | Stream next rejection                                                   | Increase explicit capacity or reduce grain/bound; runtime never waits for impossible capacity            |

Error context has optional taskId, workerId, operationId, partitionIndex,
rangeStart, rangeEnd and cause. Context is available only when known: errors before
admission may have no worker. Binary contract errors additionally have declaredBytes,
actualBytes and actualType; capacity errors have declaredBytes and resultByteCapacity.
Task errors expose remoteName and remoteStack, and append the worker stack to the
local stack. This is deliberate diagnostic information, including application file
paths; do not display raw stacks to untrusted application clients. Host causes can
be the original application error; worker causes are serialized descriptions.

Not every observable error is a PjsError. Invalid numeric options/ranges throw or
reject RangeError. Wrong sharedReadonly input throws TypeError. Invalid stream
option combinations reject TypeError on next(). Concurrent pending next() calls
reject ordinary Error; iterator.throw(reason) rejects that Error (or wraps a
non-Error reason). Native allocation failures can propagate. Malformed JavaScript
objects with throwing getters/invalid signal methods can throw synchronously.
These are programming errors, not queue or crash signals.

The [installed-package test](../../scripts/package-smoke.mjs) checks exported
class identity, name, message and stack context from an actual tarball. Unit and
lifecycle tests cover context propagation and worker recovery separately.
