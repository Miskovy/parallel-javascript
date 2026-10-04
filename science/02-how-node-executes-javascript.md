# 02 — How Node.js Actually Executes JavaScript

[Previous: computation](01-concurrency-parallelism-and-computation.md) · [Book](README.md) · [Next: parallel cost](03-the-cost-model-of-parallelism.md)

## Follow the work through the process

An asynchronous function is not a location. To understand Node performance, we
need to locate the instructions, the waiting, and the completion notification.
Consider three operations: a JavaScript loop, a network request, and an
asynchronous password derivation. All can appear inside promise-based code, but
they need not use the same execution resources.

Here is an introductory map of a Node process. It shows responsibility, not a
complete thread inventory or an exact memory layout:

```text
Node process (one OS address space)
|
+-- main JavaScript thread
|   +-- V8 isolate: ordinary JS objects and heap
|   +-- Node environment / event loop: callbacks and coordination
|
+-- libuv machinery
|   +-- OS network readiness/completion facilities
|   +-- process-global native worker pool for selected operations
|
+-- engine, Node, native-library, and addon work
|   +-- may use additional threads; implementation dependent
|
+-- explicit worker_threads
    +-- worker A: JS execution thread, isolate/heap, environment/loop
    +-- worker B: JS execution thread, isolate/heap, environment/loop
    +-- message channels and explicitly shared backing memory
```

