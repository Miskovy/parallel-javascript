# B4: Explicit diagnostic and error contracts

B4 starts from fetched main `e58e792a2069a9ac72cc13fe2309eb1e3c2b7dab`, the
PR #23 merge of B3. S1, corrected Stage A and B1–B3 are included in its ancestry.
The isolated branch is `feat/v1-explicit-diagnostic-contracts`. The original
worktree and other candidates/evidence remain untouched. No applicable AGENTS.md
was found in the ancestor or tracked source trees.

## Contract implementation

The new focused `src/diagnostics.ts` defines fourteen explicit public types:
PjsRuntimeStats, PjsOutcomeStats, PjsContainmentStats, PjsWorkerStats,
PjsQueueStats, PjsTimingStats, PjsOperationStats, PjsStreamResultStats,
PjsMapResultStats, PjsPartitionStats, PjsDispatchStats, PjsOperationSnapshot,
PjsOperationStatus and PjsRangeResultMode. Imports flow from the facade,
telemetry projection and internal operation status aliases toward these
contracts; they do not depend on telemetry implementation types, ReturnType,
internal records or mapped inferred shapes. Both stats() and the telemetry
snapshot() explicitly return PjsRuntimeStats; normal structural checking verifies
the projection without assertions/casts.

All 158 diagnostic leaves preserve their reviewed names, types and optionality.
Copies remain writable, including arrays and nested task/worker/parent records.
The required restartWindowUtilization remains number or undefined and is a
rolling-window restart count. All seven outcome fields, capacity and four parent
mode breakdowns remain. Partition stats have no timedOut field. Active parents
retain all 28 fields, the full six-status/four-mode vocabularies, optional mode
fields and optional typedOutput whose value may explicitly be undefined. Existing
TaskSnapshot/WorkerState and their statuses are unchanged. Streams/maps and
byte-mode bufferedKnownPayloadBytes remain compatibility aliases. No terminal
history, new metric or internal ownership graph is exposed.

Errors intentionally root-name PjsErrorContext, PjsBinaryResultErrorContext and
PjsTaskErrorDetails. The first two preserve the former reachable interfaces;
details names the existing inline name/message/optional stack record. No worker
protocol type is exported. Constructors retain defaults and required arguments,
inheritance/instanceof/concrete names, unknown cause and native optional
stack/cause. Six instance context fields stay required, readonly and possibly
undefined. Byte/remote fields remain class-specific; accepting a context key
does not cause a subclass to copy it. Empty messages and existing stack
construction are preserved. Type-only declarations introduce no new runtime
error class or interface value.

## Artifact and inventory comparison

The untouched main build and its JavaScript/declaration SHA-256 manifest are
retained before editing. Per-file comparison requires every pre-existing
production JavaScript file to remain byte-identical: all 36 pass. The sole new
JavaScript file, diagnostics.js, contains `export {};` and its source-map comment,
with no initialization or root runtime export. Source maps are outside the JS
byte claim because source positions change. There are no unexpected emitted-code
differences.

Five existing declarations change: index.d.ts adds the type-only roots;
runtime.d.ts and telemetry/runtime.d.ts name the explicit return contract;
errors/index.d.ts names contexts/details; partition/operation.d.ts aliases the
public status/mode vocabularies. diagnostics.d.ts is new. The other declarations
are identical. The comparison also checks all old root members/modifiers,
constructor signatures with only intentional type-name substitutions, and every
expanded diagnostic leaf against the untouched inventory.

The checker derives **61 roots = 17 runtime values + 44 type-only names,
322 member entries, zero additional named reachable types and 158 stats leaves**.
Compared with B3's 44/186/4/158, seventeen type-only roots add 136 member entries;
four former reachable types move to their intentional public names. Their REACH
IDs are retired as history. No snapshot(), root TaskDescriptor, internal
subpath or experimental option name is restored or added. The canonical inventory
preserves the curated field meanings/units/lifetimes and refreshes exact
source/declaration locations and signatures.

## Acceptance coverage

Both locked compiler fixtures import and use every new public type, including
stats assignment, required/optional/undefined distinctions, the complete unions,
writable copies, all six readonly error context fields, readonly byte fields,
unknown cause narrowing and construction of all thirteen error classes. Targeted
negative cases reject incompatible metadata, unsupported statuses/modes,
partition timedOut, omitted required utilization and omitted task-error context.
The installed package gate repeats the complete public fixture without
skipLibCheck, then compiles and executes an independent diagnostic/error consumer
under each compiler from an unrelated working directory. It checks metadata,
aliases and copy isolation against the packed candidate. Installed JS additionally
rejects diagnostic/error internal subpaths and retains root-value and B3 absence
checks.

