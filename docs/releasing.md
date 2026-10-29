# Publishing PJS releases

## Prepared 1.0.0 candidate

Published RC5 is immutable at `131d28112924fc55228d4722ec111aa513f94aee`,
tree `5e8ec2653b0b86aa93dbaf5c912e76e203f1c906`. Its baseline SHA-256 is
`a6e247f48c23530cbd22f89ddc3c30453b0cd2c10c1618ead1634afddd1c04c2`;
archive `f9bd1a3e09002b60ed136f76ac4f3ae197b2869cc910f324434ad124bc98e568`
contains 303 files / 200,346 bytes. Registry readback on 29 October 2026 found
`next=1.0.0-rc.5`, `latest=1.0.0-rc.4`, and no 1.0.0 or stable tag/release.

The workspace prepares **1.0.0**, not a published stable release. It proposes C4
removal directly at stable, requiring the explicit [policy amendment](adr/0023-v1-api-stability-decisions.md).
The [release notes](release-v1.0.0.md) and [fixed checkpoint](research/v1-release-checkpoint.md)
state contract, migration, matrix, evidence and remaining decisions. RC5-only hold
non-blocking disposition is not stable-release clearance. Evidence acceptance,
contract approval, hold disposition and publication permission remain separate.

<a id="proposed-future-candidate-gates--stage-f-remains-separate"></a>

## Explicit preparation and validation

The selector registers RC4, RC5 and stable 1.0.0 only. Unknown versions,
tag/version mismatches, missing baselines and byte drift fail closed. RC4/RC5
baselines and their original tag/source/artifact are immutable; regression tests
check both identities. Validation never writes expected hashes.

```sh
npm run build
node scripts/rc/prepare.mjs --version=1.0.0 --npm-cli=/absolute/reviewed/npm-cli.js
```

The writer accepts stable only, requires exact reviewed Node/npm and explicit
`--replace=true` for an existing **unpublished** stable freeze. It freezes source,
runtime tests, declarations, both export sets, metadata, selected release inputs,
packed members and the compressed archive. Review differences before committing.
No hash may be changed to hide a failing comparison. Baseline self-reference and
Git identity are excluded; receipts bind the actual clean commit/tree.

Stage F runs ten deduplicated Linux/Windows x64 floor/current cells: Node 22.23.4,
24.22.1, 24.22.2, 26.12.1 and 26.13.0. Each retains standard R2/R3 and the existing
runtime/registered-candidate gates. Existing extended R2/R3 run on publisher Node
on both OSes. Two-clean-build reproduction runs the extended RC soak in state A,
independent build/installed consumers in B, then compares members and complete
archive bytes before staging one canonical archive. Installed Node and browser
native/Vite profiles consume that archive. Existing exact-artifact helper rehearses
selected npm publication with `--dry-run --ignore-scripts`, offline installation
and final rehash. Keep failures and unavailable cells and do not repeat passed
checks without changed inputs or an unresolved requirement.

Registered release candidates select the existing frozen RC qualifier in place
of the overlapping ordinary runtime qualifier. The standard R2/R3 campaigns still
run once per cell. This avoids duplicate ordinary gates while retaining every
frozen-candidate contract, type, installed consumer, tooling and soak check.

See [runner commands](../scripts/rc/README.md). Large receipts and archives remain
outside Git. Chromium results do not establish other engines, macOS, ARM64 or
arbitrary bundlers. Merge, tag, GitHub Release/npm publication and dist-tag writes
require separate explicit authorization.

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
then tests the live CLI separately from ordinary runtime npm.
Publication also provisions that verified archive before its exact toolchain check.
It adds the local npm executables to subsequent steps' PATH and sets PJS_NPM_CLI
for release helpers; bare npm commands and nested npm scripts select the same CLI.
The bundled npm only bootstraps provisioning. Review Node/npm pins
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

RC2, RC4 and RC5 are already published. Validate changes with
`npm run test:release`, formatting, documentation and
workflow checks; do not publish it again to test the pipeline. No manual publish
dispatch is provided. RC5 exercised the existing OIDC publication flow. Stable publication still needs
its own explicit authorization.

There is currently no Dependabot configuration. GitHub Actions update monitoring
for the pinned releases is a follow-up; review upstream SHA updates deliberately.
