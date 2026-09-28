# Experimental numeric range operations

v0.4 added `runtime.partitionRange(task, range, createInput, options?)`; v0.5
added bounded transport batches; v0.6 added completion-only `parallelFor()`;
v0.7 adds bounded completion-order `streamRange()` over the same engine.
`partitionRange()` returns ordered chunk outputs, `parallelFor()` returns
`Promise<void>` without transporting successful values, and `streamRange()`
returns an `AsyncIterable` of identified partition outputs. All three APIs and
their derived admission limits remain experimental; no stable
`parallel.for/map/reduce` family is exported. See the
[v0.7 proposal](proposal-v0.7.md),
[completion decision](adr/0012-completion-only-operations.md), and
[stream decision](adr/0014-streaming-result-semantics.md).

## Reuse shared input

Register a normal module task. The host factory builds payloads; it does not run
inside a worker and is not serialized as a closure.

```ts
// sum.ts → sum.js
import type { RangePartition } from '@pjs/runtime';

export function sum({
  partition,
  data,
}: {
  partition: RangePartition;
  data: Float64Array<SharedArrayBuffer>;
}): number {
  let total = 0;
  for (let i = partition.start; i < partition.end; i++) total += data[i];
  return total;
}
```

```ts
import { PjsRuntime, PjsTaskRegistry, sharedReadonly } from '@pjs/runtime';
import type { RangePartition } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const sum = registry.register<
  {
    partition: RangePartition;
    data: Float64Array<SharedArrayBuffer>;
  },
  number
>('sum', new URL('./sum.js', import.meta.url), 'sum');
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 8 });
const data = sharedReadonly(
  Float64Array.from({ length: 100_000 }, (_, i) => i),
);
try {
  const chunks = await runtime.partitionRange(
    sum,
    { start: 0, end: data.length, grainSize: 10_000 },
    (partition) => ({ input: { partition, data } }),
    { timeout: 5_000, experimentalDispatchBatchSize: 4 },
  );
  console.log(chunks); // Logical range order, regardless of completion order.
} finally {
  await runtime.shutdown();
}
```

This example returns chunk sums; application aggregation is ordinary JavaScript.
PJS does not define parallel reduction semantics. Never mutate shared input
after publication, including while cancelled worker executions still access it.

For completion-only work, the same task/factory model can expose results through
a disjoint shared output:

```ts
await runtime.parallelFor(
  transform,
  { start: 0, end: output.length, grainSize: 10_000 },
  (partition) => ({ input: { partition, input, output } }),
  { experimentalDispatchBatchSize: 4 },
);
```

The worker may return a value, but PJS ignores it without structured-cloning or
transferring it. Prefer naturally `void` tasks. A returned transfer envelope is
also ignored. Only disjoint writes or correctly synchronized access are safe;
PJS provides no implicit mutex, rollback, or transaction. Completed writes stay
visible after later failure, cancellation, or timeout.

For incremental results, consume completion order explicitly:

```ts
for await (const { partition, output } of runtime.streamRange(
  transformBlock,
  { start: 0, end: input.length, grainSize: 10_000 },
  (partition) => ({ input: { partition, input } }),
  {
    timeout: 5_000,
    experimentalDispatchBatchSize: 4,
    experimentalMaxBufferedResults: 8,
  },
)) {
  consume(partition, output);
}
```

Partition identity is mandatory because delivery is not index ordered. Breaking
the loop cancels unconsumed work. If the task returns a transferred buffer, the
consumer owns it after yield. Userland can reorder or collect results, but doing
so owns the corresponding retention cost.

`grainSize` defines logical range boundaries. `experimentalDispatchBatchSize`
only groups adjacent logical children into one worker round trip. Values are
integers from 1 through 16; 1 preserves the v0.4 transport path. One batch runs
sequentially on one worker, so larger values can reduce message overhead while
also increasing non-preemptive occupancy and reducing skew balancing.

## Boundaries and payload ownership

The domain is `[start, end)`, with safe integer endpoints, a safe integer span,
`end >= start`, and a required positive safe integer `grainSize`. Negative
endpoints are valid. Grain is the maximum width, independent of worker count;
the last partition may be smaller. Empty collecting ranges return `[]`; empty
completion ranges resolve `undefined`; empty streams end immediately; none call the factory. Descriptors
are frozen `{ index, start, end }` values. Collecting more than 2³²−1 outputs is
rejected because the result is a JavaScript array. Completion ranges can use the
full safe-integer logical count while production remains bounded.

Factories must synchronously return `{ input, transferList? }`, finish their own
work and remain short. They run only as capacity permits, once per generated
partition, and may close over shared input. The worker task still receives only
its explicit payload. For exclusive data, prepare compact buffers lazily:

```ts
(partition) => {
  const rows = a.slice(partition.start * size, partition.end * size);
  return {
    input: { partition, a: rows, b: sharedB, size },
    transferList: [rows.buffer],
  };
};
```

The registered matrix task interprets `a` as compact rows, reads common `b`, and
can return `transfer(result, [result.buffer])`. Lists belong to each child, not
the parent. A configured batch size above 1 rejects any nonempty input transfer
list before posting or detachment. Use batch size 1 for this matrix pattern.
This avoids moving inputs for later batch items that might never execute after
an earlier failure. Output transfers may be combined because the buffers are
already worker-owned. Native shared views are never transferable. All existing
[transfer ownership rules](memory.md) apply; dispatch detaches buffers even if
the parent later fails or times out.

