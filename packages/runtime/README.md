# @pjavascript/runtime

**Prepared 1.0.0 candidate; unpublished.** Published RC5 is the combined
transition prerelease and accepts all six deprecated aliases. This candidate
proposes stable-only names and explicit rejection of legacy own/inherited/undefined
presence. Direct removal at 1.0.0 needs the maintainer policy amendment. Read the
[migration and complete RC5 delta](https://github.com/Miskovy/parallel-javascript/blob/main/docs/release-v1.0.0.md).

PJS runs trusted registered tasks in persistent Node or dedicated browser workers,
with bounded admission, explicit clone/transfer/shared ownership and no production
dependencies. Node ESM import and synchronous CommonJS require share one graph.

## Install

```sh
npm install @pjavascript/runtime@next
```

On 29 October 2026 npm `next` selects published **1.0.0-rc.5** and
`latest` selects RC4. Final 1.0.0 has not been released. RC5 and this candidate
support Node **22.23.4+, 24.22.1+, or 26.12.1+** within those majors
(`^22.23.4 || ^24.22.1 || ^26.12.1`). See the
[exact qualification and support limits](https://github.com/Miskovy/parallel-javascript/blob/main/docs/stability.md#proposed-node-and-platform-policy).
Linux/Windows x64 and Chromium native/Vite profiles have explicit qualification;
macOS, ARM64, other engines and arbitrary bundlers remain unclaimed.
Compile TypeScript tasks to JavaScript before registration.

Ordinary CommonJS hosts use
`const { PjsRuntime, PjsTaskRegistry } = require('@pjavascript/runtime')` synchronously.
Import and require share constructors, errors, registries and transfer helpers;
the Node root is public alongside the explicit browser entry. Task modules can use .mjs, .cjs or .js under the
nearest package type. See the [complete CommonJS example](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/core-api.md#commonjs-consumption-development).

RC5 and this candidate provide `@pjavascript/runtime/browser` for real dedicated module
workers, without Node polyfills or production dependencies. Deploy the installed
runtime/bootstrap assets and browser-ready task modules together. The
[browser guide](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/browser.md)
covers copied assets, Vite dev/production base paths, optional shared memory and
browser endpoint revocation (not a native join). Imports are inert; create runtimes
in a Window. Node physical completion/confirmed-exit guarantees remain unchanged.

## Quickstart

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

Run `node basic-run.mjs`. This example works with published RC4. It teaches the
contract; one square is too small to benefit from workers. Coarse CPU work can
amortize messaging and scheduling costs; ordinary asynchronous I/O usually
belongs on Node's event loop.

## APIs and ownership

`run`, registration and lifecycle are core candidates. `partitionRange` collects
ordered per-partition outputs, `parallelFor` discards successful outputs,
`parallelMapRange` assembles flat ordered results and `streamRange` yields
completion-order results. Range APIs and their controls are promoted in development;
statistics are diagnostic. Only the root package import is supported.

Clone is the default. Explicit transfers detach sender views at dispatch.
Shared readonly input is immutable by contract. Queue limits count waiting
tasks; stream result credits bound visible binary payloads, not RSS or
consumer-retained values. Cancellation and timeout can settle a caller while
its worker remains busy. There is no automatic retry, rollback or restoration
of transferred buffers. Await shutdown for final resource cleanup.

## Stable candidate versus published RC5

RC5 accepts the stable spellings and six deprecated experimental aliases. This
candidate proposes rejecting every legacy presence directly in 1.0.0, pending
the documented policy amendment. Migrate to dispatchBatchSize,
maxBufferedResults, outputConstructor, resultBytes, maxResultBytes and
maxReservedResultBytes. Stable-only declarations retain generic inference,
count/binary exclusions and closeable streams; runtime rejects inherited and
undefined legacy properties as well as own values.

Node retains physical occupancy and credits until validated completion or
confirmed exit. Browser retirement is posting-safe local cleanup and terminal
accounting, without native join or shared-memory quiescence. Bounded opt-in
repeatable retries/fallback and explicit recovery input reconstruction retain
their existing owners; caller rejection does not restore transferred memory or
roll back side effects. Stable hold disposition and contract/evidence acceptance
remain pending independently of merge/tag/publication authorization.

Extended R2 qualification found a queued exclusive task retaining an obsolete
busy-worker pin after a replacement became idle. The candidate corrects that pin
using existing dispatcher placement/credit checks and retains the exact failing
history as a regression, with the independent model unchanged.

See the [documentation index](https://github.com/Miskovy/parallel-javascript/blob/main/docs/README.md),
[core API](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/core-api.md),
[ownership](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/memory-ownership.md),
[lifecycle](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/lifecycle.md)
and [stability policy](https://github.com/Miskovy/parallel-javascript/blob/main/docs/stability.md).
The tarball includes compiled JavaScript, declarations, maps and their TypeScript
source for editor navigation and stack traces; internal subpaths are unsupported.

MIT licensed; see LICENSE.
