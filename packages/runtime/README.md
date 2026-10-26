# @pjavascript/runtime

**Promotion status:** Development P1/P2/P3 contracts are promoted following benchmark review; all six deprecated aliases remain. Published RC4 and release authorization remain separate.

**PJS — Parallel JavaScript Runtime.** Explicit CPU tasks on persistent Node
workers, with bounded admission and clone/transfer/shared-input ownership.
ESM only; no production dependencies. Tasks are trusted local module exports
with Node capabilities. Worker isolates are not an untrusted-code sandbox.

## Install

```sh
npm install @pjavascript/runtime@next
```

As verified on 23 October 2026, [npm `next` and `latest`](https://registry.npmjs.org/@pjavascript%2fruntime)
select **1.0.0-rc.4**, also a [GitHub prerelease](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4).
Final v1.0.0 has not been released. Development manifests support Node
**22.23.4+, 24.22.1+, or 26.12.1+**, within those majors
(`^22.23.4 || ^24.22.1 || ^26.12.1`). Use current patched releases; installing
PJS does not upgrade Node. Node 26 is Current as of 26 October 2026, with LTS
scheduled for 28 October; published RC4 retains its original metadata.
Consult the [exact Node/platform evidence](https://github.com/Miskovy/parallel-javascript/blob/main/docs/stability.md#proposed-node-and-platform-policy)
for tested development candidates; an engine range is not evidence for every
patch or qualification of published RC4. macOS and ARM64 remain unclaimed.
Compile TypeScript tasks to JavaScript before registration.

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

## Development versus published RC4

This README in a locally packed development build may describe later source.
Merged main includes S1, corrected Stage A, B1–B4, C1-A/Q, C2 and C3; unchanged
`rc.4` version fields do not make it the published artifact. Later development
adds closeable stream and ordinary-backed binary types, removes unsupported
registry.snapshot() access, and names diagnostic/error types including
PjsRuntimeStats. Those corrections are absent from immutable RC4.

C2/C3 accept `dispatchBatchSize`, `maxBufferedResults`, `outputConstructor`,
`resultBytes`, `maxResultBytes` and `maxReservedResultBytes` with six deprecated
`experimental...` aliases. Each pair rejects simultaneous presence, including
undefined or inherited properties. The later containment controls
`run({ executionLease })`, rolling `restartPolicy` and graceful
`shutdown({ forceAfter })` are also absent from published RC4. They initiate
asynchronous containment; ownership lasts until valid completion or confirmed
exit, without replay or a hard preemption guarantee. First shutdown options and
the shared promise are fixed; omitting escalation can leave drain waiting
indefinitely.

P1/P2/P3 are promoted in development; all six aliases remain. The combined
transition prerelease is not yet authorized; it and later alias removal need separate
[maintainer decisions](https://github.com/Miskovy/parallel-javascript/blob/main/docs/research/v1-api-migration-plan.md#decisions-for-maintainer-review).
Checkout examples use the development spellings and are tested against a fresh
packed artifact.

See the [documentation index](https://github.com/Miskovy/parallel-javascript/blob/main/docs/README.md),
[core API](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/core-api.md),
[ownership](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/memory-ownership.md),
[lifecycle](https://github.com/Miskovy/parallel-javascript/blob/main/docs/guide/lifecycle.md)
and [stability policy](https://github.com/Miskovy/parallel-javascript/blob/main/docs/stability.md).
The tarball includes compiled JavaScript, declarations, maps and their TypeScript
source for editor navigation and stack traces; internal subpaths are unsupported.

MIT licensed; see LICENSE.
