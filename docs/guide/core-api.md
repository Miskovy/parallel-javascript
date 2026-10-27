# Core API guide

**Promotion status:** Development P2 range/count/map/batch contracts are promoted following benchmark review; all six deprecated option aliases remain accepted through the actual shared transition window.

PJS runs explicitly registered CPU work in persistent Node worker isolates. Your
application keeps its event-loop/I/O plane; PJS supplies a bounded compute plane.

```text
Node application
  ├─ event loop / ordinary asynchronous I/O
  └─ PJS compute plane
       bounded admission → scheduler / bounded pool → worker isolates → module tasks
```

PJS does not discover parallelism in arbitrary JavaScript, capture closures,
replace the event loop, or make a tiny function inherently faster. Start with
[basic-run.mjs](../../examples/basic-run.mjs) and its
[task module](../../examples/tasks.mjs). The README's example uses the same files.

This guide describes **integrated development source**, including execution resilience and
six new option names with [deprecated aliases](../partitioning.md#c2-development-option-transition).
Published RC4 has older declarations/spellings and lacks later containment
controls. The [README quickstart](../../README.md) works with RC4;
checkout examples are tested against the packed development artifact.

## CommonJS consumption (development)

Ordinary CommonJS hosts synchronously require the package root; no dynamic-import
wrapper or application conversion is needed. This is development behavior, absent
from published RC4. Both loading modes reach one ESM graph and index.d.ts, sharing
constructors, errors, registry/handle identity and transfer-helper state within each
isolate. Internal package subpaths remain blocked.

```js
// square-task.cjs
module.exports = (value) => value * value;
```

```js
// main.cjs
const { PjsRuntime, PjsTaskRegistry } = require('@pjavascript/runtime');
const { pathToFileURL } = require('node:url');
const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  pathToFileURL(require.resolve('./square-task.cjs')),
);
const runtime = new PjsRuntime({ registry, workers: 1 });
async function main() {
  try {
    await runtime.ready();
    console.log(await runtime.run(square, 12)); // 144
  } finally {
    await runtime.shutdown();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Registration still requires file URLs. Node interprets .mjs/.cjs and .js using
its usual package type rules. Bootstrap selects a callable namespace export first,
then a callable own property of namespace.default (CommonJS module.exports).
Thus `module.exports = fn` uses the default name; `exports.compute = fn` and
`module.exports = { compute: fn }` use compute, including computed property names.
`module.exports = { default: fn }` also supports default registration. Prototype
properties, Promise-valued/missing/noncallable exports reject worker startup;
throwing export accessors follow the same startup-failure path.

The public host graph stays synchronous and free of top-level await. Worker task
modules load asynchronously and may use awaited ESM initialization. Their loading
is covered by ready()/startupTimeout. The installed bootstrap resolves relative to
the package, independently of the host's CWD. Compile tasks before registration.

With either locked compiler, NodeNext .cts consumers use
`import PJS = require('@pjavascript/runtime')` for declared types; .mts consumers
use ordinary imports. Both use the same declarations, with no .d.cts shim. The
[installed consumers](../../scripts/package-consumer/commonjs.cjs) exercise this
loading model, including awaited shutdown.

## One-sentence contracts

| API                                                    | Contract                                                                                                                         | Use / evidence / boundary                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| registry.register(id, fileURL, exportName = 'default') | Bind a unique name to a local module function and return an immutable typed identity handle.                                     | All workloads; cannot serialize closures or infer the export's schema                     |
| new PjsRuntime(options)                                | Snapshot registered tasks and start a bounded worker pool; elasticity is opt-in.                                                 | Runtime/lifecycle tests; idleTimeout opts into runtime min/max bounds                     |
| ready()                                                | Resolve once initial workers import all registered tasks, or reject startup failure.                                             | Runtime tests; readiness is more than thread creation                                     |
| run(task, input, options)                              | Execute one registered task through bounded admission and settle its caller independently of physical worker occupancy.          | v0.13 crypto and v0.14 queue controls; no retry by default; bounded opt-in recovery       |
| partitionRange(task, range, factory, options)          | Lazily divide a numeric range and collect one output per partition in logical order.                                             | v0.4 and v0.12 controls; entire result retained, no result byte cap                       |
| parallelFor(task, range, factory, options)             | Execute range children and resolve when all succeed, discarding worker return values before serialization.                       | v0.6 and v0.12 controls; writes/side effects cannot be rolled back                        |
| streamRange(task, range, factory, options)             | Eagerly start a range and deliver identified partition outputs in completion order under count and optional binary-byte credits. | v0.14 pipeline; single consumer, not ordered delivery                                     |
| parallelMapRange(task, range, factory, options)        | Validate one element per range index and assemble blocks into a flat logically ordered array or selected typed array.            | v0.8 and v0.12 controls; requires exact block kind/cardinality, preallocates final output |
| transfer(value, buffers)                               | Wrap a worker result so listed ArrayBuffers move to the caller at successful posting.                                            | v0.13/14 ownership; does not reclaim lost buffers after failure                           |
| sharedReadonly(view)                                   | Copy supported visible numeric bytes once into reusable native shared backing under an immutable-by-contract rule.               | v0.13/14 shared input; does not freeze memory                                             |
| stats()                                                | Return copied current state and cumulative diagnostic counters without retaining completed-task history.                         | v0.13/14 measurements; no latency quantiles                                               |
| shutdown(options)                                      | Close admission and use the first chosen drain policy to finish or terminate accepted work and stop workers.                     | Cross-platform lifecycle suites; graceful drain can wait indefinitely                     |

All four range methods and their controls are [promoted in development](../stability.md).

## Registration and runtime options

Register every task before constructing the runtime. The registry accepts a
nonempty unique ID, a `file:` URL and nonempty export name. Every worker imports
every registered module. Module globals persist per isolate. A registration made
after construction is not in that runtime's snapshot. Handles from another
registry, or `{ id: 'same-name' }` objects, are rejected.

B3 development removes the unsupported public registry.snapshot() method and its
TypeScript declaration. Keep your own registration metadata for introspection.
Composition captures an internal copy after scalar normalization and before the
queue getter; later registrations cannot change existing runtimes or replacement
worker configuration. Internal snapshot access and TaskDescriptor are not root
exports or supported package subpaths. This pre-v1 removal is absent from RC4.

`registry` is required. By default `workers` chooses a fixed population; `minWorkers`
defaults to 1 and `maxWorkers` to the larger of minimum and explicit workers or
availableParallelism(). Without explicit workers the available value is clamped
to those bounds. This is a default, not a sizing recommendation.
`maxQueue` defaults to 1024 waiting logical tasks. `startupTimeout` defaults to
30000 ms per worker; `maxRestarts` defaults to four times workers over the
runtime's lifetime. Integer ranges and invalid-value behavior are in the
[current option inventory](../research/v1-api-contract-inventory.md).

### Elastic workers and resource limits (development)

Define `idleTimeout` to opt into a dynamic pool, in integer milliseconds from 1
through 2147483647. Omission retains fixed-pool behavior. With elasticity,
`minWorkers` and `maxWorkers` bound the running population; omitted `workers` starts
at the minimum, while an explicit `workers` sets the initial population within
those bounds. Accepted queued work and lazy range demand grow the pool, counting
physical batches rather than their logical item weight. Only excess idle workers
retire after the timeout; running tasks and retained recovery slots are protected.
Retiring threads keep their population slots until exit, so new growth cannot
exceed `maxWorkers` while termination is pending.

```ts
const runtime = new PjsRuntime({
  registry,
  minWorkers: 1,
  maxWorkers: 4,
  idleTimeout: 1000,
  resourceLimits: {
    maxOldGenerationSizeMb: 128,
    maxYoungGenerationSizeMb: 16,
    codeRangeSizeMb: 32,
    stackSizeMb: 4,
  },
});
```

`resourceLimits` is copied and validated at construction. The four optional
`WorkerResourceLimits` fields accept positive finite numbers up to 2147483647,
in MiB; fractional values are permitted. Unknown keys reject. Every initial,
grown and replacement worker receives the same limits. These are
[Node JS-engine limits](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#new-workerfilename-options),
not ArrayBuffer, native-allocation or total RSS caps. Node command-line heap flags
can override heap limits; very small limits can prevent worker bootstrap.
Limit-triggered worker failure keeps the normal error, confirmed-exit ownership,
restart budget and explicitly opted-in retry/fallback behavior.

New ordinary calls still need idle or bounded queue capacity. With `maxQueue: 0`,
a rejected offer does not trigger speculative growth or hidden admission waits;
accepted ranges can request additional workers without materializing all inputs.
Growing workers must bootstrap before dispatch. Elastic stream defaults use
`maxWorkers` for their count/window capacity. Idle retirement does not charge the
crash budget; unexpected crashes do, even above the minimum. Forced shutdown
cancels idle timers and prevents further growth; graceful drain can grow/recover
to finish accepted work. Retirement recreates module state/caches on later growth.

`run` takes one input and returns a promise of one output. Clone is default;
optional `transferList` moves input buffers. `signal` and `timeout` affect caller
settlement by default; `cancellation: 'terminate'` also stops active execution.
Constructor/registration validation throws; ordinary
submission validation rejects. See [errors](errors.md) and [lifecycle](lifecycle.md).

## Priorities and custom scheduling (development)

`priority` is an optional signed 32-bit integer on run() and every range API.
Higher values dispatch first; the default is zero, with stable FIFO ties. Priority
ranks eligible queued physical executions, never preempts running JavaScript and
does not bypass maxQueue. Retries/fallback retain priority but join at a fresh queue
position when runnable. A physical batch retains one priority and its logical
queue weight. Lazy range production and deferred continuations remain round-robin,
so priority is not an end-to-end range latency guarantee. Strict priority can starve
lower ranks; there is no automatic aging.

```ts
const runtime = new PjsRuntime({ registry, workers: 2, maxQueue: 32 });
await runtime.run(task, input, { priority: 10 });

// Optional comparator replaces the built-in ranking; zero retains FIFO ties.
const custom = new PjsRuntime({
  registry,
  workers: 2,
  scheduling: (a, b) => b.priority - a.priority || a.weight - b.weight,
});
```

The comparator receives frozen SchedulingTask metadata: taskId, taskName, priority,
queuedAt (epoch milliseconds for this entry), weight, exclusive, and optional
operationId/partitionIndex. It cannot mutate internal records or authorize dispatch.
Keep it synchronous, cheap and free of side effects. Throws, invalid returns or
reentrant scheduling mutations disable it for that runtime, increment
stats().scheduling.policyErrors and restore built-in priority/FIFO. Capacity and
cancellation still belong to PJS.

## Asynchronous concurrency per worker (development)

`concurrency` is a positive safe integer, default one. It permits overlapping async
invocations within each isolate, not extra JavaScript CPU threads. Task modules and
their mutable globals must tolerate interleaving. A CPU loop blocks that worker's
other invocations until it yields/returns; resourceLimits apply to the entire isolate.

```ts
const io = new PjsRuntime({
  registry,
  workers: 1,
  concurrency: 2,
  maxQueue: 0,
});
await io.ready();
const responses = await Promise.all([
  io.run(fetchTask, firstUrl),
  io.run(fetchTask, secondUrl),
]);
```

A third ordinary call rejects when both slots are occupied with maxQueue:0. Queued
batches still cost one logical queue credit per partition and execute their members
sequentially in one physical slot. Range child windows use execution capacity;
stream count/byte limits still apply, and the default stream count remains worker
count. Raise maxBufferedResults explicitly when more overlap is useful.

Terminate-mode work and ordinary executionLease calls automatically require an
empty worker exclusively. A selected waiting exclusive job drains one worker by
stopping new shared posts there while existing work finishes; other workers can
continue. Cancelling that waiter restores sharing. With maxQueue:0, a new ordinary
exclusive call rejects if no empty compatible worker exists; accepted range parents
can wait through bounded lazy production. Ignored/never-ending existing work can
prevent draining indefinitely. Cooperation can target one shared invocation, without
automatic escalation. Forced shutdown can terminate every hosted invocation.

An unexpected worker exit fails every physical invocation on that thread, each with
its own retry/fallback eligibility, but consumes one worker restart decision.
Logical cancellation never frees an active slot before final response/confirmed exit.

## Progress notifications (development)

An optional third registration generic declares the application progress schema.
Ordinary interfaces need no index signature. Registration does not inspect the
export's signature or verify that schema at runtime.

```ts
// download-task.ts
import type { TaskContext } from '@pjavascript/runtime';
interface DownloadProgress {
  done: number;
  total: number;
}
export async function download(
  urls: string[],
  context: TaskContext<DownloadProgress>,
) {
  const values: string[] = [];
  for (const url of urls) {
    context.throwIfCancelled();
    values.push(await (await fetch(url, { signal: context.signal })).text());
    context.reportProgress({ done: values.length, total: urls.length });
  }
  return values;
}

// Host; register before constructing this runtime.
const downloads = registry.register<string[], string[], DownloadProgress>(
  'downloads',
  new URL('./download-task.js', import.meta.url),
  'download',
);
const runtime = new PjsRuntime({ registry, workers: 1, concurrency: 2 });
const values = await runtime.run(downloads, urls, {
  signal: controller.signal,
  cancellation: 'cooperative',
  onProgress(event) {
    console.log(event.attempt, event.value.done, event.value.total);
  },
});
```

Calls without onProgress or cooperative mode still invoke execute(input) with
exactly one argument. Either explicit opt-in supplies execute(input, context).
For progress-only settle/terminate calls, context.signal remains un-aborted and
throwIfCancelled is a no-op; reporting does not implicitly enable cooperation.
Contexts/reporters are invocation-local, including concurrent async work and batch
items. onProgress on a range receives child notifications, not an aggregate percent.

The unconstrained schema generic defaults to ProgressValue, but actual wire values
must be small JSON data: finite numbers, strings, booleans, null, dense arrays and
plain records. Binary/shared buffers, functions, accessors, cycles and class
instances are unsupported. The incremental encoder enforces 16 KiB UTF-8 and depth
16 before producing a large serialized copy. reportProgress returns false for an
unsupported/oversized value or a closed/unsubscribed reporter; it does not fail the
task. A declared type is not a guarantee that its runtime value is permitted.

Reporting is bounded and deliberately lossy: one in-flight frame and one coalesced
latest pending frame per physical execution, with bounded host callback delivery.
True means accepted for possible delivery, not delivered. Sequences increase within
one invocation with gaps; there is no guaranteed final 100% notification. Results
are authoritative. Events carry stable taskId, original taskName, fresh executionId,
physical correlationId, actual implementation name, attempt, sequence, workerId and
optional operationId/partitionIndex. Retries/fallback can repeat work and restart
sequence numbering; do not sum progress across attempts blindly.

No notification is delivered after its logical child/call settles, cancellation,
stream close or worker failure. Old attempt notifications cannot reach a successor.
Progress neither settles callers nor releases result credits. Observers must be cheap
and synchronous: a throw or returned Promise/thenable disables that logical observer
(the whole parent observer for a range), increments stats().progress.callbackErrors,
and leaves computation/recovery unchanged. Promise rejections are consumed, not
awaited. Callback work/retained values remain application-owned.

## Ordinary execution resilience (development)

These options are available in development source, not published RC4. They apply
to `run()`; all range forms also support per-partition recovery as described below.
Ordinary `run()` remains a single-task dispatch.

```ts
const result = await runtime.run(primaryTask, input, {
  signal,
  timeout: 5000,
  cancellation: 'terminate',
  repeatable: true,
  retry: { maxAttempts: 3, backoffMs: 100, on: ['worker-crash'] },
  fallback: { task: alternativeTask, on: ['worker-crash', 'task-error'] },
});
```

`cancellation` defaults to `'settle'`; `'terminate'` applies to abort and timeout.
Rejection still precedes confirmed worker exit. Intentional cancellation replaces
the worker without consuming its failure restart budget; module state/caches are lost.

`retry` and `fallback` require `repeatable: true`, checked before admission. This
asserts application safety after partial execution; PJS cannot guarantee exactly-once
side effects. `maxAttempts` is a positive safe integer including the initial primary
attempt. Fixed `backoffMs` defaults to zero (integer 0–2147483647); `on` defaults to
`['worker-crash']`. Other explicit causes are `'task-error'` and `'execution-lease'`.
Serialization, admission, protocol/bootstrap errors, cancellation, timeout and fatal
runtime failure never trigger recovery. Lease/crash replacements still use pool budgets.

Fallback is one different registered task from the same registry snapshot, defaulting
to `['task-error']` eligibility. It follows eligible primary retries, uses the same
input/output schema, and is never retried. It is algorithmic fallback inside the pool;
it cannot rescue total pool failure or execute a function on the host event loop.
One signal/deadline covers every attempt, backoff and replacement wait.

Recovery retains bounded slot/queue admission, so an accepted call can recover with
`workers: 1, maxQueue: 0`; new work rejects while the slot is reserved. Runnable FIFO
work takes precedence through slot/queue-credit exchanges. Backoff can leave reserved
capacity idle. Nonempty input transfer lists require explicit `rebuildInput` with
multiple attempts or fallback;
keep retained cloned/shared input unchanged through logical settlement. Use generic
`RunOptions<Input, Output>` for typed fallback/reconstruction option variables; legacy `RunOptions` annotations
and interface extensions remain usable without fallback. See
[lifecycle](lifecycle.md#recovery-and-shutdown) and [ownership](memory-ownership.md).

R1 development adds `run({ executionLease })`,
constructor `restartPolicy` and graceful `shutdown({ forceAfter })`.
These opt-in controls are not part of the immutable RC4 publication.
See [physical containment](lifecycle.md#experimental-physical-execution-leases-r1-development)
for units, unsupported range/batch combinations and recovery limits.

## Cooperative task cancellation (development)

Choose `cancellation: 'cooperative'` explicitly to pass a second task argument,
`TaskContext`. Without onProgress, settle/terminate modes retain exactly
execute(input), including argument count and rest-parameter behavior. Explicit
progress also supplies context, but only cooperative mode enables its cancellation
signal and polling. Registered handles declare input, output and optional progress
schemas without runtime application-schema validation.

```ts
import type { TaskContext } from '@pjavascript/runtime';
// Export from a registered task module.
export function count(input: number, context: TaskContext): number {
  let sum = 0;
  for (let n = 0; n < input; n++) {
    if (n % 1024 === 0) context.throwIfCancelled();
    sum += n;
  }
  return sum;
}
// Host: countTask was registered before constructing the runtime.
await runtime.run(countTask, 100_000_000, {
  signal: controller.signal,
  cancellation: 'cooperative',
  timeout: 2000,
});
```

`throwIfCancelled()` atomically polls shared cancellation state and throws AbortError.
For asynchronous work, pass `context.signal` to abortable APIs; catch/finally cleanup
must be awaited before the task returns. Checking only signal.aborted does not poll
shared state in a synchronous loop. Caller rejection still precedes physical completion.
Ignoring cooperation leaves the worker busy. There is no automatic grace-period
escalation; an ordinary executionLease or forced shutdown provides independent
containment. Parent abort/deadline, fail-fast cleanup and stream return/throw notify
active cooperative children and prevent later batch items from starting. Completion
preserves worker state/caches; it does not undo side effects.

## Reconstructing transferred recovery input (development)

`rebuildInput` is a synchronous callback after old physical completion/backoff and
worker admission, immediately before recovery posting. It returns
`{ input, transferList? }` for every selected retry or fallback. Initial input and
its transfer list stay explicit; no hidden backup copies or transfer reversal occur.

```ts
const prepare = () => {
  const bytes = immutableSource.slice(); // Explicit application-owned copy.
  return { input: bytes, transferList: [bytes.buffer] };
};
const first = prepare();
const result = await runtime.run(primaryTask, first.input, {
  transferList: first.transferList,
  repeatable: true,
  retry: { maxAttempts: 2 },
  fallback: { task: alternativeTask, on: ['worker-crash'] },
  rebuildInput: (next) => prepare(), // next: { attempt, implementation }.
  timeout: 5000,
});
```

Factory errors, promises, invalid/detached/duplicate/reserved buffers and serialization
failures are terminal. Factories run on the host: keep them cheap and retain stable
source data. No callback runs without a claimed worker or after terminal cancellation.
An abort from a factory/getter wins over later posting. Explicit repeatability still
covers effects of the original computation and the factory itself.

## Per-partition range recovery (development)

All four range methods, both map forms and all stream modes accept repeatable,
retry, fallback and rebuildInput options. Max attempts and fallback limits apply
**per logical partition**, not to a whole range or physical batch. Use generic
`PartitionOptions<Input, PartitionOutput>` and corresponding stream option types;
`TypedMapRangeOptions<Constructor, Input>` retains its existing constructor-first form.
Fallback accepts the original input and returns the original partition/block schema.

```ts
await runtime.partitionRange(primaryTask, range, createInput, {
  repeatable: true,
  retry: { maxAttempts: 3, backoffMs: 50, on: ['task-error', 'worker-crash'] },
  fallback: { task: alternativeTask },
  dispatchBatchSize: 4,
  timeout: 5000,
});
```

Confirmed successful partitions, collected map blocks and already-yielded values
never replay. A valid task-failure envelope confirms the later items were uninvoked;
they resume without consuming an attempt or rebuilding initial input. A worker crash
before that envelope makes all unresolved members ambiguous, even if some effects
already happened. The serialization-error path's skipped IDs are not safe evidence.
Recovery and skipped continuations dispatch singly; normal batching stays unchanged.

Range backoff retains its parent's bounded child window and stream count/full-byte
reservation, but releases worker capacity. Ready continuations rejoin the existing
producer after runnable FIFO work; this also works with workers:1/maxQueue:0. No
reserved-worker latency/starvation guarantee is added. Deferred records/replay inputs
can total operation capacity × per-parent window. Upper-bound credit refunds once
on successful deliverable output; retries/fallback preserve the original byte contract.
Map or binary contract mistakes are terminal, not task-error recovery causes.

For transferred inputs choose dispatchBatchSize:1 and provide
`rebuildInput: (partition, next) => preparePartition(partition)`. The original range
factory runs once per generated partition. Nonempty transfer lists remain forbidden
with configured batching >1, including singleton recovery. One parent signal/deadline
covers factories, all attempts, backoff and stream delivery. Cancellation/shutdown
prevents further recovery; there are still no range execution leases. Shared writes
and external effects must tolerate partial/repeated execution despite reconstruction.

## Choosing a range result

All four range APIs accept `cancellation: 'settle' | 'cooperative' | 'terminate'`, default `'settle'`.
In terminate mode parent abort/timeout, fail-fast sibling cancellation and stream
consumer close/throw stop that parent's active physical batches. Other operations
sharing the pool are unaffected. Cancellation during posting waits for successful
posting before containment; queued input transfers stay attached. Posted transfers
remain detached, shared side effects may be partial, and binary credits/worker
occupancy persist until validated completion or confirmed exit.

```ts
await runtime.parallelFor(task, range, createInput, {
  signal: controller.signal,
  timeout: 5000,
  cancellation: 'terminate',
  dispatchBatchSize: 2,
});
```

Use a half-open `{ start, end, grainSize }` range with safe integer endpoints and
positive grain. The synchronous factory runs on the host only as admission
becomes available. It receives a frozen `{ index, start, end }` descriptor and
returns `{ input, transferList? }`. Keep factories cheap. Do not launch async I/O
or return promises from them. Empty ranges succeed with an empty result or void.

```js
const range = { start: 0, end: data.length, grainSize: 4096 };
const factory = (partition) => ({ input: { partition, data } });
const partialSums = await runtime.partitionRange(sumTask, range, factory);
// Sum partialSums on the host if that is your application's reduction.

await runtime.parallelFor(writeTask, range, writeFactory);
const flat = await runtime.parallelMapRange(mapTask, range, factory, {
  outputConstructor: Float64Array,
});
for await (const { partition, output } of runtime.streamRange(
  sumTask,
  range,
  factory,
)) {
  console.log(partition.index, output);
}
```

These task-specific snippets are illustrated by the executable
[range-work](../../examples/range-work.mjs) and
[shared-input](../../examples/shared-input.mjs) recipes. Generic maps omit the
constructor and require ordinary array blocks. Typed maps require exactly the
selected built-in constructor. Each block has `partition.end - partition.start`
elements; mismatch rejects the whole operation with PjsMapContractError.

Range children use clone/transfer/shared inputs under the same ownership rules as
run. First failure fails the parent and cancels sibling callers; already running
work may finish. Collected/map partial outputs are not exposed. Streams can have
already delivered values; they discard undelivered buffered values on failure.
Use streaming when bounded incremental consumption matters, collection for a
small finite set of per-partition values, map for a flat element result, and
parallelFor for explicit side effects with no returned data.

Completion order is intentional. Use `partition.index`, start/end or application
metadata to restore logical order. Store at indexed offsets when you can afford
the output; an application reorder buffer has its own memory cost outside PJS.
The [binary recipe](../../examples/streaming-binary.mjs) demonstrates reconstruction.

## TypeScript and trusted tasks

### Explicit stream cleanup (B1 development)

Integrated development returns `PjsRangeStream<Output>` with required direct
`next()`, `return()` and `throw()`. `CountOnlyStreamRangeOptions` is also importable
from the root; it excludes all six strict byte spellings (three alias pairs). These type-only
exports are not in published RC4. Range streaming is promoted in development.

```ts
const stream = runtime.streamRange(task, range, createInput);
try {
  const item = await stream.next();
  if (!item.done) consume(item.value.partition, item.value.output);
} finally {
  await stream.return();
}
```

Creation is eager; dropping the reference does not cancel. A stream is its own
single-consumer iterator. `for await` break invokes cleanup, while a second read
that would install another pending waiter rejects without cancelling the first.
Explicit return clears delivery and synchronously cancels the parent, resolving
a pending read as done. Its fulfilled promise is not a physical-completion
barrier: posted work/byte reservations remain held until validated completion or
confirmed worker exit. Await runtime shutdown for final runtime cleanup.

Producer failure/abort/deadline is sticky for later reads even after return.
Consumer `throw(reason)` rejects itself and a pending read with the same normalized
Error and closes delivery; its supplied reason is not stored as producer failure.
Repeated close does not cancel again. See the [full protocol table](../research/v1-api-corrections.md)
for terminal throw and synchronous reason-conversion details.

### Task types

Use `registry.register<Input, Output>(...)` to describe the caller-visible payload
types, including when the worker returns `transfer(...)`. PJS infers outputs from
that handle; generics do not verify a separately loaded export or validate schemas.
Development exports the diagnostic type `PjsRuntimeStats` from the root (B4);
`ReturnType<PjsRuntime['stats']>` also describes the returned snapshot. These
diagnostics do not promise timing or performance bounds. Errors reject JavaScript
promises and need `instanceof` narrowing.

Tasks are trusted application code with Node's filesystem, network and process
capabilities. Workers are not a sandbox. No closure serialization, source eval,
arbitrary mutable-object sharing or compiler hook is supplied. Finish task-owned
asynchronous work before returning and do not use PJS's worker message port.
Shared-memory races and task side effects remain application responsibilities.
