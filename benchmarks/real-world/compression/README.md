# v0.14 bounded native compression evaluation

Run from the repository root with the installed Node version; no dependencies
or native addon installation is needed. On Windows use npm.cmd if required.

```sh
npm run build
node --test benchmarks/real-world/compression/harness.test.mjs
node benchmarks/real-world/compression/bounds.mjs benchmarks/results/compression-v0.14-bound-validation.json
node benchmarks/real-world/compression/lifecycle.mjs benchmarks/results/compression-v0.14-lifecycle.json
node benchmarks/real-world/compression/run.mjs --profile=full --output=benchmarks/results/compression-v0.14-windows-node24.json
node benchmarks/real-world/compression/report.mjs benchmarks/results/compression-v0.14-windows-node24.json docs/research/v0.14-compression-measurements.md
```

Output filenames must be new. Checkpoints replace only the file exclusively
created by that campaign. Completed artifacts alone are evidence. `smoke` checks
tooling with one warmup/trial; `full` and `reproduce` use two warmups/six trials.
`--filter=substring` selects IDs. `reproduce` is the portable reduced profile;
run it on Fedora with a new platform filename after reading the Windows report.
`memory` selects six slow-sink cells, each requiring a separate process for
attribution. Never run timing campaigns concurrently.

Before any zlib-ng campaign, the codec guard verifies the exact qualified Fedora
RPM/header/library and asks that same library for native bounds. It uses an
installed C compiler for a temporary research helper; it installs nothing and
adds no runtime dependency. Unknown codecs/builds fail closed. The
[bound note](../../../docs/research/v0.14-compression-bounds.md) distinguishes the
unchanged stock/Motley maximum from Fedora's `N + floor(N/16) + 7` maximum.
Record explicit qualification evidence with a new filename:

```sh
node benchmarks/real-world/compression/native-diagnostic.mjs benchmarks/results/compression-v0.14-fedora-native-bound-diagnostic.json
node benchmarks/real-world/compression/bounds.mjs benchmarks/results/compression-v0.14-fedora-bounds-qualified.json
```

## Equivalent work and output protocol

All four primary models process identical independent raw-deflate blocks with
the same level, window/memory/strategy/flush options. PJS and raw worker outputs
use identical native body and one compact Uint8Array copy followed by transfer.
Serial and native async also compact output. Whole-stream size is measured
outside timing and only supplies a ratio denominator, not a speed baseline.
Internal records are `{index,start,originalBytes,compressedBytes,payload}`;
partition metadata supplies original offsets without enclosing the direct
binary result. No public file format or library is created.

Three reproducible entropy classes use generator version 1 and seed 0x5eed1234.
Highly compressible logs repeat a constant record; moderate JSON records vary
numeric fields/route/status/token; poor input is xorshift32 with each word emitted
little endian. Poor bytes are deterministic pseudorandom, not cryptographic.
Corpus preparation and one-time shared copies are outside timing and recorded
as setupMs. Transfer/clone compact input copies are inside timed factory work.
Buffer views over SAB copy no backing; zlib still has its native window copies.
Source input is never mutated after publication, including cancelled work.

PJS primary paths use streamRange over byte ranges, batch size 1. Maximum output
is derived in the [bounds note](../../../docs/research/v0.14-compression-bounds.md).
Inflate fixtures contain original lengths, so exact credit requires no repeated
host compression. Preparing compressed input for a decompression benchmark is
fixture setup, not an exact-compression reservation technique.

## Measurement scope

Each cell has persistent pools across warmups/trials; startup is recorded apart.
Fixed deterministic cell order is permuted by an ID hash. Within-cell trials
remain sequential. Warmup calibration targets 350 ms using at most four passes
of 32 MiB (128 MiB consumer retention). Tiny controls use 1 MiB. Very fast cases
can stay short: inspect wallMs and CV, and do not interpret a small percentage
difference as a stable win. All valid trials/warmups and min/max/CV remain.

Every delivered output is retained under a finite 128-MiB input-sized trial
budget, validated outside timing, and released with the trial. Each compression
output is inflated and compared; shuffled independent-block reconstruction and
complete decompressed reconstruction are also checked. This consumer ownership
is outside PJS backpressure. The campaign does **not** claim a total memory cap.
Slow sinks use awaited timer actions with actual wait distributions; requested
1 ms is not assumed to be observed 1 ms. A separate consumer-withheld prefill
compares refund against benchmark-only reconciliation suppression, keeping the
worker validation and release paths. That private override is not public API.

Input/output MiB/s use actual codec input/output bytes; for inflate also retain
originalBytes for useful reconstructed-MiB/s. Ratio always means compressed /
original. Latencies span lazy factory submission to consumer delivery, including
transport and time buffered. First/10%/50% refer to completion-order delivery.
No all-at-once speedup is fabricated. Worker instrumentation uses one disjoint
two-double SAB slot per job for admission-to-body (queue + input transport) and
native body including compaction. Public queue/execution means are weighted
differences of cumulative metrics. Queue quantiles/native splits remain null.
Body occupancy excludes transport; CPU 100% is one core.

ELU, a primed 10-ms delay histogram, and a separate 10-ms timer are measured.
The final delayed timer is drained after timing. File contention reads a cached
benchmark-owned 4-KiB temporary file, at most one request in flight, then rests
10 ms; drain the last read. Sparse sample counts qualify FS tail claims.
Temporary directory creation/removal is owned by the harness. This is libuv
interference research, not disk bandwidth. UV_THREADPOOL_SIZE and host power
configuration are left unchanged.

Memory sampling runs every 10 ms plus endpoints; RSS is process-wide, while
heapUsed/external/arrayBuffers are main-isolate fields. The after endpoint includes
validation. Samples can miss transients; one long-lived process retains allocator
high-water marks. Use fresh-process selected cases for memory comparisons.
Credit traces keep up to 200 snapshots per trial, showing running maxima versus
buffered actual credits; byte/count limits are checked during observation and
terminal records/correlations/bytes must be zero. Exact credits appear in the
internal unreconciled diagnostic because exact mode never reconciles.

Preflight checks conservative source/shared/output retention plus per-worker
heap/native/scratch estimates against half free/quarter total RAM, skipping unsafe
cells. It is an estimate, not an RSS limiter. Native threading is documented
from source; Windows process-thread observations require a separate observer.

Deep queue supplements use public run(), because batch-1 streamRange limits
live children to workers. They change admission depth without claiming stream
credit behavior. Raw persistent workers remain a small orchestration baseline:
no cancellation, telemetry or result-credit system is recreated there.

## Correctness gates

Harness tests check corpus, bound arithmetic, reconstruction, metric aggregation
and unique/fair matrix. bounds.mjs tests 324 empty/tiny/boundary/entropy/pattern
fixtures at levels 1/6/9. lifecycle.mjs checks active/queued cancellation,
consumer break, deliberate worker exit/replacement, maximum/exact violations,
zero terminal ownership and six alternating refund prefill trials per entropy.
Set PJS_DEBUG_RESERVATION_INVARIANTS=1 for focused lifecycle validation.

Runtime source and historical results remain unchanged. Read the proposal before
interpreting results. No @pjs/compression, runtime feature or next milestone starts.
