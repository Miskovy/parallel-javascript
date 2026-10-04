# v1 RC1 bounded soak

**PASS on Windows and tested Fedora/Linux x64, exact candidate `cad38a178d19d42d4be1cb542ccd5e67be54896a`.**

## Retained Windows runs

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

Fresh Linux minimum/current-Node qualification and clean extended reproduction
passed below. Timing and RSS are host observations; contracts and invariants match.

## Fresh Fedora/Linux runs

All runs used unchanged exact-candidate scenarios, seed 20261003, sequentially.

| Run               | Scenario checks | Accepted logical tasks | Duration |
| ----------------- | --------------: | ---------------------: | -------: |
| v22.13.0 standard |             409 |                  7,903 |  17.15 s |
| v24.13.1 standard |             409 |                  7,903 |  16.83 s |
| v24.13.1 extended |           2,009 |                 38,405 |  78.50 s |

Linux total: **54,211 accepted tasks, 2,827 scenario checks**. Extended includes
120 fresh lifetimes. Standard/extended count the same scenario families as Windows.
Separate installed smoke checks also passed for both Node cells and both clean builds.

Every terminal has zero tasks, operations, queue, busy/live workers, reservations,
execution correlations, credit operations, buffers, reserved/unreconciled/reconciled
bytes, production claims and reserved workers. Abort listeners were checked directly;
zero warnings. Final active resources were two normal PipeWrap stdio handles with
no Timeout or MessagePort. All child processes exited naturally.

The exact-candidate extended run sampled 367 memory points. Peak RSS was 262,434,816
bytes; peak heapUsed 117,812,296; peak external 2,491,037; peak arrayBuffers 192,957.
Final RSS was 238,284,800; heapUsed 102,116,352; external 2,320,174; arrayBuffers 50,812.
These separate fields include retained harness reports and allocation/GC effects.
Linux did not run the additional Windows GC control and makes no GC-baseline or
unbounded memory claim. All actual runtime-owned bookkeeping and workers returned
to zero across 136 extended terminals. No bounded runtime/listener/timer/port leak
was observed. RSS returning to its initial value is not a frozen guarantee.

[Raw Linux scenarios, terminals, counters and memory samples](../../benchmarks/results/soak-v1.0.0-rc.1-linux.json)
are retained separately; Windows and historical artifacts remain unchanged.
