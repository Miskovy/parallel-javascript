# C1-A/Q: Containment acceptance and qualification

Base main is `7533fbad82c3d80df80a6f6b633398b21dbcf827`, the PR #25 merge of the
[Stage C plan](v1-api-migration-plan.md). Its tree matches the reviewed planning
commit 00a30a0. This isolated `test/c1-containment-acceptance` branch implements
the explicitly invoked C1-A/Q work packages. No applicable AGENTS.md was found in
the repository/ancestor instruction search. Other worktrees and historical
evidence are preserved.

## Implementation and supported contract

No runtime algorithm, default, validation order or supported public shape changes.
The production changes are comments in `types/index.ts` and
`configuration/runtime-options.ts`: lease/escalation integer units and boundaries,
successful-post start, first-shutdown ownership, asynchronous containment,
rolling decision-count semantics and lifetime fallback. Every experimental
annotation remains. Existing run/configuration/composition/controller/dispatch/
worker/pool/registry/credit ownership and the independent R2 model are unchanged.

An ordinary executionLease starts only after successful posting and physical
claim. Queue time and logical caller deadlines remain separate. Expiry preserves
an earlier timeout/abort outcome and never settles a caller twice. Restart windows
use monotonic time and approved recovery decisions, with lifetime maxRestarts
fallback (workers × 4 by default, zero valid). Defined policy/lifetime values
conflict; JavaScript explicit undefined does not select a defined lifetime budget.
Existing optional number declarations remain unchanged under exact optional types.

The first shutdown call owns its options and shared promise; later option getters
are not read. Escalation requests asynchronous termination and still awaits exit.
Replacement cannot precede confirmed old-worker exit. Termination failure cannot
release physical ownership or report successful cleanup. There is no task replay,
rollback, restoration of transferred inputs or hard realtime interruption promise.

## Focused acceptance and installed consumers

One new deterministic runtime case covers the missing lease-driven repair
termination-rejection path. A synchronized running ordinary task has a mocked
monotonic lease clock; the existing internal Node termination boundary rejects.
The leased caller receives one PjsExecutionLeaseError, queued work fails, the
runtime fails closed and shutdown rejects with the original termination cause.
Before actual exit, the physical correlation remains busy, one recovery decision
is counted, no replacement spawns, no budget exhaustion is fabricated and only
one execute message exists. A stale lease callback changes none of those results.
Actual Node exit ends ownership once; it does not turn the cached rejected
shutdown promise into success. The test uses existing gates/owner checks and
explicitly confirms cleanup through the original Node lifecycle.

The existing non-draining termination-rejection test is retained, not duplicated.
Full ordinary contracts reuse the already-settled caller, queue/post failure,
early/stale timer, policy snapshot/expiry/exhaustion, bootstrap, first-shutdown,
transfer/shared input, physical-credit and memory-lifecycle cases. Total contracts
increase from 314 to 315 without changing existing assertions, timeouts or bounds.

Installed JavaScript extends the original rolling lease/error/replacement case:
shared start/execution signals prove actual work and no replay. An active graceful
forceAfter case cancels a running and queued caller, preserves transferred-input
detachment and shared writes, returns the identical shutdown promise without
reading later option getters, confirms stopped/zero-busy and records one escalation
with no recovery decision or replacement. Lifetime default four, explicit zero
and explicit one budgets exhaust at the expected decision count and expose
required undefined rolling utilization. All cases await real runtime cleanup.

The emitted TypeScript consumer imports and uses RunOptions, RestartPolicy,
ShutdownOptions, PjsExecutionLeaseError and PjsContainmentStats against the packed
package. Both locked compilers execute ordinary lease/replacement, active graceful
escalation, shutdown identity and default/zero lifetime fallback scenarios. The
existing task fixture gains synchronized infinite-work/crash exports; these are
test workload functions, not production hooks. Both complete public type fixtures
retain the existing lease/range negatives and add missing wrong-primitive policy/
escalation negatives. Numeric bounds and runtime-only cross-option exclusions
remain runtime checks; no interface-to-union redesign occurs.

Package smoke still installs and executes outside the repository, checks installed
declarations without skipLibCheck, and uses the actual retained tarball. Existing
root-value/subpath/B3 absence, binary, stream, diagnostic/error and example checks
remain. The installed containment watchdog is still 10 seconds; its existing
5-second bounded observation pattern is reused. No fixed sleeps, GC deadlines,
performance assertions or relaxed watchdogs are introduced.

## Emitted and inventory comparison

The untouched baseline was built, copied and hashed before implementation. All
**37 pre-existing production JavaScript files remain byte-identical**, including
B4's empty diagnostics module; no module is added. All 37 declaration token
streams are identical after ignoring comments/trivia. Only types/index.d.ts and
configuration/runtime-options.d.ts differ in raw bytes, due to intentional
contract comments. Source/declaration maps may reflect new comment locations.