The map combines the documented [libuv design](references.md#libuv-design),
[V8 isolate model](references.md#v8-embed), and
[Node worker environments](references.md#node-workers). A worker also has a loop;
the process-global native pool is shared across loops. Engine helper threads are
not application workers and should not be counted as additional PJS task slots.

The useful first question about an expensive call is therefore: **which part of
this map does the work?** A function name, a promise, and the word “async” are
insufficient answers.

## What the event loop actually contributes

Imagine an HTTP connection waiting for bytes. A JavaScript callback need not
continually ask whether they arrived. Node and libuv use OS facilities to learn
when network activity can be handled. Depending on platform and operation, this
is described in terms of readiness or completion. When the loop handles the
event, relevant application callbacks can execute. The event loop coordinates
waiting and dispatch; it does not convert an arbitrary callback into parallel
JavaScript. See [LIBUV-DESIGN](references.md#libuv-design) and
[NODE-LOOP](references.md#node-loop).

There are two different times here: the time when bytes or an operation's result
become available, and the time when JavaScript handles that event. A callback can
be delayed after readiness if the loop thread is still executing other work.
Ordinary callbacks on that loop do not run simultaneously as application JS.
The OS may preempt the loop thread to run another thread, but that does not make
the same Node loop begin a second callback while the first continues.

This explains event-loop blocking. Suppose an application starts an I/O operation
and then performs a long synchronous JavaScript calculation. During that
calculation, the loop cannot handle the operation's completion callback or the
next incoming request callback. Nothing about `async/await` changes the location
of the synchronous calculation. Node's [blocking guide](references.md#node-blocking)
explains why callback cost matters to every client sharing the loop.

Here is a small ESM example with no worker involved:

```js
import { performance } from 'node:perf_hooks';

const start = performance.now();
setTimeout(() => {
  console.log('callback after', performance.now() - start, 'ms');
}, 10);

const stop = start + 100;
while (performance.now() < stop) {
  // Deliberately occupy this JavaScript thread.
}
```

The timer cannot execute its JS callback during this loop. Ten milliseconds is
a requested threshold, not a promise to interrupt the current callback at that
instant. The actual printed delay depends on scheduling and the surrounding
machine; “exactly 100 ms” is not the lesson. This follows from the timer and
callback behavior documented in [NODE-LOOP](references.md#node-loop).

### Yielding is a responsiveness choice

One alternative is dividing a long computation into bounded pieces and scheduling
the next piece through `setImmediate()`. Other callbacks can then receive turns.
That can improve responsiveness without adding multicore JS execution. Repeatedly
awaiting an already resolved promise is a different mechanism: it schedules
promise continuations and does not guarantee the same opportunity for I/O turns.
The distinction matters when “make it async” is proposed as an optimization.
Node discusses [partitioning and offloading](references.md#node-blocking); the
ECMAScript [job model](references.md#ecma-agents) explains promise continuations.

Yielding is useful when work can pause cheaply and one-thread throughput is
sufficient. It also adds coordination overhead and retains the computation on the
application execution resource. A worker may be appropriate when the calculation
needs genuinely separate JS execution. Neither choice is automatically right.

## The other pool inside Node

Some native operations need execution away from the loop thread. libuv provides a
thread pool for this work and reports completion to the loop that submitted it.
The pool is global across event loops in the process; its documented default size
is four, configurable with `UV_THREADPOOL_SIZE` at startup.
[LIBUV-POOL](references.md#libuv-pool) is the implementation source for these facts.

Examples documented by Node include asynchronous filesystem operations such as
`fs.readFile()`, DNS lookup through `dns.lookup()` and `dns.lookupService()`,
selected crypto APIs such as asynchronous `pbkdf2()` and `scrypt()`, and
asynchronous zlib APIs. Node lists the relevant distinctions in
[NODE-BLOCKING](references.md#node-blocking). Do not generalize this to every DNS
function or every operation in a module. Ordinary nonblocking network I/O follows
the OS I/O machinery rather than consuming one pool thread per connection.

The JS caller may be free while native pool threads are busy. This is why a
computationally expensive API can be asynchronous without creating a JS worker.
It also creates interference: filesystem and crypto requests can compete for
the same pool. If long derivations occupy all its threads, a read may wait for a
thread even though the main event loop remains responsive. The machine then has
two distinct congestion points: callback processing and native-pool availability.

Increasing that pool's size is an available policy, but it changes resource use
for all its users. It does not create CPU capacity, eliminate memory demand, or
make individual native operations cheaper. Application-level admission can also
limit concurrent native jobs. The correct experiment compares these policies
under the intended workload; merely observing a promise settle slowly does not
identify the congested resource.

A subtle consequence follows for worker threads: calling asynchronous `scrypt()`
from a Node worker still uses the process-global native pool. Moving the caller
to a worker does not by itself create a private libuv pool. Running synchronous
`scryptSync()` in that worker instead puts the native calculation on the worker's
execution thread. This deduction combines the documented shared pool with the
API distinction; the PJS experiment below tests the resulting workload interaction.

## Isolates separate ordinary JavaScript state

A V8 **isolate** is a VM instance with its own heap. A V8 **context** provides an
environment within an isolate; creating contexts does not by itself create
parallel execution resources. [V8-EMBED](references.md#v8-embed) defines these
objects. Keep them separate from ECMAScript execution contexts, which are
specification records for evaluating code.

Separate Node workers do not automatically share an ordinary object or module
global with the main environment. If the same module is imported in each worker,
each environment has its own ordinary module state. Passing an object by message
does not hand the receiver a pointer into the sender's ordinary JS heap. Sharing
must use the supported communication mechanisms documented by
[NODE-WORKERS](references.md#node-workers).

This is useful separation, but it is not an OS security boundary. Workers are
threads in one process. They still share CPU, process resources, native address
space, and memory pressure, and may deliberately share backing storage. Native
code has a different reach from an ordinary JS object reference. A worker should
not be treated as a separate process sandbox for hostile code. PJS's
[security policy](../SECURITY.md) states its trusted-task boundary explicitly.

Memory reporting illustrates the distinction. Node documents process-wide RSS
even when `process.memoryUsage()` is called from a worker, while its other memory
fields concern the calling thread. A small main-isolate heap is not evidence of a
small whole process. Buffer backing, worker heaps, native allocations, and code
also matter. See [NODE-MEMORY](references.md#node-memory).

## Messages, moved buffers, and shared backing

`worker_threads` supplies additional JS execution and channels for communication.
The transport choice changes both costs and legal access to data. Three modes
deserve distinct mental models:

| Mode                 | What crosses the boundary?                                                                                | What must the application reason about?                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Structured clone     | A serialized/deserialized representation of supported data; ordinary values become receiver-local values. | Supported value kinds, copying cost, and snapshot timing.                    |
| ArrayBuffer transfer | Access to selected backing storage moves; sender backing is detached.                                     | All sender aliases lose access, and reuse requires receiving ownership back. |
| SharedArrayBuffer    | Receiver wrappers refer to shared backing bytes.                                                          | Lifetime, stable input, and coordination of concurrent writes/reads.         |

Node describes messages through the HTML structured-clone model, with documented
Node-specific value behavior. It can represent supported cyclic structures; it
is not equivalent to JSON text. Arbitrary functions and closures are not a way
to send executable work. Class prototypes and accessors do not generally survive
as the original object behavior. See [NODE-WORKERS](references.md#node-workers)
and [HTML-CLONE](references.md#html-clone).

Transfer applies to the underlying ArrayBuffer, not just the slice of a typed
array the programmer happens to be holding. If two views alias that backing,
both lose sender-side access after successful transfer. Use known dedicated
backing when reasoning about ownership; Node documents additional hazards around
pooled Buffers. This is why “send this view” and “move its entire buffer” are
different operations.

Shared backing avoids repeated cloning of those backing bytes at the message
boundary; metadata still crosses, preparation may still copy, and computations
still fetch bytes through the memory hierarchy. Two workers executing
`counter[0] += 1` can both read the old value and overwrite one another's updates.
Atomic operations can coordinate particular accesses, but correctness of a whole
algorithm requires a protocol. The [ECMAScript memory model](references.md#ecma-memory)
defines the guarantees and recommends avoiding data races. We do not import the
undefined-behavior rules of another language into JavaScript.

For stable input, a simpler discipline is often enough: finish construction,
publish it, and permit no writes while readers use it. This is a contract about
all aliases, not an immutable wrapper. PJS's `sharedReadonly()` explicitly makes
a construction copy into shared backing and relies on that discipline;
[ADR 0007](../docs/adr/0007-shared-input-model.md) explains why it does not pretend
to enforce read-only protection.

## Startup and lifetime are part of execution

Creating a worker involves establishing an execution environment and loading its
code. Node explicitly recommends pooling workers when repeated tasks would
otherwise pay creation overhead. The absolute cost depends on the host, imports,
and runtime version; no fixed millisecond figure follows from
[NODE-WORKERS](references.md#node-workers).

A persistent worker amortizes startup but retains its environment, including
module state and anything the task retains. It must eventually shut down.
Exceptions, exits, and termination are also lifecycle events, not just rejected
application promises. Node supplies events and `terminate()`; a pool must decide
how those events affect in-flight work and whether replacement or retry is valid.
Replacing a worker cannot automatically undo externally visible side effects.

These obligations distinguish a reusable pool from a short worker example. In
PJS, readiness includes importing and checking registered exports, and a failed
execution is not automatically retried. [ADR 0002](../docs/adr/0002-worker-pool-model.md)
and the [lifecycle guide](../docs/guide/lifecycle.md) give the current rules.
Routine cancellation settles callers without terminating running work;
[ADR 0004](../docs/adr/0004-cancellation-and-deadlines.md) explains that policy.

## CPU work and I/O work are bottleneck descriptions

Pure JS parsing, simulation, compression, cryptographic arithmetic, image
processing, and numeric loops can occupy a JS execution thread. Network and
database response waiting usually call for asynchronous I/O. A filesystem
operation may involve both waiting and native-pool execution. Compression may be
pure JS, synchronous native code, or an asynchronous native API. The task's name
does not identify the execution path.

Ask what limits useful completion. Is the main thread calculating? Are native
workers saturated? Is the program waiting for a remote server? Is preparation or
result copying dominating? Moving network waits to JS workers often adds
communication and environments while retaining the same remote bottleneck.
Node's worker documentation specifically distinguishes CPU-intensive JS from
I/O-heavy work; its guidance is a starting model, not a measurement of your app.

PJS applies that distinction as two responsibilities:

```text
application / I/O plane: receive, initiate I/O, coordinate, consume
                         |
                    bounded admission
                         |
CPU compute plane: persistent workers execute explicit task exports

Both planes share hardware CPU, bandwidth, memory, and OS scheduling.
```

Separating execution gives the main JS thread opportunities to handle callbacks
while workers calculate. Bounded admission makes overload visible, and explicit
lifetime lets the application observe occupied capacity. This is a rationale
for the [PJS architecture](../docs/architecture.md), not physical CPU isolation.
A busy worker population can still delay the application by competing for the
machine's resources. Main-thread input construction, cloning, result handling,
and assembly can also remain expensive.

## A historical experiment on two different queues

The [v0.13 crypto campaign](../docs/benchmarks-v0.13.md#filesystem-interference)
compared native asynchronous scrypt with synchronous scrypt in four PJS workers
while running a filesystem read probe. The host was Fedora 44 / Linux
6.19.10-300.fc44.x86_64 on an AMD Ryzen 3 PRO 3300U (four physical/four logical
cores), Node v24.13.1, V8 13.6.233.17-node.40, and the default four-thread libuv
pool. Scrypt used N=16384, r=8, p=1, and 32-byte output.

At 16 concurrent crypto jobs, the report observed 67.09 operations/s for native
async and 65.96 for PJS. The associated filesystem probe p95 values were
319.39 ms and 7.62 ms. Throughput is a median across retained trials; the reported
filesystem p95 is the median of per-trial p95 values, not a pooled percentile.
Read the
[raw campaign](../benchmarks/results/crypto-v0.13-fedora-node24.json),
[measurement appendix](../docs/research/v0.13-crypto-measurements.md), and
[harness methodology](../benchmarks/real-world/crypto/README.md) with the report.
The pool topology gives a plausible mechanism: synchronous worker crypto leaves
libuv threads available to filesystem work. That mechanism is an inference from
documented execution paths and the observed interaction, not a universal latency law.

The limitations are consequential. The finite read probe collected only 3–5
reads per native trial at this concurrency, versus 23–27 with PJS. Native
per-trial p95/p99 often equaled the observed maximum. Six trials support the
large repeated interaction, but do not estimate a production population p99
precisely. The campaign did not tune libuv size or compare tuned application
admission. Later Windows research is separate; these Fedora numbers must not be
silently presented as cross-platform findings.

Nor does leaving libuv threads available remove CPU contention. In the same
contention workload, two PJS workers achieved about 42.3 operations/s with a
filesystem probe p95 of 1.31 ms; four achieved about 66.0 with 7.62 ms. More compute
throughput and better surrounding latency were different objectives. Chapter 03
uses this as evidence that worker count is a policy, not a discovered constant.

## References and exercises

The central implementation sources are [NODE-LOOP](references.md#node-loop),
[NODE-BLOCKING](references.md#node-blocking), [LIBUV-DESIGN](references.md#libuv-design),
[LIBUV-POOL](references.md#libuv-pool), [V8-EMBED](references.md#v8-embed), and
[NODE-WORKERS](references.md#node-workers). Shared-memory guarantees come from
[ECMA-MEMORY](references.md#ecma-memory), and empirical claims from
[PJS-V13-CRYPTO](references.md#pjs-v13-crypto). None establish a universal crossover
or eliminate the need to measure end-to-end behavior.

1. Why can CPU-heavy JS delay HTTP handling in an application written with `async/await`?
2. What changes when that calculation runs in a worker?
3. Why can moving asynchronous crypto calls into workers leave filesystem contention unchanged?
4. How is libuv's pool different from a PJS pool?
5. Why does an isolate with its own heap not imply a separate OS process?
6. A sender holds two typed views over one buffer. What happens to the other view
   when the buffer is transferred? What responsibility replaces detachment with shared backing?
7. What alternative controls would strengthen the interpretation of the scrypt experiment?

<details>
<summary>Solutions</summary>

1. Synchronous instructions still occupy the main JS thread, preventing it from
   handling other callbacks until control returns.
2. Another JS execution environment does the calculation. The main thread can
   process callbacks, but messaging costs and shared hardware pressure remain.
3. Async native crypto can still use the same process-global libuv pool. The
   location of its JS caller does not make that pool private.
4. libuv runs selected native work shared by multiple API families and loops.
   PJS workers execute registered task exports with explicit admission and
   lifecycle; their tasks may themselves invoke native code.
5. A JS heap boundary is an engine abstraction within a shared process address
   space. Workers still share process resources and may share backing bytes.
6. Both sender views lose backing access. Shared backing retains access and
   requires a valid stable-input or synchronization discipline.
7. Tune native admission and libuv size, retain longer read samples, vary worker
   count and load, and reproduce on additional hosts/Node builds. Compare the
   same crypto parameters and correctness, not altered security cost.

</details>
