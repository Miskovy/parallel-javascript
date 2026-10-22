# ADR 0023: Proposed v1 API stability and migration decisions

## Status

**Proposed — pending maintainer review and Stage B/C implementation.** No surface
is promoted and no final release is authorized. This records recommendations,
not an accepted replacement of earlier contracts. It preserves ADR 0022's S1
ownership and all existing physical-completion/containment constraints.

S1, corrected Stage A, B1 and B2 are integrated through PR #22 at main
`2ae078b93c8b819d2d843ecb32ffb1fc5e6728f7`. B3 is separately authorized and
implemented in development: snapshot storage/access is internal and the unsupported
public method/declaration is removed. B3 is integrated through PR #23 at main
`e58e792a2069a9ac72cc13fe2309eb1e3c2b7dab`. B4 is implemented separately in
development with explicit diagnostic/error types and preserved runtime behavior.
This does not accept C promotion or this ADR as a whole. The context and counts below retain the
historical Stage A baseline; the canonical inventory records current B1–B4
changes and the explicit pre-v1 snapshot migration.

## Historical Stage A context and baseline

On 22 October 2026, fetched main remains
`72335494704a6251c26505226c4f2575424ab190` (PR #17 R3). S1 remains local at
`f93fb9cb249a54ee625a19a20b5a6d7f7d68647f`, four commits ahead; this Stage A
branch depends on it. See [S1 report](../research/s1-runtime-api-boundaries.md)
and [canonical inventory](../research/v1-api-contract-inventory.md) for evidence
limits. Source/declaration discovery finds 40 root names, 175 member entries,
seven additional named reachable types and 158 statistics leaves. RC4 is the
published prerelease, not these development bytes despite unchanged manifests.

Actual gaps are a hidden stream cleanup declaration, overly broad binary result
backing types, public registry composition access and inferred diagnostic shapes.
Renaming experimental options alone cannot establish stable contracts. Existing
historical inventories and immutable release freezes are not today's API analysis.

## Recommended decisions

1. Stabilize core registration/construction/ready/run/shutdown, core errors and
   specialized ownership helpers after their named gates. Preserve existing
   defaults, validation timing, promise identity, synchronous graph/start order,
   caller/physical distinctions and no replay/rollback. No source change in A.
2. Implement B1–B4 as [specified](../research/v1-api-corrections.md): required
   closeable self-iterator preserving current return/throw/failure semantics;
   ordinary-backed strict result type separate from shared-capable inputs/maps;
   internal WeakMap registry snapshots with no public compatibility method; and
   explicit supported diagnostics/error types. Retain all 158 reviewed fields,
   aliases and current diagnostic mutability/status vocabularies. Intentionally
   export supported reachable types; internalize TaskDescriptor.
3. Promote C1 containment separately from C2 ranges/count-stream/map/batching and
   C3 strict binary credits. Preserve ordinary-run-only leases, opt-in rolling
   budget, first shutdown options, bounded sequential batch 1–16/default 1,
   full collect/map retention and eager completion-order streams. Byte bounds
   cover per-stream visible payload, not backing stores/process memory. Promotion
   requires contract closure plus installed JS/TS and source-bound evidence.
4. Use the six minimal option renames and one-prerelease deprecated alias window
   in the [migration plan](../research/v1-api-migration-plan.md). Reject simultaneous
   spellings by presence, including undefined/inherited keys. Remove and reject
   old names in the following chosen prerelease before final freeze; no warning
   path or silent precedence. Version selection remains a later decision.
5. Prefer delaying a feature group/final release if its gate fails. Withdrawal
   requires a separate explicit decision and migration; no silent API deletion
   or accidental experimental leakage into the target stable contract.
6. Retain current Node engine floors only after F tests floor/current-patch cells
   for both majors on Linux/Windows x64. Node 24.21.0 evidence does not establish
   24.0.0. Fix failing floors by default; narrow engines only by reviewed prerelease
   decision/migration. Retain ESM/compiled file-URL tasks and unclaimed platforms.
7. Keep immutable RC4 freezes intact. Future F work must choose explicit
   version/baseline selection with no fallback, separate semantic compatibility
   from exact artifact reproduction, and qualify the actual candidate/tarball.
   Keep publication behind separate G authorization.

## Alternatives, costs and exact decisions needed

| Decision to approve           | Default recommendation                                                         | Bounded alternative and consequence                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Stream throw/failure protocol | Preserve actual implementation; required return/throw type only                | Cleaner persistent throw error/return-clears-failure would change behavior; separately design/test, do not smuggle into B1             |
| Binary result backing         | Narrow strict type; keep runtime checks and shared inputs/maps                 | Keep broad type and document runtime rejection; simpler source compatibility but knowingly misleading, rejected                        |
| Registry composition          | Remove unsupported JS/TS snapshot; internal function/storage                   | Leave deprecated method: avoids unsupported callers breaking but retains leaked contract; rejected before freeze                       |
| Diagnostics                   | Support all 158 reviewed fields and aliases with explicit meanings             | Prune aliases or narrow active snapshots: smaller long-term surface but pre-v1 migration cost without demonstrated need; rejected here |
| Option migration              | One transition prerelease, following prerelease removes aliases before freeze  | Single breaking prerelease removes implementation overlap but no migration window; amend this decision before C if selected            |
| Feature inclusion             | C1/C2/C3 separate approvals; delay failed group/release                        | Explicit withdrawal with documented lost bounds/convenience; requires additional review, not automatic                                 |
| Node floor                    | Fix and test existing floors; select exact current patches at F                | Narrow failed floor to a qualified selected patch with release notes; additional consumer constraint/qualification                     |
| Release identity              | Maintainer selects new unused prerelease and candidate-specific baselines at F | No reuse of RC4 or weakened byte checks; no acceptable implicit fallback                                                               |

Approval is requested for this concrete decision package during review, not via
an automatic external action. Actual promotion, prerelease versions, any changed
alternative/floor/withdrawal, final source/baseline and publication remain separate
decisions. Tests are necessary evidence and never substitute for these choices.

## Implementation and validation

The original review order was S1, A, then separate B units. S1/Stage A/B1/B2
are integrated through PR #22 and B3 is implemented as a separate development
change, now integrated through PR #23. B4 has separate development contracts and
an [engineering report](../research/b4-explicit-diagnostic-contracts.md).
C1/C2/C3/C4 remain separate review units with owners, dependencies
and acceptance in the linked specs.
Preserve facade/configuration/composition/controller boundaries and one pump;
do not add generic contexts, tracing, event buses or parallel state owners.
Ordinary Promise continuation context and range AsyncResource scope are retained.

Stage A validates deterministic source/declaration inventory and focused gap
probes, locked builds/types, lint/format/docs/diff. It does not rerun full R2/R3
or claim fresh cross-platform runtime qualification. S1 Linux passes are attributed
to supplied review; raw addendum is unavailable. The excluded incomplete original
Linux Node 24 child report does not count; confirmed replay/campaign is separate.
S1 integration → A → B → C → F → G remains the release sequence. Internal cleanup
or optimization is conditional, never authority to expand A.
