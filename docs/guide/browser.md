# Browser module workers (development)

Integrated development builds expose `@pjavascript/runtime/browser`. Published
RC4 is unchanged. The Node root retains its single ESM graph for both import and
require; the explicit browser entry has a different lifecycle contract. Imports
create no workers. Construct the browser runtime in a Window; helpers and task
types can also be imported inside dedicated workers. There are no production
dependencies, Node polyfills, UI-thread task fallback or generated task strings.

## Native module deployment

Use an installed development artifact. Run
[copy-assets.mjs](../../examples/browser/copy-assets.mjs) from the application to
copy its installed `dist` tree into `public/vendor/pjs`, preserving relative paths.
Deploy public files at `/app/`. Copy the example
[index.html](../../examples/browser/index.html), [host.js](../../examples/browser/host.js)
and [tasks.js](../../examples/browser/tasks.js) alongside that tree.

```js
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime/browser';
const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  new URL('./tasks.js', import.meta.url),
  'square',
);
const runtime = new PjsRuntime({ registry, workers: 2 });
try {
  await runtime.ready();
  console.log(await runtime.run(square, 12));
} finally {
  await runtime.shutdown();
}
```

The default bootstrap resolves beside the deployed browser adapter, independently
of the page URL. `workerURL?: URL` can point to another **same-origin HTTP(S) PJS
bootstrap**, with the matching relative runtime assets. Registrations require
HTTP(S) URL objects and callable ESM exports. A task URL must already be runnable
browser JavaScript; it does not transpile TypeScript or bundle dependencies.
Workers do not inherit the document's import map. Task-side PJS helpers must use
one canonical deployed module graph, as the example's absolute helper URL does.
The internal transport now lives under `hosts/browser/`; applications still load
`browser/bootstrap.js` and the same public entry. Copy the entire installed tree
rather than selecting internal files; nested imports must retain their relative
layout after deployment.
Do not independently bundle a second worker-side transfer helper: ownership
envelopes intentionally use module-local identity.

Every endpoint installs listeners, receives versioned initialization, verifies
shared-memory agreement and imports all registered modules before readiness.
Import/export/capability errors and startup timeouts reject readiness and accepted
work without configuration-driven restart loops. Initialization detects protocol
generation mismatches, not every possible stale application asset. Deploy/cache
the runtime, bootstrap and task assets together, preferably under versioned paths.

## Vite profile

The [Vite host](../../examples/browser/vite-host.js) uses `base: '/app/'`, the same
copied public tree and an explicit bootstrap URL built from `import.meta.env.BASE_URL`.
Use it instead of host.js in the application's module script. Run the copy step
before both `vite` and `vite build`; deploy the resulting public tree and emitted
task asset. `?url&no-inline` emits the example's browser-ready JavaScript separately,
with its exports intact. It does **not** compile a raw task's TypeScript, resolve
bare worker imports or bundle its dependency graph. Use an application build step
for more complex tasks and register that emitted ESM URL. This is a defined Vite
loading profile, not a claim about every bundler.

## Capabilities and supported behavior

`browserCapabilities()` is an inert local probe returning `workers`, `windowHost`,
`sharedMemory`, `termination: 'revocation'`, `workerExitConfirmation: false`.
Constructor availability does not prove that CSP, URLs or worker imports succeed;
`ready()` validates each actual endpoint.

| Feature                                                       | Browser contract                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| run, partitionRange, parallelFor, both parallelMapRange forms | Shared admission, priorities/comparator, ordering, validation and recovery owners                                               |
| Count/exact-byte/upper-bound streamRange                      | Completion-order delivery; same count windows, visible-byte credits, refunds and iterator cleanup                               |
| Clone / transfer                                              | Default clone; explicit transfers detach after successful posting; configured batching above one still excludes input transfers |
| Shared input                                                  | Requires usable SharedArrayBuffer in page and worker; never silently copied                                                     |
| Logical / physical cancellation, leases                       | Default logical settlement; terminate/lease revoke exclusive endpoints; no native join                                          |
| Cooperative cancellation                                      | Requires usable shared atomics in both hosts; CPU loops poll; async code uses its invocation-local signal                       |
| Retry / one registered fallback / reconstruction              | Explicit repeatability; only validated task errors and genuine skipped suffixes; original deadline and bounded admission        |
| Elasticity / async concurrency / scheduling                   | Existing pool policy; bounds count managed endpoints; destructive work remains exclusive                                        |
| Progress                                                      | Same bounded encoder; atomic permits when shared memory is usable, message credits otherwise; deliberately lossy                |
| Shutdown                                                      | Graceful drains accepted work; force/forceAfter retires managed endpoints after posting cleanup                                 |
| resourceLimits                                                | Unsupported; option **presence**, including undefined, rejects                                                                  |
| Diagnostics                                                   | Portable task/queue/credit metrics; no threadId, confirmedLeaseExits, RSS or native-thread claims                               |

