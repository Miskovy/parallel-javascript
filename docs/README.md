# PJS documentation

Start with the [README quickstart](../README.md). Current guides describe the
prepared **1.0.0 candidate**. Published RC5 is the combined six-alias transition;
this candidate proposes removing those aliases directly at stable, pending the
policy amendment. See [migration](releases/release-v1.0.0.md) and the
[fixed release checkpoint](research/v1-release-checkpoint.md).

## Documentation layout

| Section                                   | Contents                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| [Guides](guide/README.md)                 | Using PJS, from registration to performance tuning.                          |
| [Reference](reference/README.md)          | Range operations, API stability and platform support.                        |
| [Development](development/README.md)      | Architecture, memory mechanics, toolchain and release procedure.             |
| [Release notes](releases/README.md)       | Versioned release scope and migration notes.                                 |
| [Proposals](proposals/README.md)          | Design proposals and implementation checkpoints.                             |
| [Benchmark reports](benchmarks/README.md) | Historical versioned measurements and cross-platform reports.                |
| [Research](research/README.md)            | API reviews, qualification reports and experiment records, grouped by topic. |
| [Architecture decisions](adr/README.md)   | Numbered decision records and their original context.                        |
| [Review evidence](review/README.md)       | Retained patches and machine-readable review artifacts.                      |

## Using PJS

| Need                                            | Read                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Registration, runtime options and API selection | [Core API](guide/core-api.md)                                                 |
| Browser module workers and asset deployment     | [Browser guide](guide/browser.md)                                             |
| Clone, transfer and shared input                | [Memory ownership](guide/memory-ownership.md)                                 |
| Cancellation, occupancy and shutdown            | [Lifecycle](guide/lifecycle.md)                                               |
| Queue, count and byte limits                    | [Backpressure](guide/backpressure.md)                                         |
| Range/map/stream options and alias migration    | [Range reference](reference/partitioning.md#c2-development-option-transition) |
| Error identity and recovery                     | [Errors](guide/errors.md)                                                     |
| Diagnostic fields, units and lifetimes          | [Telemetry](guide/telemetry.md)                                               |
| Workload sizing and measurement                 | [Performance](guide/performance.md)                                           |
| Runnable recipes                                | [Basic run and task module](../examples/basic-run.mjs)                        |

## Release and development status

On 29 October 2026 npm `next` selects published **1.0.0-rc.5** and `latest`
selects RC4. Stable 1.0.0 is unpublished. RC5 includes the integrated recovery,
scheduling, progress, CommonJS and browser contracts. The prepared candidate
adds C4 alias rejection, stable-only declarations and explicit stable freeze.
P1/P2/P3 promotion remains accepted. Policy/contract/evidence approval and
stable hold disposition remain separate from merge/publication authorization.
The [RC5 notes](releases/release-v1.0.0-rc.5.md) retain their historical preparation
attribution; the [published release](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.5)
records actual publication. Historical RC4 and earlier qualification remain intact.

- [Stability and exact Node/platform evidence](reference/stability.md).
- [Historical Node 24.0.0 development-floor qualification](research/node24-floor-qualification.md).
- [Canonical current API inventory](research/v1-api-contract-inventory.md).
- [Authoritative post-C3 maintainer decisions](research/v1-api-migration-plan.md#decisions-for-maintainer-review).
- [Proposed v1 policy, ADR 0023](adr/0023-v1-api-stability-decisions.md).
- [Release procedure and future candidate gates](development/releasing.md).

## Engineering and historical material

[Architecture](development/architecture.md), [memory mechanics](development/memory.md) and
[toolchain](development/toolchain.md) support contributors. See [CONTRIBUTING](../CONTRIBUTING.md),
[SUPPORT](../SUPPORT.md) and [SECURITY](../SECURITY.md) for project workflows.

Versioned release notes, research reports, experiment results, older inventories
and ADR context retain their original source, package names and conclusions.
Their “current” or “next” wording refers to their stated baseline. In particular,
later C1/C2/C3 passes do not repair historical B2's incomplete Linux qualification.
Frozen RC4 inputs remain immutable; none of these docs authorizes promotion,
alias removal or publication.

[The Science of PJS](../science/README.md) uses an explicitly historical RC1
architecture baseline. [Benchmark methodology](../benchmarks/README.md) links
versioned commands and retained measurements, without a current speed ranking.
The [complete Markdown review record](research/post-c3-documentation-review.md)
lists every reviewed file and its disposition.

## Maintaining this documentation

Keep this index as the only file at the documentation root. Put new documents in
the matching section and link them from that section's README. Keep practical
guides separate from versioned proposals, measurements and qualification records;
preserve the original baseline and conclusions of historical material.

When moving a document, update incoming links, its relative links, and any tools
that read or generate it. Recorded paths in historical evidence and published
release freezes refer to their original checkout. Run `npm run test:docs`,
`npm run format:check` and `git diff --check` after documentation changes.
