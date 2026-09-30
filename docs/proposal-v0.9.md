# v0.9 proposal: strict binary streams and result-byte reservations

## Decision summary

v0.9 should add an opt-in strict binary-result contract to `streamRange()`.
Before admitting each logical partition, the host obtains an exact declared
visible payload byte length and reserves it against that stream operation's
configured result-byte capacity. The existing logical-result count capacity
continues to apply independently. The worker receives the expected byte length,
unwraps any PJS transfer envelope, verifies that the direct result is an
ArrayBuffer or ArrayBuffer-backed view with exactly that visible byte length,
and only then posts success.

The guarantee is precise: **for a strict binary stream, PJS does not admit a
logical partition when its declared result payload bytes would make the sum of
buffered plus admitted-unsettled declared payload bytes exceed that operation's
configured capacity. The reservation remains until consumer delivery, or until
execution termination after cancellation/failure. The worker rejects a
non-binary, shared-backed, detached, oversized, or undersized result before
posting it as a successful payload.**

This is not a process RSS, JavaScript heap, worker-allocation, transport-
temporary, backing-allocation, or unique-physical-memory limit. User code can
allocate more before validation, inputs remain outside the budget, and the
consumer owns a result after yield.

## Scope and qualifying results

Strict mode accepts only direct values whose visible bytes are measurable
without graph traversal:

- a live `ArrayBuffer`;
- a typed-array view backed by `ArrayBuffer`;
- a Node `Buffer` backed by `ArrayBuffer`;
- a `DataView` backed by `ArrayBuffer`.

For views, the contract uses the view's `byteLength`, not its entire backing
buffer. This handles typed-array subviews and pooled Buffers honestly. A live
zero-length buffer or view is valid when zero was declared. A detached buffer
or view is a contract failure rather than a valid zero-length result.

Raw `SharedArrayBuffer` and SAB-backed views remain valid in ordinary streams
and retain v0.8 diagnostic accounting, but strict mode rejects them. Shared
backing can predate the operation, has no transfer ownership, may remain
externally reachable, and creates different pressure from an owned result
crossing the message boundary.

Objects containing binary values, arrays of buffers, Maps, Sets, proxies, and
other nested graphs do not qualify. PJS does not traverse them. Ordinary
object/scalar streams continue to use count backpressure and v0.8 diagnostics.

## Public experimental API

Add an overload using an exported binary output union and options type:

```ts
type PjsBinaryResult =
  | ArrayBuffer
  | PjsTypedArray
  | DataView<ArrayBufferLike>;

interface BinaryStreamRangeOptions extends PartitionOptions {
  experimentalMaxBufferedResults?: number;
  experimentalResultBytes:
    | number
    | ((partition: RangePartition) => number);
  experimentalMaxReservedResultBytes: number;
}

streamRange<Input, Output extends PjsBinaryResult>(
  task: PjsTask<Input, Output>,
  range: PartitionRange,
  createInput: (partition: RangePartition) => PartitionInput<Input>,
  options: BinaryStreamRangeOptions,
): AsyncIterable<StreamRangeResult<Output>>;
```

Both binary options are required together by the binary overload. Existing
`StreamRangeOptions` remains count-only. The implementation rejects partial or
invalid option combinations at runtime as well. Names remain experimental.

## Declaration model

Choose a fixed number or a synchronous per-partition callback. A fixed number
is concise for equal blocks. A callback supports uneven final partitions and
variable known sizes without changing `PartitionInput` or mixing input transfer
ownership with result declarations.

The callback runs lazily on the host in the operation's existing AsyncResource,
before the input factory and before child admission. Its result must be a
nonnegative safe integer. Capacity is also a nonnegative safe integer. Addition
uses subtraction comparisons (`declared <= capacity - reserved`) so sums do not
overflow. A declaration larger than capacity fails promptly with
`PjsResultCapacityError`; its factory is not called and no worker executes it.

Declarations are cached per next partition if byte credit is temporarily
unavailable, so the callback runs once and side effects are not repeated. The
current producer rotation can then consider another operation instead of
globally blocking behind one weighted result.

Factory-level `expectedResultBytes` was rejected because it combines unrelated
input and output ownership and would allocate input before proving byte credit.
An upper-bound declaration was rejected for v0.9 because it complicates refund
semantics and weakens predictability. Compression-like output whose exact size
is unknowable does not fit this contract.

## Exact contract and worker validation

The first contract is exact:

```text
actual visible payload bytes === declared result bytes
```

Size alone is insufficient. The output must also be a qualifying direct binary
value with non-shared, live backing. Validation occurs after user code returns
and after a PJS transfer envelope is inspected, but before `postMessage` and
before any transfer detaches the worker's buffer. On mismatch the worker sends a
compact binary-contract failure containing declared bytes, observable actual
bytes when available, and actual kind. It never posts the mismatched value as a
successful payload.

Add `PjsBinaryResultContractError` for worker result kind/size/liveness failures
and `PjsResultCapacityError` for an impossible single declaration. Errors carry
normal task/worker/operation/partition context plus declared/actual byte and
actual-kind fields where applicable. These semantics are distinct from map
cardinality and queue saturation.

