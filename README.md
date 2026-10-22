# PJS — Parallel JavaScript Runtime

[![npm prerelease](https://img.shields.io/npm/v/%40pjavascript%2Fruntime/next)](https://www.npmjs.com/package/@pjavascript/runtime)

PJS runs explicitly registered CPU work in persistent Node workers, with bounded
admission and explicit memory ownership. Your application keeps its event loop
for I/O; PJS provides a separate compute plane. There are no runtime dependencies.

**As checked on 22 October 2026, [v1.0.0-rc.4](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
is the published prerelease; npm `next` and `latest` both select it.**
See the [registry metadata](https://registry.npmjs.org/@pjavascript%2fruntime).
Final v1.0.0 has not been released. Development source contains later R1/R2/R3
work and local S1; unchanged version fields do not make it the published artifact.
Historical [RC readiness](docs/research/v1-rc1-readiness.md) and the immutable
v0.15.0 release remain available.
[API stability](docs/stability.md) distinguishes core candidates, supported
ownership helpers, experimental range APIs and diagnostic statistics.

RC2 established the permanent package identity. [RC4](docs/release-v1.0.0-rc.4.md)
published the R1A runtime qualified in RC3 and corrected the release tooling that
had blocked RC3's npm publication. Later development containment additions are
absent from that artifact. The [Stage A decision package](docs/research/v1-api-contract-inventory.md)
proposes v1 corrections and promotion gates; those decisions and future names
remain pending review and implementation.

## Install

Install the current prerelease from the [public npm package](https://www.npmjs.com/package/@pjavascript/runtime):

```sh
npm install @pjavascript/runtime@next
```

Use `@next` deliberately until stable v1.0.0 exists; RC4 is a prerelease.
Manifests declare Node `^22.13.0 || ^24.0.0`. Recent S1 evidence covers exact
22.13.0 and 24.21.0 on Linux/Windows x64; it does not prove the 24.0.0 floor.
See the [proposed floor/current-patch qualification policy](docs/stability.md#proposed-node-and-platform-policy).
macOS and ARM64 remain unclaimed. TypeScript tasks must be compiled to JavaScript
first. PJS is ESM; no CommonJS/browser/bundler/loader support is promised.

## Thirty-second example

Create `tasks.mjs`:

```js
export function square(value) {
  return value * value;
}
```

Create `basic-run.mjs`:

```js
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  new URL('./tasks.mjs', import.meta.url),
  'square',
);
const runtime = new PjsRuntime({ registry, workers: 1 });

try {
  await runtime.ready();
  console.log(await runtime.run(square, 12)); // 144
} finally {
  await runtime.shutdown();
}
```

Run `node basic-run.mjs`. The repository version is
[executable and package-tested](examples/basic-run.mjs), or use
`npm run example:basic` from the checkout. Squaring a number teaches the contract;
it is too small to benefit from workers.

## How it works

```text
Node application
  ├─ event loop / asynchronous I/O
  └─ PJS: bounded admission → fixed worker pool → registered module tasks
```

Register trusted local file exports before creating the runtime. Each worker
imports those modules and keeps its own globals. PJS does not serialize closures,
eval source strings, infer parallel safety or replace Node's event loop. Task
handle types describe your declared schema; they cannot verify the loaded export.

## Choose an API

| API                       | Use it for                                                                 | Status                    |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| run                       | One explicit task, one promise                                             | Core candidate            |
| ready / shutdown          | Startup and resource lifetime                                              | Core candidates           |
| partitionRange            | Lazy numeric partitions, ordered per-partition outputs                     | Experimental              |
| parallelFor               | Completion-only ranges and deliberate side effects                         | Experimental              |
| parallelMapRange          | Flat ordered element output from validated array/typed blocks              | Experimental              |
| streamRange               | Incremental completion-order results with count/optional byte backpressure | Experimental              |
| transfer / sharedReadonly | Explicit moved buffers / reusable shared input                             | Specialized but supported |
| stats                     | Copied state and cumulative diagnostic counters                            | Diagnostic surface        |

See the [core API guide](docs/guide/core-api.md) for contracts and options.
Streams carry partition metadata so your application can reconstruct logical
order; PJS does not promise ordered stream delivery.

## Ownership, backpressure and cancellation

Clone is the default: easy separation with copying/transport cost. `transferList`
moves input ArrayBuffers at dispatch and detaches every sender view; failures or
cancellation after dispatch cannot restore ownership. `sharedReadonly` makes one
copy into native SharedArrayBuffer backing; readonly is a contract, not freezing.
See [memory ownership](docs/guide/memory-ownership.md).

`maxQueue` bounds waiting logical tasks and rejects overflow with PjsQueueFullError.
**A deeper queue is not more CPU capacity.** Streams separately limit result count
and optionally reserve exact or maximum visible binary bytes. Upper-bound success
refunds slack on arrival; actual credit lasts until yield. **Result credits do not
bound RSS, worker allocations, inputs or consumer-retained values.** See
[backpressure](docs/guide/backpressure.md).

**Cancellation/timeout can settle a caller while its worker is still busy.** There
is no rollback. run timeouts include remaining startup and queue wait; stream
timeouts also include consumer delivery. A crash fails affected work and may
replace the worker without retrying the task. Omitted physical leases preserve
unbounded execution. The experimental R1 development API adds exclusive
`run({ executionLease })`, `restartPolicy`, and graceful `shutdown({ forceAfter })`;
these are not in the already-published RC4 artifact. Leases initiate asynchronous
containment and retain occupancy until valid completion or confirmed exit.
Shutdown still drains indefinitely when escalation is omitted. See
[lifecycle](docs/guide/lifecycle.md) and [errors](docs/guide/errors.md).

## When PJS helps — and when it does not

Coarse CPU work can amortize worker overhead; tiny transforms usually cannot.
Ordinary async I/O, cheap native calls and workloads already served well by native
async APIs should generally stay there. Independent-block processing does not
preserve one continuous compression context.

Choose workers as a resource policy. availableParallelism() is a default input,
not a universal optimum: physical cores, SMT, native threads, application headroom
and memory matter. More workers can improve throughput while hurting timer or
filesystem latency. Measure your workload's crossover, transport and surrounding
application rather than relying on a universal size threshold. The
[performance guide](docs/guide/performance.md) uses retained Windows/Fedora
[v0.13](docs/cross-platform-v0.13.md) and [v0.14](docs/cross-platform-v0.14.md)
evidence without general speedup claims.

## The Science of PJS

[The Science of PJS](science/README.md) teaches concurrency, Node execution, and
the cost of parallelism from first principles, using the runtime and its retained
experiments as a case study. Later topics include scheduling, memory, and
backpressure; you do not need PJS to learn from the material.

## Examples and reference

- [Basic run](examples/basic-run.mjs): registration, execution, shutdown.
- [Range work](examples/range-work.mjs): typed map, completion-only shared output,
  and a synchronous native compute task.
- [Shared input](examples/shared-input.mjs): immutable reusable numeric backing.
- [Binary streaming](examples/streaming-binary.mjs): exact/maximum declarations,
  refunds and application-owned reconstruction.
- [Cancellation](examples/cancellation.mjs): caller settlement versus occupancy.
- [Transfer](examples/transfer.mjs): move and return dedicated backing buffers.

[Statistics and glossary](docs/guide/telemetry.md) ·
[Architecture](docs/architecture.md) · [Full inventory](docs/research/v0.15-public-api-inventory.md) ·
[1.0 readiness](docs/research/v0.15-v1-readiness.md) ·
[Stabilization report](docs/research/v0.15-stabilization.md)

## Development and validation

### Local package evaluation

From a checkout, build and pack a local artifact:

```sh
npm ci
npm run build
npm pack --workspace @pjavascript/runtime --pack-destination /tmp
```

Then install that artifact in your ESM application:

```sh
npm install /tmp/pjavascript-runtime-1.0.0-rc.4.tgz
```

Replace `/tmp` with an absolute temporary directory on your system (for example
`$env:TEMP` in PowerShell). Use npm.cmd if your PowerShell policy blocks npm.ps1.

### Validation

```sh
npm test
npm run test:contracts
npm run test:types
npm run typecheck:compat
npm run lint
npm run format:check
npm run test:docs
npm run test:package
```

The package gate packs and installs outside the repository, tests workers/errors,
compiles and runs a TypeScript consumer, and executes the examples. test:contracts
records individual-test totals even when the local --test runner reports file
summaries. Historical research lives under docs and benchmarks; production code
imports none of the workload harnesses. See [toolchain](docs/toolchain.md) and the
[benchmark methodology](benchmarks/README.md) for their separate purposes.

## Contributing and community

Start with the [contributor guide](CONTRIBUTING.md) for setup, validation, and
runtime/API change expectations. See [support](SUPPORT.md) for questions and issue
reporting, the [Code of Conduct](CODE_OF_CONDUCT.md) for community expectations,
and the [security policy](SECURITY.md) for private vulnerability reporting.

Maintainers: see [releasing](docs/releasing.md) for trusted npm publication.

MIT licensed. RC2 is published as a prerelease; final v1.0.0 has not been released.
