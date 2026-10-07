# Admission and result backpressure

There are three independent bounds. **Queue depth is not CPU capacity.**

| Bound                              | Controls                                                                  | Does not control                                                              |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| maxQueue                           | Waiting logical tasks; active physical slots are separate                 | CPU throughput, input bytes, retained results                                 |
| experimentalMaxBufferedResults     | Buffered + admitted-unsettled logical results per stream; default workers | Bytes or consumer-retained outputs                                            |
| experimentalMaxReservedResultBytes | Occupied declared/actual visible binary result credit per stream          | Heap/RSS, backing size, scratch/native memory, inputs or post-yield retention |

FIFO means dispatch order among queued work, not result completion order. A full
ordinary run queue rejects immediately with PjsQueueFullError; the runtime is not
broken and offers no hidden waiting list. Limit application offers, shed work or
retry rejected work later with an explicit bounded backoff policy. Avoid a tight
retry loop. Only admission rejection establishes that this offer never executed;
other errors can follow side effects. Parent range admission is also bounded by
workers + maxQueue (capped at MAX_SAFE_INTEGER); children are produced lazily.

Deeper queues can absorb short bursts, but generally add waiting and worsen p95/p99
when CPU capacity is saturated. Size for acceptable backlog, not hoped-for extra
throughput. Application-level waiting must itself have a bound.

## Count and byte lifecycle

```text
count + byte capacity available
  → reserve before admission → execute → worker validates → result arrives
  → reconcile successful upper bound / refund slack
  → retain actual credit while buffered → yield / release
```

Exact mode declares `experimentalResultBytes`; maximum mode declares
`experimentalMaxResultBytes`. Each accepts a nonnegative safe integer or a
synchronous function of partition. Exactly one declaration must accompany
experimentalMaxReservedResultBytes. Omit unused properties entirely, rather than
passing undefined. Callback throws/invalid values are contract errors. A declaration
larger than capacity fails with PjsResultCapacityError instead of waiting forever.
Zero-byte outputs still consume count credit. Multiple streams have independent
capacities; aggregate runtime reserved bytes can exceed one stream's cap.

## Exact result contract

For a known-size transform, reserve `partition.end - partition.start` bytes,
validate **equality**, and retain that credit until delivery or terminal cleanup.
A smaller result is also an error. Decompression with a trustworthy original
length is a real v0.14 example; PJS does not discover that length.

```js
const options = {
  experimentalMaxBufferedResults: 4,
  experimentalResultBytes: (partition) => partition.end - partition.start,
  experimentalMaxReservedResultBytes: 16384,
};
```

See the exact transform in [streaming-binary.mjs](../../examples/streaming-binary.mjs).

## Upper-bound contract and refunds

For variable binary output, declare a trustworthy maximum M before execution.
The worker validates actual visible bytes A ≤ M before transport. On a deliverable
successful arrival, PJS refunds M − A immediately, retaining A until yield. A=0
refunds all byte credit but still occupies buffered count. A=M reconciles without
a positive-refund event. Failure/cancellation releases are not successful refunds;
discarded late successes do not reconcile. Already-buffered successes may have
refunded before a later parent failure releases their remaining actual credit.

The binary recipe filters bytes: each input byte emits at most one output byte,
so the input partition length is a provable maximum without a sizing scan. The
same resource model supports v0.14 compression, whose bound is codec-specific.
Conservative bounds can reduce concurrency: capacity for one maximum cannot
admit four maxima just because typical outputs are small.

Count and byte credit remain distinct from worker scheduling. Refunding slack
can permit further production while a consumer is slow; it promises neither
throughput gains nor lower RSS. Active cancelled work keeps its reservation until
physical completion/termination, preventing premature reuse of credit.

Physical completion means a valid final response for the task/batch or confirmed
worker-thread exit. Worker failure notification and a termination request do not
release dispatched result credit. Exact and upper-bound reservations remain held
while a failed worker can still execute; confirmed exit releases retained credit
for already-settled callers. This release is not a successful upper-bound refund.
Every logical reservation in a physical batch follows the same exit boundary.

The published `1.0.0-rc.2` abnormal-failure path releases this ownership too early;
the R1A correction restores the documented boundary. Normal results still end
task execution immediately without requiring the reusable worker thread to exit.

## External resource declarations

**PJS can correctly enforce a wrong workload declaration.** The workload/library
must supply a trustworthy bound and qualify it against its actual configuration.

v0.14's stock-zlib/Motley formula was not a portable bound for the researched
Fedora zlib-ng build. That campaign stopped qualification, inspected the matching
native implementation and established a codec-specific contract before proceeding.
The runtime needed no codec knowledge or semantic change. See the preserved
[bound qualification](../research/v0.14-compression-bounds.md) and
[cross-platform report](../cross-platform-v0.14.md).

```text
workload/library → trustworthy declaration → PJS enforcement
```

Testing many outputs is useful regression evidence but does not prove a worst-case
bound. Keep compression/crypto/native-library qualification outside the runtime.
