# 01 — Concurrency, Parallelism, and Computation

[Book](README.md) · [Glossary](glossary.md) · [Next: Node execution](02-how-node-executes-javascript.md)

## Three questions that sound like one

Imagine a program receiving requests while it also processes a large dataset.
Can both activities be in progress? Can their instructions execute at the same
time? Can the requester continue before processing finishes? These are different
questions, and they lead to different engineering decisions.

In this book, **concurrency** means organizing activities whose lifetimes overlap
and whose progress can be interleaved. **Parallelism** means actually executing
multiple computations at the same time on multiple execution resources.
**Asynchrony** means separating initiation from completion so that the initiating
execution context need not block waiting for the operation to finish. These are
working definitions, not a claim that all literature standardizes the same words.
The process/thread treatment in [OSTEP](references.md#ostep) and Node's
[blocking/offloading discussion](references.md#node-blocking) supply the machinery
behind the distinctions.

Consider two activities sharing one execution resource. A filled region means
execution; a gap may mean waiting or giving the resource to something else.

```text
time ---------------------------------------------------->

Task A: AAAA       AAA          AAAA
Task B:     BBBBBBB   BBBBBBBBBB    BB
CPU:    AAAABBBBBBBAAABBBBBBBBBBAAAABB
```

Their lifetimes overlap, but no column contains execution of both tasks. This is
concurrency without parallel CPU execution. The interleaving might be produced
by OS time slicing between threads or by explicit yielding between callbacks;
those mechanisms have different rules, even though the timeline looks similar.

Now give independent computations two resources:

```text
time ---------------------------------------------------->

CPU 1: AAAAAAAAAAAAAAAAAA
CPU 2: BBBBBBBBBBBBBBBBBB
```

This is parallel execution. Real systems combine the diagrams: several threads
run simultaneously, more threads wait, and an OS switches the runnable threads
onto available processors. A program described as concurrent may run in parallel
on one machine and interleave on another. Its correctness should not depend on
which accidental timing the machine happens to choose.

Asynchrony is a separate property of the interface. Starting an HTTP request and
receiving its answer later is asynchronous for the caller. It says nothing about
whether a second JavaScript computation runs on another core. Conversely, a
caller can synchronously wait while several threads do parallel work. Waiting at
the interface does not erase simultaneous execution behind it.

### Why this distinction matters

If the bottleneck is waiting for a remote response, overlapping requests may
reduce elapsed time. If the bottleneck is calculating millions of results,
merely changing the return value to a promise does not provide another CPU
execution resource. Start by identifying what is happening during the time you
want to save: computation, waiting, or coordination.

## Dependencies decide what can overlap

Suppose a small program reads two datasets, computes a summary for each, then
combines them. The two summaries might be independent, but combination requires
both results. We can draw this as a **dependency graph**:

```text
                 +--> summarize A --+
read inputs -----+                  +--> combine --> answer
                 +--> summarize B --+
```

A dependency means the later computation needs something the earlier one
produces. It is not simply a preference about execution order. Moving `combine`
onto another thread cannot make it correctly consume a summary that does not
exist yet. The graph distinguishes available parallelism in the algorithm from
parallel execution provided by a machine.

The graph also exposes a correctness question. Two summaries can be independent
if they read stable inputs and produce private outputs. If both update an
ordinary shared counter, independence needs another argument. A thread does not
make that update safe. Coordination may be necessary, or the algorithm can use
private partial counts and combine them afterward. We will return to shared
memory in Chapter 02; the point here is to establish dependencies before choosing
workers. [CMU's work/span notes](references.md#cmu-work-span) formalize this graph
view of a computation.

An application's declaration that jobs are independent is therefore substantive.
Splitting a list into ranges is mechanically easy; deciding that each range may
be processed without violating data dependencies is an algorithmic obligation.
For example, applying an independent transform to every pixel differs from a
filter that reads neighboring pixels while other workers overwrite them. Separate
input and output images can restore a stable-input argument, at a memory cost.

## Process, thread, and core are different objects

A **process** is an OS execution environment with an address space and associated
resources. An address space is the set of virtual addresses through which the
program sees memory. Processes usually have separate ordinary address spaces;
explicit shared mappings and communication are possible. A **thread** is an
execution sequence with its own instruction position, registers, and stack.
Threads in the same process share its address space. A **CPU core** is hardware
that executes instructions. The first two are software/OS concepts; the third is
a hardware resource. See [OSTEP's process and thread chapters](references.md#ostep).

An OS scheduler selects runnable threads for execution. A thread blocked waiting
for an event need not occupy a CPU continuously. A runnable thread can still wait
because other runnable threads have been selected. When execution switches, the
OS saves and restores relevant thread state. Consequently, four threads neither
create nor reserve four cores. They can share one core over time, and a thread
may run on different processors during its lifetime.

Hardware makes the counting subtler. A **logical processor** is an execution
context exposed to the OS. With simultaneous multithreading (**SMT**), one physical
core exposes multiple such contexts that share some hardware resources. Two
logical processors on that core are not two independent copies of its compute
and cache resources. The Linux kernel's [SMT discussion](references.md#linux-smt)
explicitly recognizes sibling threads' shared resource demands.

This distinction explains why counting threads is insufficient for predicting
performance. The OS must also run the application thread, native helper threads,
and other processes. Virtualization and CPU restrictions may further constrain
what is usable. Node's [availableParallelism estimate](references.md#node-parallelism)
is useful information, but it cannot know the optimal policy for a particular
kernel or the latency budget of the rest of the application.

## Work and span: two independent limits

We can now ask a mathematical question: even with a perfect implementation, how
quickly could the dependency graph finish? Use an idealized machine with equally
fast processors, known computation costs, and no communication or scheduling
overhead. Dependencies are fixed; adding processors does not change the algorithm.

Let $T_1$ be the total **work**, expressed as the time to execute every operation
on one ideal resource. Let $T_\infty$ be the **span**, the time along the longest
chain of dependent operations. The infinity means unlimited resources are
available, not that a real computer has them. This is the time-weighted form of
the work/span model in [CMU-WORK-SPAN](references.md#cmu-work-span).

For $p$ identical resources, let $T_p$ be the ideal execution time. They can perform
at most $p$ resource-time units of work per elapsed time unit, so finishing all
the work takes at least $T_1/p$. Dependencies impose another lower bound:
successive steps of the critical path cannot overlap. Therefore:

$$
T_p \geq \max\left(\frac{T_1}{p},\ T_\infty\right).
$$

In plaintext: ideal elapsed time is at least the larger of total work divided by
resource count and critical-path time. This is a lower bound, not a schedule or
a prediction of Node wall time.

Give the earlier graph illustrative costs: reading takes 2 ms, summary A takes
6 ms, summary B takes 4 ms, and combination takes 1 ms. These numbers are invented
for the example, not benchmark observations. Total work is 13 ms. The longest
path is read → A → combine, costing 9 ms. Two resources have a lower bound of
`max(13/2, 9) = 9 ms`. In this graph, starting both summaries after reading
attains that ideal bound. More resources cannot shorten the 9 ms dependency chain.

The maximum possible speedup for this fixed graph is thus `13/9`, about 1.44,
even with arbitrarily many ideal processors. The ratio $T_1/T_\infty$ is often
called the graph's average parallelism. It measures the opportunity in the graph,
not the recommended worker count for a real implementation. Extra workers can
still be idle because the algorithm has no ready work for them.

Be careful about what the graph models. Here “read” is deliberately treated as a
fixed-cost graph operation. Actual I/O waiting is not equivalent to CPU work and
may overlap differently. Also, the best serial program might use a different
algorithm or data layout from the parallel program. The work bound applies to
the specified computation; it does not say every measured speedup against every
serial implementation must be at most $p$. Chapter 03 makes baseline selection
and runtime costs explicit.

## Why JavaScript vocabulary gets in the way

“JavaScript is single-threaded” collapses language semantics, one execution
environment, and a whole process into one phrase. An ECMAScript execution context
records the state of an evaluation; it is not a CPU core. The specification
groups execution machinery into **agents**, and deliberately does not require an
agent to correspond to a particular implementation artefact.
[ECMA-AGENTS](references.md#ecma-agents) is the relevant language-level source.

Node runs ordinary application JavaScript on its main JavaScript thread, but the
process can contain libuv workers, engine/native helper threads, and explicit
`worker_threads`. A V8 isolate has its own heap; additional Node workers provide
additional JavaScript execution environments. These are implementation facts
documented by [V8](references.md#v8-embed), [libuv](references.md#libuv-design), and
[Node](references.md#node-workers), rather than an ECMAScript promise that all
hosts use the same architecture. Chapter 02 follows that machine in detail.

One common mistake is inferring multicore computation from `Promise.all()`.
Consider this intentionally simple example:

```js
function sum(n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += i;
  return total;
}

const results = await Promise.all([
  Promise.resolve().then(() => sum(1_000_000)),
  Promise.resolve().then(() => sum(1_000_000)),
]);
```

The callbacks run through the same agent's job execution. No instruction here
creates another JavaScript execution resource. Each loop runs before its callback
returns; the promise combination coordinates completion. If the promises instead
represent already submitted work on separate workers, parallel execution is
possible because of those workers, not because `Promise.all()` discovers a loop
and parallelizes it. This follows from the job model in
[ECMA-AGENTS](references.md#ecma-agents).

Likewise, an `async` function can do expensive synchronous work before it reaches
an `await`. Writing an asynchronous interface does not relocate that work. The
important question is where instructions execute, not how completion is spelled.

## Applying the vocabulary to PJS

PJS currently asks the programmer to declare explicit units of CPU work as
registered module exports. Accepted work executes using separate persistent Node
workers. It does not infer independence, serialize arbitrary closures, or
automatically parallelize JavaScript. The [architecture](../docs/architecture.md)
and [registration ADR](../docs/adr/0001-task-registration.md) connect those choices
to isolate boundaries and startup validation.

This makes the application responsible for identifying dependencies and valid
inputs/outputs. PJS manages accepted work and worker occupancy; it cannot prove
that a task's side effects are parallel-safe. Nor does asynchronous submission
mean immediate execution. Work can wait for bounded capacity, and FIFO dispatch
does not imply FIFO completion across workers.

Alternatives are reasonable under other goals. Cooperative event-loop chunks can
keep one thread responsive without providing multicore JS execution. Separate
processes offer a different address-space and failure boundary, with their own
startup and communication costs. Per-task workers simplify some lifetimes but
repeat startup. Native async APIs can already run compute elsewhere. PJS chooses
fixed persistent workers with one physical execution slot per worker to make
CPU admission and lifetime explicit; [ADR 0002](../docs/adr/0002-worker-pool-model.md)
records the alternatives rather than claiming they are inferior generally.

An especially revealing application of this vocabulary is cancellation. PJS can
reject a running task's caller while the worker still computes. “The request is
finished” and “the execution resource is free” describe different events.
[ADR 0004](../docs/adr/0004-cancellation-and-deadlines.md) keeps the slot occupied
until execution actually ends. The current
[abort/timeout occupancy tests](../packages/runtime/test/runtime.test.mjs) exercise
that behavior. They establish tested PJS behavior, not a theorem about every
runtime's cancellation policy.

The work/span bound does not establish that PJS achieves an ideal schedule, or
that a task is large enough to benefit. The retained
[historical crypto experiment](references.md#pjs-v13-crypto) finds both useful
parallel workloads and losing tiny jobs; Chapter 03 examines those observations.
The present chapter's diagrams and arithmetic are explanatory models, not new
experimental evidence.

## References and further reading

Read [OSTEP](references.md#ostep) for process/thread implementation,
[CMU-WORK-SPAN](references.md#cmu-work-span) for dependency analysis, and
[ECMA-AGENTS](references.md#ecma-agents) for language machinery. The
[Node worker documentation](references.md#node-workers) and
[V8 embedder guide](references.md#v8-embed) bridge to the next chapter. PJS ADRs
explain choices; its guides retain authority over current API contracts.

## Questions and exercises

1. Can two tasks be concurrent without parallel CPU execution? Draw a timeline.
2. Can computations execute in parallel behind a synchronous interface?
3. Why does the promise example above not establish multicore execution?
4. Why do four worker threads not establish four physical cores?
5. In a dependency graph, preparation takes 3 ms, two independent computations
   take 8 and 5 ms, and assembly takes 2 ms. Find work, span, and the two-resource
   lower bound. Would eight resources help this ideal graph?
6. If a cancelled request is no longer interesting to its caller, what additional
   fact is needed before reusing its execution slot?

<details>
<summary>Solutions</summary>

1. Yes. Alternate A and B on one resource, with overlapping lifetimes and no
   simultaneous execution.
2. Yes. The caller may block while two other threads execute simultaneously.
3. It schedules callbacks in the same execution environment; no worker or other
   compute resource is created.
4. Thread count is a software count. OS scheduling, SMT, CPU restrictions, and
   other runnable work determine the hardware available to them.
5. Work is `3 + 8 + 5 + 2 = 18 ms`; span is `3 + 8 + 2 = 13 ms`.
   The bound is `max(18/2, 13) = 13 ms`, attainable in this ideal graph.
   Eight resources cannot shorten its dependencies.
6. The physical execution must have finished or been stopped. Caller settlement
   alone does not establish that fact or undo side effects.

</details>
