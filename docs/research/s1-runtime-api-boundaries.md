# S1: Runtime API, composition and lifecycle boundaries

## Baseline and scope

Starting and fetched remote-main commit:
`72335494704a6251c26505226c4f2575424ab190`, R3 PR #17. The checkout was clean.
`origin` uses the repository's older `Miskovy/pjs` URL, which redirects to
`Miskovy/parallel-javascript`; no remote configuration was changed. Recent merges
were R1 #15, R2 #16 and R3 #17. There was no delta from the supplied reference.
The baseline's [CI run](https://github.com/Miskovy/parallel-javascript/actions/runs/39223715678)
passed all four Linux/Windows Node 22/24 jobs. Its metadata is retained locally in
`.node-tools/s1/baseline-remote.json`; these are baseline results, not candidate
qualification.

Work is isolated on `refactor/v1-runtime-api-boundaries`. Local implementation
commits are `dcf08cc9bd40cec7af2e6233f0d4e49fb0921e2d` (configuration) and
`f1e9ab2dcda4b63ae381bbc4c0d79edb2ae9f223` (composition, controller, API,
validation/assembly and verification observations). The subsequent documentation
commit is the delivered candidate. Each final qualification report records its
exact `sourceCommit`; the delivery ledger under `.node-tools/s1/` records that
SHA without requiring a self-referential documentation commit.

The audit read runtime, partition operation/range/stream/binary code, task
coordination/registration/transfer code, dispatch, pool, worker/bootstrap/protocol,
credits, telemetry, root types/exports, compiler/package configuration, ADRs 0018
and 0021, R1/R2/R3 verification helpers/drivers/reports, qualification, package
smoke and CI. No public correction, feature promotion, version/dependency change,
protocol change, scheduler change or publication is included.

## Ownership and module changes

| Concern                                                                             | Before                                                     | After                                                                                            |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Public prototype methods and overloads                                              | `runtime.ts`                                               | `runtime.ts`, direct delegation                                                                  |
| Ordinary submission adaptation                                                      | Facade                                                     | `api/run.ts`, `RunSubmission` capability                                                         |
| Collecting/completion mode selection                                                | Facade                                                     | `api/range/partition-range.ts`, `parallel-for.ts`                                                |
| Map overloads and constructor selection                                             | Facade                                                     | `api/range/parallel-map-range.ts`                                                                |
| Stream overloads and option adaptation                                              | Facade and range coordinator                               | `api/range/stream-range.ts`, narrow range/stream capabilities                                    |
| Scalar constructor defaults/validation                                              | Facade                                                     | `configuration/runtime-options.ts`                                                               |
| Registry snapshot, queue read, callback wiring, graph construction                  | Facade                                                     | `composition/create-runtime-components.ts`                                                       |
| Runtime state, shared lifecycle promises, pump, drain/escalation/fatal coordination | Facade                                                     | One `RuntimeController`                                                                          |
| Accepted parents, AsyncResource, lazy production, children, terminal settlement     | `RangeCoordinator`                                         | Same owner                                                                                       |
| Stateless shared request validation                                                 | Range coordinator                                          | `partition/validation.ts`, invoked at the same point                                             |
| Map block validation/copying                                                        | Range coordinator method                                   | `partition/results/map-assembly.ts`; target, counters, timing and settlement stay in coordinator |
| Tasks / physical admission / FIFO / result credits                                  | Task coordinator / dispatcher / scheduler / credit manager | Same owners                                                                                      |
| Worker population / execution / stream buffers                                      | Pool / worker / stream                                     | Same owners                                                                                      |

The run capability is colocated with `api/run.ts` because it does not depend on
ranges. All other requested paths are used directly. These modules remain
internal; the package export map and root index are unchanged. The facade holds
one component reference without duplicated lifecycle state. API functions receive
small typed capabilities, not the facade or a general component context.

Composition stores callbacks in passive owners, then constructs the controller,
telemetry and stream capabilities before synchronous startup. One controller owns
the runtime state, readiness/shutdown promises, guarded pump, drain waiter and
escalation timer. Its pump order and the range continuation immediate are
unchanged. Normalization preserves property access order and synchronous
constructor errors; registry snapshot still precedes the queue getter. An
internal forwarding overload lets map/stream facade implementation signatures
delegate their existing unions without expanding supported public overloads.

