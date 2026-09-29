# 0016: Diagnostic stream payload-byte observability

## Context

The v0.7 stream bound counts logical results. Equal item counts can retain very
different binary payloads, but exact JavaScript object size cannot be measured
safely without graph traversal, aliases, proxies, getters, cycles, and runtime
implementation details.

## Decision

Expose diagnostic queued payload bytes only for direct `ArrayBuffer`,
`SharedArrayBuffer`, typed-array, Node Buffer, and DataView outputs. Buffers
contribute their `byteLength`; views contribute their visible `byteLength`.
Ordinary arrays, objects, and scalars increment `unknownBufferedResults` even if
they contain nested buffers. PJS never traverses their graphs.

Metrics report current and peak `knownBufferedPayloadBytes` plus current and
peak unknown result counts. Direct delivery to a waiting consumer is not queued.
Yield, close, failure, and cancellation release current accounting.

Aliased views are counted per payload. The same physical SharedArrayBuffer can
cross separate worker messages as distinct host wrapper identities, so cheap
identity tracking cannot guarantee unique-backing accounting. These bytes are
not exclusive ownership, RSS, heap size, transport temporaries, or unique
physical memory.

## Consequences

No hard byte limit is added. Unknown values cannot be treated as zero, and size
is learned only after a worker result has already crossed the boundary. Logical
result capacity remains the enforceable general bound.

## Revisit conditions

A future binary-only mode may reserve declared bytes before dispatch, but it
must reject unknown values and validate declarations. It must not silently
generalize the diagnostic metric into exact memory accounting.
