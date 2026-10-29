# PJS 1.0.0 candidate and migration

**Unpublished review proposal.** RC5 is published at
`131d28112924fc55228d4722ec111aa513f94aee`. This candidate prepares 1.0.0;
it does not authorize stable publication. On 29 October 2026 `next` selects RC5
and `latest` selects RC4. Historical release notes retain their original status
and attribution. See the [fixed checkpoint and evidence ledger](research/v1-release-checkpoint.md).

## Proposed alias policy

RC5 is the combined transition prerelease and retains all six aliases. The
candidate proposes removing them **directly in 1.0.0**. ADR 0023 originally
required a following removal prerelease before stable freeze. That exact boundary
needs a maintainer amendment; this implementation is a review proposal, not an
accepted policy. No further prerelease or elapsed-time approval is inferred.

| Removed candidate property         | Use instead            |
| ---------------------------------- | ---------------------- |
| experimentalDispatchBatchSize      | dispatchBatchSize      |
| experimentalMaxBufferedResults     | maxBufferedResults     |
| experimentalOutputConstructor      | outputConstructor      |
| experimentalResultBytes            | resultBytes            |
| experimentalMaxResultBytes         | maxResultBytes         |
| experimentalMaxReservedResultBytes | maxReservedResultBytes |

Remove legacy keys completely, including inherited keys and keys explicitly set
to undefined. Every affected existing boundary checks presence and rejects before
reading that pair's values, building inputs, posting work or detaching buffers.
Other validation/getter ordering stays at its existing owner. Constructor-selector
failure is synchronous; range validation rejects its Promise; stream selection
returns a failed closeable stream. Throwing Proxy traps retain existing catch
behavior. Stable values are read once and absence retains existing defaults.

```js
// RC5 transition input:
const old = {
  experimentalMaxBufferedResults: 2,
  experimentalResultBytes: 16,
  experimentalMaxReservedResultBytes: 32,
};
// Prepared stable input; do not spread `old` and leave removed keys behind:
const options = {
  maxBufferedResults: 2,
  resultBytes: 16,
  maxReservedResultBytes: 32,
};
const stream = runtime.streamRange(task, range, createInput, options);
try {
  for await (const { output } of stream) consume(output);
} finally {
  await stream.return();
}
void old;
```

Stable declarations omit legacy members, including legacy `never` exclusions.
Explicit type aliases preserve conditional input/output/progress inference and
overload applicability. Count-only excludes the three stable byte properties;
exact and upper-bound modes remain mutually exclusive and require capacity.
Fresh literals reject unknown keys, but TypeScript permits extras on structurally
compatible variables. Runtime presence guards remain authoritative. Declaration
merging is not a supported extension mechanism. Closeable iteration and ordinary
ArrayBuffer backing requirements remain unchanged.

If the maintainer selects retention in 1.x, this same candidate must restore
acceptance, declarations, fixtures and freeze. Supported stable aliases would
then carry a SemVer obligation: removal requires a later major release.

## Intended public contract

Only the Node root and explicit `/browser` entry are supported. Internal subpaths,
worker protocols, debug/profile hooks, emitted private fields and source-map paths
are not public contracts. Stable behavior/types/errors/defaults and supported
diagnostic fields follow SemVer after approval and publication. Exact error text,
stack text, timing, enumeration order and implementation graphs are not protocols.