No per-task closures over a component graph or payload history are added. Stream
capabilities are allocated once per runtime. Request validation returns a
short-lived parent-level record without input/factory payloads. Assembly receives
the existing output target and scalar identity/context inputs, with no owner
record or resource authority. There are no new timers or Promise scheduling layers.

## Public API parity

All 40 development root exports, constructor/public method types, overloads,
option optionality, errors and inferred statistics match the starting commit.
The TypeScript checker comparison in `.node-tools/s1/public-contract.mjs`
compares resolved export types, call/construct signatures and public instance
members. Private/protected layouts are excluded and only compiler-generated
numeric symbol identity suffixes are normalized. Raw baseline and candidate
snapshots are retained. Existing type tests and both locked compilers supplement
that comparison; installed-package qualification verifies ESM/NodeNext, worker
URLs, source maps and execution from an unrelated working directory.

`ready()` and repeated `shutdown()` preserve shared promise identities and
prototype receivers. Repeated shutdown ignores later options before validation;
the first call retains its getter/validation order. Streams still return the
existing AsyncIterable declaration. Synchronous factories, AsyncResource scope
and destruction, physical occupancy, transfer detachment, shared memory,
credit reconciliation and terminal-before-cancellation order are preserved.

Deferred API corrections remain separate: directly closeable stream typing,
shared-backed binary-view typing, `PjsTaskRegistry.snapshot()`'s declaration leak,
and a reviewed named stable statistics interface. Experimental controls are not
promoted. Historical RC4 source/package evidence and all `scripts/rc/` and release
scripts remain unchanged. RC source freezes are not valid development gates.

## Verification observation changes

The new test-side `test/helpers/runtime-inspection.mjs` returns actual live
components or the actual lifecycle controller. It copies no mutable state and
caches no workers or payloads. Observation relocation is the only change to
existing test assertions and instrumentation:

- `helpers/containment.mjs`: physical worker/credit owners.
- `helpers/lifecycle-runner.mjs`: task/credit maps, dispatcher, controller pump,
  drain state and shutdown clock. Instrumented callbacks still bind their owners.
- `helpers/lifecycle-oracles.mjs`: exact credit/admission/range/repair checks and
  controller shutdown timer.
- `helpers/memory-lifecycle.mjs`: actual task/parent/credit/pool owners and
  controller timer/drain waiter; numeric-only sampling remains unchanged.
- `containment.test.mjs`, `memory-lifecycle.test.mjs`,
  `model-real-worker.test.mjs`, `physical-boundary.test.mjs` and
  `upper-bound-result.test.mjs`: direct field observations/clock bindings.
- `scripts/r3/child.mjs`: actual coordinator dispatched/settle instrumentation
  and current pool records.
- `scripts/reservation-soak.mjs`, `scripts/cross-platform-v011/binary.mjs` and
  `scripts/compression-supplement-v014.mjs`: credit/owner observation paths.

R2's independent model and enabled-action generator, seeds, histories, negative
detection, real-worker checks, credit sums, diagnostics and watchdog budgets are
unchanged. R3 configurations, scenarios, seeds, measurements and bounds are
unchanged. Historical RC tooling is preserved for its historical source.

Eight new `runtime-boundaries.test.mjs` cases cover actual startup with complete
callbacks and synchronous spawn, constructor/snapshot/queue getter ordering,
prototype/shared-promise compatibility, mode/request adaptation, map constructor
getter timing, stream normalization/rejection ordering, assembly context/offsets,
blocked internal package paths, and range getter order before state rejection.
Port probes supplement the original real-worker suites. Existing map, stream,
reservation, AsyncResource and lifecycle tests continue to exercise settlement
and cleanup; their assertions were not replaced by aggregate statistics.

Development verification passed the original 284 contracts before editing, plus
type and compatibility checks. After extraction, the 291-case development run
passed, and the subsequently added eighth seam case passed in the focused suite
(final total: 292). An intermediate observation relocation missed spread-expression
receivers and failed existing private checks; those paths were corrected without
altering assertions. TypeScript's compatibility compiler required explicit types
on cyclic composition callback owners; both compilers now pass. Development
reports and raw type/benchmark snapshots remain under `.node-tools/s1/`.

