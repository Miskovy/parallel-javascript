<div align="center">

<h1>PJS</h1>

<p><strong>Parallel JavaScript Runtime</strong></p>

<p>Explicit CPU parallelism. Persistent workers. Bounded work. Measurable behavior.</p>

<p>
  <a href="packages/runtime/package.json"><img src="https://img.shields.io/badge/Node.js-%E2%89%A522-339933?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Runtime: Node.js 22 or newer"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/TypeScript-7.0-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="Build compiler: TypeScript 7.0"></a>
  <a href="docs/architecture.md"><img src="https://img.shields.io/badge/status-v0.2%20foundation-0F766E?style=flat-square" alt="Status: v0.2 foundation"></a>
  <a href="packages/runtime/package.json"><img src="https://img.shields.io/badge/runtime_dependencies-0-0F766E?style=flat-square" alt="Zero runtime dependencies"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748B?style=flat-square" alt="License: MIT"></a>
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="#define-a-task">Task API</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/benchmarks-v0.2.md">Benchmarks</a> ·
  <a href="docs/toolchain.md">Toolchain choices</a>
</p>

</div>

---

PJS v0.2 is a small foundation for explicit CPU parallelism in Node.js: persistent workers, registered module tasks, bounded FIFO admission, explicit buffer transfers, task lifecycles, failure recovery, cancellation/deadlines, and real statistics. It builds with TypeScript 7 and has no runtime dependencies.

> **The programmer declares parallelizable work. PJS decides how accepted tasks use the available workers.**

Higher-level partitioning and parallel algorithms are future work; benchmark examples currently partition their own workloads.

## What works today

| Capability                     | v0.2 behavior                                                               |
| ------------------------------ | --------------------------------------------------------------------------- |
| **Persistent workers**         | A fixed, configurable population reused across tasks                        |
| **Explicit task registration** | Typed handles for local module exports; no closure serialization or eval    |
| **Bounded scheduling**         | FIFO admission with a finite queue and explicit overflow errors             |
| **Failure recovery**           | Correlated errors, crash replacement, and a bounded restart budget          |
| **Cancellation and deadlines** | Queued work is removed; active caller settlement preserves worker occupancy |
| **Observability**              | Task counts, queue/execution timings, worker state, and thread IDs          |
| **Graceful shutdown**          | Close admission, drain accepted work, and release workers                   |

## Quick start

The runtime targets Node.js 22 or newer. Repository development tools require Node.js 22.13+ or 24+. This iteration was tested on Node.js 24.21.0 on Windows. Other supported Node versions/platforms still need CI coverage.

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

`SharedArrayBuffer` retains Node's shared-memory semantics, with synchronization left to the caller; it cannot be placed in a transfer list. Message-port transfers and shared-memory helpers are deferred. Task modules are trusted application code, must finish all their work before returning, and must not manipulate PJS's worker message port. Module globals persist independently in each worker. Generic task types are a caller assertion about the export; v0.2 does not generate or validate input/output schemas.

### Statistics

`stats()` returns copied snapshots, accepted/rejected and terminal task counts, active task timestamps, queue occupancy, worker/thread IDs, crash/restart counts, and sampled latency means. It retains no completed-task history. See [metric definitions and lifecycle details](docs/architecture.md).

## Measure before optimizing

```sh
npm run benchmark:cpu
npm run benchmark:matrix
npm run benchmark:transfer
```

The [benchmark methodology](benchmarks/README.md) separates startup from warm-pool execution and retains every sample. Small workloads can be slower under PJS, and more workers do not guarantee linear scaling.

The [v0.2 measurement report](docs/benchmarks-v0.2.md) compares clone and transfer paths, including matrix input preparation. The [v0.1 baseline](docs/benchmarks-v0.1.md) and its raw JSON remain preserved. Neither compiler nor runtime speedups are assumed.

PJS does not claim to outperform Piscina.

## Development

| Command                    | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `npm run build`            | Compile the runtime and emit declarations               |
| `npm test`                 | Build and run the correctness suite                     |
| `npm run test:stress`      | Repeat all runtime and transfer tests five times        |
| `npm run test:types`       | Check public API declarations with TypeScript 7         |
| `npm run typecheck:compat` | Check runtime source with the TypeScript 6 API compiler |
| `npm run lint`             | Check TypeScript and JavaScript with ESLint             |
| `npm run format:check`     | Verify formatting with Prettier                         |
| `npm run format`           | Apply formatting                                        |

All dependencies are development tools. The runtime itself has **zero external dependencies**. TypeScript 7 supplies the build compiler; a TypeScript 6 compatibility API keeps ESLint working. See [toolchain choices](docs/toolchain.md) for the aliases, commands, and exact locked versions.

## Design notes and roadmap

- [Architecture](docs/architecture.md): ownership, lifecycle, protocol, failure handling, and metrics.
- [Architecture decisions](docs/adr/0001-task-registration.md): registration, pool model, scheduler, and cancellation.
- [Runtime research](docs/research/runtime-landscape.md): existing systems and concepts worth investigating.

The roadmap is measurement-driven: reusable read-only shared inputs, runtime-owned partitioning, structured parallel algorithms, cooperative cancellation, then evidence-backed scheduling improvements.

Framework integrations, compiler transforms, custom syntax, browser support, and advanced schedulers are outside v0.2.

## License

Licensed under [MIT](LICENSE).
