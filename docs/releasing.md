# Publishing PJS releases

The canonical package is [`@pjavascript/runtime` on npmjs.com](https://www.npmjs.com/package/@pjavascript/runtime),
served by `https://registry.npmjs.org/`. Current published prerelease:
`v1.0.0-rc.4`, installed with `npm install @pjavascript/runtime@next`.
Final v1.0.0 has not been released. Published versions are immutable; do not republish them.

The repository npm badge and install link make the package immediately discoverable.
The new package `homepage` field appears beginning with the next published version;
existing RC2 metadata and its packaged README do not change retroactively.
GitHub's repository **Packages** sidebar represents GitHub Packages. This project
does not publish a duplicate there or create another package identity. Any later
organization/linked-artifact or GitHub Packages adoption is a separate decision.

## RC4 candidate qualification

The [RC4 candidate note](release-v1.0.0-rc.4.md) defines this release's scope.
The active [baseline](../scripts/rc/frozen-rc4.json) freezes the merged R1A runtime,
RC4 metadata, declarations and every packed file. The old R1A repair allowance is
removed. Run the [qualification commands](../scripts/rc/README.md) from a committed,
clean tree. The RC4 qualification historically used four CI cells with standard soak; two independent clean local builds
run full qualification/extended soak and require identical archives. Preserve the
candidate commit, report, canonical tarball and SHA-256 together. Any subsequent
change invalidates qualification of that commit and requires qualification again.
RC3 is an immutable GitHub prerelease with no npm publication: its release
validator stopped before the OIDC step. RC4 is published on npm with registry signatures and a provenance attestation.
The procedure below applies to future deliberately approved releases. PR qualification now tests the selected
npm CLI without credentials/scripts and validates the actual candidate tarball
through the same release helper; unknown JSON shapes fail before review.

## Runtime feature qualification after RC4

RC4 is already published and immutable. Feature branches intentionally change
runtime source bytes and use ordinary contract qualification:

```sh
npm run release:npm -- .node-tools/release-cli
npm run runtime:qualify -- --release-npm-cli=/absolute/path/to/provisioned/npm-cli.js --output=.node-tools/new-runtime-report.json
```

The provisioner prints the selected path. Start from a clean committed tree and
choose a new output filename. The four Linux/Windows x64 Node 22.13.0/24 CI cells
use this path: build, all contracts (including the bounded containment soak),
types, compatibility compiler, installed package, release tooling, lint, formatting,
documentation and diff checks. Reports retain exact versions, source commit and outputs.
This is not approval to publish the unchanged version or a new candidate.

The release-specific `rc:qualify`, API/package freezes and committed
`frozen-rc4.json` remain intact. They must fail for changed feature bytes rather
than pretend R1 is the RC4 artifact. Qualify RC4 from its historical tag/commit;
a future release requires a separately reviewed version and baseline.
The `release.published` workflow, OIDC binding and publication guards are unchanged.

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

The workflow uses GitHub-hosted Ubuntu, exactly Node 24.21.0 / npm 11.19.0 from
the reviewed [publication toolchain](../scripts/release/toolchain.json), and
SHA-pinned official `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0.
The shared release helper rejects any other publisher version before registry
operations and disables package-manager caching. Runtime support for Node
22.13.0 and Node 24 does not approve every bundled npm for publishing. Four-cell
CI provisions the exact release npm archive after verifying its committed SHA-512,
then tests the live CLI separately from ordinary runtime npm. Review Node/npm pins
and archive integrity together when upgrading; repeat the four-cell qualification
and two-build reproduction. See upstream
[trusted publishing guidance](https://docs.npmjs.com/trusted-publishers/),
[checkout releases](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node releases](https://github.com/actions/setup-node/releases/tag/v7.0.0), and
[Node releases](https://nodejs.org/en/about/previous-releases).

## Deliberate release procedure

1. Update the chosen package/workspace version and synchronize the lockfile in a
   normal PR. Review release notes and any version-specific qualification gates.
   Version selection remains a human decision.
2. Pass existing CI, including Ubuntu/Windows Node 22.13/24 qualification, and
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
   broad CI matrix remains separate. CD also enforces the active exact RC4
   source/declaration/export/manifest baseline. Its final artifact check compares
   every packed file with the committed RC4 hashes; no repair exception is accepted
   and no extended research campaign runs here. Future releases must deliberately
   review a new version and baseline together.
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
