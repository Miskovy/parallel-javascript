<div align="center">

<h1>PJS</h1>

<p><strong>Parallel JavaScript Runtime</strong></p>

<p>Explicit CPU parallelism. Persistent workers. Bounded work. Measurable behavior.</p>

<p>
  <a href="packages/runtime/package.json"><img src="https://img.shields.io/badge/Node.js-%E2%89%A522-339933?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Runtime: Node.js 22 or newer"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/TypeScript-7.0-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="Build compiler: TypeScript 7.0"></a>
  <a href="docs/architecture.md"><img src="https://img.shields.io/badge/status-v0.9%20binary%20result%20credits-0F766E?style=flat-square" alt="Status: v0.9 strict binary result credits"></a>
  <a href="packages/runtime/package.json"><img src="https://img.shields.io/badge/runtime_dependencies-0-0F766E?style=flat-square" alt="Zero runtime dependencies"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748B?style=flat-square" alt="License: MIT"></a>
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="#define-a-task">Task API</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/benchmarks-v0.9.md">Benchmarks</a> ·
  <a href="docs/toolchain.md">Toolchain choices</a>
</p>

</div>

---

PJS v0.9 is a small foundation for explicit CPU parallelism in Node.js: persistent workers, registered module tasks, bounded FIFO admission, explicit buffer transfers, reusable shared inputs, experimental runtime-owned range partitioning, bounded dispatch batching, completion-only parallel ranges, bounded completion-order result streams, strict binary result-byte credits, element-block mapping, host async-context association, task lifecycles, failure recovery, cancellation/deadlines, and real statistics. It builds with TypeScript 7 and has no runtime dependencies.

> **The programmer declares parallelizable work. PJS decides how accepted tasks use the available workers.**

The experimental `partitionRange()` operation owns lazy range division and ordered collection. `parallelFor()` discards successful values before worker result transport. `streamRange()` yields identified partition results incrementally under an independent logical-result bound. `parallelMapRange()` validates one element per numeric range index and assembles worker blocks into a flat ordered result. See the [range guide](docs/partitioning.md).

## What works today

| Capability                     | v0.9 behavior                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------- |
| **Persistent workers**         | A fixed, configurable population reused across tasks                             |
| **Explicit task registration** | Typed handles for local module exports; no closure serialization or eval         |
| **Bounded scheduling**         | FIFO admission with a finite queue and explicit overflow errors                  |
| **Failure recovery**           | Correlated errors, crash replacement, and a bounded restart budget               |
| **Cancellation and deadlines** | Queued work is removed; active caller settlement preserves worker occupancy      |
| **Observability**              | Task counts, queue/execution timings, worker state, and thread IDs               |
| **Reusable shared inputs**     | Explicit construction over native SAB backing with a read-only usage contract    |
| **Numeric range partitioning** | Lazy bounded children, explicit grain, ordered outputs and one parent deadline   |
| **Bounded dispatch batching**  | Experimental transfer-free grouping with separate logical/physical accounting    |
| **Completion-only ranges**     | Experimental parallel-for semantics without worker output transport or retention |
| **Bounded result streams**     | Experimental completion-order AsyncIterable with consumer backpressure           |
| **Binary result credits**      | Opt-in exact pre-admission byte reservations plus worker validation              |
| **Element-block mapping**      | Experimental flat generic/typed results with strict block cardinality            |
| **Result memory diagnostics**  | Visible queued buffer/view bytes plus unknown-result counts                      |
| **Host async context**         | One AsyncResource per range operation; worker stores are not implicitly copied   |
| **Graceful shutdown**          | Close admission, drain accepted work, and release workers                        |

## Quick start

The runtime targets Node.js 22 or newer. Repository development tools require Node.js 22.13+ or 24+. v0.9 was tested on Node.js 24.21.0 on Windows; v0.5 was tested on Node.js 24.13.1 on Linux. Other supported Node versions/platforms still need CI coverage.

```sh
npm ci
npm test
npm run example
```

In PowerShell environments that block `npm.ps1`, use `npm.cmd`.

## Define a task

Tasks are ordinary exported functions in local modules. Compile TypeScript task modules to JavaScript before registering them. PJS does not serialize closures or load compiler hooks.

