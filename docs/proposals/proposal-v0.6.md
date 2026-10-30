# v0.6 proposal: completion-only parallel ranges and async context

## Decision summary

v0.6 adds the experimental method `runtime.parallelFor()`. It executes a
registered task over the same numeric range, lazy input factory, admission,
batching, cancellation, deadline, failure, and shutdown machinery as
`partitionRange()`, but resolves with `void` and never creates or fills a
range-wide output array.

The three candidate names were evaluated as follows:

- `runtime.parallelFor()` says both that work is parallel and that this is a
  completion-only loop. It leaves a coherent future family
  (`parallelMap`, `parallelReduce`) without adding a new namespace now.
- `runtime.forRange()` describes the domain but not the important parallel
  execution or completion-only semantics.
- `parallel.for()` gives the cleanest eventual algorithm family, but adding a
  second public object/namespace for one experimental operation would commit
  more surface than the evidence supports.

`parallelFor()` is therefore the narrow experimental choice. A future stable
algorithm namespace may replace it; v0.6 does not add `map` or `reduce`.

## Completion-only semantics

Completion-only execution means that every required logical range partition
has successfully invoked and awaited the registered task. Success is not based
on physical batch count and does not imply that side effects are reversible or
durable. The parent resolves as `Promise<void>` only after all logical children
complete. An empty range resolves without invoking the factory.

Tasks use the existing `PjsTask<Input, Output>` registration mechanism. The
`parallelFor()` signature accepts `PjsTask<Input, unknown>` so existing tasks
can be reused. A worker return value is allowed but ignored at the worker
boundary: PJS does not inspect a transfer envelope, prepare a transfer list,
put the value in a result message, or retain it on the host. The task itself may
still allocate the value before returning it, so completion-oriented tasks
should naturally return `void`. A separate public task kind would add API
surface without preventing JavaScript implementations from returning values.

This contract can avoid result transport today while leaving room for a
stricter completion-task registration contract if real misuse warrants one.
Returning a transfer envelope from completion work does not transfer its
buffers; the whole return value is discarded.

## Shared range engine and result policy

`partitionRange()` and `parallelFor()` share one host operation record with a
result policy:

```text
range operation
  resultMode = collect  -> indexed output array -> Promise<Output[]>
  resultMode = discard  -> no output array      -> Promise<void>
```

The shared record owns the range plan, producer cursor, live logical children,
deadline, cleanup, counters, and one operation-level async resource. It does
not use inheritance. The result policy is the semantic difference, while all
lifecycle machinery stays common. This is also the answer to whether
`partitionRange()` can eventually use the same internal primitive: it does in
v0.6.

No range-wide partition list, Promise list, task-record list, or output list is
created for completion mode. Only the existing bounded live-child window is
present. Successful output memory therefore cannot accumulate in the host in
proportion to the completed logical count or returned value size.

## Worker protocol and output transport

The internal protocol remains version 2. Execute messages carry an explicit
completion-only marker. Successful completion work responds with `completed`
or a batch item of that type, containing only task identity and execution
timing. Failures retain the existing serialized error form. This is an
unambiguous extension between a runtime and its own same-build bootstrap and
does not justify a protocol-v3 migration mechanism.

The worker awaits the task result but deliberately does not call
`transferOutput()` and never includes the value in `postMessage`. For batches,
each successful item produces compact completion metadata; first failure still
stops later items. Physical result messages are still required to release
worker occupancy and correlate logical completion.

## Input memory and side effects

Inputs behave exactly as for `partitionRange()`:

- ordinary payload graphs are structured-cloned;
- shared backing is sent using native `SharedArrayBuffer` semantics;
- exclusive input transfer lists are supported only at batch size one;
- batching above one rejects input transfers before admission or detachment.

Completion-only work is particularly appropriate for a shared output whose
partitions write disjoint regions. PJS supplies no automatic safety. The
application must establish disjoint access or use correct Atomics-based
synchronization. Unsynchronized overlapping writes are a data race. PJS adds
no mutex, semaphore, barrier, shared-object wrapper, or transaction.

Successful side effects from earlier partitions remain after a later failure,
cancellation, timeout, crash, or non-draining shutdown. PJS provides no rollback
or transactional semantics. The API is for CPU work, not a replacement for
Node's ordinary asynchronous database, network, or filesystem I/O.

