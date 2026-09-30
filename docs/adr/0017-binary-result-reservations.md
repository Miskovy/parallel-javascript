# 0017: Strict binary stream result-byte reservations

## Context

v0.8 can report the visible bytes of direct binary values after they reach the
host. That diagnostic cannot prevent admission of more large results than a
consumer intends to retain. Arbitrary JavaScript values still have no safe,
cheap exact-size model, and collected operations retain their final output by
definition.

## Decision

Add an opt-in exact binary-result contract only to `streamRange()`. A caller
declares fixed or per-partition visible bytes and a per-operation maximum
reserved-result-byte capacity. PJS reserves each logical result before child
admission and requires both the existing count credit and byte credit.

The worker validates the direct result before successful `postMessage`. Live
ArrayBuffer and ArrayBuffer-backed typed arrays, Buffers, and DataViews qualify;
their visible `byteLength` must equal the declaration. Nested graphs, wrong
types, detached values, raw SharedArrayBuffer, and SAB-backed views fail with
`PjsBinaryResultContractError`. A declaration larger than capacity fails before
the input factory or worker runs with `PjsResultCapacityError`.

Reservations last from admission through consumer yield. Queued cancellation
releases immediately. A cancelled running task retains credit until its worker
execution returns, fails, crashes, or is terminated. Logical items in a physical
batch retain separate reservations. Count capacity remains mandatory.

Protocol v2 gains optional per-logical-item expected bytes and a compact binary
contract failure shape. The change is additive inside workers created by the
same runtime package, so the protocol number is unchanged.

## Consequences

The capacity bounds declared direct result payload pressure, not RSS, heap,
worker allocation, transport temporaries, input data, backing allocation, or
consumer-held results. User code can allocate an oversized result before the
worker rejects it, but that value is not posted as successful output.

Ordinary streams remain count-bounded and accept arbitrary cloneable outputs.
`partitionRange()`, `parallelMapRange()`, `parallelFor()`, and `run()` gain no
result-byte capacity. This avoids collected-output deadlock and preserves their
existing memory models.

## Revisit conditions

Compression-like workloads may justify a separate upper-bound contract after
evidence establishes useful refund semantics. Shared-result accounting,
caller-provided destinations, global byte pools, and weighted-fair scheduling
require separate ownership and fairness decisions.
