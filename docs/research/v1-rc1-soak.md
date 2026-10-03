# v1 RC1 bounded soak

**PASS on Windows, exact candidate `cad38a178d19d42d4be1cb542ccd5e67be54896a`.**
[Raw scenario/terminal/memory evidence](../../benchmarks/results/soak-v1.0.0-rc.1-windows.json)
is separate from immutable historical measurements. [Commands and bounds](../../scripts/rc/README.md)
describe fixed workers/queues/cycles/watchdogs/sample limits. Runs were sequential.

| Run                                            |     Seed | Scenario checks | Accepted logical tasks | Duration |
| ---------------------------------------------- | -------: | --------------: | ---------------------: | -------: |
| Node 22.13.0 standard                          | 20261003 |             409 |                  7,903 |  37.86 s |
| Node 22.23.3 standard                          | 20261003 |             409 |                  7,903 |  37.39 s |
| Node 24.21.0 standard                          | 20261003 |             409 |                  7,903 |  36.97 s |
| Node 24.21.0 extended, clean npm-ci checkout   | 20261003 |           2,009 |                 38,405 | 179.21 s |
| Node 24.21.0 fresh-process standard/GC control | 20261004 |             409 |                  7,903 |  37.89 s |

Total **70,017 accepted logical tasks**. These are actual task counters, including
range children, not invented parent counts. Scheduling can change sibling
admission before failure across machines. Smoke runs every family in 19 checks;
it passed inside each of the three installed Node matrix packages and both clean
installed package builds. Standard/extended are manual/release profiles; normal
CI uses smoke. No historical crypto/compression/benchmark campaign was repeated.

Each profile covers mixed successes/throws/rejections, queued/active abort,
queued/running/consumer deadlines, listener cleanup, caller/physical split,
controlled exits/replacement/two-worker storm/restart exhaustion, queue overflow
and FIFO, completion-order streams, slow consumers, break/return/throw,
count caps 1/2/4, exact equality/maximum validation, refunds including zero/equal
actual, clone/transfer/shared input, boundaries/tails/empty/oversized grain,
typed assembly, discarded uncloneable parallelFor output, eight-state shutdown,
first-mode promise identity, during/after rejection, independent pools and
repeated construct/run/shutdown (120 fresh lifetimes in extended).

Gated cancellation/deadline cases retain **1024 maximum bytes for a 1-byte result**
after caller settlement. The worker remains busy; with the other worker gated,
a sentinel stays queued until physical end. Late success releases once without
refund/reconciliation. Queued cancellation never starts its body and allows reuse
of still-attached transfer backing. Active iterator return drops late values and
prevents later queued bodies starting. Concrete errors and recovery are asserted.

Periodic checks enforce real per-stream buffer-plus-child count/byte caps, credit
composition, queue capacity and fixed worker bound. Every terminal has zero tasks,
parent operations, queue, busy/live workers, reservations, physical correlations,
credit operations, buffered values, reserved/unreconciled/reconciled bytes,
admission claims and reserved workers. Abort listeners are removed. No warning is
suppressed. Final resources are only normal PipeWrap stdio: no Timeout/MessagePort.
Successful child exit is natural; watchdogs terminate failures only.

## Memory interpretation

RSS, heapUsed, external and arrayBuffers are separate; arrayBuffers overlaps
external. Extended sampled 757 points: peak RSS 203,743,232 bytes and peak heapUsed
98,768,136 bytes. Final RSS 171,360,256 bytes and heapUsed 83,356,032 did not return
to baseline. Repeated JSON serialization and retained diagnostic reports create
harness/application allocations and garbage. This does not isolate every native
allocator or worker-heap effect.

The independent standard control recorded heapUsed 15,130,720 bytes after soak
and 8,112,216 after two diagnostic collections; arrayBuffers fell from 418,875 to
143,615. RSS stayed 82,391,040 bytes versus 36,966,400 initially. Collection
demonstrates collectable heap, not allocator high-water RSS release. Harness,
module and report retention is application-owned. No growing PJS logical owner,
worker, listener or timer residue was observed. This is bounded evidence, not an
unbounded memory guarantee. Exact control command/script are in the raw artifact.

Fresh Linux minimum/current-Node reproduction is required. Timings and RSS need
not match Windows; correctness, ownership and cleanup invariants must match.
