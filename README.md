<p align="center">
  <img src="static/pjs-logo-square-1280x1280.png" width="200" height="200" alt="PJS logo: green circuit and hexagon mark">
</p>

**Release status:** Published RC5 is the transition prerelease. This checkout prepares an unpublished 1.0.0 candidate with proposed C4 alias removal; policy and stable-release approval remain pending.

<h1 align="center">PJS</h1>

<p align="center"><strong>Parallel JavaScript Runtime</strong></p>

<p align="center">
  Explicit CPU tasks on persistent Node workers, with bounded admission and explicit memory ownership.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pjavascript/runtime"><img src="https://img.shields.io/npm/v/%40pjavascript%2Fruntime/next" alt="npm next prerelease"></a>
  <a href="https://github.com/Miskovy/parallel-javascript/actions/workflows/ci.yml"><img src="https://github.com/Miskovy/parallel-javascript/actions/workflows/ci.yml/badge.svg?branch=main" alt="Runtime and installed package CI on main"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="#examples">Examples</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

PJS runs registered, trusted module exports in a fixed pool of Node workers.
Your application's event loop stays available for I/O. Coarse CPU work can
amortize worker and transport costs; tiny transforms and ordinary asynchronous
I/O usually belong on the host. There are no production dependencies.

Development builds also execute tasks in dedicated browser module workers through
the explicit `@pjavascript/runtime/browser` entry. See the
[browser deployment guide](docs/guide/browser.md) for native modules, Vite assets,
capability requirements and endpoint-retirement guarantees. Published RC5 already includes this browser entry.

**Published prerelease: [1.0.0-rc.5](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.5).**
On 29 October 2026, npm `next` selects RC5 and `latest` still selects RC4.
Final 1.0.0 is unpublished. RC5 accepts all six deprecated aliases.

**Prepared candidate: 1.0.0.** It proposes rejecting all six legacy properties,
including inherited and explicit undefined presence. Use the stable spellings in
the [migration notes](docs/release-v1.0.0.md). Direct removal at 1.0.0 needs the
documented maintainer policy amendment; passing CI does not accept that decision
or resolve stable-release holds. See the [checkpoint](docs/research/v1-release-checkpoint.md).

## Quickstart

```sh
npm install @pjavascript/runtime@next
```

