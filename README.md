<p align="center">
  <img src="static/pjs-logo-square-1280x1280.png" width="200" height="200" alt="PJS logo: green circuit and hexagon mark">
</p>

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

**Current release: [1.0.0-rc.4](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4),
a prerelease.** As checked on 23 October 2026, [npm `next` and `latest`](https://registry.npmjs.org/@pjavascript%2fruntime)
both select RC4. Final v1.0.0 has not been released. CI reports validation results;
it does not establish stable-release or production-readiness approval.

## Quickstart

```sh
npm install @pjavascript/runtime@next
```

PJS is ESM. Manifests declare Node `^22.13.0 || ^24.0.0`. Consult the exact
[Node and platform evidence](docs/stability.md#proposed-node-and-platform-policy),
including the [24.0.0 floor report](docs/research/node24-floor-qualification.md),
for tested development candidates; an engine range is not evidence for every patch.
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

## Choose an API

| API                           | Use it for                                                    | Status                        |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------- |
| `run`                         | One explicit task, one promise                                | Core candidate                |
| `ready` / `shutdown`          | Startup and resource lifetime                                 | Core candidates               |
| `partitionRange`              | Ordered, retained per-partition results                       | Experimental                  |
| `parallelFor`                 | Completion-only ranges and deliberate side effects            | Experimental                  |
| `parallelMapRange`            | Flat ordered array or typed-array output                      | Experimental                  |
| `streamRange`                 | Completion-order results under count and optional byte limits | Experimental                  |
| `transfer` / `sharedReadonly` | Moved buffers or reusable shared input                        | Specialized supported helpers |
| `stats`                       | Copied state and cumulative counters                          | Diagnostic surface            |

Register tasks before creating the runtime. Each worker imports those local file
exports and keeps its own globals. PJS does not serialize closures or infer
parallel safety. Worker isolates are not a sandbox for untrusted code.
See the [core API guide](docs/guide/core-api.md) for contracts and options.

## Development status

Merged source includes S1, corrected Stage A, B1–B4, C1-A/Q, C2 and C3. It differs
from published RC4 despite unchanged version fields. Checkout examples use the
six new development option names with deprecated aliases; RC4 uses the older
spellings and declarations. Later containment controls are also absent from RC4.

All feature experimental annotations and all six aliases remain. Promotion,
one shared transition prerelease, C4 removal and final-candidate qualification
need the separate [maintainer decisions](docs/research/v1-api-migration-plan.md#decisions-for-maintainer-review).
See the [stability policy](docs/stability.md) and [current inventory](docs/research/v1-api-contract-inventory.md).

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
is no automatic retry or rollback. Development's experimental exclusive
`run({ executionLease })`, rolling `restartPolicy` and graceful
`shutdown({ forceAfter })` initiate asynchronous containment; physical ownership
lasts until valid completion or confirmed exit. Without escalation, graceful
shutdown can wait indefinitely. See [lifecycle](docs/guide/lifecycle.md) and
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
