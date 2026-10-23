# API stability and compatibility

PJS is pre-1.0. As checked on **23 October 2026**, npm `latest` and `next`
select [`@pjavascript/runtime@1.0.0-rc.4`](https://registry.npmjs.org/@pjavascript%2fruntime),
and [GitHub RC4](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
is a prerelease. Final v1.0.0 has not been released.

Development main `0f79db5e1192dd47db32d2e300fc382a0f431462` integrates S1,
corrected Stage A, B1–B4, C1-A/Q, C2 and C3. It differs from immutable published
RC4 despite unchanged version fields; those new bytes must not replace RC4.
The [canonical inventory](research/v1-api-contract-inventory.md) records **61 root
names, 342 members and 158 diagnostic leaves**, with no additional named reachable
types. The [v0.15 inventory](research/v0.15-public-api-inventory.md) is historical.

B1 exposes the existing closeable stream contract; B2 narrows strict results to
ordinary backing; B3 removes unsupported registry.snapshot() access; B4 names
diagnostic/error types. C1-A/Q adds acceptance and installed-consumer evidence.
C2/C3 implement [six option spelling pairs](partitioning.md#c2-development-option-transition)
with deprecated aliases and exclusive presence rules. **All feature experimental
annotations and all six aliases remain.** The authoritative
[post-C3 decisions](research/v1-api-migration-plan.md#decisions-for-maintainer-review)
separate P1/P2/P3 promotion, the shared transition release, C4, F and publication.
Hold applicability remains unresolved; merged work and passing CI imply no
promotion, eligibility or release clearance.

## Current status and proposed disposition

| Surface                                                                              | Current status                                              | Recommended v1 disposition / exact gate                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry registration, runtime construction, ready/run/shutdown, base options/errors | Core candidate                                              | Stabilize with documented registration/admission/first-shutdown contracts; B3 encapsulation, B4 errors, installed core consumers                                             |
| transfer/sharedReadonly and ownership types                                          | Specialized supported                                       | Stabilize specialized helpers: dispatch detachment/alias effects, copy-visible-bytes shared input, immutability by contract; installed ownership and physical-boundary gates |
| executionLease, lease error, restartPolicy, forceAfter                               | Experimental development additions despite unprefixed names | Promote C1 after B4, containment/physical/R2 and installed JS/TS gates; ordinary exclusive run only, no replay or hard termination deadline                                  |
| partitionRange / parallelFor                                                         | Experimental                                                | Promote C2: ordered retained collection / completion-only pre-serialization discard, one parent deadline/context, partial side effects; range/batch/installed gates          |
| streamRange / result types                                                           | Experimental                                                | B1 closeable stream implemented; C2: eager completion order, single consumer, explicit abandonment cleanup; stream/context/memory/installed gates                            |
| parallelMapRange / array and typed overloads / map error                             | Experimental                                                | Promote C2: full flat target, logical ordering, built-in constructors, exact block kind/cardinality and reentrant validation-before-target lookup                            |
| Dispatch batching and count/output-constructor options                               | Experimental; C2 names and deprecated aliases               | C2 renames implemented; P2 promotion remains separate. Default 1, limit 16, sequential items, transfer/lease restrictions and skipped-item failure preserved                 |
| Exact / upper-bound binary output options, types and errors                          | Experimental                                                | B2 types and C3 renames implemented; separate P3 promotion after credit/worker/physical/installed negative TS gates; visible payload per stream, not RSS                     |
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

The root package is the only supported import. Packed source/maps enable editor
navigation, not internal subpath contracts. Public class members remain callable
in JS despite export maps or `@internal`; B3 removes registry.snapshot() from the
prototype and public declaration. Registry storage is module-private, while other TS-private
emitted properties, absolute-path internal imports, protocol, profile sink,
reservation debug flags and private-field inspection remain unsupported. Do not
claim that this provides runtime secrecy or a security sandbox.

Caller settlement, physical ownership and worker lifecycle are independent.
Abort/deadline/lease/escalation may settle callers while a worker remains occupied.
Only a validated final execution response or confirmed worker exit releases that
physical ownership. No replay, rollback, transfer restoration, native/OOM safety
or hard realtime preemption. Preserve ordinary Promise continuation context and
range AsyncResource behavior; no tracing API is proposed.

## Proposed Node and platform policy

PJS is an **ESM Node package**. Use `import`, compile TypeScript tasks to ordinary
JavaScript first and register local file URLs relative to the calling module.
No CommonJS entrypoint, browser/bundler integration or TypeScript loader is promised.
No production dependency or new compiler prerequisite is introduced for consumers.

Unchanged manifests declare `^22.13.0 || ^24.0.0`. Accepted C1/C2/C3 campaigns
cover Linux x64 Node **22.13.0 / 24.21.0** and Windows x64 **22.13.0 / 24.22.1**
at the actual sources/trees in the [post-C3 evidence ledger](research/v1-api-migration-plan.md#reviewed-implementation-and-evidence).
These are historical runtime executions, not qualification of this documentation
commit or proof of Node 24.0.0. Earlier S1/B1/B4 results and incomplete B2 Linux
qualification retain their original attribution. No macOS, ARM64, other-major or
every-patch guarantee follows.

Recommend retaining those engine floors only if final-candidate F qualifies the
actual floor **22.13.0 / 24.0.0** and a deliberately selected current patch in
each supported major on **both Linux x64 and Windows x64**. Record exact versions
at F, deduplicate equal floor/current versions, use the reviewed separate release
npm CLI, and bind results to the final source/tarball. This is up to eight runtime
cells, not four assumed family-wide passes. Include build/types/installed package,
contracts and required R2/R3 evidence; separately complete required extended and
two-build artifact reproduction/release rehearsal.

If 24.0.0 (or another promised floor) fails, default to fixing compatibility and
rerunning affected qualification. Bounded alternative: explicitly narrow engines
to the first selected qualified patch in a reviewed prerelease with migration
notes, then qualify that floor/current matrix before freeze. Do not infer the
floor from a later patch or silently keep a failed promise. Stage A changes no
engine range. Security triage carries no universal patch/support deadline; see
[SECURITY](../SECURITY.md).

## Release closure

S1 integration → A decision review → B corrections → C controlled promotion and
alias removal → F final-candidate qualification/rehearsal → G authorized release.
Conditional internal type/state work and optimization require independent reasons
and must finish before F. Historical RC4 source/artifact baselines are immutable,
and current scripts select them unconditionally: they cannot qualify publication
of future source. F must deliberately select a new version/baseline and bind
qualification to that candidate. Semantic API compatibility and exact artifact
reproducibility are separate checks. See [releasing](releasing.md); no release
gate, frozen hash or package metadata is changed by this decision package.