Source and built declarations retain the complete B4 graph: **61 roots = 17
runtime values + 44 type-only names; 322 members; zero additional named reachable
types; 158 diagnostic leaves**. Comparison retains all constructors, fields,
modifiers, aliases, optionality/status vocabularies and experimental markers.
Canonical inventory locations are refreshed from the checker; field meaning,
units/lifetime and historical report conclusions are preserved.

## Qualification procedure and evidence attribution

Commit implementation/tests/current docs before qualification. Each fresh receipt
records its exact clean source SHA and tested tree, platform/architecture, exact
Node, runtime npm, compiler identities, independently selected release npm, command
outputs and package hash. Ignored delivery and the draft PR bind the final results
without a self-referential report commit. Development preflight is not relabeled
as clean-candidate evidence.

The plan's reconfirmed targets are Windows x64 Node 22.13.0 and 24.22.1, and Linux
x64 Node 22.13.0 and 24.21.0. The exact Windows 24.22.1 archive is retained and
verified against the official Node SHA-256 list. Runtime npm is separately
recorded per cell; release npm 11.19.0 is independently integrity-verified. Locked
compilers are primary 7.0.2 and compatibility/checker 6.0.3 (wrapper 6.0.2).
Capture the actual remote Node patch rather than trusting the floating CI `24`
selector; any missing planned patch remains an outstanding cell, not a substituted
family-wide pass. Local Linux execution is unavailable without a configured
distribution/container; authorized branch/PR CI can supply fresh remote evidence.

Use the unchanged ordinary qualifier on available exact Windows cells:

```sh
npm run runtime:qualify -- --release-npm-cli=<verified-npm-11.19.0-cli> --output=<fresh-cell-report.json>
node node_modules/typescript/bin/tsc6 -p packages/runtime/test/tsconfig.json
node scripts/checks/api-contract-inventory.mjs --check --output=<fresh-cell-inventory.json>
node --test scripts/checks/api-contract-inventory.test.mjs
```

The qualifier builds, runs all contracts, public types, compatibility, installed
package, release dry-run regressions, lint/format/docs/diff, then standard R2 and
R3 with the original corpora/bounds. Existing CI runs R2/R3 once and supplies
their reports to the same qualifier, avoiding duplicate campaigns within a cell.
Supplement with declaration-token/public-inventory/JS comparisons and source-tree
and experimental-marker checks. No workflow, release tooling, frozen RC4 input,
manifest, version, dependency, timeout, model, generator or campaign changes.

Audit retained R2 histories/actions/observations and worker/negative/replay/cleanup
records, plus every R3 config/result/source/environment/measurement/quiescent owner
checkpoint and created/confirmed-exit total, against aggregates. Verify archived
and extracted evidence as well as actual package SHA-256. Attribute a CI synthetic
merge to its real SHA/tree; compare that tree with the reviewed head before
claiming equivalence. Exclude failed/incomplete/unavailable cells and retain them
separately. Any behavioral contradiction stops this unit for a scope decision;
it is not permission to change runtime code or loosen checks.

Development preflight confirmed the new failure-path case and installed package
on exact Windows Node 24.22.1. Retained failed attempts include negative type
directives placed on declarations before formatting wrapped the offending fields,
and an emitted TS throwing getter inferred as void rather than the declared
option type. Moving directives to the properties and explicitly annotating getter
return types corrected those fixtures. No production behavior was changed to
obtain green results.

Historical B4 evidence remains at its original candidate e78b773 / synthetic merge
c8c1576: Linux 22.13.0/24.21.0 and Windows 22.13.0/24.22.1. Separately reported
local Windows 24.21.0 evidence remains local B4 evidence. Historical B2 Linux is
still incomplete; later C1/B4 successes cannot rewrite it. No Node 24.0.0 floor,
other architecture/OS, extended GC/OOM, performance or final Stage F qualification
is inferred from ordinary C1 results.

## Recommendation boundary

This is acceptance/qualification, **not C1-P promotion**. A recommendation must
reflect the final source-bound matrix, including unavailable or failed cells.
Even complete evidence does not establish release-hold eligibility: separately
tracked holds remain open and untouched, applicability remains unresolved and
requires a maintainer decision. Promotion is deferred pending that decision,
evidence review and explicit C1-P authorization. ADR 0023 stays proposed as a
whole. No option rename/alias window, C2–C4 implementation, Stage F source/version/
baseline selection, publication/tag, merge/auto-merge, Rust or unrelated work is
included. Stop after this C1-A/Q draft PR delivery.
