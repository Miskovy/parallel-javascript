# @pjavascript/runtime

Explicit CPU tasks on persistent Node workers, with bounded admission and explicit
clone/transfer/shared-input ownership. ESM only; manifests declare Node
`^22.13.0 || ^24.0.0`. No production dependencies.

PJS is pre-1.0. run, registration and lifecycle are core candidates. Range APIs
and result-credit options remain experimental. Statistics are diagnostic.

## Install

As checked on 22 October 2026, **1.0.0-rc.4** is published as
[`@pjavascript/runtime`](https://www.npmjs.com/package/@pjavascript/runtime);
[registry metadata](https://registry.npmjs.org/@pjavascript%2fruntime) reports
both `next` and `latest` at RC4. Its [GitHub release](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
is a prerelease. Final v1.0.0 has not been released. Development source contains
later R1/R2/R3 work and local S1 absent from the immutable RC4 artifact, despite
unchanged version fields. B1 development adds type-only PjsRangeStream and
CountOnlyStreamRangeOptions exports, exposing existing stream cleanup behavior.
B2 adds PjsOwnedTypedArray and ResultByteDeclaration type-only exports; strict
PjsBinaryResult views now require ordinary ArrayBuffer backing. Shared-capable
inputs and mapping types are preserved. Those declarations are absent from RC4;
ranges remain experimental and the
broader Stage A v1 decisions and option renames remain proposed.

```sh
npm install @pjavascript/runtime@next
```

Recent S1 evidence covers exact Node 22.13.0/24.21.0 on Windows/Linux x64; it does
not establish Node 24.0.0. Final-candidate policy requires floor/current-patch
qualification in both majors on both platforms; see the
[stability policy](https://github.com/Miskovy/parallel-javascript/blob/main/docs/stability.md).
macOS and ARM64 are not claimed. Compile TypeScript tasks to ordinary JavaScript
and register file URLs; no CommonJS/browser/bundler/loader support is promised.

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
There is no automatic retry or rollback. Omitted physical leases leave execution
unbounded. The experimental development API supports exclusive ordinary
`run({ executionLease })` in integer milliseconds, pool-wide rolling
`restartPolicy: { maxRestarts, windowMs }` and graceful `shutdown({ forceAfter })`.
These additions are not in the published RC4 artifact. Expiry initiates asynchronous
termination; it does not promise hard realtime preemption or native/OOM protection.
Ranges and physical batches reject leases before execution. Transferred buffers
stay detached, shared writes may be partial, and held Atomics locks may be abandoned.
Graceful shutdown without escalation waits for physical work and stream delivery.
The first shutdown call fixes options and the shared promise. An abnormal worker failure rejects affected callers
without proving execution ended: binary result credits and physical busy occupancy
remain held until confirmed thread exit. A valid final result ends its own physical
correlation immediately. Worker replacement waits for exit; work is never replayed.

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

MIT licensed; see LICENSE. RC4 remains a prerelease candidate.
