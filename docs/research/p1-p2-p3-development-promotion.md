# P1/P2/P3 development API promotion

This branch applies the approved P1 containment, P2 range/count/map/batch and
P3 strict-binary annotation/status promotion. All six deprecated aliases and
their exclusive-presence rules remain. No release, version, dependency, alias
window, C4 or Stage F/G change is authorized.

**Current acceptance, 24 October 2026: PASS under the revised maintainer-approved
contract.** Complete production JavaScript byte identity remains **FALSE**. The
original strict-gate verdict remains **FAIL** as historical evidence; the
maintainer explicitly accepts only the three verified emitted JSDoc changes
described below. This decision changes no release boundary or hold.

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

## Historical artifact identity: original strict gate fails

The merged baseline was built before applying promotion with Windows x64 Node
24.22.1 and locked primary TypeScript 7.0.2. The candidate used the same toolchain.
Both builds emit 38 production JavaScript files and 152 total dist files.
Complete SHA-256 manifests are committed for the
[baseline](../review/p1-p2-p3-development-promotion/baseline-production-js.json)
and [candidate](../review/p1-p2-p3-development-promotion/candidate-production-js.json).
Their manifest-file SHA-256 values are respectively
`fbfe1f04b3fe17daa2fbea1ceef8f676a6f39fdfeab0ece5b1de474f4c12145c` and
`ed712b127fca1d49015e11c7ba6bfcf643c3bed084a47590641736e4e81be765`.
The [comparison](../review/p1-p2-p3-development-promotion/artifact-comparison.json)
records each changed JavaScript/declaration digest, separate maps, marker counts,
alias occurrences and token equivalence. The prepared patch itself retains SHA-256
`e86baea491405d22d771a5a5cdf9386896fe73cee83880541fa48e97ffc4aee6`.

**Production JavaScript is not byte-identical.** Thirty-six JavaScript files
retain their bytes. `dist/runtime.js` changes the retained `partitionRange` and
`parallelFor` JSDoc; `dist/errors/index.js` removes the retained experimental tag
on `PjsExecutionLeaseError`. These are exactly three comment changes. Parsed token
streams excluding comments/trivia are identical, but that does not satisfy the
requested complete-byte gate. The build configuration retains comments; it was
not changed or postprocessed to conceal the differences. At this original review
no byte-identity waiver or release-policy decision was inferred. The subsequent
explicit exception is recorded separately below; none of these comparison
results or hashes is changed by that decision.

Six declaration files change comments only: configuration/runtime-options,
errors/index, partition/range, partition/stream, runtime and types/index.
Their parsed nontrivia token streams remain identical. Five declaration maps and
`errors/index.js.map` change separately; 138 emitted files are unchanged overall.

## Explicit maintainer exception — 24 October 2026

After reviewing the report and original strict-gate failure, the maintainer
explicitly approved in this conversation a narrowly scoped exception for the
three verified JSDoc-only differences. The revised acceptance contract requires
identical executable token streams, unchanged module structure/exports/runtime
semantics, and no emitted JavaScript differences beyond these exact changes:

| Emitted module         | Approved JSDoc change                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `dist/runtime.js`      | `partitionRange`: remove `@experimental` and replace “this API is not yet stable” with the approved ordered-retained-results description |
| `dist/runtime.js`      | `parallelFor`: remove `@experimental` from the completion-only description                                                               |
| `dist/errors/index.js` | `PjsExecutionLeaseError`: remove `@experimental` from the physical-dispatch-lease description                                            |

**Revised verdict: PASS. Original strict byte-identity verdict: FAIL. Complete
JavaScript byte identity: FALSE.** This is an explicit change to the acceptance
contract, not a reinterpretation of the original bytes or historical results.
The original manifests, artifact comparison, qualification summary (including
its FAIL verdict), tarball hashes and CI reconciliation remain unchanged.
The [separate exception verification](../review/p1-p2-p3-development-promotion/maintainer-exception-2026-10-24.json)
records the authority/date, exact scope, preserved-evidence hashes and current
equivalence checks without replacing earlier evidence.

