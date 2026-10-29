# PJS documentation

Start with the [README quickstart](../README.md). Current guides describe the
prepared **1.0.0 candidate**. Published RC5 is the combined six-alias transition;
this candidate proposes removing those aliases directly at stable, pending the
policy amendment. See [migration](release-v1.0.0.md) and the
[fixed release checkpoint](research/v1-release-checkpoint.md).

## Using PJS

| Need                                            | Read                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Registration, runtime options and API selection | [Core API](guide/core-api.md)                                       |
| Browser module workers and asset deployment     | [Browser guide](guide/browser.md)                                   |
| Clone, transfer and shared input                | [Memory ownership](guide/memory-ownership.md)                       |
| Cancellation, occupancy and shutdown            | [Lifecycle](guide/lifecycle.md)                                     |
| Queue, count and byte limits                    | [Backpressure](guide/backpressure.md)                               |
| Range/map/stream options and alias migration    | [Range reference](partitioning.md#c2-development-option-transition) |
| Error identity and recovery                     | [Errors](guide/errors.md)                                           |
| Diagnostic fields, units and lifetimes          | [Telemetry](guide/telemetry.md)                                     |
| Workload sizing and measurement                 | [Performance](guide/performance.md)                                 |
| Runnable recipes                                | [Basic run and task module](../examples/basic-run.mjs)              |

## Release and development status

On 29 October 2026 npm `next` selects published **1.0.0-rc.5** and `latest`
selects RC4. Stable 1.0.0 is unpublished. RC5 includes the integrated recovery,
scheduling, progress, CommonJS and browser contracts. The prepared candidate
adds C4 alias rejection, stable-only declarations and explicit stable freeze.
P1/P2/P3 promotion remains accepted. Policy/contract/evidence approval and
stable hold disposition remain separate from merge/publication authorization.
The [RC5 notes](release-v1.0.0-rc.5.md) retain their historical preparation
attribution; the [published release](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.5)
records actual publication. Historical RC4 and earlier qualification remain intact.

- [Stability and exact Node/platform evidence](stability.md).
- [Historical Node 24.0.0 development-floor qualification](research/node24-floor-qualification.md).
- [Canonical current API inventory](research/v1-api-contract-inventory.md).
- [Authoritative post-C3 maintainer decisions](research/v1-api-migration-plan.md#decisions-for-maintainer-review).
- [Proposed v1 policy, ADR 0023](adr/0023-v1-api-stability-decisions.md).
- [Release procedure and future candidate gates](releasing.md).

## Engineering and historical material

[Architecture](architecture.md), [memory mechanics](memory.md) and
[toolchain](toolchain.md) support contributors. See [CONTRIBUTING](../CONTRIBUTING.md),
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
