# Publishing PJS releases

The canonical package is [`@pjavascript/runtime` on npmjs.com](https://www.npmjs.com/package/@pjavascript/runtime),
served by `https://registry.npmjs.org/`. Current published prerelease:
`v1.0.0-rc.4`, installed with `npm install @pjavascript/runtime@next`.
Final v1.0.0 has not been released. Published versions are immutable; do not republish them.

Public [npm metadata](https://registry.npmjs.org/@pjavascript%2fruntime) rechecked
23 October 2026 reports both `latest` and `next` at RC4;
[GitHub](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
lists it as a prerelease. Development main includes integrated S1, corrected
Stage A, B1–B4, C1-A/Q, C2 and C3. Unchanged RC4 version fields do not identify
those bytes as the published artifact. The [post-C3 decision table](research/v1-api-migration-plan.md#decisions-for-maintainer-review)
and [ADR 0023](adr/0023-v1-api-stability-decisions.md) grant no release approval.

The repository npm badge and install link make the package immediately discoverable.
The new package `homepage` field appears beginning with the next published version;
existing RC2 metadata and its packaged README do not change retroactively.
GitHub's repository **Packages** sidebar represents GitHub Packages. This project
does not publish a duplicate there or create another package identity. Any later
organization/linked-artifact or GitHub Packages adoption is a separate decision.

## RC5 candidate preparation and validation

`1.0.0-rc.5` is a **review candidate**, not a published release or final-v1.0
readiness declaration. On 28 October 2026 read-only checks returned explicit npm
and GitHub-release 404s for RC5 and a successful empty remote-tag query. The package
metadata remained accessible with latest/next at RC4. Recheck availability before
any separately authorized publication. This PR creates no tag, release or registry state.

The explicit reviewed map in [baseline.mjs](../scripts/rc/baseline.mjs) registers
RC4 and RC5 only. Unknown versions, missing baseline files, tag/version mismatches,
workspace/package/lock metadata drift, and source/declaration/artifact drift fail
closed. Historical [frozen-rc4.json](../scripts/rc/frozen-rc4.json) is unchanged,
including its original Node 24.21.0 publication pin; validate RC4 at its original
tag/source and artifact, never against new RC5 bytes. RC4 historical reports remain
evidence for that artifact only. The RC5 [baseline](../scripts/rc/frozen-rc5.json)
selects the integrated implementation and reviewed Node 24.22.1/npm 11.19.0 toolchain.

Baseline writing is a deliberate preparation operation, separate from every
read-only check:

```sh
npm run build
node scripts/rc/prepare.mjs --version=1.0.0-rc.5 --npm-cli=/absolute/reviewed/npm-cli.js
```

Only RC5 can be prepared by this writer. Existing output requires an explicit
--replace=true. Review input changes before regeneration; validation never writes
expected values. The baseline hashes the full source/test/declaration inventories,
both public export sets, workspace/package/lock metadata, selected release/tooling/
consumer inputs, and every packed file plus the compressed archive. Its own file
and Git SHA/tree are excluded to avoid a self-reference. Unpacked historical
research and documentation outside the enumerated inputs are excluded, not
requalified. Receipts bind the actual clean committed SHA/tree, baseline hash and
tarball SHA-256. Material candidate changes require explicit regeneration and
affected checks again; never edit a digest to hide an unexplained mismatch.

From the clean committed candidate use the existing normal validation and RC
requirements described in [RC tooling](../scripts/rc/README.md). The release branch
runs the unchanged six-cell Linux/Windows minimum matrix, standard R2/R3 and the
existing real-browser job, plus registered candidate qualification. Reproduction
uses two independent clean builds: full qualification and the existing bounded RC
extended soak in A, build/independent consumers in B, then compares the **actual
archives**. This is not a new benchmark or extended R2/R3 campaign.

Stage the reproduced canonical archive with its receipt/checksum outside Git.
Set PJS_CANDIDATE_TARBALL to that absolute archive for the installed Node and browser
harnesses; they validate and install those bytes instead of repacking. RC package
validation also accepts --tarball=absolute/path. The existing release helper's
tarball mode checks the selected baseline, artifact and immutable digest, runs
selected-npm **publish --dry-run --ignore-scripts**, and installs the same archive.
No rehearsal may invoke actual publication. All failed receipts remain retained;
use new output paths for retries.

<a id="proposed-future-candidate-gates--stage-f-remains-separate"></a>

## Preparation is not publication eligibility

Separately tracked release holds and their applicability remain **unresolved**.
The [post-C3 decisions](research/v1-api-migration-plan.md#decisions-for-maintainer-review),
[ADR 0023](adr/0023-v1-api-stability-decisions.md) and
[stability policy](stability.md) still govern them. This work neither investigates
nor clears excluded findings. RC5 selection resolves the version/baseline preparation
choice only. No alias window starts from this PR; actual deliberate publication is
required and no alias-removal release is selected.

The existing Stage F/G requirements for final readiness, including separately
selected current patches, extended evidence and hold applicability, have not been
silently replaced by candidate CI. Their unresolved applicability/publication
clearance is a maintainer decision. Normal supported-minimum and Chromium results
do not establish all current patches, other browser engines, macOS, ARM64, final
v1.0 readiness or authorization to publish. Historical reports and holds remain
unchanged. See [RC5 notes and migration](release-v1.0.0-rc.5.md).

## One-time maintainer configuration

On **npmjs.com**, open the package Settings → Trusted publishing and configure a
GitHub Actions trusted publisher with these exact, case-sensitive values:

| Field             | Value                  |
| ----------------- | ---------------------- |
| Package           | `@pjavascript/runtime` |
| GitHub owner      | `Miskovy`              |
| Repository        | `parallel-javascript`  |
| Workflow filename | `publish-npm.yml`      |
| Environment       | `npm`                  |

Allow direct **`npm publish`** for this publisher (stage-only permission is
insufficient). Dist-tag management permission is unnecessary: the publication
sets its tag directly. This configuration lives on npmjs.com, not in a repository
secret. No permanent npm publishing credential is needed in GitHub.
The workflow filename and environment are part of the trust binding; coordinate
any changes with npm configuration.

Separately create the GitHub **`npm` Environment** in repository Settings →
Environments. Configure deployment protection before the first future release;
required human approval is recommended when supported. Allow the intended release
tags through any environment deployment restrictions. These protections are not
assumed to exist already.

The workflow uses GitHub-hosted Ubuntu, exactly Node 24.22.1 / npm 11.19.0 from
the reviewed [publication toolchain](../scripts/release/toolchain.json), and
SHA-pinned official `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0.
The shared release helper rejects any other publisher version before registry
operations and disables package-manager caching. Runtime support for Node
22.23.4, 24.22.1 and 26.12.1 does not approve every bundled npm for publishing. Six-cell
CI provisions the exact release npm archive after verifying its committed SHA-512,
then tests the live CLI separately from ordinary runtime npm. Review Node/npm pins
and archive integrity together when upgrading; repeat the runtime validation matrix
and two-build reproduction. See upstream
[trusted publishing guidance](https://docs.npmjs.com/trusted-publishers/),
[checkout releases](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node releases](https://github.com/actions/setup-node/releases/tag/v7.0.0), and
[Node releases](https://nodejs.org/en/about/previous-releases).

## Deliberate release procedure

1. Update the chosen package/workspace version and synchronize the lockfile in a
   normal PR. Review release notes and any version-specific qualification gates.
   Version selection remains a human decision.
2. Pass existing CI, including Ubuntu/Windows Node 22.23.4/24.22.1/26.12.1 validation, and
   merge the reviewed change.
3. Tag the approved commit with exactly `v` plus the runtime package version.
   Create its GitHub Release: e.g. `1.0.0-rc.4` requires `v1.0.0-rc.4`, whereas
   `1.0.0` requires `v1.0.0`.
4. Mark any SemVer prerelease as a GitHub prerelease. Stable versions must have
   the prerelease checkbox cleared.
5. Publish the GitHub Release. This is the sole CD trigger. Ordinary pushes,
   merges, pull requests and draft releases do not publish to npm.
6. The job enters the `npm` Environment; approve the deployment if configured.
7. CD checks out the exact release tag, validates tag/version/classification and
   queries npm. An existing immutable version is reported and publication is
   skipped; versions and tags are not changed automatically. Registry verification
   and consumer smoke still run for an already-published version.
8. For an absent version, CD runs `npm ci`, `test:release` (including the selected real npm CLI dry-run regression),
   `test:contracts` (including build), `test:types`, `typecheck:compat`,
   `test:package`, lint, formatting, documentation and diff checks. The existing
   broad CI matrix remains separate. CD also enforces the explicitly selected version
   source/declaration/export/manifest baseline. Its final artifact check compares
   every packed file with the selected committed hashes; no repair exception is accepted
   and no extended research campaign runs here. Unknown versions remain blocked until a version and baseline are deliberately reviewed together.
9. CD packs once into runner temporary staging. It validates the actual tarball's
   name, version, plausible file count, allowed contents, zero runtime
   dependencies and repository metadata, performs a publish dry-run and runs an
   offline external consumer against that exact artifact. It records SHA-256 in
   the log and step summary and checks the hash again immediately before publish.
10. npm authenticates using short-lived GitHub OIDC identity and publishes the
    same `.tgz` publicly. Prereleases use `next`; stable versions use `latest`.
    npm generates provenance automatically for this public package/repository.
11. For both new publications and already-published versions, CD verifies the
    exact package identity, version and chosen dist-tag within a ten-minute
    monotonic convergence deadline. Transient failures use exponential backoff
    (5, 10, 20, then at most 30 seconds), bounded by the remaining deadline.
    Each npm request has both a process timeout and fetch timeout of at most
    30 seconds, reduced to the remaining budget; npm internal retries are disabled
    and online revalidation is requested. It reports the validated registry
    dist-tags and installs the chosen tag in a fresh external project, asserting
    the expected version and exercising public imports, worker loading/execution,
    error recovery and shutdown with the existing package-consumer fixtures.

Publishing is serialized without canceling an in-progress job and has a 30-minute
timeout. Only `contents: read` and `id-token: write` are granted to the publishing
job. No GitHub Release assets or releases are modified. CD never bumps a version,
creates a tag/release, or commits a lockfile.

## Failure and retry behavior

Tag/classification mismatches and registry lookup failures fail closed. Only an
explicit npm E404 permits a new publication. Correct the release preparation or
external configuration before retrying; never delete/unpublish or invent a version
to repair a workflow run.

If publication succeeds but later registry verification or consumer smoke fails,
inspect npm and the logs first. Rerunning the workflow finds the published version
and skips further qualification, packing, publication and automatic tag mutation.
It still verifies the registry version and expected dist-tag and runs the public
consumer smoke. A missing or moved dist-tag retries within the convergence
deadline, then fails; investigate the release state before any deliberate correction. Inspect provenance manually after
diagnosing a publication failure.
A prerelease run verifies only `next`; an automatically created `latest` tag from
first publication is allowed and is never deleted by CD.

The post-publication verifier retries only explicit E404 propagation, a missing or
stale selected dist-tag, ECONNRESET, ECONNREFUSED, ETIMEDOUT (including the child
process timeout), EAI_AGAIN, and registry E408/E429/E500/E502/E503/E504 responses.
Authorization errors (E401/E403), malformed JSON/identity/dist-tags, a different
package name or exact version, integrity/configuration errors, and unknown errors
fail immediately. Diagnostics include attempt number, monotonic elapsed and
remaining milliseconds, classification, and next action. Request time counts
against the deadline; no new request or retry sleep starts after exhaustion, and
a response arriving at or after the deadline cannot count as convergence.

The immutable pre-publication guard remains separate and unchanged: only explicit
E404 permits publication; its network/auth failures never authorize a publish.
No automatic retry republishes an artifact or repairs a dist-tag. After deadline
exhaustion, inspect the public version, selected tag and provenance, then rerun
verification and consumer smoke after convergence. A rerun of the release workflow
still skips publication when the exact version exists. Because the workflow checks
out the immutable release tag, rerunning RC4 uses RC4's original verifier; this
hardening applies to future release tags that contain it. The updated helper may
also be run read-only from this branch with the reviewed publication CLI to verify
an existing version. Do not move the RC4 tag to adopt this helper.

### Historical latest tag

On 2026-10-10, the public registry reported both `next` and `latest` pointing to
`1.0.0-rc.4`; RC4's exact name/version, registry signatures and provenance-attestation
metadata were present. The earlier `latest` → `1.0.0-rc.2` state has already been
corrected. No tag mutation is needed or performed by this change. CD does not
promote prereleases to `latest` automatically. Any future deliberate tag correction
requires explicit maintainer authorization and an existing appropriate npm session.

RC2 and RC4 are already published. Validate changes with
`npm run test:release`, formatting, documentation and
workflow checks; do not publish it again to test the pipeline. No manual publish
dispatch is provided. End-to-end OIDC publication will be exercised only by a
future deliberately approved release.

There is currently no Dependabot configuration. GitHub Actions update monitoring
for the pinned releases is a follow-up; review upstream SHA updates deliberately.
