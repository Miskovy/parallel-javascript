# API stability and compatibility

PJS is pre-1.0. **Stage B is integrated; C2's development alias transition is
implemented. Stage C feature promotions remain pending separate approval.**
This does not promote current features or declare v1 ready.
The [canonical current inventory](research/v1-api-contract-inventory.md) discovers
61 root names, all declared members and no additional reachable named types,
including R1 additions. The [v0.15 inventory](research/v0.15-public-api-inventory.md)
is historical (38 root names), not the development contract.

B1 is now implemented in development: streamRange returns PjsRangeStream with
required direct cleanup, and CountOnlyStreamRangeOptions is root-named. Both new
exports are type-only; runtime keys and stream protocol are unchanged. The stream
API remains experimental. These declaration additions are not in published RC4;
B2 development also exports PjsOwnedTypedArray and ResultByteDeclaration and
narrows strict PjsBinaryResult views to ordinary backing. This deliberate pre-v1
constraint preserves shared-capable inputs, mapping and count-only streams.
B3 development removes unsupported registry.snapshot() and its declaration;
module-private storage and internal composition snapshots preserve registration
and runtime isolation. Introspection callers retain their own metadata. B4
development adds seventeen type-only diagnostic/error roots, naming all 158
preserved diagnostic leaves without changing runtime behavior. Feature promotion
remains pending. C2 introduces `dispatchBatchSize`, `maxBufferedResults` and
`outputConstructor` with deprecated legacy aliases and both-presence rejection.
The [range reference](partitioning.md#c2-development-option-transition) documents
observable presence checks and the interface-to-type-alias compatibility cost.
The three C3 byte names remain proposed and unavailable.

As checked on 22 October 2026, npm `latest` and `next` select
[`@pjavascript/runtime@1.0.0-rc.4`](https://registry.npmjs.org/@pjavascript%2fruntime);
GitHub lists [RC4 as a prerelease](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4).
Merged development main includes R1/R2/R3 additions absent from that immutable
artifact. Main `2ae078b93c8b819d2d843ecb32ffb1fc5e6728f7` integrates reviewed
S1/Stage A/B1/B2 through PR #22. B3 is integrated through PR #23 at main
`e58e792a2069a9ac72cc13fe2309eb1e3c2b7dab`. B4 is integrated through PR #24 at
B4 integration main `35f2aacfe431516ed559409a3cba6bf2ccd2e6b7`, whose tree matches the
reviewed B4 head and tested synthetic merge. The [Stage C plan](research/v1-api-migration-plan.md)
proposes C1 contract/installed-evidence closure and qualification first, with a
separate P1 promotion decision. C2/C3/C4 and the shared option-migration boundary
have their own dependencies/approvals; hold applicability is unresolved.
C1-A/Q is implemented as an acceptance/qualification change from main
`7533fbad82c3d80df80a6f6b633398b21dbcf827`, the PR #25 plan integration. It adds
the focused failure-path and installed JS/both-compiler scenarios, plus contract
comment/guidance clarification. Runtime algorithms, public shapes and all
experimental annotations are preserved. The [C1 report](research/c1-containment-acceptance.md)
and source-bound delivery distinguish current evidence from historical B4 runs.
C1-P promotion still needs explicit maintainer approval and hold-applicability
review; no eligibility or release clearance is inferred.
Unchanged development `rc.4` manifests do not authorize republishing its new bytes.

## Current status and proposed disposition

| Surface                                                                              | Current status                                              | Recommended v1 disposition / exact gate                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry registration, runtime construction, ready/run/shutdown, base options/errors | Core candidate                                              | Stabilize with documented registration/admission/first-shutdown contracts; B3 encapsulation, B4 errors, installed core consumers                                                                    |
| transfer/sharedReadonly and ownership types                                          | Specialized supported                                       | Stabilize specialized helpers: dispatch detachment/alias effects, copy-visible-bytes shared input, immutability by contract; installed ownership and physical-boundary gates                        |
| executionLease, lease error, restartPolicy, forceAfter                               | Experimental development additions despite unprefixed names | Promote C1 after B4, containment/physical/R2 and installed JS/TS gates; ordinary exclusive run only, no replay or hard termination deadline                                                         |
| partitionRange / parallelFor                                                         | Experimental                                                | Promote C2: ordered retained collection / completion-only pre-serialization discard, one parent deadline/context, partial side effects; range/batch/installed gates                                 |
| streamRange / result types                                                           | Experimental                                                | B1 closeable stream implemented; C2: eager completion order, single consumer, explicit abandonment cleanup; stream/context/memory/installed gates                                                   |
| parallelMapRange / array and typed overloads / map error                             | Experimental                                                | Promote C2: full flat target, logical ordering, built-in constructors, exact block kind/cardinality and reentrant validation-before-target lookup                                                   |
| Dispatch batching and count/output-constructor options                               | Experimental; C2 names and deprecated aliases               | C2 minimal renames; default 1, limit 16, sequential items, transfer/lease restrictions and skipped-item failure preserved; no automatic batching                                                    |
| Exact / upper-bound binary output options, types and errors                          | Experimental                                                | B2 ordinary-backed result types implemented in development; C3 minimal renames and separate promotion after credit/worker/physical/installed negative TS gates; visible payload per stream, not RSS |
| stats / task and worker snapshots / containment diagnostics                          | Supported diagnostics; explicit B4 contracts in development | B4 preserves all 158 inventoried fields and aliases with reviewed units/lifetimes; C1/C2/C3 gates for corresponding groups; no timing/performance guarantee                                         |
| Registry.snapshot / TaskDescriptor                                                   | Internal; public method removed in B3                       | B3 implemented in development: module-private WeakMap, internal snapshot function, stable handles/copied descriptors; introspection callers retain their own metadata                               |
| Error contexts, task-error details, status/mode and byte-declaration types           | Intentionally root-named in B1/B2/B4 development            | Preserve metadata, hierarchy and status vocabularies; TaskDescriptor remains internal after B3                                                                                                      |

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
release authorization are separate decisions. Current runnable examples use the
implemented C2 names and retain existing binary spellings. C2 and C3 must land
before one shared transition prerelease; no release window starts with this
development change. Aliases remain until a separately authorized C4 decision.

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

Unchanged manifests declare `^22.13.0 || ^24.0.0`. Re-inspected B4 CI covers
Linux x64 Node **22.13.0 / 24.21.0** and Windows x64 **22.13.0 / 24.22.1** at the
exact synthetic-merge SHA/tree in the [qualification ledger](research/v1-api-migration-plan.md#verified-starting-state-and-qualification-ledger).
Local B4 Windows 24.21.0 results remain separate. Historical S1/B1 evidence and
incomplete B2 Linux qualification retain their original attribution; B4 passes
do not rewrite them, qualify C candidates or prove Node 24.0.0. No macOS, ARM64,
other major or every-patch guarantee follows.

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
