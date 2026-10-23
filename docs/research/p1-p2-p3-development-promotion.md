# P1/P2/P3 development API promotion

This branch applies the approved P1 containment, P2 range/count/map/batch and
P3 strict-binary annotation/status promotion. All six deprecated aliases and
their exclusive-presence rules remain. No release, version, dependency, alias
window, C4 or Stage F/G change is authorized.

## Starting point and patch review

Remote `main` and merged PR #31 were verified at
`102ae49bec616be960bf1e3d63a727dea1731eae`, tree
`d19142e41a127876f7db6d62b4db2ffe4859c80d`, equal to reviewed head
`4cb5e4d44f7e90a0870cf3f92d5a9f27c095b8f0`. GitHub returned no reviews or
comments; the maintainer explicitly confirmed in this session that human review
was completed outside GitHub. This records that confirmation without inventing
a GitHub review submission. The promotion worktree was clean before changes;
the original checkout and its untracked `static/` assets were preserved.

Branch: `api/p1-p2-p3-development-promotion`.

The unchanged [prepared patch](../review/p1-p2-p3-promotion.patch) and its
generator were reviewed against the benchmark specification, report, coverage,
migration plan, inventory, ADR 0023 and stability policy. The patch covers six
source files and eleven documentation files. It changes comments only in source;
the three additional active documentation files corrected during reconciliation
are the documentation index, telemetry guide and releasing guide.

| Source under `packages/runtime/src/` | Reviewed / removed markers |
| ------------------------------------ | -------------------------- |
| `types/index.ts`                     | 3 / 3                      |
| `configuration/runtime-options.ts`   | 1 / 1                      |
| `errors/index.ts`                    | 1 / 1                      |
| `runtime.ts`                         | 5 / 5                      |
| `partition/range.ts`                 | 17 / 17                    |
| `partition/stream.ts`                | 1 / 1                      |
| Total                                | 28 / 28                    |

No global removal was used. Source tokens, signatures, unions, root exports,
defaults, error inheritance and runtime algorithms are unchanged. All fourteen
deprecated alias annotations in the range declarations remain. The six names are
`experimentalDispatchBatchSize`, `experimentalMaxBufferedResults`,
`experimentalOutputConstructor`, `experimentalResultBytes`,
`experimentalMaxResultBytes` and `experimentalMaxReservedResultBytes`.

The Stage C heading and opening status now distinguish approved development
promotion from unresolved policy/holds, the unauthorized transition prerelease,
C4 and F/G. Older queues, scope proposals and qualification entries are explicitly
historical; their dated pending decisions remain intact. The package README's
duplicated “The the” is corrected and states that the combined transition
prerelease is not yet authorized. Stale current P2/P3, count-stream, option,
diagnostic and documentation-index statements are reconciled. Historical
benchmark, C1–C3, B1–B4 and RC4 evidence remains unchanged.

## Artifact identity: strict gate fails

The merged baseline was built before applying promotion with Windows x64 Node
24.22.1 and locked primary TypeScript 7.0.2. The candidate used the same toolchain.
Both builds emit 38 production JavaScript files and 152 total dist files.
Complete SHA-256 manifests and the comparison are retained with the qualification
evidence; final references and hashes will be added after qualification.

**Production JavaScript is not byte-identical.** Thirty-six JavaScript files
retain their bytes. `dist/runtime.js` changes the retained `partitionRange` and
`parallelFor` JSDoc; `dist/errors/index.js` removes the retained experimental tag
on `PjsExecutionLeaseError`. These are exactly three comment changes. Parsed token
streams excluding comments/trivia are identical, but that does not satisfy the
requested complete-byte gate. The build configuration retains comments; it was
not changed or postprocessed to conceal the differences. No byte-identity waiver
or release-policy decision is inferred.

Six declaration files change comments only: configuration/runtime-options,
errors/index, partition/range, partition/stream, runtime and types/index.
Their parsed nontrivia token streams remain identical. Five declaration maps and
`errors/index.js.map` change separately; 138 emitted files are unchanged overall.

## Qualification

Fresh ordinary qualification, installed-package checks and supplemental compiler
and inventory checks are being retained for the committed promotion candidate.
Pending checks are not passes. The final report will name the executed source,
tool identities, exact tarball hash, package contents and results.

## Evidence boundaries and remaining decisions

The accepted PR #31 campaign remains historical supporting evidence: six passing
functional cells, 399 accepted performance cases, 15 inconclusive cases, four
optional capability skips, no confirmed runtime correctness defect and no
demonstrated optimization from identical package bytes. Dedicated Linux
performance hardware was unavailable. Its source attribution and hashes are not
relabeled as promotion-artifact qualification. No new 418-case performance
campaign or performance-improvement claim is made here.

The strict byte-identity failure prevents a PASS promotion verdict under this
work order. Human review must resolve that requirement before acceptance.
Separately tracked hold applicability remains unresolved; policy/release
decisions, a selected combined transition prerelease and publication, its actual
shared alias window, C4 and Stage F/G retain their separate gates. Published RC4
evidence and version fields remain unchanged. No npm publication, dist-tag or Git
tag operation is performed.