## Admission, batching, failure, cancellation, and shutdown

Production remains lazy. A parent has at most
`workers * experimentalDispatchBatchSize` live children, while queued physical
entries consume logical admission weight. `maxQueue` continues to bound queued
logical work, not messages. Existing FIFO rotation and fairness rules apply.

Batching stays explicit and experimental; its default is one and its maximum is 16. Grain stays explicit. No automatic batch/grain selection or work stealing
is introduced.

Logical partitions remain parent children; physical batches are transport only.
If item 11 fails in `[10, 11, 12, 13]`, 10 may have completed, 11 is the first
failure, and 12/13 are skipped. The parent rejects once, queued siblings are
cancelled, running siblings remain occupied, and completed side effects remain.
Worker crashes are not retried because executed side effects cannot be known.

One `AbortSignal` and one absolute deadline cover startup, capacity waiting,
factory execution, queueing, dispatch, worker execution, and final completion.
Queued/future work stops. Posted work is non-preemptive and its late completion
is ignored after parent settlement. Cancellation does not roll back effects.

`shutdown({ drain: true })` closes public admission and completes the whole
accepted range, including ungenerated partitions. `drain: false` cancels the
operation and terminates workers under existing rules. The first shutdown mode
wins.

## Async context and diagnostics

Each accepted range operation owns one `AsyncResource` created in the caller's
current async scope. Host-side application callbacks (the lazy input factory)
and final resolve/reject run in that resource's async scope. Cleanup emits the
resource's destroy event exactly once.

This provides a logical operation relationship for `async_hooks` and preserves
the captured `AsyncLocalStorage` store in host operation callbacks. Normal
promise continuation rules preserve the caller's store after `await`, including
concurrent and nested stores, errors, cancellation, and timeouts.

Worker isolates do not inherit the host `AsyncLocalStorage` store. v0.6 does not
serialize arbitrary stores into task payloads. Doing so would create ownership,
security, schema, framework, and transport commitments.

One resource per operation is chosen because it supplies useful diagnostics at
constant cost. A resource per logical child would add allocation and hook work
to the fine-grained path; it is benchmarked only as a research control and is
not adopted unless evidence changes.

## Metrics

Existing total `operations.*`, `partitions.*`, `tasks.*`, timing, and physical
dispatch counters retain their meanings. Completion-only successful children
increment `partitions.completed` and logical task completion exactly like
collecting children. Active-operation snapshots expose the result mode.

`stats().operations.collecting` and `.completion` distinguish accepted and
terminal parent counts plus current pending parents without splitting every
existing metric namespace. Physical batches remain dispatch metrics, never
public children. No output-byte metric is claimed: JavaScript structured-clone
graphs and shared backing do not have a cheap, reliable byte accounting model.

## Comparison with `partitionRange()`

| Property                            | `partitionRange()`             | `parallelFor()`                              |
| ----------------------------------- | ------------------------------ | -------------------------------------------- |
| Return                              | ordered `Promise<Output[]>`    | `Promise<void>`                              |
| Successful worker value             | cloned/transferred to host     | ignored before transport                     |
| Parent retention                    | one slot per logical partition | no output array or slots                     |
| Primary use                         | per-partition values           | disjoint shared output / intentional effects |
| Range, factory, admission, failures | shared semantics               | shared semantics                             |

## Evidence plan and gate

The v0.6 benchmark suite compares collecting undefined/scalar/large output with
completion mode at batch sizes 1/4/8, records wall/CPU/RSS, physical messages,
event-loop delay/utilization, and repeats the 32 MiB retention experiment. A
shared vector transform and shared-output matrix multiply compare completion
messages against private worker output transport and host assembly. Fairness
mixes a large completion parent, ordinary `run()`, and collecting work. Piscina
uses a bounded manual producer and is labeled as a transport harness rather than
an equivalent algorithm API.

Same-build ordinary `run()` and `partitionRange()` controls guard regressions.
Async-resource measurements compare no resource, one operation resource, and a
per-child synthetic control over 512 no-op logical items. Raw results are stored
only in new `*-v0.6.json` artifacts.

The next milestone is selected from these measurements. v0.6 does not preselect
map, reduce, cooperative cancellation, streaming, adaptive sizing, worker
context propagation, or structured scopes.
