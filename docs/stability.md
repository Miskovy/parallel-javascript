# API stability and compatibility

**Promotion status:** P1/P2/P3 are promoted in development after reviewed benchmark acceptance; all six deprecated aliases remain. Publication, hold applicability, C4 and Stage F/G remain separate.

PJS is pre-1.0. As checked on **23 October 2026**, npm `latest` and `next`
select [`@pjavascript/runtime@1.0.0-rc.4`](https://registry.npmjs.org/@pjavascript%2fruntime),
and [GitHub RC4](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
is a prerelease. Final v1.0.0 has not been released.

Integrated Checkpoints 1–4, patched Node support and host cleanup are prepared
as the **unpublished 1.0.0-rc.5 candidate**. Version metadata does not publish it or
replace RC4. The [RC5 migration note](release-v1.0.0-rc.5.md) explains intentional
changes. Current [public inventories](research/v1-api-contract-inventory.md) record
71 Node root exports / 168 diagnostic leaves and 72 browser root exports / 167
leaves, with no additional reachable named types. Historical inventories remain unchanged.

B1 exposes the existing closeable stream contract; B2 narrows strict results to
ordinary backing; B3 removes unsupported registry.snapshot() access; B4 names
diagnostic/error types. C1-A/Q adds acceptance and installed-consumer evidence.
C2/C3 implement [six option spelling pairs](partitioning.md#c2-development-option-transition)
with deprecated aliases and exclusive presence rules. **P1/P2/P3 contracts are promoted in development;
all six deprecated aliases remain.** The authoritative
[post-C3 decisions](research/v1-api-migration-plan.md#decisions-for-maintainer-review)
separate P1/P2/P3 promotion, the shared transition release, C4, F and publication.
Hold applicability remains unresolved; P1/P2/P3 development promotion follows
explicit maintainer approval, not an inference from passing CI. It supplies no
hold eligibility or release clearance. The [promotion report](research/p1-p2-p3-development-promotion.md)
records fresh qualification, the historical strict JavaScript byte-identity
failure and the explicit maintainer-approved revised acceptance.

## Current status and proposed disposition

| Surface                                                                              | Current status                                              | Recommended v1 disposition / exact gate                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry registration, runtime construction, ready/run/shutdown, base options/errors | Core candidate                                              | Stabilize with documented registration/admission/first-shutdown contracts; B3 encapsulation, B4 errors, installed core consumers                                             |
| transfer/sharedReadonly and ownership types                                          | Specialized supported                                       | Stabilize specialized helpers: dispatch detachment/alias effects, copy-visible-bytes shared input, immutability by contract; installed ownership and physical-boundary gates |
| executionLease, lease error, restartPolicy, forceAfter                               | Promoted development contract                               | C1 accepted after B4, containment/physical/R2 and installed JS/TS gates; ordinary exclusive leases, eligible opt-in recovery, no hard termination deadline                   |
| partitionRange / parallelFor                                                         | Promoted development contract                               | C2 contract: ordered retained collection / completion-only pre-serialization discard, one parent deadline/context, partial side effects; range/batch/installed gates         |
| streamRange / result types                                                           | Promoted development contract                               | B1 closeable stream implemented; C2: eager completion order, single consumer, explicit abandonment cleanup; stream/context/memory/installed gates                            |
| parallelMapRange / array and typed overloads / map error                             | Promoted development contract                               | C2 contract: full flat target, logical ordering, built-in constructors, exact block kind/cardinality and reentrant validation-before-target lookup                           |
| Dispatch batching and count/output-constructor options                               | Promoted development contract                               | C2 renames implemented; P2 promotion is accepted. Default 1, limit 16, sequential items, transfer/lease restrictions and skipped-item failure preserved                      |
| Exact / upper-bound binary output options, types and errors                          | Promoted development contract                               | B2 types and C3 renames implemented; P3 accepted after credit/worker/physical/installed negative TS gates; visible payload per stream, not RSS                               |
| stats / task and worker snapshots / containment diagnostics                          | Supported diagnostics; explicit B4 contracts in development | B4 preserves all 158 inventoried fields and aliases with reviewed units/lifetimes; C1/C2/C3 gates for corresponding groups; no timing/performance guarantee                  |
| Registry.snapshot / TaskDescriptor                                                   | Internal; public method removed in B3                       | B3 implemented in development: module-private WeakMap, internal snapshot function, stable handles/copied descriptors; introspection callers retain their own metadata        |
| Error contexts, task-error details, status/mode and byte-declaration types           | Intentionally root-named in B1/B2/B4 development            | Preserve metadata, hierarchy and status vocabularies; TaskDescriptor remains internal after B3                                                                               |

[ADR 0023](adr/0023-v1-api-stability-decisions.md) records the recommendations,
alternatives and review decisions. The [B specification](research/v1-api-corrections.md)
and [C migration plan](research/v1-api-migration-plan.md) define signatures,
compatibility breaks, aliases/removal boundary, implementation units and acceptance.
Passing tests alone does not close a contract. If a group misses its gate, delay
its inclusion/final release; withdrawal requires a separate reviewed migration.
Do not leave experimental features accidentally within an experimental-free freeze.

## Compatibility boundary

Pre-v1 incompatible changes need prerelease notes and migration guidance. The
recommended transition accepts deprecated option aliases for one prerelease,
rejects both spellings by property presence, and removes/rejects aliases in the
following selected prerelease before final freeze. Actual version numbers and
release authorization are separate decisions. Current checkout examples use all
six C2/C3 development names. Both migrations are integrated, but one shared
transition prerelease has not been selected or published. No alias window starts
with their merges. All six aliases remain until a separately authorized C4 decision.

Once declared stable in 1.x, supported behavior **and types**, error identities,
supported diagnostic fields, defaults and ownership/cleanup semantics follow
SemVer; incompatible changes require a major. Additive fields/types may be minor,
but should not silently narrow assignability or overload resolution. Exact stack
or message text, constructor arity, enumeration order, transient sample ordering,
performance bounds and internal graphs are not protocols.

The supported entries are the Node root `@pjavascript/runtime` and the explicit
`@pjavascript/runtime/browser` entry. Internal subpaths remain unsupported. Packed
source/maps enable editor navigation, not internal subpath contracts. Public class members remain callable
in JS despite export maps or `@internal`; B3 removes registry.snapshot() from the
prototype and public declaration. Registry storage is module-private, while other TS-private
emitted properties, absolute-path internal imports, protocol, profile sink,
reservation debug flags and private-field inspection remain unsupported. Do not
claim that this provides runtime secrecy or a security sandbox.

Caller settlement, physical ownership and worker lifecycle are independent.
Abort/deadline/lease/escalation may settle callers while a worker remains occupied.
On Node, only a validated final execution response or confirmed worker exit releases
physical ownership. Browser shutdown/containment instead uses posting-safe endpoint
revocation and terminal local accounting; it provides no native join or proof of
shared-backing quiescence. Failed termination cannot report successful cleanup.

There is no retry by default. Eligible opt-in retries and one registered-task fallback
require `repeatable: true`; `rebuildInput` explicitly reconstructs transferred recovery
input when needed. Confirmed successes and delivered results are preserved. Node
supports the documented task-error, worker-crash and execution-lease recovery causes;
browser recovery permits validated task errors and genuinely skipped suffixes only,
never ambiguous revoked work. Partial/repeated effects remain the application's
responsibility. There is no rollback, automatic transfer restoration, native/OOM safety
or hard realtime preemption. Node preserves ordinary Promise continuation context and
range AsyncResource behavior; browser callback scopes provide no Node async-context
guarantee. See the [recovery API](guide/core-api.md#ordinary-execution-resilience-development)
and [browser lifecycle](guide/browser.md#retirement-and-memory-ownership).

## Proposed Node and platform policy

PJS uses **one ESM Node implementation**, consumed through import or synchronous
CommonJS require in development builds. Both resolve to the same runtime/declarations,
without duplicate registry/helper state. Compile TypeScript tasks to ordinary
JavaScript first and register local file URLs. Task modules can be ESM or CommonJS;
.cts consumers use NodeNext `import = require`, while .mts consumers use import.
Published RC4 remains ESM-only. Development's explicit browser entry now supports
dedicated module workers with native-module and Vite dev/production loading profiles;
see the [browser contract](guide/browser.md). Real Chromium **156.0.8078.4** was
executed on Linux x64, with isolated/non-isolated pages. Other browser engines
remain unclaimed. Automatic TypeScript task loading remains outside the contract.
No production dependency or new compiler prerequisite is introduced for consumers.

Development manifests now declare `^22.23.4 || ^24.22.1 || ^26.12.1`: the minimums
are **22.23.4, 24.22.1 and 26.12.1**, within those majors. The
[official October advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
and [release index](https://nodejs.org/dist/index.json), checked 26 October 2026,
confirm these security releases with no newer release on those lines. Stay on
current patched releases rather than treating a minimum as a recommended permanent
pin. Updating package engines does not upgrade a consumer's installed Node binary.

According to the [official schedule](https://github.com/nodejs/Release/blob/main/schedule.json),
Node 26 is **Current**, with LTS scheduled for 28 October 2026; Node 22 and 24 are
Maintenance LTS. Node 20 is upstream EOL (30 April 2026), remains unsupported, and
did not receive these October upstream fixes. The active six-cell matrix is
Linux/Windows x64 × the three exact minimums, with actual versions recorded,
normal runtime/package checks, standard R2/R3 and official executable identities.
CI results establish executions for a specific commit, not every patch or platform.

### Historical evidence and release scope

Accepted C1/C2/C3 campaigns
cover Linux x64 Node **22.13.0 / 24.21.0** and Windows x64 **22.13.0 / 24.22.1**
at the actual sources/trees in the [post-C3 evidence ledger](research/v1-api-migration-plan.md#reviewed-implementation-and-evidence).
These are historical runtime executions, not qualification of this documentation
commit or proof of Node 24.0.0. Earlier S1/B1/B4 results and incomplete B2 Linux
qualification retain their original attribution. No macOS, ARM64, other-major or
every-patch guarantee follows.

Subsequent [exact-floor qualification](research/node24-floor-qualification.md)
accepted Node **24.0.0** on **Linux x64 and Windows x64** for development candidate
`9e2068d437d70ae766d798913090d97412baf900`, tree
`b3e9504316757e9724f006068cd60929356b44fb`, in
[CI run 39988041278](https://github.com/Miskovy/parallel-javascript/actions/runs/39988041278).
Both cells passed the ordinary gates, unchanged standard R2/R3, full compatibility
fixtures and inventory checks; raw evidence and actual archives were reconciled.
This supports only the former 24.0.0 floor for that development source, not the
new minimums, immutable published RC4 or a future final candidate. The historical
report and frozen artifacts remain unchanged.

This maintenance changes support policy, not final-release gates or existing holds.
Any future final-candidate work must use the then-declared floors/current patches,
the separate release npm CLI and exact source/tarball attribution under the
existing [release procedure](releasing.md). Existing extended/reproduction/rehearsal
requirements remain separate; no additional campaign is introduced here. A failed
promised floor requires a concrete fix or an explicitly reviewed support change,
not an inferred pass from a later patch. Security triage carries no universal
patch/support deadline; see [SECURITY](../SECURITY.md).

## Release closure

S1 integration → A decision review → B corrections → C controlled promotion and
alias removal → F final-candidate qualification/rehearsal → G authorized release.
Conditional internal type/state work and optimization require independent reasons
and must finish before F. Historical RC4 source/artifact baselines remain immutable.
Current scripts explicitly select the registered RC4 or RC5 baseline from the candidate
version and reject unregistered versions; they never default new source to RC4.
RC5 remains an unpublished review candidate. Qualification binds the selected inputs
to the actual committed SHA/tree and staged artifact. Semantic API compatibility and
exact artifact reproducibility are separate checks. See [releasing](releasing.md).
Candidate preparation and documentation reconciliation do not clear existing holds,
decide their applicability, start an alias transition window or authorize publication.
