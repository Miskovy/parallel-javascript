# Experimental numeric range operations

v0.4 adds `runtime.partitionRange(task, range, createInput, options?)`.
It returns one promise of ordered chunk outputs. The API and its derived
admission limits are experimental; no stable `parallel.for/map/reduce` family
is exported. See the [proposal](proposal-v0.4.md) and
[ownership decision](adr/0008-runtime-owned-partitioning.md).

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
    { timeout: 5_000 },
  );
  console.log(chunks); // Logical range order, regardless of completion order.
} finally {
  await runtime.shutdown();
}
```

This example returns chunk sums; application aggregation is ordinary JavaScript.
PJS does not define parallel reduction semantics. Never mutate shared input
after publication, including while cancelled worker executions still access it.

## Boundaries and payload ownership

The domain is `[start, end)`, with safe integer endpoints, a safe integer span,
`end >= start`, and a required positive safe integer `grainSize`. Negative
endpoints are valid. Grain is the maximum width, independent of worker count;
the last partition may be smaller. Empty ranges return `[]` without calling
the factory. Descriptors are frozen `{ index, start, end }` values. More than
2³²−1 outputs is rejected because the result is a JavaScript array.

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
the parent. Native shared views are never transferable. All existing
[transfer ownership rules](memory.md) apply; dispatch detaches buffers even if
the parent later fails or times out.

## Admission and retention

Parents are main-isolate records, consume no worker, and may wait for startup
or capacity even with `maxQueue: 0`. Active parents are bounded by
`min(Number.MAX_SAFE_INTEGER, workers + maxQueue)`; overflow rejects with
`PjsQueueFullError`. Ordinary `run()` still rejects immediately on task overflow.
Parent acceptance commits the logical range without reserving all its children.

Each parent has at most `workers` unsettled children. Descriptors and payloads
are generated lazily using actual idle/queue capacity. Children enter the same
FIFO: waiting tasks never exceed `maxQueue`, and occupied executions never
exceed workers. A factory holds an admission credit through child submission,
so a reentrant `run()` cannot steal its promised slot. Eligible parents rotate;
continuous external submissions have no fairness guarantee.

These are task-count bounds, **not output-memory bounds**. Completed results
are retained by logical index until success, so collecting millions of outputs
can exhaust memory. The factory's captured data can also be large. Nothing
allocates all descriptors, result slots, or child promises at acceptance.
Streaming collection and a separate configurable operation limit remain open
design questions.

## Failure, cancellation, deadlines and shutdown

The parent succeeds only after every required child completes. First observed
failure stops production, rejects once, cancels queued/running sibling callers,
and discards accumulated/late outputs. A worker exception remains `PjsTaskError`
with `operationId`, `partitionIndex`, `rangeStart`, `rangeEnd`, task and worker
context. Factory exceptions become local `PjsError` with the original cause.
Serialization and crash errors retain their existing classes. There are no
automatic retries or worker termination on ordinary task failure.

One signal and deadline cover startup, capacity waiting, factory work, queueing,
execution and collection. Timeout is never reset per chunk. Synchronous host
code cannot be preempted; elapsed time is checked at production/settlement
boundaries in addition to the timer. The first observed terminal reason wins.

**Caller cancellation does not release an executing worker.** Busy siblings
continue until completion/crash; only then can another execution use the slot.
Cancellation does not undo side effects or restore transferred bytes.

Graceful shutdown closes public admission and finishes the **entire accepted
range**, including chunks not yet generated. It waits for cancelled executions
too. `shutdown({ drain: false })` cancels parents and terminates workers under
the existing shutdown rules. The first shutdown call fixes the mode. Large
ranges or uncooperative tasks can keep graceful shutdown waiting indefinitely.

Partition operations invoked inside workers reject with `PjsRuntimeStateError`.
No worker callback channel, parent worker slot, or nested child pool is created.
General nested compute remains unsupported.

## Statistics

| Namespace              | Meaning                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `tasks.*` and `timing` | Ordinary submissions plus actual admitted child tasks; existing definitions        |
| `operations.*`         | Parent accepted/rejected/completed/failed/cancelled/timedOut, pending and capacity |
| `partitions.*`         | Descriptors generated, children admitted, child caller completed/failed/cancelled  |
| `activeOperations`     | Live range/progress snapshots; queued children and scheduled/running children      |
| `activeTasks`          | Existing task snapshots plus optional operation/partition context                  |

Generated can exceed admitted if a factory fails or cancellation intervenes.
A parent timeout increments `operations.timedOut`; its pending children count
as cancelled, not independently timed out. Late worker execution durations are
still sampled. Terminal operation records and outputs are discarded by the
runtime; returned successful arrays belong to the caller. See
[ADR 0009](adr/0009-partition-admission-and-metrics.md).
