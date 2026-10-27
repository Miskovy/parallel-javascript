# Checkpoint 4: CommonJS consumption and browser workers

Status: proposed; architecture review only. Inspected 26 October 2026 after fetching
`origin`. Current main is
[`8e9e75cfac3193b714dee1d2276b48f9955e7490`](https://github.com/Miskovy/parallel-javascript/tree/8e9e75cfac3193b714dee1d2276b48f9955e7490),
the PR #34 merge of `77a6310`; there are no subsequent changes. Checkpoint 4 remains architecture only. The separate Node support maintenance
updates the supported versions below without implementing CommonJS or browsers.

## Inspected boundaries

Source governs over older paragraphs in the [architecture](../architecture.md)
and [lifecycle](../guide/lifecycle.md) documentation that still describe earlier
range-recovery behavior. The [Checkpoint 2](checkpoint-2-execution-recovery.md)
and [Checkpoint 3](checkpoint-3-scheduling-concurrency-progress.md) designs,
[API](../guide/core-api.md), [ownership](../guide/memory-ownership.md) and
[backpressure](../guide/backpressure.md) guides describe the relevant contracts.
Paths below are relative to `packages/runtime/src/`.

| Location                                                                      | Current boundary / responsibility to retain                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manifest, `index.ts`, `runtime.ts`, `api/`, configuration/composition | Root exports have only types/import. NodeNext compilation supplies Node ambient types. Composition connects passive owners, then starts workers; merely importing the package creates none.                                                                 |
| `tasks/registry.ts`, `workers/bootstrap.ts`                                   | Registry accepts file: URL objects. Bootstrap imports task modules asynchronously, resolves callable exports and acknowledges readiness only after all registrations load.                                                                                  |
| `workers/worker.ts`, `pool/pool.ts`, `dispatch/dispatcher.ts`                 | Native Worker construction, workerData, Node events/termination promises and threadId are embedded in PjsWorker. Pool owns population/budgets; dispatcher owns eligibility, shared/exclusive claims, drain pins, weighted admission and recovery exchanges. |
| `tasks/coordinator.ts`, `partition/coordinator.ts`, `partition/operation.ts`  | Logical/attempt/parent state and exactly-once settlement stay here. Dependencies include node:crypto, node:util, isMainThread, setImmediate and AsyncResource inheritance.                                                                                  |
| `tasks/transfer.ts`, `tasks/shared.ts`, `partition/binary.ts`                 | Node brand checks, isMarkedAsUntransferable and Buffer diagnostics are mixed with portable buffer/credit rules. Transfer envelopes and pending reservations use module-local WeakMaps.                                                                      |
| `workers/progress.ts`, protocol, credits, lifecycle, telemetry                | Encoder is portable, but reporters require shared atomics; receiving uses Buffer.byteLength. Other dependencies include Node timers/unref, process.env invariant configuration and process.hrtime.bigint profiling.                                         |

A read-only AST walk found **33 modules in the static runtime-value graph from
index.ts, with no top-level await**. Worker bootstrap is outside that graph; its
top-level awaited imports therefore do not prevent synchronous host loading.
Built-in dependencies in that graph are node:async_hooks, crypto, os, util and
worker_threads. Replacing just the Worker constructor would leave browser imports
and declarations coupled to Node.

Consumer evidence read includes `scripts/package-smoke.mjs` and
`scripts/package-consumer/`, registry/public-type/runtime-boundary tests, and the
Checkpoint 2/3, containment, transfer, shared, batch, stream and result-credit tests.
The installed harness currently asserts root-only exports and tests ESM consumers;
it copies Node types into TypeScript consumers and provides no browser execution proof.

## 1. CommonJS: one synchronous ESM implementation

**Recommend mapping require to the existing ESM entry.** The exact
[Node 22.23.4](https://nodejs.org/download/release/v22.23.4/docs/api/modules.html#loading-ecmascript-modules-using-require),
[Node 24.22.1](https://nodejs.org/download/release/v24.22.1/docs/api/modules.html#loading-ecmascript-modules-using-require)
and [Node 26.12.1](https://nodejs.org/download/release/v26.12.1/docs/api/modules.html#loading-ecmascript-modules-using-require)
documentation permits synchronous require of an ESM graph without top-level await.
It is enabled without a default experimental warning at all three supported floors.
Keep engines `^22.23.4 || ^24.22.1 || ^26.12.1` unchanged during Checkpoint 4. Explicit Node
flags disabling require(esm) are outside this consumption contract.

As verified on 26 October 2026, Node 26 is Current, with LTS scheduled for
28 October; see the [official release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).
These are supported minimums, not a recommendation to stay on an old patch. Use
current patched releases within each supported major; engines do not upgrade Node.
Historical floor evidence and published RC4 remain unchanged. Mixed import/require
identity must be executed on all three supported versions when CommonJS is implemented.

| Approach                                        | Decision                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| require and import resolve to the same ESM file | Smallest change; preserves constructor, error-class, registry and helper identities. Recommended.                                                     |
| Thin .cjs bridge calling require('./index.js')  | Still depends on synchronous ESM loading; adds a file without removing that constraint. An async-import bridge would violate synchronous consumption. |
| Separate CommonJS build                         | Unnecessary at these floors; creates duplicate module-local identity/ownership state unless additional machinery is added. Reject.                    |

Keep the Node public graph free of top-level await, including dependencies added
during browser extraction. Import and require of one installed package instance
must expose the same constructors/functions and compatible task handles. Test
these identities, not equality of incidental module-namespace wrappers. Separate
installed copies remain separate instances, as today.

Use the same `dist/index.d.ts` for Node import and require. Modern
[TypeScript NodeNext](https://www.typescriptlang.org/docs/handbook/modules/reference.html#interoperability-rules)
models require(esm); it does not detect top-level-await incompatibility itself.
An .mts consumer uses import; an .cts consumer can use
`import PJS = require('@pjavascript/runtime')` for typed synchronous loading.
Check both locked compilers and their emitted .mjs/.cjs. No .d.cts shim or second
declaration identity is needed. Older node16/node18 resolution is not an added claim.

Node workers continue resolving their installed bootstrap with a file URL relative
to the Node adapter's import.meta.url, never the caller's CWD. Bootstrap and user
ESM tasks may still await imports: they are loaded inside the worker, not through
the host's synchronous public graph.

### Node task modules

Keep file: registration and Node's normal .mjs/.cjs/package-type interpretation.
Continue dynamic import in bootstrap; preserve callable namespace exports first.
For CommonJS object exports, additionally resolve a callable **own** requested
property of namespace.default. This avoids depending on synthetic named-export
heuristics; see [Node's CommonJS namespace interop](https://nodejs.org/download/release/v24.22.1/docs/api/esm.html#interoperability-with-commonjs).
Non-callable/missing exports fail startup as today.

| Task definition                                                   | Registration exportName                       |
| ----------------------------------------------------------------- | --------------------------------------------- |
| ESM export default function / export function compute             | default / compute, unchanged                  |
| CommonJS module.exports = function                                | default, unchanged selection convention       |
| CommonJS exports.compute = fn or module.exports = { compute: fn } | compute, including computed object properties |
| CommonJS module.exports = { default: fn }                         | default through the own-property fallback     |

No prototype lookup, Promise-valued export or late asynchronous reassignment of
module.exports is a task declaration. A CommonJS task may require the PJS root to
call transfer(); bootstrap must recognize that envelope through the same WeakMap
instance. This is an important mixed-loading acceptance case.

## 2. Browser entry and loading model

Choose an **explicit `@pjavascript/runtime/browser` entry**, rather than switching
the root through a browser condition. Conditional roots are convenient but can
silently select a different lifecycle/type contract in SSR and bundler graphs.
The explicit entry makes that choice visible. Node consumption remains root-only;
`/browser` is the sole intentional host-entry addition, not permission to import
arbitrary src/dist internals.

Proposed manifest shape, not a change in this task:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    },
    "./browser": {
      "types": "./dist/browser/index.d.ts",
      "import": "./dist/browser/index.js",
      "default": "./dist/browser/index.js"
    }
  }
}
```

The browser facade exposes the same task/range/helper concepts and shared error
classes, plus browserCapabilities(). Its PjsRuntimeOptions adds `workerURL?: URL`
and excludes resourceLimits (`?: never`, with a runtime presence check). Its
declarations and transitive imports require web/ECMAScript libraries, **no Node
built-ins or Node type package**. Browser runtime creation initially belongs to a
Window host; worker-side helpers remain importable without creating another pool.
Import is inert, including in an SSR inspection; Worker availability is checked at
construction. No automatic Node fallback, polyfills or UI-thread execution.

Use one ESM emit tree with Node and browser entry modules and shared policy files;
no second runtime implementation or CommonJS emit. Add separate browser host/worker
type-check graphs with types:[] and appropriate DOM/WebWorker libraries. Inspect
the emitted browser import/declaration graphs as well: compiling in a project that
has Node ambient types is not sufficient evidence of portability.

### URLs, assets and initialization

- Browser registration accepts URL objects with http:/https: schemes, resolved by
  the application with new URL(...). Reject file:, data:, blob: and executable
  strings in this initial contract. Node's registry keeps its file: restriction.
- Default unbundled bootstrap is `new URL('./bootstrap.js', import.meta.url)`
  inside the published browser adapter, constructed as a dedicated module Worker.
  Optional workerURL must point to a deployed copy of that PJS bootstrap. It is
  not a URL for arbitrary task code. A custom worker factory is unnecessary initially.
- Install host listeners first, then send one versioned init containing the frozen
  registry, concurrency and capability requirements. Browser bootstrap waits for
  exactly one init, imports each task URL, validates exports/capabilities, then sends
  ready. Replacements/growth use identical bootstrap and configuration. No execute
  before ready; malformed/repeated initialization is a bootstrap/protocol failure.
- Share the existing invocation/batch runner. Browser supplies postMessage/events;
  Node supplies parentPort/workerData. Task modules are browser ESM with callable
  named/default exports, not CommonJS source, closures, eval or function strings.

Protocol adds an explicit progress mode/enable marker: absence of a shared buffer
must not mean absence of an opted-in context. Guard all SharedArrayBuffer references
when the constructor is unavailable. Keep init/control validation separate from
execution eligibility and preserve exact single/batch correlation checks.

Bootstrap must be same-origin in the supported profile; task imports may be
cross-origin only when permitted by CORS. Serve JavaScript MIME types and allow
the assets under the site's CSP. Module dependencies must themselves be
browser-resolvable URLs. See the [Worker constructor/loading contract](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker).
Do not assume the document's import map applies inside workers.

Constructor failures, import/network/CORS/MIME errors, invalid exports and capability
mismatches reject readiness and accepted callers through existing PjsWorkerError
startup/fatal paths. StartupTimeout covers init/import readiness, including hanging
task-module top-level await; no respawn loop for configuration failure. Plain task
exceptions remain task-error final envelopes, not startup failures.

### Defined bundler profile

Support a concrete Vite profile first: bundle the host facade, copy the installed
PJS dist tree unchanged into public/vendor/pjs, pass its bootstrap workerURL, and
emit self-contained task JavaScript as non-inlined URL assets. Vite documents
[explicit URL imports and public-directory copying](https://vite.dev/guide/assets).
This avoids relying on a bundler to discover runtime registry URLs, rewrite an
entire dynamic-import graph, or retain exports from a task mistakenly built as a
worker entry. Do not use ?worker for an importable task module.

Public assets retain the PJS relative-module layout. A task with dependencies must
be provided as browser-ready ESM with explicitly deployed imports; a raw URL asset
does not compile TypeScript or bundle its imports. Worker/task modules must use
**one canonical deployed PJS helper graph within that worker**: independently
bundling another transfer() implementation can break envelope identity. Pure task
modules need no PJS import; helper-using modules import the same copied browser
entry used by bootstrap. No compatibility claim for every bundler or SSR worker launch.

Copy assets from the same installed package version as the host facade. Deploy
versioned runtime/bootstrap/task assets consistently; mixing cached generations is
unsupported, and protocol-version validation only detects incompatible protocols.

## 3. Shared owners and the small host boundary

Keep facade/API adaptation, coordinators, scheduler, dispatcher, pool policy,
protocol validation, result credits and stream assembly as their current owners.
Bind a small set of private Node/browser services in existing composition; no
backend registration API, plugin system or second recovery manager.

| Service / extraction                  | Concrete change                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker transport and initialization   | Move native Worker creation, events, port setup and termination observations out of PjsWorker. Keep its active-correlation map, phases, validation and exclusive capacity logic shared. Pool receives the bound worker construction path; it still owns workers/restart decisions.                                                                              |
| Deferred work and timers              | Keep standard performance.now()/Date.now() measurements. Replace Node-specific timer handle types with internal cancellation handles. Node retains setImmediate and unref for idle timers; browser uses cancellable setTimeout tasks, including zero-delay deferred pumping. Never replace bounded host turns with an endless microtask chain.                  |
| IDs, CPU hint and coordinator scope   | Inject Node randomUUID/availableParallelism/isMainThread; browser uses Web Crypto IDs, a navigator.hardwareConcurrency hint (default capped at four, explicit bounds still win), and Window-host validation. These are defaults/correlation IDs, not physical CPU guarantees.                                                                                   |
| Range async scope                     | Replace AsyncResource inheritance with a scope owned by RangeOperation. Node scope wraps the same AsyncResource/runInAsyncScope/emitDestroy lifecycle. Browser invokes callbacks directly and releases references; it promises no Node AsyncLocalStorage propagation. Invocation-local TaskContext stays shared.                                                |
| Buffer/Promise checks                 | Split Node util.types, marked-buffer checks and Buffer diagnostic naming from portable validation. Use intrinsic ArrayBuffer/typed-array brand checks, ArrayBuffer.isView and existing detached-buffer probes in the browser; retain cross-realm handling and Node guards. Preserve terminal async/thenable reconstruction rejection and rejection observation. |
| Progress and profiling                | Share incremental encoding, correlation and observer drain. Replace Buffer.byteLength with bounded portable UTF-8 sizing. Select one of two bounded reporters below. Node hrtime transport profiling remains Node-only; normal executionMs is measured within each worker, never by subtracting unrelated host/worker clock origins.                            |
| Configuration, diagnostics and errors | Move process.env invariant activation to Node composition. Pass normalized capability decisions to existing validation. Normalize browser ErrorEvent/messageerror/fatal reports without retaining DOM event targets. Browser diagnostics omit unsupported Node observations; shared error classes/serialization remain the authority.                           |

Transfer reservations/envelope state must not become mutable global host switches.
Use host-bound validation at the existing helper/transport boundaries, with shared
ownership bookkeeping. Node import/require continues to reach one set of WeakMaps.
No browser import chain may reach a Node adapter through an innocent re-export.

## 4. Browser lifecycle: completion versus revocation

This needs an explicit product decision, not an exit-event emulation.
The [HTML termination algorithm](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker)
runs in parallel, discards queued work and aborts the running script; Worker.terminate()
returns undefined and exposes no completion event/promise. An error event also does
not establish exit. The recommendation below distinguishes that observability from
Node's confirmed native exit; a timer delay cannot bridge it.

**Recommend browser endpoint revocation as the stop contract.** Physical cancellation
really calls native Worker.terminate(); it never downgrades to settle. However,
browser shutdown resolution means PJS endpoints/records have been retired, not that
the host observed physical execution cease. Browser capabilities declare
`termination: 'revocation'` and `workerExitConfirmation: false`.

Keep the difference explicit internally:

```text
validated final response -> existing completion/credit/recovery transitions
Node failure -> retain physical claims -> confirmed exit -> eligible recovery
Browser failure -> settle affected work terminally -> native terminate
  -> revoke endpoint -> abandon terminal accounting claims -> replace endpoint
```

On browser retirement: stop admission to that worker, close progress channels,
invoke terminate(), then detach listeners and invalidate its generation. Ignore
queued callbacks/messages by generation and attempt ID. If terminate throws, fail
cleanup closed; do not announce successful retirement/replacement. Never synthesize
the Node exited callback with Promise.resolve(terminate()).

Add a narrow **abandonExecution** transition to existing dispatcher/credit ownership
for revoked browser endpoints, requiring all affected logical callers to be terminal.
It releases local delivery/count/byte claims without marking physical completion or
enabling replay. Node never takes this path. Until actual revocation, merely rejecting
a caller or requesting cancellation still retains occupancy and result reservations.
Validated browser final responses retain the existing strong completion path.

Consequently browser result credits bound PJS-owned live endpoints/buffered visible
results; after revocation they do not account for unobservable residual computation.
Browser maxWorkers bounds managed endpoints, not a measured number of simultaneously
living native threads. Node retains its stronger live/terminating-thread and physical
credit bounds. Neither host promises total RSS, native-allocation limits or rollback.

### Recovery and shared state

Do not quietly reinterpret repeatable:true as permission for overlapping attempts.
Initially, browser retry/fallback supports **task-error after a validated final
response only**, including per-partition recovery and genuine skipped batch suffixes.
Reject configured worker-crash/execution-lease recovery causes before factories or
transfers; because retry's current default is worker-crash, browser retry must specify
`on: ['task-error']`. Default task-error fallback remains useful. Reconstruction and
retained credits then use the same confirmed-attempt boundaries as Node.
Validate the requested public policies, not an unused internal retry-cause default:
a fallback-only call must remain valid without opting into retries.

A browser hard error/lease expiry remains terminal for its unconfirmed invocations;
worker replacement restores capacity for other work and is not task retry. Crash
ambiguity, partial shared writes and external side effects cannot establish safe
replay. Successful/streamed partitions never replay; serialization/invalid-output
failures remain terminal, including the misleading serialization skipped suffix.

After revocation, **PJS cannot authorize shared-buffer reuse or certify locks/state
quiescent**. Keep shared input immutable, or abandon that generation and allocate
fresh backing; an application protocol must provide any stronger acknowledgement.
Transferred input stays detached and unrecoverable unless explicitly reconstructed
after a supported, confirmed failure. No hidden backup copies or batching exceptions.

### Failure, capacity and shutdown

An observable hard worker error/messageerror/fatal report retires that worker;
fan out to all active physical attempts before pumping, with one restart decision.
Install worker-side forwarding for uncaught errors/unhandled rejections; caught
task exceptions still use normal final envelopes. Duplicate notifications are
guarded by the existing pool failure ownership. Startup failure/budget exhaustion
remains fatal. Intentional cancellation/idle retirement is budget-exempt; leases
retain their normal restart charge. All replacements use the same host services.

Exclusive placement for terminate-mode and leased work, drain-pin cleanup and
per-invocation cooperative targeting remain unchanged. A hard error can affect all
async invocations sharing a worker; cooperative requests cannot terminate its peers.
There is no new heartbeat: self.close(), silent UA termination or a frozen page
need not produce a detectable exit. Unanswered work keeps its slot until a valid
response or explicit retirement through lease/termination/forced shutdown.

Graceful shutdown drains accepted work/ranges and closes streams as today, then
retires idle endpoints. Forced shutdown/forceAfter terminates all managed endpoints
and abandons remaining terminal claims. Neither browser path promises a native join,
including when an earlier endpoint was revoked. Clear retry/startup/lease/idle/defer
timers, pins, factories, pending callbacks, listeners and worker references. Page
teardown may prevent any final acknowledgement or promise continuation; pagehide
cleanup is best effort, not another shutdown guarantee.

Browser stats retain logical IDs, queue/attempt/result/progress counters and measured
durations. Omit threadId, confirmedLeaseExits and Node-only profiling observations;
do not invent -1 IDs or zero-valued unsupported metrics. Add a cumulative
unconfirmedRetirements count of worker endpoints retired with unfinished attempts,
not a gauge pretending to know which old workers still exist. Browser
busy/activeExecutions describe managed protocol ownership. Node stats retain their
present fields/meaning. Shared RunOptions/RetryOptions shapes do not prove host
capabilities; browser validation enforces its supported recovery-cause subset.

## 5. Capability matrix and shared-memory-dependent behavior

Base browser support means dedicated module Workers, structured clone/ArrayBuffer
transfer, normal ESM/Promises and the deployed loading profile. Shared support
additionally requires usable SharedArrayBuffer/Atomics in both page and workers.
The [shared-memory requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements)
include a secure, cross-origin-isolated context; standard deployment uses COOP
same-origin and COEP require-corp (or an appropriate credentialless policy).
Probe without allocating at import; validate page/worker agreement during init.
Do not create a fake SharedArrayBuffer or silently copy a supplied shared value.

| Existing feature                                      | Node import/require                   | Browser without shared memory                                                          | Browser with shared memory                                   |
| ----------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| run; partitionRange; parallelFor                      | Existing behavior                     | Supported in actual workers                                                            | Same                                                         |
| parallelMapRange, generic and typed                   | Existing behavior                     | Supported; original block contracts/order                                              | Same                                                         |
| streamRange count, exact-byte, upper-bound            | Existing behavior                     | Supported; completion order/count/refund rules; revocation limit above                 | Same                                                         |
| Clone; ArrayBuffer transfers                          | Existing behavior                     | Supported; detachment/reservation rules and batch-input transfer ban retained          | Same                                                         |
| Shared input / sharedReadonly                         | Existing behavior                     | Unsupported; helper rejects, nested shared post failures remain serialization failures | Supported; immutability/application atomic protocol required |
| Strict binary result credits                          | Physical ownership through final/exit | Live-endpoint accounting through final/revocation; ordinary-backed output only         | Same; shared-backed strict output still rejected             |
| Logical cancellation and deadlines                    | Existing behavior                     | Supported; no early slot/credit release                                                | Same                                                         |
| Cooperative CPU/async cancellation                    | Shared flag plus local signal         | Reject cooperative mode; a message cannot interrupt a CPU loop                         | Existing flag/local-signal contract; no automatic escalation |
| Physical cancellation                                 | Terminate and confirmed exit          | Native terminate plus explicit revocation contract                                     | Same; no shared-state reuse acknowledgement                  |
| Retries, fallback, reconstruction                     | Existing causes/defaults              | task-error only after validated completion; explicit bounded retry policy/rebuild      | Same; no ambiguous replay even with shared memory            |
| Elasticity, priority/custom policy, async concurrency | Existing behavior                     | Shared policy/claims/windows; endpoint population bound                                | Same                                                         |
| Progress                                              | Atomic bounded reporter               | Bounded message-credit/coalescing reporter                                             | Existing atomic reporter                                     |
| Graceful/forced shutdown                              | Confirmed physical cleanup            | Drain/terminate and retire endpoints; no native join                                   | Same                                                         |
| Worker resourceLimits                                 | Existing JS-engine limits             | Reject option presence                                                                 | Reject option presence                                       |
| executionLease                                        | Ordinary exclusive execution only     | Supported as termination-request timer; expiry terminal, no join/replay                | Same                                                         |
| Diagnostics                                           | Existing Node observations            | Portable/browser projection, no thread/exit/RSS inventions                             | Same                                                         |

Without shared memory, progress still has one in-flight frame and one latest encoded
pending value per physical execution, the same 16 KiB/depth-16 incremental encoder,
and the existing bounded host drain. A correlated acknowledgement returns a local
worker permit; only then may it post another frame. A synchronous loop cannot
process that acknowledgement, so it may deliver just its first update until it
yields; unsent updates can be dropped at completion. This preserves the documented
lossy contract without a message backlog. The atomic version remains preferable
when available. Neither version releases result credit or changes caller settlement.
Without atomics, closing the worker-side reporter takes effect at its next control
turn; host delivery stops immediately. A CPU loop can keep coalescing locally until
it yields, with at most one close notification and one acknowledgement outstanding.
Returning true is still only acceptance for possible delivery, never a remote-close
or completion acknowledgement.

Keep exact argument-count rules: execute(input) by default; execute(input, context)
only for explicit cooperative mode or onProgress. Progress-only contexts do not
enable cooperative cancellation. Preserve unconstrained progress generics, fallback
type compatibility and runtime wire validation. Unsupported capabilities/causes
reject clearly rather than silently selecting a weaker option.

## Proposed examples

All browser entry/options and CommonJS package consumption below are **proposed**.
Files belong to the consuming application, using its installed package.

### 1. CommonJS application and task

```js
// square-task.cjs
module.exports = (value) => value * value;
```

```js
// main.cjs; no ESM application conversion or async import wrapper.
const { PjsRuntime, PjsTaskRegistry } = require('@pjavascript/runtime');
const { pathToFileURL } = require('node:url');
const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  pathToFileURL(require.resolve('./square-task.cjs')),
);
const runtime = new PjsRuntime({ registry, workers: 2 });
async function main() {
  try {
    await runtime.ready();
    console.log(await runtime.run(square, 12));
  } finally {
    await runtime.shutdown();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### 2 and 4. Native browser modules, ordinary call and range map

Copy the installed dist tree to a same-origin `/vendor/pjs/`, retaining its layout.
This application build script resolves the proposed supported browser entry; it
does not reach into a repository checkout:

```js
// copy-pjs-assets.mjs, run by the application's ordinary build.
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const entry = new URL(import.meta.resolve('@pjavascript/runtime/browser'));
await cp(fileURLToPath(new URL('../', entry)), 'public/vendor/pjs', {
  recursive: true,
});
```

```html
<!-- Serve public/ over HTTP(S); native module host. -->
<script type="importmap">
  {
    "imports": {
      "@pjavascript/runtime/browser": "/vendor/pjs/browser/index.js"
    }
  }
</script>
<script type="module" src="/host.js"></script>
```

```js
// tasks/math.js; imported separately in every worker, never executed by the UI.
export const square = (value) => value * value;
export function squareBlock({ start, end }) {
  return Array.from({ length: end - start }, (_, n) => (start + n) ** 2);
}
export function sumShared(values, context) {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    if (i % 1024 === 0) context.throwIfCancelled();
    total += values[i];
  }
  return total;
}
```

```js
// host.js
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime/browser';
const registry = new PjsTaskRegistry();
const moduleURL = new URL('./tasks/math.js', import.meta.url);
const square = registry.register('square', moduleURL, 'square');
const block = registry.register('block', moduleURL, 'squareBlock');
const runtime = new PjsRuntime({ registry, workers: 2 }); // Default deployed bootstrap.
try {
  await runtime.ready();
  console.log(await runtime.run(square, 12));
  const values = await runtime.parallelMapRange(
    block,
    { start: 0, end: 100_000, grainSize: 1024 },
    ({ start, end }) => ({ input: { start, end } }),
    { repeatable: true, retry: { maxAttempts: 2, on: ['task-error'] } },
  );
  render(values);
} finally {
  await runtime.shutdown();
}
```

The default worker URL is relative to the copied browser adapter, not host.js or
the page. Task dependencies must use worker-resolvable URLs; tasks/math.js above
has none. Generic map assembly still runs in the host, not its CPU task body.

### 3. Vite host with emitted task and worker assets

Run the same copy script before Vite dev/build. Public files become deployed worker
and runtime assets; the task is a separate URL asset with its exports intact.
Assume an absolute Vite base such as `/app/` and browser-ready math.js from above.

```js
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime/browser';
import taskURL from './tasks/math.js?url&no-inline';
const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  new URL(taskURL, location.href),
  'square',
);
const runtime = new PjsRuntime({
  registry,
  workers: 2,
  workerURL: new URL(
    `${import.meta.env.BASE_URL}vendor/pjs/browser/bootstrap.js`,
    location.href,
  ),
});
try {
  console.log(await runtime.run(square, 12));
} finally {
  await runtime.shutdown();
}
```

Use the configured [Vite base URL](https://vite.dev/guide/build#public-base-path)
for copied assets. This profile intentionally does not ask Vite to bundle arbitrary
runtime-imported task URLs. Deploy the whole copied tree and emitted task asset
together; do not inline the task or independently duplicate worker-side PJS helpers.

### 5. Explicit shared-memory capability requirement

```js
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
  browserCapabilities,
} from '@pjavascript/runtime/browser';
if (!browserCapabilities().sharedMemory) {
  throw new Error(
    'This computation requires cross-origin-isolated shared memory',
  );
}
const registry = new PjsTaskRegistry();
const sum = registry.register(
  'sum',
  new URL('./tasks/math.js', import.meta.url),
  'sumShared',
);
const values = sharedReadonly(new Float64Array([1, 2, 3]));
const runtime = new PjsRuntime({ registry, workers: 2 });
try {
  await runtime.ready(); // Also validates worker capability agreement.
  console.log(
    await runtime.run(sum, values, {
      cancellation: 'cooperative',
      timeout: 1000,
    }),
  );
} finally {
  await runtime.shutdown();
}
```

The application explicitly requires the capability. PJS does not replace cooperation
with logical settlement, silently substitute a private clone for shared input, or infer a termination
acknowledgement from shutdown. BrowserCapabilities is a host probe, not proof that
every deployment URL/header is correct; startup still validates each worker.

## Implementation order and focused acceptance

After review, implement in this order, with focused tests alongside the changes:

1. **CommonJS mapping and task exports.** Manifest require condition and the small
   Node task-export resolver in bootstrap; retain one ESM/declaration graph. Extend
   installed consumer fixtures in `scripts/package-consumer/` and package-smoke,
   plus registry/type tests. No second Node build or engine change.
2. **Extract only the host dependencies needed above.** `runtime.ts`, composition,
   configuration, workers/worker and bootstrap, pool construction, coordinator
   timer/ID/scope calls, transfer/shared/binary helpers and Node profiling/debug
   activation. Keep scheduler, recovery admission, range assembly/streams and
   result-credit policy shared. Add concrete Node/browser transport/service files
   and a shared invocation runner, not a new manager hierarchy.
3. **Browser facade, init and retirement semantics.** Add browser index/bootstrap,
   capability validation, bounded non-atomic reporter, browser diagnostic projection
   and the guarded accounting-abandon path. Add browser-only source/declaration
   type checks, copied-asset examples and real-browser fixtures. Update manifest
   exports/files verification, API inventories and user guides for both entries.

Existing `api/`, `types/index.ts`, `diagnostics.ts`, `results/credit.ts` and
`lifecycle/runtime-controller.ts` need narrow changes for host types/capabilities
and tagged retirement. Node's public behavior and original owner boundaries remain
the regression baseline. Existing tsc can emit the additional ESM files; no runtime
dependency or new application launcher is required.

Acceptance cases for later implementation:

- Installed ordinary .cjs require at all three Node floors, mixed import/require identity
  for constructors/errors/handles and transfer envelopes, ESM/CJS default/named task
  modules, unrelated CWD, and .cts/.mts compilation/execution with both compilers.
  Check the public graph stays synchronous; do not forbid task-module await.
- Installed browser declaration consumer with types:[] and **no Node type packages**;
  inspect both emitted import graphs for node:, process/Buffer/NodeJS leaks. Importing
  either facade creates no workers. Node src/dist subpaths stay blocked.
- Real browser, local HTTP server, deployed installed assets: task execution in
  DedicatedWorkerGlobalScope, separate worker globals, UI responsiveness during CPU
  work, initial/replacement readiness and all four range APIs, both map forms and
  count/exact/upper-bound streams. Mocks alone do not establish execution support.
- Vite dev and production base-path fixture using copied runtime/bootstrap plus
  emitted non-inlined task URL; exercise actual worker loading and helper-envelope
  identity. Verify CORS/startup/import failures and timeout without respawn loops.
- Isolated and non-isolated browser pages: shared helpers/cooperative flags gated
  correctly, CPU polling and async cleanup where supported; bounded progress in both
  modes, including CPU floods, acknowledgements, stale attempts and observer errors.
- Cancellation/lease/error with shared async invocations and exclusive drain pins:
  native terminate is invoked, peer isolation/budgets/one settlement hold, unsupported
  crash/lease replay rejects early, and browser revocation never emits confirmed exit.
  Exercise task-error recovery/rebuild, skipped suffixes, credit cleanup and shutdown.
- Node containment still waits for delayed confirmed exit and keeps physical credits;
  browser abandoned accounting is terminal-only and distinct in diagnostics. Page
  teardown/silent closure has no invented completion guarantee or timer-based proof.

## Decisions for maintainer review

The recommended packaging choice is one Node ESM identity with a require mapping,
plus an explicit browser facade and documented copied-asset/workerURL loading model.
No additional CommonJS build/declaration choice is needed.

The substantive approval is the **browser revocation contract**: native termination
without observable join, local abandonment of terminal delivery claims, and endpoint
rather than live-native-thread population bounds. Recommend accepting it with
task-error-only browser recovery; neither repeatable:true nor an atomic flag proves
that a terminated worker has physically ceased. If Node-equivalent confirmed-exit
ownership must be universal, browser active termination/lease recovery cannot be
advertised with that guarantee. Do not substitute an invented exit event or delay.

These are explicit browser limits, not a proposal to defer real worker execution.
Stop for architecture review before changing source, packaging or tests.