Three added runtime cases cover error identity/metadata, zero-sample means and
deep snapshot isolation with a synchronized running task, caller cancellation
before physical completion, and map validated-copy totals versus successful child
responses. Existing tests gain assertions for optional mode fields, byte-mode
aliases, exact reservation peak/refund units and replacement-local worker totals.
The full suite reuses the existing containment, registry, runtime-boundary,
physical ownership, stream/map, credit and lifecycle tests rather than copying
their scenarios. New worker scenarios use existing gates and bounded observation
helpers; no sleep, GC deadline, performance bound or production hook is added.

Development preflight on Windows x64 Node 24.21.0 passed 314 contracts and the
packed installed consumers. The first focused attempt passed 21/23: two new
assertions incorrectly assumed mappedElements was copied progress and the
buffered-byte alias existed in count-only mode. Source and inventory agreed on
planned length and byte-mode-only presence; assertions were corrected, with no
behavior change. The corrected focused run passed all 38 cases. A lint preflight
also caught two compile-only property expressions in each fixture; explicit void
uses corrected them. An initial docs invocation encountered Git's worktree
ownership guard; a process-local safe.directory setting allowed the unchanged
check to pass without changing global configuration. Failed attempts are retained
separately.

## Clean-candidate validation and provenance

Commit implementation/tests/docs before final validation. Fresh exclusive
receipts and ignored delivery bind the exact committed candidate SHA to source
cleanliness, platform/architecture, Node, runtime npm, compiler versions and the
retained packed tarball digests. This avoids claiming a self-referential report
commit as already qualified. Development preflight is identified separately.

Run the following ordinary gates on Windows x64 exact Node 22.13.0 (runtime npm
10.9.2) and 24.21.0 (runtime npm 11.18.0). Both use locked primary TypeScript
7.0.2 and compatibility/inventory checker 6.0.3; the compatibility wrapper package
is 6.0.2. Select and integrity-verify release npm 11.19.0 independently with
PJS_NPM_CLI for release regressions. npm commands below are invoked through each
selected Node binary and npm-cli.js; receipts retain the absolute commands.

```sh
npm run build
npm run test:contracts
npm run test:types
npm run typecheck:compat
npm run test:package
npm run test:release
npm run lint
npm run format:check
npm run test:docs
node node_modules/typescript/bin/tsc6 -p packages/runtime/test/tsconfig.json
node scripts/api-contract-inventory.mjs --check --output=<fresh-cell-inventory.json>
node --test scripts/api-contract-inventory.test.mjs
git diff --check
```

The retained B4 driver runs these same gates with the ordinary qualifier's
unchanged 300-second command watchdog and per-test harness timeouts, plus the
baseline artifact/public-graph comparison and clean-source checks. It does not
invoke runtime:qualify: that driver unconditionally launches R2/R3 campaigns.
No harness, timeout, frozen RC4 input, workflow, manifest, version, dependency or
release implementation is changed. Release tests are dry-run only.

No fresh B4 Linux result is inferred from Windows. B3 CI Linux Node 22.13.0 and
24.22.1, and Windows 22.13.0 and 24.21.0, are historical provenance supplied in
the B4 handoff, not fresh B4 checks or evidence for another Node patch. Historical
B2 Linux remains incomplete: Node 22 combines separately successful runs without
an end-to-end ordinary qualifier; Node 24 is incomplete/failed. Prior failed
artifacts remain preserved. Capture exact source/environment and reconcile raw
children before accepting any later CI qualification.

Local Linux execution is unavailable: wsl.exe lists no configured distribution
and no Docker command is installed. These are unavailable local cells, not failed
or passed B4 Linux tests. The ordinary contract suite still runs its existing
bounded model/real-worker and memory tests; no new R2/R3 campaign is inferred.

Unchanged bounded R2/R3 campaigns are deliberately not repeated solely for these
declaration names; the B4 specification reserves them for promotion/final
qualification. No Node 24.0.0 floor, other platform/architecture, extended GC,
memory-pressure, performance or final-release qualification is claimed. Feature
groups still require their Stage C acceptance and approval; Stage F must select
and qualify a new exact version/baseline/artifact, and Stage G requires separate
publication authorization. ADR 0023 remains proposed as a whole. Separately
tracked release holds remain open and untouched; no investigation was performed.
No unresolved diagnostic/error design decision was needed. Stop after the B4
draft PR delivery; no Stage C, Rust, broad refactoring, merge or publication.