| Area / existing owner                  | Contract retained from RC5                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration / registry                | Register trusted module exports before runtime construction; stable task handles and a private registry snapshot. Node file URLs support ESM and callable CommonJS forms; browser registration uses HTTP(S) ESM.                                                                                                                             |
| Lifecycle / controller and host worker | ready/run/shutdown; first shutdown options and Promise win. Logical settlement is separate from execution ownership. Node releases physical occupancy/credits on validated completion or confirmed exit. Browser shutdown performs posting-safe retirement and terminal local accounting; no native join or shared-backing quiescence proof. |
| Recovery / task and range coordinators | Bounded opt-in retries/fallback require repeatable work; no replay of successful/delivered partitions, no rollback of side effects. Explicit rebuildInput reconstructs recovery input after capacity claim; transfers need fresh backing/lists. Browser rejects unsupported crash/lease recovery causes before effects.                      |
| Scheduling / FIFO and dispatcher       | Default FIFO/priority zero; stable priorities and guarded custom comparator. Bounded async concurrency overlaps waits on one JS thread per worker. Destructive cancellation and ordinary leases are exclusive; replacement restores capacity, not task success.                                                                              |
| Progress / invocation context          | Invocation-local bounded lossy JSON progress, informational only; no result/credit release. Cooperative/progress opt-in adds context; default invocation remains execute(input).                                                                                                                                                             |
| Ranges / range coordinator             | Half-open integer partitions, lazy admission, one parent deadline/context. Ordered collection retains outputs; parallelFor discards before serialization. Batch size 1–16 groups transfer-free children; range execution leases remain excluded.                                                                                             |
| Streams / range stream                 | Eager completion-order single-consumer delivery with explicit return/throw cleanup, count bounds and cancellation. Exact/upper-bound visible result bytes use existing credit reconciliation, slack refunds and physical ownership rules; no RSS bound.                                                                                      |
| Mapping / assembly                     | Full ordered flat target, built-in typed constructors, exact block kind/cardinality; preserve validation before target lookup. Shared-capable map outputs do not widen strict binary result backing.                                                                                                                                         |
| Transfers / transfer core              | Clone default; dispatch detaches every sender alias of transferred input. Failed/cancelled ownership stays with existing posting/physical owners; no hidden restoration copies.                                                                                                                                                              |
| Shared memory / shared helper          | sharedReadonly copies visible numeric bytes into reusable shared backing; immutability is an application contract. Cooperation needs usable page/worker shared memory. Cancellation never certifies browser shared-memory reuse.                                                                                                             |
| Diagnostics / telemetry                | Copied snapshots and supported counters, units and lifetimes; no completed-task retention or latency/performance guarantee. Node/browser differences remain explicit.                                                                                                                                                                        |
| Browser capabilities / browser host    | Dedicated module workers; inert Node-free import graph, no host execution fallback. Native copied assets and Vite dev/production under non-root bases share canonical worker/helper graphs. No isolation: cooperative mode rejects and progress uses bounded message credits. resourceLimits presence rejects.                               |

The remaining `@experimental` annotation on the array-map overload in the
internal `api/range/parallel-map-range` adapter is retained. That internal callable
and its direct declaration are outside supported export paths. The public range
facade's P2 contract was already promoted; no annotation is erased or feature
promoted by this checkpoint. Internal profiling/debug/protocol mechanisms remain
unsupported. No experimental public feature is promoted to make the freeze appear
stable.

## Complete intended differences from RC5

- Runtime: six selectors reject legacy presence; ordinary run rejects the former
  batch alias at its validation boundary. Stable algorithm, admission, lifecycle,
  result, ownership, host and worker protocols are preserved.
- Types: six legacy members/exclusive transition unions disappear; stable
  conditional generic aliases, overload order and stable mode exclusions remain.
  Root export names and runtime values stay the same for both entries.
- Consumers/tests: positive fixtures, active tooling and examples use stable
  names; C2/C3 positives remain covered and C4 adds explicit removal negatives.
- Package: workspace/package/lock version is 1.0.0, updated packaged README and
  changed source/emitted declarations/JS/maps from the changes above. Export maps,
  engine floors, dependencies/resolutions, files allowlist and publisher pins stay
  fixed. Source/maps do not grant internal import support.
- Release tooling: explicit stable registration/preparation, immutable RC5 guard,
  historical identity regressions, stable `latest` rehearsal classification and
  focused final-candidate CI. Active docs distinguish published RC5 from stable.

## Platforms and qualification

Node engines remain `^22.23.4 || ^24.22.1 || ^26.12.1`. Linux/Windows x64 exact
floor/current selections are 22.23.4, 24.22.1, 24.22.2, 26.12.1 and 26.13.0.
Both compiler fixtures and installed Node/browser consumers exercise the intended
artifact. Chromium native/Vite profiles are bounded support evidence; other
engines, macOS, ARM64 and arbitrary bundlers remain unclaimed. No family-wide
every-patch or process-memory/performance guarantee follows from those results.

Qualification and two-build/canonical archive identities are recorded in the
checkpoint ledger. RC5's evidence cannot qualify changed stable bytes. Stable
hold applicability, contract/policy approval, evidence acceptance and merge/release
authorization are distinct remaining decisions. Nothing here publishes a release.