## Admission and retention

Parents are main-isolate records, consume no worker, and may wait for startup
or capacity even with `maxQueue: 0`. Active parents are bounded by
`min(Number.MAX_SAFE_INTEGER, workers + maxQueue)`; overflow rejects with
`PjsQueueFullError`. Ordinary `run()` still rejects immediately on task overflow.
Parent acceptance commits the logical range without reserving all its children.

With batch size `B`, each parent has at most `workers × B` unsettled logical
children and at most `workers` physical batches in flight from one production
turn. Descriptors and payloads are generated lazily in bounded arrays of at
most 16. Children enter the same FIFO through one weighted leader: waiting
logical weight never exceeds `maxQueue`, while physical queue nodes may be
fewer. Occupied physical executions never exceed workers. A factory reserves
the chosen worker or logical queue credits, so reentrant ordinary work cannot
steal capacity. Eligible parents rotate at production boundaries; continuously
competing external submissions still have no formal fairness guarantee.

These are task-count bounds, **not output-memory bounds**. `partitionRange()`
retains completed results by logical index until success, so collecting millions
of outputs can exhaust memory. `parallelFor()` creates no indexed output array
and successful worker values never reach the host. User task allocations and the
factory's captured data can still be large. Neither mode allocates all
descriptors or child promises at acceptance.

`streamRange()` adds a separate positive logical-result bound,
`experimentalMaxBufferedResults`, defaulting to the worker count. Each admitted
unsettled child reserves one result credit. Buffered results plus such children
cannot exceed the capacity, including when a physical batch contains multiple
items. Reading releases a credit and production resumes. The count does not
estimate bytes, and application-side reordering or collection is outside it.

## Failure, cancellation, deadlines and shutdown

The parent succeeds only after every required child completes. A worker executes
batch items in logical order and stops after the first item failure. Earlier
items may have completed; later items are reported skipped and never invoked.
First observed failure stops production, rejects once, cancels queued/running
sibling callers, and discards accumulated/late outputs. A worker exception remains `PjsTaskError`
with `operationId`, `partitionIndex`, `rangeStart`, `rangeEnd`, task and worker
context. Factory exceptions become local `PjsError` with the original cause.
Serialization and crash errors retain their existing classes. There are no
automatic retries or worker termination on ordinary task failure.

Collection exposes no successful array on failure. Streaming is intentionally
different: values already yielded remain observable and cannot be rolled back;
buffered values are discarded, future production stops, and subsequent
iteration rejects. Earlier successful items in a failing physical batch may
therefore have reached the consumer before the first failing item terminates the
stream.

One signal and deadline cover startup, capacity waiting, factory work, queueing,
execution, buffering, and stream consumer waiting. Timeout is never reset per chunk. Synchronous host
code cannot be preempted; elapsed time is checked at production/settlement
boundaries in addition to the timer. The first observed terminal reason wins.

**Caller cancellation does not release an executing worker.** A posted batch is
one non-preemptive physical execution and finishes all of its items unless an
item fails. Busy siblings continue until completion/crash; only then can another
execution use the slot. Cancellation does not undo side effects.

A worker crash during a batch fails the parent and triggers bounded replacement.
No logical item is retried because the host cannot know which side effects ran.
Malformed batch correlation fails the worker safely.

Graceful shutdown closes public admission and finishes the **entire accepted
range**, including chunks not yet generated. For streams it also waits for every
result to be consumed; close an abandoned iterator to avoid an indefinite drain.
It waits for cancelled executions too. `shutdown({ drain: false })` cancels parents and terminates workers under
the existing shutdown rules. The first shutdown call fixes the mode. Large
ranges or uncooperative tasks can keep graceful shutdown waiting indefinitely.

Partition operations invoked inside workers reject with `PjsRuntimeStateError`.
No worker callback channel, parent worker slot, or nested child pool is created.
General nested compute remains unsupported.

## Statistics

| Namespace              | Meaning                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `tasks.*` and `timing` | Ordinary submissions plus actual admitted child tasks; existing definitions       |
| `operations.*`         | Parent totals plus collecting/completion/streaming outcomes, pending and capacity |
| `streams.*`            | Streaming parent accepted/rejected/terminal outcomes and pending count            |
| `streamResults.*`      | Produced/yielded/currently buffered/peak buffered logical result counts           |
| `partitions.*`         | Descriptors generated, children admitted, child caller completed/failed/cancelled |
| `dispatch.*`           | Physical execute/result messages plus logical task/partition totals and ratio     |
| `activeOperations`     | Live range/progress snapshots including result mode and stream buffer state       |
| `activeTasks`          | Existing task snapshots plus optional operation/partition context                 |

Generated can exceed admitted if a factory fails or cancellation intervenes.
A parent timeout increments `operations.timedOut`; its pending children count
as cancelled, not independently timed out. Late worker execution durations are
still sampled. Terminal operation records and outputs are discarded by the
runtime; returned successful arrays belong to the caller. See
[ADR 0009](adr/0009-partition-admission-and-metrics.md).
