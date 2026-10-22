# API stability and compatibility

PJS is pre-1.0. **The v1 policy below is proposed, pending review and Stage B/C
implementation.** It does not promote current features or declare v1 ready.
The [canonical current inventory](research/v1-api-contract-inventory.md) discovers
44 root names, all declared members and five additional reachable named types,
including R1 additions. The [v0.15 inventory](research/v0.15-public-api-inventory.md)
is historical (38 root names), not the development contract.

B1 is now implemented in development: streamRange returns PjsRangeStream with
required direct cleanup, and CountOnlyStreamRangeOptions is root-named. Both new
exports are type-only; runtime keys and stream protocol are unchanged. The stream
API remains experimental. These declaration additions are not in published RC4;
B2 development also exports PjsOwnedTypedArray and ResultByteDeclaration and
narrows strict PjsBinaryResult views to ordinary backing. This deliberate pre-v1
constraint preserves shared-capable inputs, mapping and count-only streams.
B3/B4, feature promotion and option renames remain proposed.

As checked on 22 October 2026, npm `latest` and `next` select
[`@pjavascript/runtime@1.0.0-rc.4`](https://registry.npmjs.org/@pjavascript%2fruntime);
GitHub lists [RC4 as a prerelease](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4).
Merged development main includes R1/R2/R3 additions absent from that immutable
artifact. Stage A is based on unmerged local S1
`f93fb9cb249a54ee625a19a20b5a6d7f7d68647f`; S1 integration remains pending.
Unchanged development `rc.4` manifests do not authorize republishing its new bytes.

## Current status and proposed disposition

| Surface                                                                                     | Current status                                              | Recommended v1 disposition / exact gate                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry registration, runtime construction, ready/run/shutdown, base options/errors        | Core candidate                                              | Stabilize with documented registration/admission/first-shutdown contracts; B3 encapsulation, B4 errors, installed core consumers                                                                    |
| transfer/sharedReadonly and ownership types                                                 | Specialized supported                                       | Stabilize specialized helpers: dispatch detachment/alias effects, copy-visible-bytes shared input, immutability by contract; installed ownership and physical-boundary gates                        |
| executionLease, lease error, restartPolicy, forceAfter                                      | Experimental development additions despite unprefixed names | Promote C1 after B4, containment/physical/R2 and installed JS/TS gates; ordinary exclusive run only, no replay or hard termination deadline                                                         |
| partitionRange / parallelFor                                                                | Experimental                                                | Promote C2: ordered retained collection / completion-only pre-serialization discard, one parent deadline/context, partial side effects; range/batch/installed gates                                 |
| streamRange / result types                                                                  | Experimental                                                | B1 closeable stream implemented; C2: eager completion order, single consumer, explicit abandonment cleanup; stream/context/memory/installed gates                                                   |
| parallelMapRange / array and typed overloads / map error                                    | Experimental                                                | Promote C2: full flat target, logical ordering, built-in constructors, exact block kind/cardinality and reentrant validation-before-target lookup                                                   |
| Dispatch batching and count/output-constructor options                                      | Experimental with experimental prefix                       | C2 minimal renames; default 1, limit 16, sequential items, transfer/lease restrictions and skipped-item failure preserved; no automatic batching                                                    |
| Exact / upper-bound binary output options, types and errors                                 | Experimental                                                | B2 ordinary-backed result types implemented in development; C3 minimal renames and separate promotion after credit/worker/physical/installed negative TS gates; visible payload per stream, not RSS |
| stats / task and worker snapshots / containment diagnostics                                 | Supported diagnostics; nested shape not frozen              | B4 explicit named interfaces, retain all 158 inventoried fields and aliases with reviewed units/lifetimes; C1/C2/C3 gates for corresponding groups; no timing/performance guarantee                 |
| Registry.snapshot / TaskDescriptor                                                          | Public JS/TS composition leak, unsupported                  | Remove method and root-reachable descriptor in B3; internal WeakMap snapshot function, stable handles and copied descriptors; explicit pre-v1 migration                                             |
| Error contexts, inline task-error details, reachable status/mode and byte-declaration types | Structurally reachable, mostly not root-named               | Intentionally name/export supported types in B1/B2/B4; preserve metadata, hierarchy and status vocabularies. Internalize only TaskDescriptor in B3                                                  |

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
release authorization are separate decisions. Current runnable examples continue
to use current spellings until implementation.

Once declared stable in 1.x, supported behavior **and types**, error identities,
supported diagnostic fields, defaults and ownership/cleanup semantics follow
SemVer; incompatible changes require a major. Additive fields/types may be minor,
but should not silently narrow assignability or overload resolution. Exact stack
or message text, constructor arity, enumeration order, transient sample ordering,
performance bounds and internal graphs are not protocols.

The root package is the only supported import. Packed source/maps enable editor
navigation, not internal subpath contracts. Public class members remain callable
in JS despite export maps or `@internal`; B3 actually removes snapshot. TS-private
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

Unchanged manifests declare `^22.13.0 || ^24.0.0`. Recent S1 qualification covers
exact Node **22.13.0 and 24.21.0** on Windows/Linux x64. Linux evidence is attributed
to the supplied independent review/handoff; its raw addendum/archive is unavailable
here. See the inventory for the accepted confirmed rerun versus excluded original
Node 24 child artifact. Historical passes do not qualify Stage B/C or prove Node
24.0.0. No macOS, ARM64, other major or every-patch guarantee follows.

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
