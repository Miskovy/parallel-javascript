# Exact Node 24.0.0 development-floor qualification

## Baseline and scope

Baseline main is `c162cc7e9b7b3ebc5360de2fad5664f36274b2ac`, the PR #29 merge,
tree `4fa5467ca8dffeca14c81fa38c21e26ed481f02a`. The isolated
`test/node24-floor-qualification` branch preserves other worktrees and assets.
No applicable AGENTS.md was found. Both manifests declare
`^22.13.0 || ^24.0.0`; earlier later-patch evidence did not qualify 24.0.0.

This task qualifies development source, not the immutable published RC4 artifact
or a final release. All six deprecated aliases and experimental annotations
remain. Engines, versions, dependencies, compilers, publication configuration,
frozen inputs and runtime behavior are unchanged. The
[post-C3 decision table](v1-api-migration-plan.md#decisions-for-maintainer-review)
continues to govern promotion and release decisions; hold applicability remains
unresolved.

## Exact runtimes and tools

Official archives were downloaded from [Node's v24.0.0 distribution](https://nodejs.org/dist/v24.0.0/)
and checked against [SHASUMS256.txt](https://nodejs.org/dist/v24.0.0/SHASUMS256.txt).
The reference executable hashes below were computed from those verified archives.
The floor CI supplement requires the running executable to match those bytes,
including when setup-node uses the Actions tool cache.

| Platform    | Archive / SHA-256                                                                                    | Executable SHA-256                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Linux x64   | `node-v24.0.0-linux-x64.tar.xz` / `59b8af617dccd7f9f68cc8451b2aee1e86d6bd5cb92cd51dd6216a31b707efd7` | `5677177955d00aa75909df3490120a2e2a2bba80ebcc66a505e8f9d7a5f0b463` |
| Windows x64 | `node-v24.0.0-win-x64.zip` / `3d0fff80c87bb9a8d7f49f2f27832aa34a1477d137af46f5b14df5498be81304`      | `ade7ce4d4ff97447aa4fdcf2ae9e9094cbfaca0b135475cac621349bc2d335ab` |

The local Windows executable reports Node **24.0.0**, V8
**13.6.233.8-node.10**, runtime npm **11.3.0**, Windows x64. The Linux archive's
bundled npm metadata is also 11.3.0; actual Linux execution must be established
by CI, not inferred from the downloaded archive. Local WSL enumeration failed
with access denied, so no local Linux execution is claimed.

Locked primary/compatibility compilers remain **7.0.2 / 6.0.3**. Release npm is
selected independently at **11.19.0**, with the existing archive integrity
`sha512-SDd/hHg3KqHE5Ht2NHWxNYNtqCQ2pXAPLl6OtQhPyED5PHsRfrOtO199MZTIG2cQoQ1ZRI9t28shrD+2cr3AAw==`.
The supplement verifies the actual provisioned release archive, executable,
Node/V8/OS identities, compiler versions, source SHA/tree and clean status.

## Ongoing CI and acceptance

The validation matrix is now Linux/Windows x64 × **22.13.0, 24.0.0, floating 24**:
six jobs instead of four. Existing selectors, ordinary qualification, standard
R2/R3 bounds/seeds/watchdogs and evidence retention are preserved. Each job
generates R2/R3 once and passes those reports into the qualifier. No publication
workflow, Actions version or credentials/permissions change is involved.

Exact-floor jobs additionally run `scripts/node24-floor-checks.mjs` after the
ordinary gate, retaining `.node-tools/node24-floor/` even on failure. It executes
the complete compatibility public fixtures, source/declaration inventory parity
and inventory-tool regressions under the selected Node 24.0.0 process. It records
source/emitted JS/declaration hashes for independent baseline comparison; it
does not freeze future runtime implementations to this baseline.

The ordinary gate covers build, all individual contracts, primary public type
fixtures, production compatibility, installed JS and both emitted TS consumers
without skipLibCheck, release-tooling dry runs, lint, format, docs and diff.
Acceptance also requires raw R2 histories/actions/observations/replay/negative
detection/real-worker cleanup, every R3 config/result/measurement/ownership
checkpoint and created-versus-confirmed exits, plus actual package hashes.
Downloaded CI archives must match GitHub's digests and extracted records must
reconcile with aggregates. Synthetic merge trees must match the reviewed head.

## Results and evidence status

**Pending execution and independent audit.** The introduced matrix is coverage
configuration, not a passing result. Neither floor cell is accepted by this
initial report. Candidate SHAs, exact runs, cell outcomes and package hashes
will be recorded after the clean committed candidate executes. Failed/incomplete
attempts remain separate; an unavailable platform remains unqualified.

Existing historical reports retain their conclusions, including incomplete B2
Linux qualification. A floor pass would support only the named development
candidate on these exact cells; it would not establish every Node 24 patch,
published RC4 compatibility, production readiness or Stage F closure.