```ts
// square.ts → square.js
export function square(value: number): number {
  return value * value;
}
```

```ts
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const square = registry.register<number, number>(
  'square',
  new URL('./square.js', import.meta.url),
  'square',
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 100 });

try {
  await runtime.ready();
  const result = await runtime.run(square, 12, { timeout: 5_000 });
  console.log(result, runtime.stats());
} finally {
  await runtime.shutdown();
}
```

The tiny square example illustrates the contract; it is too small to benefit from workers. Try the [prime search example](examples/prime-search.mjs) for actual CPU work. Ordinary asynchronous database, network, and filesystem operations should generally stay on Node's event loop. Workers target CPU-intensive JavaScript. See the [Node worker documentation](https://nodejs.org/api/worker_threads.html).

## Configure the runtime

| Option                     | Default and meaning                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `registry`                 | Required; snapshotted at construction, imports validated during startup                   |
| `workers`                  | `availableParallelism()`, clamped to configured min/max                                   |
| `minWorkers`, `maxWorkers` | Bounds on the fixed population selected at construction; no elasticity yet                |
| `maxQueue`                 | 1024 waiting tasks; executing tasks do not consume queue capacity                         |
| `startupTimeout`           | 30,000 ms per worker, including replacements                                              |
| `maxRestarts`              | `4 * workers` replacements over the runtime lifetime; bootstrap failures fail immediately |

`run()` may be called during startup; those submissions consume queue capacity. With `maxQueue: 0`, await readiness and submit only to idle capacity. Admission errors reject the returned promise. Invalid constructor options throw synchronously.

### Cancellation, deadlines, and shutdown

`run(task, input, { signal, timeout })` uses an end-to-end deadline, including startup and queue time. Cancellation and timeout remove queued tasks immediately.

**An active task continues occupying its worker until it returns or crashes.** Its eventual output is discarded. Cancellation does not undo side effects or preempt CPU code.

`shutdown()` waits for these executions too, and can wait indefinitely for uncooperative code. Choose `shutdown({ drain: false })` initially when terminating active work is intended. The first shutdown call fixes the mode; subsequent calls return the same promise. See [ADR 0004](docs/adr/0004-cancellation-and-deadlines.md) for the reasoning.

### Transfer buffers explicitly

Move input backing buffers at dispatch:

```ts
const values = new Float64Array([1, 2, 3]);
const result = await runtime.run(double, values, {
  transferList: [values.buffer],
});
// values is detached after dispatch; use result for the returned data.
```

To move output buffers back, the registered task returns a transfer envelope. The caller receives the value inside it:

```ts
import { transfer } from '@pjs/runtime';

export function double(values: Float64Array<ArrayBuffer>) {
  for (let i = 0; i < values.length; i++) values[i] *= 2;
  return transfer(values, [values.buffer]);
}
```

Run the complete example with `npm run example:transfer`. Register its handle with the input/output payload types, not the envelope type.

**Transfer detaches every sender-side view of the entire backing ArrayBuffer.** A queued task retains the caller's buffer until dispatch; rejection or queued cancellation leaves it attached. Once dispatched, cancellation, task failure, or a worker crash cannot restore ownership. Pending transfers reserve their buffers against another transfer through this library instance. See [the ownership ADR](docs/adr/0005-transfer-ownership.md).

### Memory and task ownership

Payloads use structured clone by default. Do not mutate, resize, or externally transfer queued inputs before settlement. Only explicitly listed ArrayBuffers are moved. Lists are snapshotted and validated; detached, duplicate, shared, or Node-marked untransferable buffers are rejected with `PjsSerializationError`. Put the listed buffers in the payload: a list alone does not make them reachable by the receiver. Use dedicated buffers; transferring a subview moves its entire backing buffer, including bytes outside the view.

`SharedArrayBuffer` retains Node's shared-memory semantics and cannot be placed in a transfer list. Use `sharedReadonly(view)` to copy a supported numeric view once into compact shared backing storage. Read-only is a usage contract, not enforced protection: tasks and aliases can still mutate native views. Never mutate published shared input, including after cancellation while a worker may still read it. Lifetime is managed by GC; `maxQueue` does not bound shared bytes. See [clone, transfer and shared memory](docs/memory.md) for types, examples, failure semantics and Atomics. Message-port transfers remain deferred. Task modules are trusted application code, must finish all their work before returning, and must not manipulate PJS's worker message port. Module globals persist independently in each worker. Generic task types are a caller assertion about the export; PJS does not generate or validate input/output schemas.

