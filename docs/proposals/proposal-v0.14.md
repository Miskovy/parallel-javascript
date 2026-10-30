# PJS v0.14 — bounded native compression research proposal

Written before benchmark implementation and retained measurements, 2026-10-02.
The checkout starts at d9e259ef2ee14a11e05b57fb7621295aa67958c9;
runtime implementation is 18f0c87e7b7920179403bbc396afabced6bb06c4.
Freeze packages/runtime/src. No compression package, scheduler, protocol,
ordered stream, automatic grain, native addon or next milestone is authorized.

## Question and hypotheses

Can the existing runtime express a useful bounded binary compute pipeline?
Throughput, first result, filesystem isolation, responsiveness, admission,
credit ownership and ergonomics all count as evidence. Preserve losses.

| ID  | Prediction before measurement                                                                 |
| --- | --------------------------------------------------------------------------------------------- |
| H1  | Tiny blocks lose because dispatch and transport dominate.                                     |
| H2  | Coarse independent blocks can benefit from PJS parallelism.                                   |
| H3  | Shared/transfer inputs materially improve coarse compression over cloning.                    |
| H4  | Native async zlib and async filesystem work interfere through libuv.                          |
| H5  | Dedicated workers running sync zlib isolate filesystem work.                                  |
| H6  | Safe maxima provide meaningful retained-output/admission control.                             |
| H7  | Early refunds most improve producer progress for compressible output with a slow consumer.    |
| H8  | Incompressible output approaches the maximum, reducing refunds.                               |
| H9  | Compression level changes the useful block crossover.                                         |
| H10 | Known decompressed length makes exact credits natural and produces different execution costs. |

## Design and evidence contract

Use Node node:zlib deflateRaw/inflateRaw only, windowBits=15, memLevel=8,
default strategy, no dictionary, Z_NO_FLUSH/Z_FINISH. Levels 1 and 6;
level 9 is a targeted supplement. Derive the bound from authoritative sources
before activating maxima; test empty, 1-byte, boundaries, every grain and level,
multiple deterministic seeds and entropy fixtures. Fail if the worker contract fails.

Internal block records have index, originalBytes, compressedBytes, payload;
stream partition identity supplies index and original range externally. This
is private benchmark infrastructure. Compare identical independent blocks across
serial sync, bounded native async, persistent PJS sync workers and minimal raw
workers. Whole-stream size is a separate ratio tradeoff, never a speedup denominator.

Generate highly repeated records, changing structured records, and deterministic
xorshift32 pseudorandom bytes (not cryptographic randomness). Record seed and
generator version. Start at 32 MiB; do not blindly cross 128/256 MiB. Grains:
64 KiB, 256 KiB, 1 MiB, 4 MiB; targeted 1 KiB control. Main workers=4;
supplements 1/2/4/availableParallelism. Two warmups and six retained trials.
Warmup calibration aims for 350 ms with at most four corpus passes and 128 MiB
consumer retention; preserve short windows and variance. No outlier removal.

PJS uses streamRange over numeric byte ranges and a shared immutable corpus;
clone uses compact blocks, transfer creates dedicated compact copies lazily.
Include that preparation in timing, and report shared setup separately. Use
completion order, reconstruct externally by index. Output is a compact transferred
Uint8Array; identical native body and compaction for raw workers. Timing metadata
uses separate disjoint shared instrumentation slots, outside the binary output.

Compression controls: count-only, maximum with refund, benchmark-only held maximum
using the established v0.12 reconciliation override. Decompression: natural exact
original length. Sweep count 4/16/64, bytes 1/4/16 maxima and fast/1-ms consumers;
record actual consumer wait because Windows timers need not deliver 1 ms.
Consumer-withheld prefill is the causal refund-progress control. No shipping API.

Record input/output MiB/s, blocks/s, ratio compressed/original, wall, first/10%/50%,
block end-to-end distributions, queue mean and body/admission-to-body distributions,
CPU (100%=one core), occupancy, ELU, delay histogram and independent timer.
Unavailable queue and native execution quantiles stay null. Sample memory and
credit planes; terminal records, bytes and correlations must be zero.
Credits do not bound native zlib state, scratch, backing, RSS or consumer retention.
Validate every retained output outside timed work by inflate and byte equality,
including reconstructed input. Limit validation retention and expose its scope.

Contention uses only a benchmark-owned cached temporary 4-KiB file and a bounded
single read probe with 10-ms rest; drain final probes and report sparse samples.
Leave UV_THREADPOOL_SIZE and power settings unchanged. Sweep native logical
concurrency and PJS worker counts; use ordinary run() for the deep-queue supplement,
since batch-1 streamRange deliberately admits at most worker-count live children.
No competing scheduler in raw baseline. Record unsupported native thread metrics
as null; inspect zlib implementation for internal threading.

Preflight estimates input/shared backing, possible consumer retention, worker
heaps and native codec state against half free RAM and quarter total RAM;
skip rather than swap/OOM. Fresh processes confirm selected memory cases.
Focused lifecycle tests gate cancellation while work remains physically occupied,
consumer break, deliberate benchmark worker exit and replacement, and undersized
maximum/exact mismatch. Preserve historical tracked files with baseline hashes.

## Decision gates

Outcome A: existing runtime fits; B: useful with documented ergonomics; C: a
measured missing capability with minimal reproduction. A genuine missing primitive
stops implementation: document problem, impact, alternatives and architectural
owner. Do not implement the solution. Do not create @pjs/compression.

After the current Windows campaign, prepare a reduced second-platform profile
for coarse crossover, ownership, refunds/capacity, FS isolation and exact inflate.
Do not claim Fedora reproduction without running there. Run build, runtime tests,
type tests, compatibility, lint, format and diff checks plus meaningful harness
tests. Report every required question and recommend, but do not start, a next milestone.
