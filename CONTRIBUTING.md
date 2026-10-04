# Contributing to PJS

Contributions are welcome: runtime correctness, tests, documentation, examples,
developer experience, cross-platform compatibility, performance investigation,
benchmark methodology, and bug reproductions all help PJS mature.

Small fixes and focused improvements can go straight to a pull request. If the
problem or intended behavior is unclear, open an issue first. Significant runtime,
architecture, or public API proposals should begin with a GitHub issue before
substantial implementation so the maintainer and contributors can agree on the
problem and contract. There is no formal RFC requirement, and a proposal does not
guarantee acceptance. Small PRs are welcome; you do not need to study the project's
research history to fix a documentation page.

## Understand the model

PJS combines the Node event loop with a bounded compute plane backed by persistent
`worker_threads` workers. Applications explicitly register trusted module exports
for CPU work; ordinary asynchronous I/O stays on Node's event loop.

PJS is not a transparent JavaScript auto-parallelizer, a closure serializer, a
replacement for async I/O, or a distributed runtime.

Start with the [README](README.md), [architecture](docs/architecture.md),
[stability policy](docs/stability.md), and [core API guide](docs/guide/core-api.md).
For changes to a particular contract, also read the relevant
[lifecycle](docs/guide/lifecycle.md), [backpressure](docs/guide/backpressure.md),
[memory ownership](docs/guide/memory-ownership.md), or
[error](docs/guide/errors.md) guide.

## Development requirements and setup

Use Node **22.13+ within Node 22.x**, or **Node 24.x**, with npm and Git. Other Node
majors are outside the supported policy. The project uses ESM; compile TypeScript
task modules to JavaScript before loading them in workers.

```sh
git clone https://github.com/Miskovy/pjs.git
cd pjs
npm ci
npm run build
```

For a PR, fork the repository on GitHub and clone your fork instead if you do not
have push access. Work on a focused branch and open the PR against `main`.
The lockfile and workspace scripts supply the development tools; no global
compiler or linter installation is needed. On Windows, use `npm.cmd` if your
PowerShell policy blocks `npm.ps1`.

## Validation commands

Run these commands from the repository root. They are the normal validation gates:

