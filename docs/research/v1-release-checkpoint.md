# PJS 1.0.0 release checkpoint

Prepared from published RC5 commit `131d28112924fc55228d4722ec111aa513f94aee`,
tree `5e8ec2653b0b86aa93dbaf5c912e76e203f1c906`. This is an unpublished proposal.
No merge, tag, release, npm publication or dist-tag mutation is authorized.

## Fixed acceptance checklist

The following scope is fixed on 29 October 2026 from ADR 0023, the Stage C
migration plan, stability/release guidance and the existing qualification runners.
Additions require a concrete defect or a previously missed explicit requirement.

- [ ] Inventory both entries and review supported behavior, owners and host guarantees.
- [ ] Close C4 with six legacy presence guards, stable-only option declarations,
      migration examples and installed/runtime/both-compiler regressions.
- [ ] Prepare 1.0.0 manifests and lock metadata without resolution or publisher-pin changes.
- [ ] Register/write an explicit stable freeze; preserve immutable RC4/RC5 identities.
- [ ] Update active API, stability, platform, migration and release guidance.
- [ ] Qualify the clean committed candidate on Linux/Windows x64, Node
      22.23.4, 24.22.1, 24.22.2, 26.12.1 and 26.13.0. Node 22.23.4 is both
      floor and current patch; ten distinct cells replace duplicate floor/current cells.
- [ ] Run existing standard R2/R3 per cell; existing extended R2/R3 on the selected
      publisher Node on both OSes; standard RC soak per cell and extended RC soak
      in the two-clean-build reproduction. Keep existing seeds, bounds and assertions.
- [ ] Both locked public compiler fixtures, installed JS/TS, ESM/CommonJS identity,
      browser native/Vite dev/production and isolation capabilities; release tooling,
      inventory, docs, lint/format and package gates.
- [ ] Two clean builds, exact file/archive equality, one canonical staged archive,
      exact staged Node/browser consumers and selected-CLI publication dry run.
- [ ] Commit/push and one focused draft PR with exact identities and evidence attribution.

## Decisions kept separate from technical acceptance

1. **Proposed policy amendment, not accepted:** RC5 is the published combined
   transition. Amend ADR 0023's following-prerelease removal requirement to remove
   all six aliases directly in 1.0.0. This candidate implements that proposal for
   review. No second prerelease or elapsed-time approval is inferred. Consumers
   must migrate every legacy property before upgrading; inherited and undefined
   presence also rejects. If retention in 1.x is chosen, restore acceptance and
   declarations here; removal then needs a later major release under SemVer.
2. Approve the exact stable public contract and candidate evidence independently.
3. Decide stable-release hold applicability/disposition explicitly. The retained
   RC5 release decision says: “The holds do not block this RC5 transition
   prerelease; keep them open separately.” That applies to RC5 only. Holds remain
   open for 1.0.0; their underlying finding is excluded from this work.
4. Merge authorization and tag/publication authorization are later separate actions.

## Support limits and recommendations

The package keeps `^22.23.4 || ^24.22.1 || ^26.12.1`; qualification covers exact
selected patches on Linux/Windows x64. Chromium native copied assets and Vite
dev/production under non-root bases are the defined browser profiles. Browser
retirement proves posting-safe local accounting, not native join or shared-memory
quiescence. macOS, ARM64, other browser engines and arbitrary bundlers are unclaimed.
Additional platform testing and benchmark expansion are recommendations, not gates.

The exact current patches were checked against the
[official Node distribution index](https://nodejs.org/dist/index.json).
Registry readback found `next=1.0.0-rc.5`, `latest=1.0.0-rc.4`, and no 1.0.0.
Remote main and the RC5 tag identify the base above; no stable tag exists.

## Qualification ledger

The first committed candidate's extended R2 run exposed a concrete I5 queue
divergence: seed 19/case 59, action 23, retained an exclusive task's pin on a busy
worker after another replacement became idle. The exact history also failed
locally. Add one focused regression and correct obsolete pin revalidation at the
existing dispatcher owner; keep model assertions, seeds and bounds unchanged.
This is a defect-driven addition to implementation scope, not a new release gate.
The original failure and package/baseline are retained. The corrected source
requires fresh qualification; earlier results retain their original attribution.

Results will bind actual clean head/tree, baseline, tools and archive. RC5 evidence
is historical and cannot qualify changed stable bytes. Failures and unavailable
cells remain recorded. Large archives and receipts stay outside Git.