### Reuse large read-only input

```ts
import { sharedReadonly } from '@pjs/runtime';

const referenceData = sharedReadonly(new Float64Array([1, 2, 3]));
const results = await Promise.all([
  runtime.run(compute, { referenceData, from: 0, to: 1 }),
  runtime.run(compute, { referenceData, from: 1, to: 3 }),
]);
// Both workers read the same backing bytes; referenceData remains reusable.
```

Initialize before dispatch, then never write through any alias. Native views
remain writable: this contract is not a sandbox or enforced immutability.
The helper copies once; passing the resulting view again does not copy its
backing bytes. Prefer private result buffers for each task. See the
[memory guide](docs/memory.md) for supported types, lifetime and tradeoffs.

### Runtime-owned ranges (experimental)

```ts
const chunks = await runtime.partitionRange(
  rangeTask,
  { start: 0, end: referenceData.length, grainSize: 10_000 },
  (partition) => ({ input: { partition, data: referenceData } }),
  { timeout: 5_000, experimentalDispatchBatchSize: 4 },
);
```

Register `rangeTask` as a normal module task accepting this payload. The factory runs lazily on the host; outputs retain logical chunk order. The experimental batch option groups up to 4 transfer-free logical children into one worker message; it does not change grain, ordering, logical metrics, or the queue's logical admission bound. Keep batch size 1 for input transfers. Graceful shutdown finishes entire accepted ranges. Collected output bytes are not bounded by `maxQueue`. See the [complete lifecycle and batching contract](docs/partitioning.md).

For work whose result is visible through disjoint shared output or another
intentional side effect, avoid collecting values:

```ts
await runtime.parallelFor(
  transformTask,
  { start: 0, end: output.length, grainSize: 10_000 },
  (partition) => ({ input: { partition, input, output } }),
  { experimentalDispatchBatchSize: 4 },
);
```

`parallelFor()` returns `Promise<void>`. Worker values are allowed for task
reuse but are ignored before output serialization, so completion-oriented tasks
should return `void`. Shared output remains natively writable: use disjoint
regions or explicit synchronization. Cancellation and failure do not roll back
completed writes. This API is for CPU work, not ordinary asynchronous I/O.

For one output element per numeric range index, return one block per partition:

```ts
const output = await runtime.parallelMapRange(
  transformBlock,
  { start: 0, end: input.length, grainSize: 10_000 },
  (partition) => ({ input: { partition, input } }),
  {
    experimentalDispatchBatchSize: 4,
    experimentalOutputConstructor: Float64Array,
  },
);
```

Each typed block must be a `Float64Array` of exactly
`partition.end - partition.start` elements. Generic mode omits the constructor
and requires ordinary arrays. The final result is flat and ordered by element,
not by worker completion. A mismatch fails the entire operation.

When values are needed incrementally, use the bounded completion-order stream:

```ts
for await (const { partition, output } of runtime.streamRange(
  transformTask,
  { start: 0, end: input.length, grainSize: 10_000 },
  (partition) => ({ input: { partition, input } }),
  {
    experimentalDispatchBatchSize: 4,
    experimentalMaxBufferedResults: 8,
  },
)) {
  consume(partition, output);
}
```

The result bound counts buffered plus admitted-unsettled logical results, not
bytes. Direct buffer/view outputs also contribute diagnostic visible-byte
metrics; objects and scalars count as unknown, and neither field is a hard
memory bound. `break` cancels remaining work. Producer failure leaves
already-yielded values observable. Stream timeouts and graceful shutdown
include consumer delivery time.

For direct owned binary results whose exact size is known before dispatch, add
the strict v0.9 byte contract:

