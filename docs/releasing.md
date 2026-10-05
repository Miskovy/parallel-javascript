# Publishing PJS releases

The canonical package is [`@pjavascript/runtime` on npmjs.com](https://www.npmjs.com/package/@pjavascript/runtime),
served by `https://registry.npmjs.org/`. Current published prerelease:
`v1.0.0-rc.2`, installed with `npm install @pjavascript/runtime@next`.
Final v1.0.0 has not been released. Do not republish RC2.

The repository npm badge and install link make the package immediately discoverable.
The new package `homepage` field appears beginning with the next published version;
existing RC2 metadata and its packaged README do not change retroactively.
GitHub's repository **Packages** sidebar represents GitHub Packages. This project
does not publish a duplicate there or create another package identity. Any later
organization/linked-artifact or GitHub Packages adoption is a separate decision.

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

The workflow uses GitHub-hosted Ubuntu, Node 24, and SHA-pinned official
`actions/checkout` and `actions/setup-node` v7.0.0 releases. It checks for npm
11.5.1+ and disables package-manager caching. See upstream
[trusted publishing guidance](https://docs.npmjs.com/trusted-publishers/),
[checkout releases](https://github.com/actions/checkout/releases/tag/v7.0.0),
[setup-node releases](https://github.com/actions/setup-node/releases/tag/v7.0.0), and
[Node releases](https://nodejs.org/en/about/previous-releases).

## Deliberate release procedure

1. Update the chosen package/workspace version and synchronize the lockfile in a
   normal PR. Review release notes and any version-specific qualification gates.
   Version selection remains a human decision.
2. Pass existing CI, including Ubuntu/Windows Node 22.13/24 qualification, and
   merge the reviewed change.
3. Tag the approved commit with exactly `v` plus the runtime package version.
   Create its GitHub Release: e.g. `1.0.0-rc.3` requires `v1.0.0-rc.3`, whereas
   `1.0.0` requires `v1.0.0`.
4. Mark any SemVer prerelease as a GitHub prerelease. Stable versions must have
   the prerelease checkbox cleared.
5. Publish the GitHub Release. This is the sole CD trigger. Ordinary pushes,
   merges, pull requests and draft releases do not publish to npm.
6. The job enters the `npm` Environment; approve the deployment if configured.
7. CD checks out the exact release tag, validates tag/version/classification and
   queries npm. An existing immutable version is reported and publication is
   skipped; versions and tags are not changed automatically.
8. For an absent version, CD runs `npm ci`, the release-helper tests,
   `test:contracts` (including build), `test:types`, `typecheck:compat`,
   `test:package`, lint, formatting, documentation and diff checks. The existing
   broad CI matrix remains separate. The RC qualification/package scripts have
   RC2-specific assertions, so CD uses reusable bounded gates and its own final
   artifact check; no extended research campaigns run here.
9. CD packs once into runner temporary staging. It validates the actual tarball's
   name, version, plausible file count, allowed contents, zero runtime
   dependencies and repository metadata, performs a publish dry-run and runs an
   offline external consumer against that exact artifact. It records SHA-256 in
   the log and step summary and checks the hash again immediately before publish.
10. npm authenticates using short-lived GitHub OIDC identity and publishes the
    same `.tgz` publicly. Prereleases use `next`; stable versions use `latest`.
    npm generates provenance automatically for this public package/repository.
11. CD verifies the published version and chosen dist-tag, with six bounded
    visibility attempts and increasing backoff (5–25 seconds). It lists registry
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
and skips further publication and automatic tag mutation. Verify the recorded
version, dist-tag, provenance and consumer manually after diagnosing the failure.
A prerelease run verifies only `next`; an automatically created `latest` tag from
first publication is allowed and is never deleted by CD.

RC2 is already published. Validate changes with
`node --test scripts/release/npm-release.test.mjs`, formatting, documentation and
workflow checks; do not publish it again to test the pipeline. No manual publish
dispatch is provided. End-to-end OIDC publication will be exercised only by a
future deliberately approved release.

There is currently no Dependabot configuration. GitHub Actions update monitoring
for the pinned releases is a follow-up; review upstream SHA updates deliberately.
