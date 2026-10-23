# C2: Range, count stream, mapping and batching option transition

Fetched main is `3e0381317fde3438e1a3008dc8c4e84257ff066a`, the PR #26 C1-A/Q
merge, tree `8a3b8f3fd69b07c44d9749f8a69c34af3e701691`. History confirms S1,
corrected Stage A and B1–B4 are integrated. No applicable AGENTS.md was found
in the ancestor/repository instruction search. Work uses the isolated
`feat/c2-range-option-transition` branch; the original checkout and other
worktrees/evidence are preserved. The handoff explicitly authorizes this shared
alias transition, normal commits/push and one draft PR to main.

## Implementation and compatibility

Only three option pairs change: dispatchBatchSize/experimentalDispatchBatchSize,
maxBufferedResults/experimentalMaxBufferedResults and
outputConstructor/experimentalOutputConstructor. Legacy members are deprecated
in declarations and remain accepted. Both-presence rejects equal, conflicting,
undefined and inherited properties before either value is read. A small stateless
internal selector probes the current name then the legacy name and returns the
selected key, without reading options. No scheduler/state owner/context is added.

Batch selection remains after timeout/signal in shared range validation. Count
selection remains before byte-mode validation in the stream adapter, including
existing catch-path rejection accounting. Invalid null/primitive stream options
retain the original property-read and catch-path behavior. Constructor selection
remains before parent submission; its getter and presence errors are synchronous
without a rejected parent count. Common validation returns a rejected Promise;
stream normalization returns a sticky failed closeable stream. New Proxy has
operations and skipping absent value reads are documented intentional changes.
Ordinary run never gains batching: a defined lease rejects either batch spelling
by presence, including inherited undefined, before transfer/posting.

Five interfaces become type aliases with explicit exclusive-pair unions and
intersections: PartitionOptions, StreamRangeOptions, BinaryStreamRangeOptions,
UpperBoundBinaryStreamRangeOptions and TypedMapRangeOptions. This intentionally
loses interface declaration merging and interface extension of these union shapes;
applications can use intersections. Optional never alternatives exclude the
other spelling. Runtime presence checks remain authoritative without exact
optional types. Constructor inference/overload order, shared-capable inputs/maps,
binary/count-only exclusions, closeable streams, B3 and B4 contracts remain.

There is no change to batch scheduling, sequential failure/skipped siblings,
completion-only discard before serialization, flat logical map assembly,
validation-before-target lookup, default capacity, eager completion-order streams,
empty ranges, context, logical cancellation or physical credit/occupancy owners.
Strict byte names, validation and credit algorithms are unchanged.

## Acceptance and installed consumers

Twenty-three new runtime contracts cover every pair's own/inherited single spelling,
duplicate equal/conflicting/undefined cases, no getter reads on duplicate pairs,
single selected reads, throwing getters/has traps, abort and shutdown reentrancy,
rejection accounting, no factory/post/detachment, ordinary/range lease exclusions,
configured singleton transfer exclusion, batch/count defaults and numeric limits,
batch 16 as one physical dispatch, all eleven empty typed constructors and invalid
subclasses. Existing synchronized range/completion/batch/stream/map, context and
physical-boundary suites now exercise new C2 names; focused legacy tests remain.
The original failure/skipped-sibling, retention/exit and map cancellation seam
assertions remain intact. Existing helpers/watchdogs are reused; no new sleeps,
GC deadlines, relaxed timeouts or test hooks in production are introduced.

Installed JavaScript exercises all four methods, array/typed mapping, count/exact/
maximum streaming, inherited constructor selection, legacy positives and duplicate
rejection/sticky stream failures. Both emitted TypeScript consumers execute all
methods/overloads with new common options and focused legacy mapping/range calls.
Both full compiler fixtures reject incompatible pairs (including explicit
undefined with exact optional types) and retain all existing binary/count-only,
shared input, B3 and B4 negatives. Actual packed consumers run outside the
repository with no skipLibCheck; runnable binary examples use C2 common names
and retain experimental byte names.

## Derived inventory and emitted scope

Before implementation, the untouched baseline was built and all dist files
copied and hashed; its complete source/declaration inventory is retained in
ignored evidence. The same checker derives the candidate: 61 roots = 17 runtime
values + 44 type-only names; 333 member entries; zero additional named reachable
types; 158 diagnostic leaves. The eleven new member IDs are six inherited batch
members, four count members and one constructor member. No removed member/root
or diagnostic change is intended. The typed legacy constructor member becomes
optional in the union, whose alternatives require exactly one constructor.

Emitted comparison permits the four changed JavaScript boundaries (map adapter,
stream adapter, shared range validation, task submission) and the new internal
stateless selector. Existing scheduling, assembly, lifecycle, worker/credit and
telemetry JavaScript must remain byte-identical. Public overloads/root exports
are unchanged; the option declarations encode only these C2 pairs. Source and
declaration graph parity, semantic delta and experimental marker checks accompany
the ordinary qualification receipts. Frozen RC4 inputs, historical reports/audits,
workflows, manifests, dependencies and versions remain untouched.

## Qualification and evidence provenance

Development preflight passes all 337 runtime contracts and installed JS/both
locked emitted TS consumers on local Windows x64 Node 24.21.0. That is preflight,
not qualification of a clean committed candidate. Retained failed attempts include
an uncached offline dependency installation, expected old Proxy-trace assertions,
a test getter requiring an explicit return for lint and an installed TS local
variable collision. Additional fixture corrections use the existing map error
class and the existing successful return() with sticky subsequent failure, rather
than assuming different behavior. Failed fixture output and the failed package
report/tarball are retained. Fixes
were limited to fixtures/expected new presence traces; no checks were weakened.

Commit implementation, acceptance and this report before qualification. Each
fresh exclusive receipt binds exact source SHA/tree and clean status, platform/
architecture, actual Node/runtime npm, independently verified release npm 11.19.0,
locked primary 7.0.2 and compatibility 6.0.3 compilers, commands and package SHA-256.
Run the unchanged ordinary qualifier and standard R2/R3 with original seeds,
actions, bounds and checks, plus both full compiler fixtures, inventory parity/
regressions and the emitted comparison. Release-tooling tests are dry runs only.
The draft PR and ignored final delivery receipt bind the actual final results
without a self-referential report commit. No ignored archives enter Git.

Initial exact cells are Linux x64 Node 22.13.0/24.21.0 and Windows x64 Node
22.13.0/24.22.1. Reconfirm official tool availability and actual selected patches;
a floating CI selector cannot prove a different patch. Missing/failed cells stay
unqualified and retained. No configured local Linux runtime is assumed; existing
authorized branch/draft-PR CI can provide remote evidence without workflow edits.
Audit raw R2 histories/actions/observations, worker/replay/negative/cleanup records
and every R3 config/result/source/environment/measurement/quiescent-owner/confirmed
exit against aggregate reports. Verify archive digests and extracted contents,
plus retained tarballs. Attribute a synthetic merge to its actual SHA/tree and
prove tree equivalence before treating it as head evidence. Historical C1/B4
qualification remains historical and supplies no new C2 pass.

## Decision and release boundary

Aliases remain and every feature remains experimental. Separate P2 promotion,
C1-P, C3, C4, Stage F version/baseline selection and publication are not authorized
by this implementation. C2 and future C3 must land before the same eventual
transition prerelease; this task starts no alias window and publishes no partial
migration. C4 removal requires its own later decision. Separately tracked holds
remain open, untouched and outside this task; no P1/P2/P3 eligibility is inferred.
No merge, auto-merge, tag, publication, Rust or unrelated optimization is included.