| Command                    | What it protects                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm test`                 | Builds the runtime, checks public type cases, and runs the runtime test suite.                       |
| `npm run test:contracts`   | Runs each runtime test file separately and reports individual contract-test totals.                  |
| `npm run test:types`       | Checks positive and negative public API type cases.                                                  |
| `npm run typecheck:compat` | Checks runtime source with the compatibility TypeScript compiler.                                    |
| `npm run lint`             | Checks source and scripts against the repository's lint rules.                                       |
| `npm run format:check`     | Checks repository formatting without modifying files.                                                |
| `npm run test:docs`        | Checks local Markdown links and the README's executable example.                                     |
| `npm run test:package`     | Packs and installs outside the checkout; checks workers, errors, TypeScript consumers, and examples. |

When formatting is needed, use the workspace formatter on only the files you
changed, for example `npm exec -- prettier --write CONTRIBUTING.md`. Avoid
reformatting unrelated historical documents. Run `git diff --check` before
submitting.

### Validation by change type

| Change                           | Minimum expected validation                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation/community metadata | `npm run format:check`, `npm run test:docs`, and `git diff --check`; check issue-form YAML when changed. Run the documented example if you change it. |
| Tests                            | Relevant tests plus `npm test`, lint, and format checks.                                                                                              |
| Runtime implementation           | All normal validation gates listed above.                                                                                                             |
| Public API/types                 | All normal gates, including type compatibility, contract, documentation, and installed-package checks.                                                |
| Worker/lifecycle/backpressure    | All normal gates, with relevant regression coverage for affected contracts and terminal ownership.                                                    |
| Performance claim                | Relevant correctness checks plus reproducible benchmark evidence.                                                                                     |

To run one runtime test file while investigating a failure, build first, then use
`node --test --test-timeout=20000 packages/runtime/test/runtime.test.mjs`, replacing
the path with the relevant test file. Run the normal suite before submitting a
behavior change.

Extended release-candidate soak campaigns are release qualification work, not a
requirement for every documentation or small test PR. Existing CI runs its own
qualification gates; report failures and resolve them before merge.

## Tests and runtime contracts

A runtime correctness change should normally include a regression test
demonstrating the failure before the fix and protecting the contract afterward.
Prefer tests of observable behavior, documented contracts, ownership invariants,
and failure recovery over tests tied to internal implementation shape.

For core runtime changes, the PR description must say whether the change affects
scheduling, queue admission, caller settlement, cancellation, timeouts, worker
replacement, stream ordering, result credits, memory ownership, or shutdown.
"No effect" is a valid answer for any area. Explain changed contracts and how
tests protect them; PJS is approaching stable 1.0 and these boundaries matter.

In particular, caller settlement is separate from worker occupancy, cancellation
does not undo a transferred buffer, and result credits do not bound all process
memory. Preserve the documented invariants or discuss a deliberate contract
change before implementing it.

## Public API proposals

Significant API or architecture changes should start with a GitHub issue. Explain:

- The problem and why existing APIs cannot solve it cleanly.
- The proposed contract, including failure semantics and ownership implications.
- Compatibility impact and any migration needed.
- The testing strategy and documentation changes.

Use the [stability policy](docs/stability.md) to distinguish core candidates,
supported ownership helpers, experimental range APIs, and diagnostic surfaces.
An experimental API is not automatically promoted by adding an example.

## Performance contributions

Only performance claims need benchmark evidence; every PR does not need a
benchmark. Include hardware, OS, Node version, worker count, workload, input size,
number of runs, baseline, and PJS results. Record relevant queue settings and how
the measurements were collected so another contributor can repeat them.

Choose appropriate controls, such as serial execution, raw persistent
`worker_threads`, or a native Node API. Compare equivalent work and ownership
costs, explain variability, and report repeated measurements rather than noisy
one-shot timings. Do not cherry-pick favorable runs or input sizes. The
[performance guide](docs/guide/performance.md) and
[benchmark methodology](benchmarks/README.md) provide context; you only need the
parts relevant to your claim.

## Cross-platform contributions

Timing does not need to match between operating systems. Focus on the same
semantics, invariants, and installed-package behavior. Include the OS, architecture,
and exact Node version you tested; reproduction on an additional platform is
especially useful.

RC1 has completed Windows and Fedora/Linux x64 qualification. macOS and ARM64
remain unclaimed; a new reproduction is useful evidence, not automatic platform
qualification. See the [RC readiness report](docs/research/v1-rc1-readiness.md).

## Commits and pull requests

Use clear, focused, descriptive commit messages. Prefer logically separated
commits for unrelated changes; no Conventional Commits or sign-off format is
required.

A PR should solve one coherent problem, include tests where appropriate, update
docs when public behavior or contracts change, and avoid unrelated cleanup.
Describe user-visible effects and compatibility impact. Fill in the
[PR template](.github/PULL_REQUEST_TEMPLATE.md) with actual commands executed and
platforms tested; mark irrelevant contract areas as "None" or "No effect".

The project is [MIT licensed](LICENSE). Contributions use the existing license;
there is no CLA or DCO requirement.

## Reporting and community

Use [SUPPORT.md](SUPPORT.md) to choose a bug, feature, performance, documentation,
or question form. A minimal reproduction is a valuable contribution on its own.

**Do not report security vulnerabilities through public issues.** Follow the
private reporting instructions in [SECURITY.md](SECURITY.md).

Participation in PJS spaces implies following the
[Code of Conduct](CODE_OF_CONDUCT.md). Sensitive conduct reports use its private
maintainer contact guidance.