Protocol v2 gains optional `expectedResultBytes` on a single execution and on
each logical batch item, plus a validated binary-contract failure shape. This
is an additive internal field between a runtime and the workers it starts; a
version bump adds no compatibility because mixed package builds are already
unsupported. Malformed fields remain protocol failures.

## Count and byte admission

Strict streams satisfy both independent invariants:

```text
buffered results + admitted-unsettled results <= result count capacity

buffered declared bytes + reserved admitted-unsettled bytes
  <= result byte capacity
```

The stricter dimension wins. Zero-byte results still consume count credit and
ordinary task metadata. Byte capacity is per stream operation, not a global RAM
pool. Producer rotation skips an operation whose next cached declaration lacks
credit and can progress another eligible operation. No weighted-fair scheduler,
work stealing, or automatic capacity policy is added.

Physical batches remain transport units only. Every logical batch item owns its
own reservation, and the sum must already fit before physical dispatch. Expected
bytes travel per item. If an earlier item fails, later skipped item reservations
release when batch execution terminates; earlier successful buffered items
follow normal delivery or parent-failure cleanup.

## Reservation lifecycle

Reservation occurs immediately before logical child admission. No reservation
exists for ungenerated work or while a cached declaration waits for capacity.
The task ID owns the reservation after admission.

On successful result receipt, the reservation remains while the result is
buffered. Yield releases it. Direct delivery to a waiting consumer releases it
in the same turn even though diagnostic buffered bytes remain zero.

Queued cancellation removes the task and releases immediately. Cancellation or
deadline after physical dispatch settles the caller but retains reservation
until the worker result, batch termination, crash, or worker termination proves
that execution can no longer allocate/post that result. A worker crash releases
all reservations associated with that physical execution exactly once and does
not retry. Consumer close/failure releases received buffered reservations and
queued reservations, while running reservations remain until execution ends.

Graceful shutdown preserves the stream contract: it waits for production,
execution, and consumer delivery, so reservations reach zero through normal
yield. Non-draining shutdown cancels parents, terminates workers, and releases
remaining running reservations only after worker termination completes.

## Collected operations and typed map

`partitionRange()` and `parallelMapRange()` intentionally retain final output.
Applying temporary stream credits to them can deadlock whenever total final
output exceeds capacity, so v0.9 adds no byte-capacity option to collected
operations. `parallelFor()` has no successful result payload, and ordinary
`run()` has only one result, so neither changes.

Typed `parallelMapRange()` already derives each block's expected bytes from
partition width and `BYTES_PER_ELEMENT`. It remains a correctness and benchmark
control for exact sizing, but does not acquire streaming reservation semantics
or change its established `PjsMapContractError` behavior. A small internal
binary inspection helper may be shared only where it does not change that API.

## Metrics and invariants

Extend `streamResults` with:

```text
currentReservedResultBytes
peakReservedResultBytes
resultByteReservationWaits
resultByteReservationRejected
binaryResultContractFailures
```

Current reserved bytes include cancelled running executions until they
terminate, even after the parent is no longer active. Peak is the aggregate
runtime high-water mark. A wait counts once per logical declaration that could
not initially reserve credit; rejected counts impossible/invalid declarations.

Strict active-operation snapshots expose:

```text
reservedResultBytes
bufferedKnownPayloadBytes
resultByteCapacity
```

For each active strict stream at stable observable boundaries:

```text
bufferedKnownPayloadBytes <= reservedResultBytes <= resultByteCapacity
```

Existing `knownBufferedPayloadBytes` remains actual queued visible bytes for all
streams. Reserved bytes are declared future/received payload credit. Neither is
RSS, heap, worker allocation, transport temporary size, unique backing bytes,
or consumer-retained memory.

## Evidence plan

Tests cover valid ArrayBuffer, typed array, Buffer, DataView, zero length,
subviews, uneven partitions, clone/transfer, batch sizes, declaration validation,
impossible results, wrong kind, SAB, detached values, over/undersize mismatch,
queued/running cancellation, consumer close/throw, timeout, crash, first batch
failure, both shutdown modes, saturation, multiple streams, and zero terminal
reservation leakage. Existing count-only streams and object outputs remain
unchanged.

Benchmarks compare count capacities 1/4/8/16 with byte capacities
1/4/16/64 MiB for fixed binary blocks, a variable 4/16/64/256 KiB pipeline,
fast and slow consumers, a realistic binary transformation/async sink, an
ordinary object-stream negative control, typed map sizing, and an
application-managed Piscina byte semaphore. Retain wall/CPU/RSS, throughput,
first-result latency, sampled worker occupancy, reserved/buffered peaks,
physical messages, event-loop delay/utilization, and timer drift.

Mixed strict streams with different result sizes, ordinary work,
`parallelFor()`, and `parallelMapRange()` test bounded fairness. A committed
v0.8 same-machine control covers established APIs and isolates opt-in overhead.
No work stealing, reduce, ordered streaming, generic schema system, caller-
provided destination, or automatic grain/batch/capacity sizing is introduced.
