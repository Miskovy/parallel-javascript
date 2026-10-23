# PJS documentation

Start with the [README quickstart](../README.md), then choose a guide for the
contract you need. The current guides describe **integrated development source
through C3**, not the immutable package already published on npm.

## Using PJS

| Need                                            | Read                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Registration, runtime options and API selection | [Core API](guide/core-api.md)                                       |
| Clone, transfer and shared input                | [Memory ownership](guide/memory-ownership.md)                       |
| Cancellation, occupancy and shutdown            | [Lifecycle](guide/lifecycle.md)                                     |
| Queue, count and byte limits                    | [Backpressure](guide/backpressure.md)                               |
| Range/map/stream options and six alias pairs    | [Range reference](partitioning.md#c2-development-option-transition) |
| Error identity and recovery                     | [Errors](guide/errors.md)                                           |
| Diagnostic fields, units and lifetimes          | [Telemetry](guide/telemetry.md)                                     |
| Workload sizing and measurement                 | [Performance](guide/performance.md)                                 |
| Runnable recipes                                | [Basic run and task module](../examples/basic-run.mjs)              |

## Release and development status

As verified on 23 October 2026, [npm `latest` and `next`](https://registry.npmjs.org/@pjavascript%2fruntime)
select **1.0.0-rc.4**, also a [GitHub prerelease](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4).
The [RC4 release record](release-v1.0.0-rc.4.md) describes that published artifact.
Final v1.0.0 has not been released.

Development main `0f79db5e1192dd47db32d2e300fc382a0f431462` integrates S1,
corrected Stage A, B1–B4, C1-A/Q, C2 and C3. It includes later containment
controls, declaration corrections and six option renames absent from RC4.
All six deprecated aliases and feature experimental annotations remain.
Unchanged manifest versions do not make development bytes published RC4.

- [Stability and exact Node/platform evidence](stability.md).
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