## Clean candidate qualification

Final tracked documentation is prepared before final qualification. Run artifacts
are ignored and never overwrite earlier failure/evidence paths. The final delivery
ledger identifies the delivered SHA, exact commands/results and any missing cells.

Local environment: Windows 10 build 19045, x64, Intel Core i3-10100F. Node
24.21.0 uses runtime npm 11.18.0. The available Node 22.13.0 distribution uses
runtime npm 10.9.2. `npm ci` installed the unchanged lockfile. Publication npm is
separately provisioned and integrity-verified at 11.19.0, using:

```powershell
npm.cmd run release:npm -- .node-tools/s1/release-npm
```

The returned CLI is
`.node-tools/s1/release-npm/node_modules/npm/bin/npm-cli.js`; provisioning evidence
is `provision.json` in that directory. This provisions tooling only.

```powershell
npm.cmd run runtime:qualify -- --release-npm-cli=E:/Miskovy/Work/pjs/pjs/.node-tools/s1/release-npm/node_modules/npm/bin/npm-cli.js --output=.node-tools/s1/win-node24.json
# In a separate shell, prepend the existing Node 22 distribution to PATH:
$env:PATH = (Join-Path (Get-Location) '.node-tools/node-v22.13.0-win-x64') + ';' + $env:PATH
npm.cmd run runtime:qualify -- --release-npm-cli=E:/Miskovy/Work/pjs/pjs/.node-tools/s1/release-npm/node_modules/npm/bin/npm-cli.js --output=.node-tools/s1/win-node22.json
```

Each qualifier enforces clean committed source and runs build, contracts, type
tests, compatibility compiler, installed package, release tooling tests, lint,
format, docs and diff checks, followed by standard R2/R3 campaigns. It creates
source-matching `.r2/` and `.r3/` directories beside the report and preserves
their original corpus/bounds. Debug credit invariants are enabled for final runs.
No immutable RC4 freeze is substituted for ordinary qualification.

Linux Node 22/24 candidate cells require separately authorized remote candidate
pushing/CI, which this task does not authorize. They remain unqualified; successful
baseline CI and Windows results do not qualify them. No remote push, PR creation,
comments, package publication, tag, release, dist-tag or merge is performed.

## Bounded performance check

The existing dispatch-efficiency and completion-only measurement programs are
run sequentially by `.node-tools/s1/benchmark.mjs` on baseline and candidate.
They cover ordinary bounded run, collecting range, completion range and stream,
with two workers, 512 scalar no-op partitions, batch size one, two warmups and
five measured trials per case. Commands, machine details, first-run data and all
raw samples are retained in `base-benchmark.json`, `development-benchmark.json`
and the final `candidate-benchmark.json`.

Baseline versus implementation medians (milliseconds) were ordinary 40.13/25.35,
collecting 45.29/30.37, completion 45.79/28.88 and streaming 44.73/31.22. These
small, sequential no-op samples show substantial common drift and do not establish
a speedup or a material performance guarantee. They omit representative large CPU,
binary/map, memory, Linux and Node 22 workloads. No implementation change was made
to chase measurements. Final raw samples and comparison are included in the local
delivery ledger with their exact source commit.

## Proposed pull request

Title: **Separate runtime API adaptation, composition and lifecycle ownership**

The public facade mixed API adaptation with constructor wiring and runtime
lifecycle algorithms, making an API-specific change require unrelated engine
knowledge. Keep `PjsRuntime`'s existing public signatures and delegate to internal
API modules, scalar configuration normalization, one composition builder and one
lifecycle controller. Stream normalization moves out of accepted-parent control;
map block validation/copying becomes stateless while the range coordinator retains
parents, metrics, production and settlement.

Retain physical execution/credit ownership and the guarded pump order. Relocate
existing exact observations through a test-only adapter and add eight seam cases.
Document the boundary in ADR 0022 while preserving ADR 0018's history. Attach the
clean-candidate qualification ledger, resolved public-contract comparison and
bounded benchmark evidence. Report Linux cells as unqualified until candidate CI
runs. Stream/binary typing, registry snapshot and named statistics API corrections
remain deferred; no release or feature promotion accompanies this refactor.
