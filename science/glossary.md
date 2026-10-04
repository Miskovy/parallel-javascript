# Glossary

These definitions use the book's terminology, not an implied universal standard.
An OS thread, an ECMAScript agent, and a PJS task are different kinds of object.
Follow chapter links for assumptions and examples; follow the
[bibliography](references.md) for primary sources. Entries covering later topics
provide orientation rather than a complete correctness model.

## Activities and execution resources

The conceptual conventions below are developed in
[Chapter 01](01-concurrency-parallelism-and-computation.md), with
[OSTEP](references.md#ostep), [ECMA-AGENTS](references.md#ecma-agents), and the
[Node execution sources](references.md#node-workers).

| Term              | Meaning                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency       | Organization of activities whose lifetimes overlap and whose progress can be interleaved; simultaneous CPU execution is not required.                                                                                                        |
| Parallelism       | Actual simultaneous execution of computations on multiple execution resources. Available independence in an algorithm does not ensure a machine executes it simultaneously.                                                                  |
| Asynchrony        | Separation of initiation and completion so the initiating execution context need not block until completion; it does not specify where computation runs.                                                                                     |
| Process           | OS execution environment with an address space and associated resources. Separate ordinary address spaces can still have explicitly shared mappings.                                                                                         |
| Address space     | The virtual addresses through which a program accesses memory; virtual addresses are not identical to physical memory locations.                                                                                                             |
| Thread            | An execution sequence with its own instruction position, register state, and stack. Threads in one process share its address space.                                                                                                          |
| Worker            | An execution participant assigned work by a coordinator. Here, a PJS worker wraps a Node worker thread; “worker” alone need not mean an OS thread in every system.                                                                           |
| CPU core          | Physical hardware capable of executing instructions. Creating a software thread does not create or reserve a core.                                                                                                                           |
| Logical processor | Hardware execution context exposed to the OS, potentially subject to virtualization or restrictions; multiple such contexts may share a physical core.                                                                                       |
| SMT               | Simultaneous multithreading: one physical core exposes multiple hardware thread contexts that share some resources. Logical processor count is consequently not a count of independent full cores. See [LINUX-SMT](references.md#linux-smt). |
| Scheduling        | Selecting ready work for available resources. PJS task assignment and OS thread scheduling are separate policies at different layers.                                                                                                        |
| Preemption        | Suspension of a running execution by another authority so other work can run. OS thread preemption does not make Node interleave two ordinary callbacks on the same JS stack.                                                                |
| Task              | A declared unit of application work, with inputs and a completion/outcome. In PJS, a registered handle identifies an export; each accepted invocation has its own logical identity.                                                          |
| Job               | Context-dependent unit of pending execution. ECMAScript Jobs are specification-level scheduled operations; an application “CPU job” may contain many such operations. Do not equate every job with a worker or PJS task.                     |
| Queue             | Storage for work or values waiting to be selected or consumed. FIFO orders selection by arrival; multiple resources need not complete in that order.                                                                                         |

## Node's machine

[Chapter 02](02-how-node-executes-javascript.md) develops these entries from
[NODE-LOOP](references.md#node-loop), [LIBUV-DESIGN](references.md#libuv-design),
[LIBUV-POOL](references.md#libuv-pool), and [V8-EMBED](references.md#v8-embed).

| Term              | Meaning                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event loop        | Mechanism coordinating events and callback execution for an associated execution thread. Waiting for OS events is different from executing their JS handlers.                                                                             |
| Callback          | Function invoked when a relevant operation or event is handled. A completed I/O operation may wait before its callback receives an execution turn.                                                                                        |
| Execution context | In ECMAScript, a specification record containing evaluation state. It is not a physical core, OS thread, or promise of parallel execution.                                                                                                |
| Agent             | ECMAScript specification machinery including execution contexts and an executing thread; the standard does not mandate a particular implementation artefact for it.                                                                       |
| V8 isolate        | Instance of the V8 VM with its own heap. Separate isolates in one process are not separate OS address spaces.                                                                                                                             |
| V8 context        | Environment for JS code within a V8 isolate. Creating another context is not equivalent to creating another worker thread.                                                                                                                |
| libuv             | Native library providing event loops, OS I/O integration, thread-pool work, and related platform abstractions used by Node.                                                                                                               |
| libuv worker pool | Process-global native thread pool shared across event loops for selected operations. It does not execute arbitrary application JS callbacks submitted as tasks.                                                                           |
| worker_threads    | Node module providing independent JS execution threads/environments and message/shared-backing communication within one process. See [NODE-WORKERS](references.md#node-workers).                                                          |
| Heap              | Storage managed for dynamically allocated objects. “V8 heap” names an engine-managed domain and does not include every native allocation or all process memory.                                                                           |
| RSS               | Resident set size: process memory resident in main memory, including code, JS and native data. Node's worker RSS reports concern the whole process; RSS is not a sum of task payload sizes. See [NODE-MEMORY](references.md#node-memory). |

## Performance and dependency models

[Chapter 03](03-the-cost-model-of-parallelism.md) defines the timing boundaries
and ratios; [Chapter 01](01-concurrency-parallelism-and-computation.md#work-and-span-two-independent-limits)
and [CMU-WORK-SPAN](references.md#cmu-work-span) explain graph costs. Latency and
throughput definitions here state measurement conventions; historical PJS reports
must be read with their own boundaries and sampling limitations.

| Term                     | Meaning                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Throughput               | Useful completed work per elapsed time, such as correctly completed jobs/s or input MiB/s. State what is counted and over which interval.                              |
| Latency                  | Elapsed time between specified initiating and completing events for an operation. Queue wait, execution, and consumer delivery may be different boundaries.            |
| Tail latency             | High end of a latency distribution, often described by quantiles such as p95 or p99. A small sample's maximum is not a precise population p99.                         |
| Speedup                  | Chosen serial-baseline time divided by parallel time for equivalent work: `S(p)=T1/Tp`. Below one means slower parallel execution.                                     |
| Parallel efficiency      | Speedup divided by parallel resource count: `E(p)=S(p)/p`. It is a comparison ratio, not a measured fraction of busy CPU cycles.                                       |
| Work                     | Total computation across a fixed dependency graph, expressed as operations or ideal one-resource time `T1`. Real serial-baseline time may include different overheads. |
| Span                     | Cost of the graph's longest chain of dependencies, denoted `T∞` in this book. Unlimited execution resources cannot shorten that chain under the model.                 |
| Critical path            | A longest-duration dependency chain determining a lower bound on completion. A realized schedule can add resource waiting beyond the algorithm's dependency span.      |
| Granularity / grain size | Amount of useful work in a schedulable unit. Item count is a proxy only when items have comparable computation costs.                                                  |
| Partition                | A defined portion of a problem assigned as a work unit; valid boundaries must respect dependencies and input/output ownership.                                         |
| Load imbalance           | Unequal assigned work or completion durations leaving some resources idle while others still determine completion. Equal item counts do not ensure equal work.         |
| Straggler                | A late-finishing unit that holds up an operation requiring its result; it can arise from costly input, assignment, or execution interference.                          |
| Crossover                | Workload condition at which a strategy becomes faster than a specified alternative. It depends on the whole cost boundary, not just payload bytes.                     |
| Amortization             | Distributing a one-time cost over repeated uses for an average/session analysis. It does not remove first-use latency.                                                 |
| Oversubscription         | Runnable demand beyond useful execution capacity available to that workload. Configured PJS workers are only one source of process/machine demand.                     |

## Partitioning and assignment

[Chapter 04](04-partitioning-grain-size-and-load-balance.md) develops these models
and examples. [OPENMP-SCHEDULE](references.md#openmp-schedule) gives concrete
loop-scheduling vocabulary; [BL-WORK-STEALING](references.md#bl-work-stealing)
states the randomized algorithm's assumptions. The independent-job bound is
derived in the chapter, with historical attribution to
[GRAHAM-LIST](references.md#graham-list).

| Term                     | Meaning                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Makespan                 | Elapsed time until all work in a specified batch finishes. The ideal chunk model excludes runtime overhead and unrelated application work.                      |
| Static assignment        | Choosing which resource owns each piece before observing its completion. Fixed partition boundaries do not by themselves imply static assignment.               |
| Dynamic assignment       | Choosing the next ready piece when execution capacity becomes available. A central FIFO can assign fixed-grain chunks dynamically.                              |
| Adaptive partitioning    | Changing future piece sizes or boundaries as execution proceeds. It is a different decision from assigning already defined pieces.                              |
| Block-cyclic assignment  | Assigning successive fixed-size blocks to resources in a repeating cycle. It may spread position-dependent cost while changing locality.                        |
| Skew                     | Unequal useful work associated with input data or decomposition. Equal item counts can conceal unequal computation costs.                                       |
| Over-partitioning        | Creating more schedulable pieces than execution resources, without necessarily creating more workers. It adds assignment opportunities and recurring overhead.  |
| List scheduling          | Assigning the next ready piece from a list whenever a resource is idle. The chapter's bound assumes independent, initially ready chunks on identical resources. |
| Work stealing            | An idle resource takes ready work from another resource's queue. It does not subdivide an opaque task already executing.                                        |
| Deque                    | Double-ended queue. The classical work-stealing algorithm uses opposite ends for owner operations and stealing.                                                 |
| Fully strict computation | In the cited computation model, join edges return from child threads to their parents. This dependency restriction matters to the work-stealing theorem.        |
| Halo                     | Additional neighboring input read by a partition beyond its output region. Read overlap and exclusive output ownership require separate reasoning.              |

## Data, lifetime, and bounds

Transport mechanics come from [NODE-WORKERS](references.md#node-workers),
[HTML-CLONE](references.md#html-clone), and
[ECMA-MEMORY](references.md#ecma-memory), as introduced in Chapter 02. PJS-specific
behavior belongs to its [ownership guide](../docs/guide/memory-ownership.md),
[lifecycle guide](../docs/guide/lifecycle.md), and
[backpressure guide](../docs/guide/backpressure.md).

| Term                     | Meaning                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured clone         | Serialization/deserialization of supported values for another environment, including supported graphs and binary kinds; ordinary object identity/behavior is not generally preserved across environments. It is not JSON serialization.                                                         |
| Transfer                 | Moving access to a transferable resource. For ArrayBuffers here, successful transfer detaches sender backing, affecting every alias; metadata and coordination still cost work.                                                                                                                 |
| SharedArrayBuffer        | JS object representing backing bytes that agents can share through host-supported mechanisms. Shared backing does not imply free construction, immutable bytes, or no memory traffic.                                                                                                           |
| Atomics                  | ECMAScript operations for atomic access/coordination on supported typed-array kinds. Individual atomic steps do not automatically make a multistep algorithm correct.                                                                                                                           |
| Data race                | Introductory description: conflicting accesses to overlapping shared storage, involving a write, without the required coordination. Exact ECMAScript data races use event/order/access-size rules in [ECMA-MEMORY](references.md#ecma-memory); this is not a claim of C/C++ undefined behavior. |
| Memory ownership         | Rules governing which participants may access, mutate, transfer, or retain storage over time. It is a program/runtime discipline, not automatic OS protection.                                                                                                                                  |
| Cancellation             | Ending interest in, or attempting to stop, an operation according to a policy. PJS caller cancellation does not itself stop an active worker or roll back effects.                                                                                                                              |
| Timeout                  | Policy triggered when a deadline expires. Deadline scope must be stated; settling a timed-out caller does not establish that physical execution stopped.                                                                                                                                        |
| Cooperative cancellation | Running work checks a signal or state and elects to stop at agreed points. Responsiveness depends on checks; the current PJS task contract does not supply automatic CPU preemption.                                                                                                            |
| Logical completion       | The caller-visible outcome has settled. Physical work may still be executing afterward, as with PJS cancellation of a running task.                                                                                                                                                             |
| Physical completion      | The execution actually finishes or is stopped, making its occupied resource reusable under the runtime protocol.                                                                                                                                                                                |
| Backpressure             | Feedback/admission rules restricting production when a defined capacity is occupied, through pausing, limiting, or rejection. It bounds a specified domain, not total process memory by magic.                                                                                                  |
| Resource bound           | Explicit limit on a named resource domain with defined acquisition/release events, such as waiting logical tasks or occupied result credits.                                                                                                                                                    |
| Result credit            | PJS accounting permission for admitted/retained stream results. Byte-credit mode accounts for declared/actual visible binary bytes and lifecycle; it does not reserve OS memory or bound backing/scratch/RSS/consumer retention.                                                                |

For mathematical definitions and numerical exercises, return to
[the cost model](03-the-cost-model-of-parallelism.md). For exact current API
promises, use the guides and [stability policy](../docs/stability.md).