Request retries with `on: ['task-error']`; the Node default worker-crash retry cause
is unsupported here and rejects before factories/reconstruction/transfers. A
fallback-only request keeps its supported default task-error policy. Hard failure,
termination and lease expiry are terminal for affected executions. Replacement
restores capacity, **never replays ambiguous work**. Confirmed partition successes
and delivered values are preserved during eligible recovery; serialization-error
“skipped” IDs do not authorize replay. Fallback outputs satisfy the original map or
binary contract. Shared writes and external effects remain the application's
repeatability responsibility.

Progress keeps one in-flight frame and one latest encoded pending value per
physical execution, with bounded host delivery. Payloads use the existing 16 KiB,
depth-16 incremental JSON encoder. Message acknowledgements include invocation and
sequence, so stale/duplicate controls cannot grant permits. A synchronous CPU loop
without shared atomics may post only its first update until it yields; pending
updates can be discarded at completion. A true return from `reportProgress()` means accepted for
possible delivery, not guaranteed delivery. Observer errors/async returns disable
reporting without failing the task. Closing stops host callbacks immediately.
Default invocation remains exactly `execute(input)`; cooperative cancellation or
onProgress explicitly opts into `execute(input, context)`. Progress schemas remain
unconstrained TypeScript declarations; runtime wire-value validation still applies.

```js
import { browserCapabilities } from '@pjavascript/runtime/browser';
if (!browserCapabilities().sharedMemory) {
  throw new Error(
    'This operation requires cross-origin-isolated shared memory',
  );
}
// Register a participating task first; ready() also checks worker capabilities.
await runtime.run(task, input, { cancellation: 'cooperative', signal });
```

## Retirement and memory ownership

Browsers expose no Node-style exit confirmation or join. A validated final
response proves completion. `Worker.terminate()` plus endpoint revocation proves
only local retirement. PJS stops admission/progress, waits for every clone/post
transaction to commit or roll back and input/transfer cleanup to finish, then
terminates and abandons each remaining terminal correlation once. A failed post
already rolled back is not abandoned. Throwing native termination fails cleanup
closed: no successful retirement/replacement or release of its retained claims.
Late/duplicate messages on detached generations have no effect.

`unconfirmedRetirements` is a cumulative count of endpoints retired with unfinished
invocations, not a live-thread gauge. Pool/credit limits bound managed accounting,
not provably live native threads or total RSS. Shutdown promises local retirement,
not native join or safe shared-memory reuse. Revocation, shared atomics and a
cancel/error notification do not certify old shared backing quiescent. Keep shared
input immutable, or allocate a new backing generation rather than reusing it.
Silent worker self-close is not observable as completion; use an explicit lease
for potentially nonreturning ordinary work, or forced shutdown. Page teardown is
best effort. Browser callback scopes do not supply Node AsyncResource/AsyncLocalStorage
guarantees. Node retains validated-completion/confirmed-exit ownership throughout.

## Deployment security

Tasks are trusted application modules, not arbitrary untrusted code. Serve over
HTTP(S) with JavaScript MIME types; bootstrap is same-origin and imported task
dependencies need appropriate URL/CORS permissions. Allow the bootstrap in the
page's CSP `worker-src`. The **worker script response's own CSP** controls its
module imports and execution; configure its `script-src` and applicable network
directives too. PJS requires neither eval nor executable blob/data URLs. Adapt
policies to the deployed asset origins rather than allowing arbitrary origins.

Shared memory is optional. Usable shared memory normally requires secure context,
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (or an appropriate credentialless
deployment), including compatible CORS/CORP permissions for embedded assets.
Non-isolated pages support ordinary workers, transfer and bounded progress;
cooperative requests reject rather than downgrading cancellation.

`npm run test:browser` packs/installs the artifact, checks Node-free graphs and both
compilers without Node types, and runs native/Vite dev/production fixtures at
`/app/` in real Chromium with isolated and non-isolated pages. The executed browser
version is printed. Firefox, WebKit and other engines remain unclaimed until
executed; browser mocks alone are not execution evidence.
