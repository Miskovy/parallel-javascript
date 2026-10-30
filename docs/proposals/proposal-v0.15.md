# v0.15: runtime stabilization and 1.0 readiness

This proposal was written after inspecting the clean starting commit
`3ddf511b8ae4a2edfa2b472f59d2bf80b6adfd57` and running the seven baseline gates,
before stabilization implementation. Baseline source, manifest, export and
historical evidence SHA-256 hashes were captured first. The completed audit and
validation will live in `docs/research/v0.15-*` and
`benchmarks/results/validation-v0.15.json`.

## Current surface

The only package entrypoint is ESM `@pjs/runtime`, with a conditional declaration
export. It exports PjsRuntime, PjsTaskRegistry, transfer, sharedReadonly, twelve
error classes, and task, lifecycle, ownership and range types. Runtime methods
are ready, run, partitionRange, parallelFor, parallelMapRange, streamRange,
stats and shutdown. All four range methods remain explicitly experimental.
Registry.register binds local module exports; its @internal snapshot method is
also reachable and needs an explicit unsupported classification. Types reachable
through signatures and stats are part of the audit even without root re-exports.

The runtime source has 25 files and no production dependencies. v0.11 separated
task, range, dispatch, credit and telemetry owners. v0.12 validated upper-bound
refunds; v0.13 and v0.14 exercised real CPU and binary pipelines without finding
a missing primitive. Historical Windows/Fedora Node 22/24 correctness exists.

## Goals and decision criteria

- Inventory every root export, public member, option and observable error;
  classify each once, with source, tests and retained workload evidence.
- Explain caller settlement separately from physical execution, and result
  credit separately from process memory.
- Provide a short JavaScript introduction, focused guides and executable recipes.
- Test the actual npm tarball from an unrelated temporary consumer directory,
  including worker paths, errors, TypeScript, exports and example execution.
- Correct demonstrated packaging and type/contract documentation defects without
  changing scheduling or ownership. Expand only useful contract/type coverage.
- Define a deliberate pre-1.0 compatibility policy and concrete release gates.

Core-candidate status requires clear purpose, ownership, failure, cancellation,
typing, tests and cross-platform evidence. Successful performance experiments
alone do not promote an API. Retain experimental names when portability or
long-term surface decisions remain. Document naming differences when they
express different concepts; do not rename for style.

## Non-goals and compatibility

No new execution primitive, scheduler, automatic sizing/batching, ordered stream,
cooperative cancellation, workload package, native addon, performance campaign,
website, publication or 1.0 tag. Historical result artifacts and cross-platform
reports are immutable. Runtime semantics are frozen by default. Any necessary
source change must identify its allowed stabilization category and individually
answer the seven semantic-impact questions in the final report.

0.x breaking changes require an explicit problem, migration and risk assessment.
Implement only MUST/strong SHOULD fixes before 1.0; classify and defer other
debt explicitly. Prefer preserving the source when documentation suffices.
1.x would protect a specifically declared stable core; advanced experimental
controls need not block it.

## Initial risks and audit questions

- The package advertises Node >=22, while workspace tooling requires 22.13+;
  decide installation eligibility separately from the qualified support matrix.
- No CI workflow or installed-package gate exists. The package lacks its own
  README/license. Declaration/source maps point at sources not currently packed.
- Registry.snapshot is public despite @internal intent. Decide whether its
  removal is necessary now or explicitly unsupported pending a later cleanup.
- Binary result typings accept ArrayBufferLike views, including shared backing
  rejected at runtime. Evaluate this as experimental typing debt, not a new
  shared-result ownership capability.
- Stats exposes inferred nested shapes and internal type names; distinguish
  useful diagnostic contracts from promises of permanent counter layout.
- Graceful shutdown intentionally waits for abandoned streams and uncooperative
  work. Make that contract discoverable without inventing escalation.
- Baseline npm test reports 13 file-level successes in this environment. Obtain
  individual-test counts independently before comparing with retained 178-test
  evidence. Preserve the raw baseline result.

## Validation and readiness

Keep the user's default Node and power settings. Use already-installed Node 22
and 24 binaries explicitly for reduced correctness/package validation. Record
Windows package validation as pending if the machine is unavailable. A clean
installed import, worker run, public error identity, type resolution and shutdown
are mandatory. Check links, executable examples and artifact hashes at the end.

The readiness decision must distinguish a known core redesign/correctness defect
from release hardening or optional future features. Decide A, B or C only from
the completed evidence; do not begin the next milestone.
