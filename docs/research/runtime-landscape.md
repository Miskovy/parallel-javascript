# Runtime landscape: initial design research

Reviewed 2026-09-19 against the primary sources linked below. This is a design survey, not a performance ranking or a complete implementation audit. “Not established here” means the linked material does not support a stronger claim; it does not mean the project lacks that capability. Current docs and branches can change; pin versions before any comparative benchmark.

## JavaScript runtimes and pools

| System and source                                                            | Problem, scheduling, task representation                                                                  | Memory and lifecycle                                                                                    | Cancellation, admission, observability, limitation                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Piscina](https://github.com/piscinajs/piscina)                              | CPU worker pool; default FIFO, custom queues; module exports and per-call export selection                | Persistent worker threads, configurable population; clones and explicit transfers                       | AbortSignal may terminate the executing thread; maxQueue and drain notifications; run/wait histograms and utilization. Strong future baseline. Its documented pool capabilities are already substantial; PJS has no demonstrated advantage. |
| [workerpool](https://github.com/josdejong/workerpool)                        | Node/browser pool; pending tasks and registered methods or dynamically serialized functions               | Configurable worker backends/population; transfers on supported backends; crash handling                | maxQueueSize; promise cancellation and execution-start timeout can terminate worker; stats expose queue/worker counts. Serialized functions cannot assume captured lexical state.                                                           |
| [Parallel.js](https://github.com/parallel-js/parallel.js)                    | Map/reduce/spawn facade over worker execution; functions and explicitly supplied dependencies/environment | Isolated worker globals; source/environment transport is explicit in its API                            | maxWorkers controls execution concurrency. Bounded queued admission, cancellation guarantees, and rich metrics were not established from the README. Useful ergonomic reference, not PJS's task transport model.                            |
| [threads.js](https://threads.js.org/usage-pool)                              | Module-exposed functions/proxies and a pool queue; configurable concurrency                               | Worker abstraction spans platforms; explicit termination, promise/observable results                    | maxQueuedJobs bounds admission; documented queued cancellation cannot stop an already-started job; completion/settlement and pool events. Cross-platform ergonomics add scope PJS intentionally defers.                                     |
| [Tinypool](https://github.com/tinylibs/tinypool)                             | Small Piscina-derived pool aimed at tools such as Vitest; module task handlers                            | Thread/process backends, transferable data with thread backend, configurable teardown/recycling         | Explicitly omits Piscina-style utilization. Detailed cancellation/admission semantics should be checked against a pinned source version before comparison; README similarity does not prove equivalent behavior.                            |
| [Jest worker](https://github.com/jestjs/jest/tree/main/packages/jest-worker) | Exported module methods; FIFO/priority task queues, worker keys and assignment policy                     | Child-process or worker-thread isolation; startup hooks, retries, optional memory recycling             | Method promises, stdout/stderr, lifecycle methods; universal per-task cancellation/bounded admission not established here. Test/tool workloads motivate different retry and affinity choices than side-effect-aware CPU tasks.              |
| [Node worker_threads](https://nodejs.org/api/worker_threads.html)            | Thread/isolate primitive; application owns task representation and scheduling                             | Separate heaps; structured clone, ArrayBuffer transfers and SharedArrayBuffer; explicit start/terminate | No task queue, per-task cancellation, or admission policy provided by the primitive. Thread events, resource limits, CPU/event-loop tools are available. AsyncResource is recommended for pool diagnostics.                                 |
| [libuv thread pool](https://docs.libuv.org/en/v1.x/threadpool.html)          | Native blocking work submitted as C callbacks; supports filesystem/name-resolution operations             | Global native thread pool shared across event loops, not additional JS isolates                         | Cancellation applies to pending work through uv_cancel; application admission/metrics still needed. Does not execute arbitrary JavaScript CPU tasks, so changing UV_THREADPOOL_SIZE is not a PJS replacement.                               |

## Systems concepts worth adapting

| System and source                                                                                                        | Execution and scheduling model                                                                                                       | Lifetime, cancellation, backpressure, observation                                                                                                                                                        | Implication for PJS                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Java ForkJoinPool](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html) | Shared-heap ForkJoinTask, work stealing, recursive split/join and configurable parallelism                                           | Managed pool/shutdown; cancellation is a task contract, not guaranteed arbitrary-code interruption; queue/steal/active counts; application admission remains important                                   | Study joins and helping to avoid nested starvation. JS isolates cannot steal object closures from another isolate's heap.                                                                           |
| [Go scheduler source](https://go.dev/src/runtime/proc.go)                                                                | G goroutines, M OS threads, P execution resources; local/global runnable work and stealing                                           | Runtime-owned goroutine/thread lifecycle, parking and scheduler coordination; contexts/channels provide separate cancellation/admission patterns; scheduler itself is not a bounded application task API | Runnable task placement and wakeup discipline are relevant. Migratable language stacks and runtime preemption cannot simply be recreated with worker messages.                                      |
| [Rayon](https://docs.rs/rayon/latest/rayon/)                                                                             | Parallel iterators, join and scopes over a thread pool; Rust's type system permits shared-memory closures under safety constraints   | Structured completion; algorithm-level short-circuit behavior; user-defined pools. The overview does not establish a general queue-admission or JS-style hard-cancellation contract                      | Partitioning and structured algorithms are a better long-term target than a function-dispatch wrapper. PJS needs an explicit data-ownership contract instead of relying on Rust's Send/Sync checks. |
| [Tokio runtime](https://docs.rs/tokio/latest/tokio/runtime/)                                                             | Async task polling; global and per-worker queues with stealing; cooperative progress                                                 | Managed runtime and task lifetime; scheduler fairness depends on assumptions about bounded task counts and poll times; runtime metrics/configuration                                                     | Study fairness and wakeup overhead. CPU loops do not yield just because they run inside an async JS function; PJS is a compute runtime, not an async I/O scheduler.                                 |
| [oneTBB scheduler](https://uxlfoundation.github.io/oneTBB/main/tbb_userguide/How_Task_Scheduler_Works.html)              | Shared-memory task scheduling; local depth-first execution, steals from other workers                                                | Scheduler manages execution threads; wider library offers structured task groups. This scheduler page alone does not establish admission/cancellation/metrics contracts                                  | Locality and stealing larger older tasks are useful hypotheses. Costs change when moving work requires cloning isolate-owned data.                                                                  |
| [OpenMP 5.2](https://www.openmp.org/spec-html/5.2/openmp.html)                                                           | Explicit parallel regions, worksharing loops, task constructs, schedule policies and reductions in a shared-memory programming model | Teams/regions and synchronization define completion; cancellation and tooling belong to the specification; scheduling clauses do not alone bound application admission                                   | Borrow explicit partitioning and reduction contracts. Avoid pretending JavaScript shares the same heap, compiler analysis, or memory model.                                                         |

## Work stealing research gate

The [Chase–Lev paper](https://www.cs.wm.edu/~dcschmidt/PDF/work-stealing-dequeue.pdf) describes an owner pushing/popping at one end and thieves taking work at the other, with a dynamically growing circular structure. This solves deque coordination, not PJS task serialization, ownership transfer, cancellation, or nested dependency progress.

Before adopting such a design, define a shared numeric descriptor format, ownership transitions, payload lifetime, ABA/wraparound handling, and JavaScript Atomics ordering. Prove that cancelled/stolen work settles once and global admission remains bounded. Compare against the central FIFO on skewed and nested workloads. Message-based chunk redistribution may be simpler and faster at coarse task sizes; benchmark that alternative first. NUMA affinity is a later platform-dependent question.

The immediate research hypotheses are smaller: transfer ownership can reduce bulk copying; reusable read-only inputs can reduce matrix replication; runtime-owned chunking can balance uneven ranges without losing admission bounds. Every proposed advantage needs a benchmark against the existing implementation and, eventually, a pinned Piscina baseline.

## v0.3 review: native sharing and a pinned baseline

Reviewed 2026-09-27: [Node worker messaging](https://nodejs.org/api/worker_threads.html#portpostmessagevalue-transferlist) already transports SAB-backed views without copying their backing bytes. A helper supplies construction and a usage contract without worker resource synchronization; see [ADR 0007](../adr/0007-shared-input-model.md). A future partitioner can reference the same view in bounded child tasks. Native GC avoids speculative disposal semantics.

The [ECMAScript shared memory model](https://tc39.es/ecma262/multipage/memory-model.html) and [Atomics algorithms](https://tc39.es/ecma262/multipage/structured-data.html#sec-atomics-object) distinguish atomic integer access from compound unsynchronized updates. Read-only kernels need no atomic read loop when initialization precedes publication and no participant writes. The [memory guide](../memory.md) documents load/store/add/compareExchange/wait/notify and a deterministic lost-update demonstration. This is groundwork, not a synchronization library.

Piscina **5.3.2** is an exact development-only dependency. Its installed README and implementation define the tested fixed min/max pool, concurrency one, default synchronous Atomics and transfer-list behavior. [The upstream project](https://github.com/piscinajs/piscina) is the primary reference; the lockfile pins the actual artifact. Matched kernels compare CPU, clone, transfer and shared read workloads. Cancellation is deliberately not compared: Piscina can terminate active workers while PJS preserves execution occupancy. See [measured results and limitations](../benchmarks-v0.3.md); neither these workloads nor a single machine support a general performance ranking.

## v0.4 review: partition ownership before scheduler changes

Reviewed 2026-09-27. [Rayon indexed iterators](https://docs.rs/rayon/latest/rayon/iter/trait.IndexedParallelIterator.html#method.with_min_len)
provide grain controls within a richer parallel-iterator model. PJS adopts the
separation of logical range order from execution order, while retaining explicit
module tasks and isolate payloads. Its experimental grain is an exact maximum
chunk width, not Rayon's minimum split hint. There is no automatic grain policy.

[Piscina backpressure](https://github.com/piscinajs/piscina#backpressure)
shows why an application producer must respect a bounded pool. v0.4 moves that
producer and its lifecycle into PJS. The benchmark uses a bounded workers-sized
manual producer over **archived PJS v0.3** and **Piscina 5.3.2**, rather than
comparing against an unbounded eager Promise list. Piscina is not required to
expose a range API for this successful-work comparison.

[Node's worker transport](https://nodejs.org/api/worker_threads.html)
already supplies shared backing and exclusive transfers. A synchronous host
payload factory combines the same shared view, compact transferred slices and
cloned range metadata. No per-worker resource registry or protocol change is
needed. Factories reserve admission before invoking application code, because
reentrant host callbacks must not invalidate the bounded-production contract.

The [proposal](../proposal-v0.4.md), [ownership ADR](../adr/0008-runtime-owned-partitioning.md)
and [admission/metrics ADR](../adr/0009-partition-admission-and-metrics.md)
keep parents outside worker capacity, reject worker-created partitioning, and
separate logical-parent settlement from execution occupancy. Output retention
remains proportional to completed results. This is intentionally narrower than
nested structured parallelism or streaming map.

The [v0.4 report](../benchmarks-v0.4.md) evaluates uniform range sums, shared-B
matrix rows, increasing-cost indices, and a no-op transport control across five
grains. Per-worker kernel intervals are an occupancy proxy, not precise idle or
CPU time. The next milestone must follow those observations; no adaptive
chunking, distributed queues, work stealing or public algorithm family is
implemented in v0.4.

The completed study favors an overhead/grain-efficiency follow-up: at four
workers, middle grains improved increasing-cost work over one chunk per worker,
while 128 chunks slowed range, matrix and skew kernels. One-worker skew changes
also reveal non-balance effects, so JIT/arithmetic controls are needed. The
report recommends profiling/bounded batching experiments before work stealing
or stable algorithm APIs.

## v0.5 review: message amortization before scheduler replacement

Reviewed 2026-09-28. Node's [worker-pool guidance](https://nodejs.org/api/async_context.html#using-asyncresource-for-a-worker-thread-pool)
recommends `AsyncResource` so diagnostics tools can connect submitted work to
callbacks. PJS records internal timing for this milestone but defers context
propagation: logical items inside one physical batch need an explicit choice of
async scope, `AsyncLocalStorage` capture, cancellation lifetime and failure
attribution. Adding wrappers during a fine-grain cost study would also change
the path under measurement.

Node's [`performance.eventLoopUtilization`](https://nodejs.org/api/perf_hooks.html#performanceeventlooputilizationutilization1-utilization2)
and [`monitorEventLoopDelay`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
provide complementary host-pressure observations. v0.5 records both plus an
independent timer-drift probe. These are process/session observations rather
than a promise of request latency under a framework workload.

The retained comparison gives Piscina 5.3.2 an explicit harness-side batching
mode. Both libraries benefit when multiple tiny logical items share one
message, so the evidence supports batching as a general transport technique,
not a scheduler superiority claim. PJS keeps its central FIFO, counts queued
logical weight, preserves per-partition identity and rejects batched input
transfers. The [proposal](../proposal-v0.5.md), [ADRs](../adr/0010-dispatch-efficiency.md),
and [measurement report](../benchmarks-v0.5.md) define the limits. Work stealing
still lacks evidence: the fixed-width skew control instead shows that large
contiguous batches can reduce dynamic balance.
