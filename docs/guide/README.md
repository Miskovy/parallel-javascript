# Using PJS

[Documentation index](../README.md)

Start with the [quickstart](../../README.md#quickstart), then use these guides
for the contract you need. They describe the prepared candidate identified in
the [documentation index](../README.md#release-and-development-status).

| Guide                                   | Covers                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| [Core API](core-api.md)                 | Task registration, runtime configuration, API selection and CommonJS. |
| [Browser](browser.md)                   | Module workers, deployment, capabilities and browser ownership.       |
| [Memory ownership](memory-ownership.md) | Clone, transfer and reusable shared input.                            |
| [Lifecycle](lifecycle.md)               | Startup, cancellation, execution ownership, recovery and shutdown.    |
| [Backpressure](backpressure.md)         | Queue limits, stream buffering and result-byte credits.               |
| [Errors](errors.md)                     | Error identity, metadata and recovery behavior.                       |
| [Telemetry](telemetry.md)               | Diagnostic fields, units and lifetimes.                               |
| [Performance](performance.md)           | Workload sizing, worker counts and measurement.                       |

See the [range reference](../reference/partitioning.md) for range, map and stream
options, the [stability policy](../reference/stability.md) for compatibility, and
the [runnable examples](../../README.md#examples) for complete recipes.