```ts
for await (const { output } of runtime.streamRange(
  binaryTask,
  { start: 0, end: blocks.length, grainSize: 1 },
  (partition) => ({ input: { partition, blocks } }),
  {
    experimentalMaxBufferedResults: 8,
    experimentalResultBytes: (partition) => blocks[partition.index].byteLength,
    experimentalMaxReservedResultBytes: 4 * 1024 * 1024,
  },
)) {
  await consume(output);
}
```

Both byte options are required together. The declaration is exact, not an
upper bound. Workers accept only a live direct `ArrayBuffer` or an
ArrayBuffer-backed typed array, Buffer, or DataView with the declared visible
`byteLength`. Nested graphs and shared backing do not qualify. Count and byte
credits both apply; credit lasts until yield, or until a cancelled running
execution actually ends. The capacity bounds declared result payloads, not
RSS, worker allocations, transport temporaries, inputs, or values retained by
the consumer.

### Statistics

`stats()` returns copied snapshots, accepted/rejected and terminal task counts, active task timestamps, queue occupancy, worker/thread IDs, crash/restart counts, and sampled latency means. It also reports parent operation outcomes, map block/element/assembly totals, stream result counts/buffer occupancy and observable payload bytes, generated/admitted child counts, and separate physical dispatch-message counts; `tasks.*` remains logical. It retains no completed-task history. See [metric definitions and lifecycle details](docs/architecture.md).

## Measure before optimizing

```sh
npm run benchmark:cpu
npm run benchmark:matrix
npm run benchmark:transfer
npm run benchmark:shared
npm run benchmark:matrix:shared
npm run benchmark:piscina
npm run benchmark:dispatch
npm run benchmark:completion
npm run benchmark:stream
npm run benchmark:map
npm run benchmark:binary
```

The [benchmark methodology](benchmarks/README.md) separates startup from warm-pool execution and retains every sample. Small workloads can be slower under PJS, and more workers do not guarantee linear scaling.

The [v0.9 report](docs/benchmarks-v0.9.md) evaluates strict binary result credits, count-versus-byte capacity, realistic fast/slow consumers, fairness, v0.8 regression controls, and an application-managed Piscina equivalent. The [v0.8 report](docs/benchmarks-v0.8.md) and all earlier evidence remain preserved.

The [v0.3 report](docs/benchmarks-v0.3.md) compares clone, transfer and reusable shared input, including a pinned Piscina baseline. The [v0.2 measurement report](docs/benchmarks-v0.2.md) compares clone and transfer paths, including matrix input preparation. The [v0.1 baseline](docs/benchmarks-v0.1.md) and its raw JSON remain preserved. Neither compiler nor runtime speedups are assumed.

PJS does not claim to outperform Piscina.

## Development

| Command                    | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `npm run build`            | Compile the runtime and emit declarations               |
| `npm test`                 | Build and run the correctness suite                     |
| `npm run test:stress`      | Repeat all correctness tests ten times                  |
| `npm run test:types`       | Check public API declarations with TypeScript 7         |
| `npm run typecheck:compat` | Check runtime source with the TypeScript 6 API compiler |
| `npm run lint`             | Check TypeScript and JavaScript with ESLint             |
| `npm run format:check`     | Verify formatting with Prettier                         |
| `npm run format`           | Apply formatting                                        |

All dependencies are development tools or benchmark baselines (Piscina is pinned to 5.3.2). The runtime itself has **zero external dependencies**. TypeScript 7 supplies the build compiler; a TypeScript 6 compatibility API keeps ESLint working. See [toolchain choices](docs/toolchain.md) for the aliases, commands, and exact locked versions.

## Design notes and roadmap

- [Architecture](docs/architecture.md): ownership, lifecycle, protocol, failure handling, and metrics.
- [Architecture decisions](docs/adr/0001-task-registration.md): registration, pool model, scheduler, and cancellation.
- [Runtime research](docs/research/runtime-landscape.md): existing systems and concepts worth investigating.

The next milestone should be selected from the [v0.9 measurements](docs/benchmarks-v0.9.md). Reduce, ordered streaming, cooperative cancellation, worker-context propagation, global byte pools, and scheduling changes remain design work; v0.9 stabilizes none of them.

Framework integrations, compiler transforms, custom syntax, browser support, and advanced schedulers are outside v0.9.

## License

Licensed under [MIT](LICENSE).