The candidate was rebuilt with the same locked primary compiler and Node 24.22.1.
Every one of its 38 JavaScript modules was checked against the original merged
baseline for identical executable tokens and parsed module structure, and for
exact bytes after applying only the three approved substitutions inside JSDoc.
This also preserves import/export structure; every other JavaScript byte remains
identical. All 152 emitted-file hashes and all 193 package-file hashes still match
the qualified promotion candidate, including declarations, source maps, packed
sources and README. The retained installed tarball still has SHA-256
`9a449fa83c2472197d021f845d89dbe57dfc5e1771c3afccf50db9ad9d3aeacc`.

Changes since qualified implementation `78189574cdaa5b814a02b562b52c33a7745252bc`
are confined to documentation and review evidence. Production sources, public
signatures/unions, six aliases and deprecation annotations, package metadata,
dependencies, compiler inputs, tests, harnesses, workflows and release holds are
unchanged. Runtime semantics remain those of the qualified implementation.
The current change records this exception and reconciles report references in
active documentation; it does not alter the packed package README or package bytes.

The affected documentation links, formatting and diff checks were rerun for this
revision, along with the build and artifact/module equivalence checks above.
All pass. The existing ordinary, compiler, installed-package, runtime-contract,
inventory, lint and release dry-run gates remain satisfied for the identical
qualified inputs. The subsequent [six-cell run 40016238532](https://github.com/Miskovy/parallel-javascript/actions/runs/40016238532)
also passed at prior review head `3cd9b4dc664aab8b00d047383d78ed324cfb5c01`.
Neither historical run is relabeled as execution of this documentation revision.
No executable code or qualification input changed, so no full performance
campaign is repeated or new performance claim made.

## Fresh qualification

Executed promotion source is `78189574cdaa5b814a02b562b52c33a7745252bc`, tree
`b7e41bab533a78b4492c19ab04f023f3fa497fa6`, with a clean working tree.
The later evidence/report commit changes only this report and review evidence;
runtime source, declarations, packed README, package metadata, dependencies,
harnesses, tests and workflows retain the executed candidate's inputs. This is
explicit input equivalence, not relabeling the execution as the later commit.

[CI run 40015092066](https://github.com/Miskovy/parallel-javascript/actions/runs/40015092066)
passed all six ordinary qualification cells:

| OS / architecture | Actual Node versions         | Ordinary / installed / standard R2/R3 |
| ----------------- | ---------------------------- | ------------------------------------- |
| Linux x64         | 22.13.0, 24.0.0, **24.21.0** | All pass                              |
| Windows x64       | 22.13.0, 24.0.0, **24.22.1** | All pass                              |

The unchanged workflow's floating Linux `24` selector actually resolved to
24.21.0; this is not a fresh Linux 24.22.1 result or Stage F's selected-current
patch qualification. The benchmark campaign's original 24.22.1 attribution stays
separate. Exact 24.0.0 identity and supplemental complete compatibility fixtures,
inventory parity and tool regressions passed on both operating systems.

All twenty new CI ZIP archives were downloaded using the GitHub connector's
artifact links, checked against their GitHub SHA-256 digests and CRC-tested.
Their 2,260 extracted files were reconciled against actual raw reports. Every
cell has **339 passed contracts**, zero failed/skipped/cancelled contracts;
**162 R2 histories / 2,746 actions / 162 cleanup records**; and **11 R3 children,
1,261 samples, 612 ownership checkpoints, 47 created / 47 confirmed worker exits**.
Raw histories, child configurations, samples and zero physical/credit/buffer
ownership agree with the aggregate reports. All six actual tarballs share the
new package hash below. [CI reconciliation](../review/p1-p2-p3-development-promotion/ci-reconciliation.json)
retains the archive IDs/digests, exact environments and check results.

Local Windows x64 Node 24.22.1 also passed the full ordinary qualifier and
unchanged standard R2/R3 against that exact committed source. Runtime npm was
11.19.1; independently selected release npm was 11.19.0 and its archived bytes
were checked against the unchanged pinned integrity. Primary and compatibility
compilers report **7.0.2 / 6.0.3** (the compatibility package wrapper is 6.0.2).
Both complete locked public fixtures were additionally executed and retained
against the clean candidate. The checker confirms **61 root exports, 17 runtime
values, 44 type-only names, 342 members, no additional named reachable types and
158 diagnostic leaves**, with source/declaration parity. Inventory tool regressions
also pass. [Local qualification summary](../review/p1-p2-p3-development-promotion/qualification-summary.json)
records the tool hashes and individual checks.

Fresh installed-package qualification packs the actual candidate, installs that
tarball offline into unrelated consumers and executes JavaScript registration,
worker resolution/recovery, root/error identity, closeable streams, binary
validation, containment and all six examples. Both compilers check the installed
complete positive/negative fixture without `skipLibCheck`, compile the TypeScript
cleanup consumer and execute its emitted JavaScript. Invalid alias/exclusion,
lease/range, map-constructor and ordinary-backed strict-result combinations remain
rejected. Build, public types, TS6 compatibility, **34 release dry-run tests**,
lint, formatting, docs and `git diff --check` pass. No actual npm publish occurs.

The first local ordinary run stopped at the release test: its credential-free
synthetic npm `publish --dry-run` timed out inside the network-restricted sandbox
(33 release tests passed, one timed out). That failed receipt remains retained.
The fresh complete network-enabled run passes all 34 without changing source,
timeouts or acceptance thresholds; it does not erase the earlier attempt.

## Promotion package

The new tarball remains named `pjavascript-runtime-1.0.0-rc.4.tgz` because this
task must not change versions. It is a development artifact, not replacement RC4
or a publication candidate. SHA-256:

`9a449fa83c2472197d021f845d89dbe57dfc5e1771c3afccf50db9ad9d3aeacc`

It contains **193 files**, 116,691 compressed bytes and 591,999 unpacked bytes.
The [complete package contents and per-file hashes](../review/p1-p2-p3-development-promotion/package-contents.json)
were obtained from the actual retained tarball. Every file matches the built
package. Updated declaration comments and README status/grammar were explicitly
verified, along with all fourteen deprecation annotations, all six aliases,
unchanged root-only exports, unchanged version and zero production dependencies.
Packed maps resolve to included sources. Tarball identity is expected to differ
from PR #31; its historical package SHA-256 remains
`00ecfac40befa2409b2d579011e1aca98b409fdc08fccd37087628462e5611a3`.

Raw local evidence, the baseline dist snapshot, actual packages, failed/successful
receipts and downloaded/extracted CI artifacts are retained under
`.node-tools/p1-p2-p3-promotion/evidence/` in the original workspace. Historical
benchmark artifacts, their hashes, frozen RC4 inputs and the unapplied patch
artifact itself were not modified.

## Evidence boundaries and remaining decisions

The accepted PR #31 campaign remains historical supporting evidence: six passing
functional cells, 399 accepted performance cases, 15 inconclusive cases, four
optional capability skips, no confirmed runtime correctness defect and no
demonstrated optimization from identical package bytes. Dedicated Linux
performance hardware was unavailable. Its source attribution and hashes are not
relabeled as promotion-artifact qualification. No new 418-case performance
campaign or performance-improvement claim is made here.

At the original strict-gate review, the byte-identity failure prevented a PASS
promotion verdict. The explicit maintainer exception recorded above supersedes
that acceptance requirement for only the three verified JSDoc changes; the
promotion now passes the revised contract while complete byte identity remains
false. This development promotion remains subject to human PR review.
Separately tracked hold applicability remains unresolved; policy/release
decisions, a selected combined transition prerelease and publication, its actual
shared alias window, C4 and Stage F/G retain their separate gates. Published RC4
evidence and version fields remain unchanged. No npm publication, dist-tag or Git
tag operation is performed.
