# C3 byte-option development migration

Baseline main is `24ad3a3f7a8d5f0900fcd85d7e89a47b3c68bce2`, the PR #27
C2 integration. An isolated feat/c3-byte-option-transition worktree preserves
the original checkout. No applicable AGENTS.md was found. The untouched build
and source/declaration inventory were captured before editing.

## Migration and compatibility

resultBytes, maxResultBytes and maxReservedResultBytes now accept their deprecated
experimental aliases. All six C2/C3 legacy aliases remain and features remain
experimental. Mixed declaration/capacity spellings are valid. Duplicate pair
presence rejects before either value read, including equal/undefined/inherited
properties. Every exact spelling conflicts with every maximum spelling; one
declaration and one capacity are required. Count-only excludes all six byte keys.

C2's unchanged stateless selector runs at existing boundaries: count first,
exact pair, maximum pair, mode exclusion, capacity pair, pairing exclusion,
selected declaration getter, selected capacity getter/validation, declaration
validation, submission. No declaration callback runs during normalization.
Production can start eagerly during submission; callbacks retain that timing.
Selected getters are read once. Added Proxy has checks are observable; catch
probes preserve legacy-first short circuit order, adding each new name after its
legacy name. Catch traps can still throw synchronously after rejectedOptions;
that behavior is preserved rather than redesigned. Null/primitive handling,
closeable streams and sticky failures remain governed by their existing owners.

The two strict types extend C2's inline exclusive unions; no helper type or root
export is added. Required legacy properties become optional individually while
the union requires exactly one spelling. The existing interface-to-type-alias
compatibility cost remains. Runtime presence checks remain authoritative without
exactOptionalPropertyTypes. Output/backing types, overload order, generic
inference, ResultByteDeclaration, C2 exclusions, B3 and B4 are preserved.

Only the stream adapter's spelling selection, presence validation, catch
recognition and forwarding change at runtime. Credit, binary inspectors, worker
validation, scheduling, transport, lifecycle, recovery and telemetry remain
unchanged. These subsystems are regression boundaries, not an investigation.

## Acceptance and evidence

Shared installed-JS/runtime acceptance exercises new/legacy/mixed exact and maximum
modes, own/inherited options, getter reads/order, duplicate pairs, incompatible
modes, missing fields, integer limits, zero, synchronous/lazy callback timing and
errors, C2 common options, abort/shutdown reentrancy, catch traps, accounting,
no factory/post/detachment and sticky cleanup. Both emitted TS consumers execute
all declaration/capacity spelling combinations; both compiler fixtures preserve
existing backing/nonbinary negatives and add C3 shape exclusions. Existing binary,
credit, physical and C2 regression suites retain their original assertions.

The first development fixture incorrectly assumed callbacks always wait until
the API returns; it was corrected to assert normalization-before-production.
A throwing has fixture also exposed the established catch-path synchronous
throw; acceptance distinguishes that path from a one-time trap failure. Failed
preflight outputs are retained in ignored evidence. No runtime algorithm, test
bound, watchdog or assertion was relaxed to obtain a pass.

Before qualification, commit implementation, tests and this report. Fresh
exclusive receipts bind exact clean source/tree, Node/npm/compiler identities,
commands, actual tarball hashes and standard unchanged R2/R3 raw children. The
ordinary qualifier includes full contracts, production compatibility, installed
JS/both emitted TS consumers without skipLibCheck, release-tooling dry runs,
lint/format/docs/diff. Supplement with both compiler fixtures, inventory parity/
regressions and emitted-scope comparison. Derive counts from the checker rather
than a fixed inventory. Only the stream adapter JS and option declarations may
change; all other production JS must remain byte-identical to baseline.

Exact initial cells are Linux x64 Node 22.13.0/24.21.0 and Windows x64
22.13.0/24.22.1. Actual patches, source/tree, package hashes and qualification
outcomes are bound in the draft PR and ignored delivery receipts after the
committed candidate runs, following the C2 report convention. Verify downloaded
archive digests and reconcile histories/observations, child results, cleanup and
confirmed exits against aggregates and extracted evidence. Retain/exclude failed
or unavailable attempts; historical C2 results remain historical.

## Approval boundary

This is API migration, not strict-result promotion or v1 readiness. P1/P2/P3,
separately tracked holds and their applicability remain separate and untouched.
C2/C3 belong to the same eventual transition prerelease; no version or window is
selected here. C4 cannot remove aliases merely because implementations merge.
No workflow/dependency/manifest/version/frozen-input changes, merge, auto-merge,
tag, publication, Stage F, Rust or unrelated refactoring are authorized.
