# @pjavascript/runtime

Explicit CPU tasks on persistent Node workers, with bounded admission and explicit
clone/transfer/shared-input ownership. ESM only; qualified Node families are
22.13+ within 22.x and 24.x. No production dependencies.

PJS is pre-1.0. run, registration and lifecycle are core candidates. Range APIs
and result-credit options remain experimental. Statistics are diagnostic.

## Install

Current prerelease: **1.0.0-rc.2**, published as
[`@pjavascript/runtime`](https://www.npmjs.com/package/@pjavascript/runtime) under `next`.
Final v1.0.0 has not been released.

```sh
npm install @pjavascript/runtime@next
```

Qualified platforms: Windows x64 and Fedora/Linux x64. macOS and ARM64 are not claimed.

## Example and contracts

Create a local task module:

```js
// task.mjs
export function square(value) {
  return value * value;
}
```

```js
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  new URL('./task.mjs', import.meta.url),
  'square',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
try {
  await runtime.ready();
  console.log(await runtime.run(square, 12));
} finally {
  await runtime.shutdown();
}
```

The tiny example teaches the API, not a performance benefit. Use coarse CPU work;
ordinary async I/O generally belongs on Node's event loop. Tasks are trusted local
module exports, not serialized closures or a sandbox. Compile TypeScript tasks
before registration.

Cancellation/timeout can reject a caller while execution still occupies a worker.
There is no preemption, retry or rollback. Graceful shutdown waits for physical
work and stream delivery; abandoned streams can keep it pending. The first
shutdown call fixes drain mode.

Clone is default. Explicit transfers detach all sender-side views at dispatch.
Shared readonly input is immutable by contract, not frozen. Queue limits count
waiting tasks; result credits bound visible binary payloads only, not process RSS
or consumer-retained values. More workers or queue depth is not always better.

See the [full guide](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/core-api.md),
[ownership](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/memory-ownership.md),
[lifecycle](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/lifecycle.md) and
[stability policy](https://github.com/Miskovy/parallel-javascript/blob/main/docs/stability.md).
The tarball includes compiled JS/declarations/maps and their TypeScript source
for stack traces and editor navigation. Only the root import is supported.

MIT licensed; see LICENSE. RC2 is a published prerelease.