PJS ships ESM and supports synchronous CommonJS `require` through the same Node graph.
RC5 and this candidate support Node **22.23.4+, 24.22.1+, or 26.12.1+**
within those majors (`^22.23.4 || ^24.22.1 || ^26.12.1`). Stay on current patched
releases; updating PJS does not upgrade your Node executable. Consult the
[support policy and exact evidence](docs/stability.md#proposed-node-and-platform-policy).
The [24.0.0 floor report](docs/research/node24-floor-qualification.md) is historical;
it does not establish the new minimums or change published RC4.
macOS and ARM64 remain unclaimed. Compile TypeScript tasks to JavaScript before
registration.

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

Run `node basic-run.mjs`. This complete example works with published RC4 and is
[package-tested](examples/basic-run.mjs). From a checkout, use `npm run example:basic`.
Squaring one number teaches the contract; it is too small to benefit from workers.

CommonJS applications can use the same root exports in development builds:

```js
const { PjsRuntime, PjsTaskRegistry } = require('@pjavascript/runtime');
```

See the [complete CommonJS registration/execution example](docs/guide/core-api.md#commonjs-consumption-development).
It keeps one ESM implementation and declaration graph; no application conversion
or dynamic-import wrapper is required. Task modules can use ESM or CommonJS.

## Choose an API

| API                           | Use it for                                                    | Status                        |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------- |
| `run`                         | One explicit task, one promise                                | Core candidate                |
| `ready` / `shutdown`          | Startup and resource lifetime                                 | Core candidates               |
| `partitionRange`              | Ordered, retained per-partition results                       | Promoted in development       |
| `parallelFor`                 | Completion-only ranges and deliberate side effects            | Promoted in development       |
| `parallelMapRange`            | Flat ordered array or typed-array output                      | Promoted in development       |
| `streamRange`                 | Completion-order results under count and optional byte limits | Promoted in development       |
| `transfer` / `sharedReadonly` | Moved buffers or reusable shared input                        | Specialized supported helpers |
| `stats`                       | Copied state and cumulative counters                          | Diagnostic surface            |

Register tasks before creating the runtime. Each worker imports those local file
exports and keeps its own globals. PJS does not serialize closures or infer
parallel safety. Worker isolates are not a sandbox for untrusted code.
See the [core API guide](docs/guide/core-api.md) for contracts and options.

## Development status

The published RC5 includes the integrated runtime, recovery, scheduling, progress,
CommonJS and browser contracts. This candidate changes six alias acceptance paths,
their option declarations, migration consumers, version metadata and release freeze.
Execution and ownership keep their existing owners. A focused dispatcher correction
lets queued exclusive work use an idle replacement instead of an obsolete busy-worker
pin, as found by the required extended R2 profile. The remaining
`@experimental` annotation on the internal array-map adapter overload is retained
and explicitly classified in the [stable contract](docs/release-v1.0.0.md).
See [stability](docs/stability.md) and the [current inventory](docs/research/v1-api-contract-inventory.md).

## Ownership, cancellation and backpressure

Clone is the default. `transferList` moves input ArrayBuffers at dispatch and
detaches every sender view; cancellation cannot restore them. `sharedReadonly`
copies visible numeric bytes into reusable shared backing; immutability is an
application contract. See [memory ownership](docs/guide/memory-ownership.md).

`maxQueue` bounds waiting logical tasks. Streams separately limit buffered result
count and optionally reserve exact or maximum visible binary bytes. **Result
credits do not bound RSS, worker allocations, inputs or consumer-retained values.**
See [backpressure](docs/guide/backpressure.md).

Cancellation or timeout can settle a caller while its worker stays busy. There
is no retry by default or rollback. Eligible opt-in retries and registered-task
fallback require `repeatable: true` and preserve confirmed successes. Node's exclusive
`run({ executionLease })`, rolling `restartPolicy` and graceful
`shutdown({ forceAfter })` initiate asynchronous containment; physical ownership
lasts until valid completion or confirmed exit. Without escalation, graceful
shutdown can wait indefinitely. Browser containment/shutdown uses posting-safe local
endpoint retirement, without native join or shared-backing quiescence proof, and
permits recovery only after validated task errors or genuinely skipped work. See
[lifecycle](docs/guide/lifecycle.md), [browser ownership](docs/guide/browser.md#retirement-and-memory-ownership) and
[errors](docs/guide/errors.md).

## Examples

These recipes run against the packed development artifact; the quickstart above
also works with the published package.

- [Basic run](examples/basic-run.mjs): registration, execution and awaited shutdown.
- [Range work](examples/range-work.mjs): typed maps, shared output and native compute.
- [Shared input](examples/shared-input.mjs): reusable numeric backing.
- [Binary streaming](examples/streaming-binary.mjs): exact/maximum credits and reconstruction.
- [Cancellation](examples/cancellation.mjs): caller settlement versus occupancy.
- [Transfer](examples/transfer.mjs): move and return dedicated buffers.

## Documentation

The [documentation index](docs/README.md) connects the guides, release scope and
engineering records. Start with [API selection](docs/guide/core-api.md),
[diagnostics](docs/guide/telemetry.md) or [performance](docs/guide/performance.md).
Measure worker count, grain size, transport and application headroom for your
workload; more workers or a deeper queue is not always better.

[The Science of PJS](science/README.md) teaches concurrency and the cost of
parallelism from first principles using retained experiments. Historical
[benchmarks](benchmarks/README.md) keep their original versions and limitations.

## Development and community

```sh
npm ci
npm run build
npm run example:basic
npm run test:docs
```

Use [CONTRIBUTING](CONTRIBUTING.md) for the full validation matrix and
[toolchain](docs/toolchain.md) for compiler and release-CLI setup. The package
gate installs a fresh tarball outside the checkout and tests JavaScript,
both TypeScript consumers and all six examples.

[Support](SUPPORT.md) · [Code of Conduct](CODE_OF_CONDUCT.md) ·
[Security policy](SECURITY.md) · [Maintainer release procedure](docs/releasing.md) ·
[MIT license](LICENSE)
