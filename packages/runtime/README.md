# @pjavascript/runtime

Explicit CPU tasks on persistent Node workers, with bounded admission and explicit
clone/transfer/shared-input ownership. ESM only; qualified Node families are
22.13+ within 22.x and 24.x. No production dependencies.

PJS is pre-1.0. run, registration and lifecycle are core candidates. Range APIs
and result-credit options remain experimental. Statistics are diagnostic.

## Install

This source prepares **1.0.0-rc.4**, a candidate containing the R1A physical-completion
repair. Until RC4 is published, the registry prerelease remains **1.0.0-rc.2** as
[`@pjavascript/runtime`](https://www.npmjs.com/package/@pjavascript/runtime) under `next`.
RC3 was qualified and released on GitHub; its npm workflow stopped before
publication because the release validator assumed the wrong npm JSON shape.
RC4 has the same runtime and corrects release tooling.
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
