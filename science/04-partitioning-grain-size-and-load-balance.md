# 04 — Partitioning, Grain Size, and Load Balance

[Previous: The cost model](03-the-cost-model-of-parallelism.md) · [Book](README.md) · [Glossary](glossary.md)

## Four equal pieces of what?

Suppose four workers must process a million records. Giving each worker 250,000
records sounds balanced. It is balanced in record count. If the first quarter
contains cheap records and the last quarter contains expensive ones, three
workers can finish while the fourth has most of its calculation left.

We could make more pieces and give an idle worker the next available piece.
That creates opportunities to redistribute unfinished work, but each piece
needs bookkeeping, input preparation, dispatch, and a result. A piece containing
almost no calculation may cost more to move than to execute. Splitting also
changes memory access and the shape of the function being executed.

[Chapter 03](03-the-cost-model-of-parallelism.md) introduced this tension as a
cost-model term. Here we ask how to choose the pieces, how to assign them, and
what can be proved about the resulting balance. The historical **PJS v0.4**
experiment supplies a useful engineering case: finer partitioning helped some
workloads and hurt others, including when the scheduling strategy stayed fixed.

## Partitioning is part of the algorithm

A **partition** is a piece of the problem with defined inputs and an output that
can contribute to the complete answer. Partitioning specifies those pieces;
assignment chooses where they execute. Production determines when descriptors
and payloads are materialized. These decisions can be made independently. A
fixed partition plan can be produced lazily and assigned dynamically.

Consider the integer indices in a half-open range $[a,b)$, where $a\leq b$:
include $a$, exclude $b$. Let $n=b-a$ be its length and $g$ a positive integer
grain size, measured here in indices per chunk. The number of chunks is:

$$
m=\left\lceil\frac{n}{g}\right\rceil.
$$

In plaintext, `chunks = ceil(length / grain)`. For chunk index $k$, where
$0\leq k<m$, its boundaries are:

$$
a_k=a+kg,\qquad b_k=\min(a+(k+1)g,b).
$$

Thus `[0,10)` with grain 3 becomes `[0,3)`, `[3,6)`, `[6,9)`, and `[9,10)`.
Adjacent chunks meet at an endpoint without sharing an index. An empty range
has zero chunks. The final chunk may be shorter.

These equations describe integer arithmetic. JavaScript implementations must
also check representability and intermediate calculations. PJS's
[range planner](../packages/runtime/src/partition/range.ts) validates safe-integer
endpoints, length, and positive grain; it computes the final endpoint using the
remaining length so a full-grain addition cannot overflow near the limit.
[Partition tests](../packages/runtime/test/partition.test.mjs) include coverage,
awkward sizes, and safe-integer boundaries. An abstract formula is not a complete
implementation specification.

Coverage is necessary, but it does not establish algorithmic independence. A
sum can produce partial sums for later combination. Matrix multiplication can
give different output rows to different workers while they read common input.
A filter that reads neighboring elements needs a **halo** of extra input around
each output partition. Reading overlap can be legitimate; conflicting output
writes need a separate correctness argument. A recurrence in which element
$i$ needs the newly computed value at $i-1$ cannot become independent merely by
drawing boundaries. The dependency graph from
[Chapter 01](01-concurrency-parallelism-and-computation.md#work-and-span-two-independent-limits) still
constrains the algorithm.

Combining outputs also needs a numerical contract. JavaScript Number addition
uses finite-precision arithmetic; regrouping a sum can change its value. For
example, `(1e16 + -1e16) + 1` gives 1, while `1e16 + (-1e16 + 1)` gives 0.
Partitioning changes grouping even if partial results are collected in order.
Specify the acceptable error or required reproducibility rather than assuming
the serial result will be identical; see [ECMA-NUMBER](references.md#ecma-number).

Grain size therefore has two meanings worth keeping separate: a count of
problem items, and the useful execution cost inside a schedulable chunk. Equal
counts imply equal cost only under an additional workload assumption.

## Model the load before choosing a scheduler

For a first model, suppose $m\geq1$ independent chunks are ready at time zero,
with $p\geq1$ resources; both counts are integers. Chunk
$j$ needs positive execution time $c_j$ on any of $p$ identical resources. Once
started, it runs to completion: there is no preemption or subdivision. Ignore
dispatch, transport, contention, and other application work. Define total work
$W=\sum_{j=1}^{m}c_j$ and largest chunk $c_{\max}=\max_j c_j$.

The **makespan** $M$ is the elapsed time until every chunk finishes. Two lower
bounds follow immediately:

$$
M\geq\max\left(\frac{W}{p},c_{\max}\right).
$$

In plaintext, completion needs at least `max(total work / workers, longest
chunk)`. The first term is the capacity bound; the second is the indivisible
chunk bound. These are the work/span principles applied to a flat batch, with
no additional dependency chain; see [CMU-WORK-SPAN](references.md#cmu-work-span).
Changing assignment cannot split the largest chunk.

For a static assignment, let $A_r$ be the chunks allocated to resource $r$, and
$L_r=\sum_{j\in A_r}c_j$ its load. With the model's zero-overhead assumptions:

$$
M_{\mathrm{static}}=\max_{1\leq r\leq p} L_r,
\qquad B=\frac{W}{pM_{\mathrm{static}}}.
$$

Here $B$ is a balance ratio: actual work divided by the available resource-time
rectangle. It reaches one when loads are equal. It describes this schedule,
not a process CPU counter or the speedup efficiency of a complete application.

For two resources and chunk costs `9, 9, 1, 1 ms`, contiguous blocks produce
loads `18, 2 ms`. Cyclic assignment produces `10, 10 ms`. The first has
$B=20/(2\times18)\approx0.556$; the second has $B=1$.

```text
Each character represents 1 ms; "." is idle.
A and B cost 9 ms each; C and D cost 1 ms each.

                     0        9        18 ms
Contiguous, r1:      AAAAAAAAABBBBBBBBB
Contiguous, r2:      CD................
Cyclic, r1:          AAAAAAAAAC........
Cyclic, r2:          BBBBBBBBBD........
```

The diagram depicts an ideal schedule. It makes the idle tail visible without
implying that an operating system pins either execution resource to a core.

## Static, dynamic, and adaptive choices

A static assignment decides ownership before observing completions. A dynamic
assignment chooses the next piece as capacity becomes available. Adaptive
partitioning changes the size or boundaries of future pieces. Calling all
three decisions “dynamic scheduling” hides which mechanism actually changed.

| Strategy                      | How pieces reach resources                                   | Useful property                                      | Main question to measure                                           |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Static contiguous blocks      | Each resource owns one region or consecutive group.          | Simple ownership and contiguous access.              | Does position correlate with cost?                                 |
| Static cyclic or block-cyclic | Successive items or blocks rotate across resources.          | Spreads a cost trend across owners.                  | Do scattered access or periodic costs defeat the intended benefit? |
| Static cost-aware boundaries  | Estimated costs determine unequal item counts.               | Can balance predictable work with few chunks.        | Are the estimates accurate enough?                                 |
| Dynamic central queue         | An available resource takes the next ready chunk.            | Completions influence assignment.                    | Are dispatch and preparation keeping up?                           |
| Guided or adaptive production | Future chunk sizes change during execution.                  | Can combine coarse early work with finer later work. | Does the shrinking policy fit the cost distribution?               |
| Work stealing                 | Idle resources take ready work from other resources' queues. | Can redistribute work generated locally.             | Is enough work stealable, and what does movement cost?             |

OpenMP gives a concrete specification vocabulary: explicit static chunks use
cyclic assignment; dynamic schedules supply another chunk after completion;
guided schedules reduce chunk sizes toward a specified minimum.
[OPENMP-SCHEDULE](references.md#openmp-schedule) documents these distinctions.
They are useful analogies, not promises that a Node pool implements OpenMP.

In our `9,9,1,1` example, a central queue initially supplies the two 9 ms chunks.
At 9 ms the resources take the remaining 1 ms chunks, completing at 10 ms.
No cost estimate was needed. This does not make dynamic assignment universally
better: the queue needs coordination, and its next piece might be poorly placed
for a resource's cached data. A static assignment can already be balanced.

Cost-aware boundaries offer another solution when item cost is predictable.
Let nonnegative estimated item costs be $w_i$, with prefix cost
$F(t)=\sum_{i=0}^{t-1}w_i$. Choose boundaries near positions where $F(t)$ reaches
successive multiples of $F(n)/p$. Equal estimated cost then replaces equal item
count. A single very expensive item remains indivisible, and estimates can be
wrong; this approach does not eliminate either limitation.

A guided policy can start with large chunks, then shrink them as work runs out.
That limits early dispatch count while leaving more scheduling choices near the
end. But remaining item count is only a proxy for remaining cost. If the last
items are much more expensive, shrinking by count alone may still leave a long
tail. A policy informed by measured cost also has to distinguish persistent
skew from a transient delay. These are alternatives to evaluate, not automatic
upgrades to fixed grain.

## What greedy assignment can guarantee

There is a useful bound for the ideal flat batch. A **list scheduler** takes the
next ready chunk from a list whenever a resource is idle. Order need not be
optimal. Under our independent, initially ready, fixed-cost assumptions:

$$
M_{\mathrm{list}}\leq\frac{W}{p}
+\left(1-\frac{1}{p}\right)c_{\max}.
$$

This is the independent-job form of the classical list-scheduling bound
associated with [GRAHAM-LIST](references.md#graham-list). We can derive it without
knowing the best assignment. Let the final-finishing chunk have duration $c_*$
and start at time $s$. Until $s$, every resource was busy: otherwise that already
ready chunk would have been scheduled. By its start, the resources have executed
$ps$ work, out of at most $W-c_*$ work belonging to other chunks. Therefore:

$$
ps\leq W-c_*,\qquad
M_{\mathrm{list}}=s+c_*
\leq\frac{W}{p}+\left(1-\frac{1}{p}\right)c_*
\leq\frac{W}{p}+\left(1-\frac{1}{p}\right)c_{\max}.
$$

In plaintext, `start <= (other work)/p`; add the last chunk's duration.
Let $M_{\mathrm{opt}}$ be the best possible makespan for these same fixed chunks.
Both $W/p$ and $c_{\max}$ are at most $M_{\mathrm{opt}}$, so:

$$
M_{\mathrm{list}}\leq\left(2-\frac{1}{p}\right)M_{\mathrm{opt}}.
$$

This worst-case factor compares assignments of the same pieces. It does not
compare different partitions or include runtime overhead. For our two-resource
example the first bound is `10 + 0.5×9 = 14.5 ms`; the actual 10 ms is better.
A bound need not be a close estimate.

A live Node runtime may have factories producing chunks late, transport stalls,
other tasks sharing admission, and changing execution rates. Its idle resource
may lack a ready chunk despite an unfinished parent operation. Those conditions
invalidate the proof's busy-until-$s$ premise. The theorem explains why greedy
assignment can be effective; it is not a wall-time guarantee for PJS.

## Over-partitioning buys choices at a price

**Over-partitioning** means creating more schedulable pieces than resources,
$m>p$. Four workers can consume forty chunks without creating forty threads.
This differs from hardware oversubscription, discussed in
[Chapter 03](03-the-cost-model-of-parallelism.md#hardware-capacity-is-more-than-a-core-count).

More pieces give a dynamic scheduler more chances to correct an early imbalance.
Once the queue is empty, however, it can only wait for already running pieces.
The list bound suggests controlling $c_{\max}$, not maximizing chunk count for
its own sake. Subdivision helps if it actually reduces the largest useful
execution cost.

To see the competing costs, assume $n$ items, at most $u$ useful time per item,
and fixed grain $g$. Assume subdivision preserves that per-item cost, giving
$c_{\max}\leq gu$. Let $h$ be non-overlapping serialized coordination time per
chunk, independent of grain. A deliberately conservative planning model adds
the ideal list bound and this coordination ledger:

$$
\widehat T(g)=\frac{W}{p}
+\beta gu+h\left\lceil\frac{n}{g}\right\rceil,
\qquad \beta=1-\frac{1}{p}.
$$

The terms are useful work per resource, an allowance for imbalance, and
per-chunk coordination. All have units of time. This is an illustrative model,
not a proven bound on a pipelined runtime: it assumes the costs can be added and
omits bytes moved, caches, and output assembly. The imbalance allowance can be
very pessimistic for uniform chunks that divide evenly among resources.

Ignoring the ceiling, the grain-dependent terms are `β×u×g + h×n/g`.
For $p>1$ and positive $h,u$, their derivative is $\beta u-hn/g^2$.
Setting it to zero gives $\beta ug^2=hn$, hence:

$$
g_*\approx\sqrt{\frac{hn}{\beta u}}.
$$

This square-root result answers a narrow question about this model. With
`n=10,000`, `p=4`, `h=0.02 ms`, and `u=0.01 ms/item`, it gives about 163 items
per chunk. An integer candidate must also leave enough chunks for the resources
and respect the algorithm's boundaries. It is not a recommended PJS grain;
the experiment below shows that changing grain can change useful kernel cost
itself, contradicting a premise of this calculation.

A simpler local check asks how much useful work must accompany overhead $h$.
If a chunk computes for $t$ and we want overhead fraction at most $\epsilon$,
where $0<\epsilon<1$:

$$
\frac{h}{t+h}\leq\epsilon
\quad\Longrightarrow\quad
t\geq\frac{1-\epsilon}{\epsilon}h.
$$

For a 5% target, useful compute must be at least `19×h`. This ratio concerns
those two local costs; it does not establish end-to-end parallel efficiency.

Byte traffic can change the grain choice even when chunk execution is constant.
If every chunk clones the whole $D$-byte input, input movement grows like $mD$.
If each chunk receives a compact, disjoint slice, total input bytes can remain
about $D$, but slice preparation and dispatch recur. Shared backing avoids
repeatedly copying that backing after construction while preserving per-message
metadata and ownership obligations. The transport foundations and caveats are
in [Chapter 02](02-how-node-executes-javascript.md#messages-moved-buffers-and-shared-backing)
and [NODE-WORKERS](references.md#node-workers). Neither shared input nor lazy
production makes retaining all outputs free.

## Skew and stragglers are different diagnostic questions

**Skew** is unequal work associated with the data or decomposition. A
**straggler** is a piece or resource finishing much later than its peers. Skew
can cause stragglers, but so can an interruption, variable execution rate,
allocation pause, or competition elsewhere in the process. The execution
resources described in [Chapter 02](02-how-node-executes-javascript.md) and
[OSTEP](references.md#ostep) explain why a worker is not a dedicated CPU.
Fixed $c_j$ values model useful scheduling costs; measured wall intervals also
reflect the host.

The v0.4 skew kernel makes item $i$ execute `16×(i+1)` inner iterations.
Ignoring variation in time per iteration, a chunk $[a,b)$ has loop work:

$$
16\sum_{i=a}^{b-1}(i+1)
=16\frac{(b-a)(a+b+1)}{2}.
$$

In plaintext, multiply `16 × count × (first weight + last weight) / 2`.
For four equal blocks of $g$ items, the last-to-first work ratio is
$(7g+1)/(g+1)$, approaching seven. With $g=1024$, it is about 6.994.
Equal ranges are predictably unequal work. This is an operation-count model,
not a prediction that their measured durations have exactly that ratio.
See the [kernel](../benchmarks/partitioning/kernel.mjs) and
[skew evidence](references.md#pjs-v04-partitioning).

Subdivision exposes some of this cost to later assignment decisions. It cannot
redistribute an opaque function already running inside a worker. A queue can
give another worker a ready chunk; moving the remainder of an executing chunk
requires cooperative subdivision or a different algorithmic contract.
Likewise, caller cancellation is not an instruction-level preemption mechanism.
The distinction between logical and physical completion remains important.

To diagnose a tail, inspect per-worker execution intervals alongside operation
time, preparation, transport, and result costs. Large differences are a reason
to investigate balance. They do not alone identify data skew or measure exactly
how long a CPU was idle. A worker interval can include time when the operating
system was executing something else.

## Work stealing: a theorem with a computation model

A central queue is not the only way to find ready work. In the classic randomized
work-stealing algorithm, each processor has a double-ended ready queue, or
**deque**. The owner uses the bottom; an idle processor chooses a random victim
and steals from the top. On a spawn, the parent continuation becomes stealable
while the owner executes the child.

Blumofe and Leiserson analyze **fully strict** computations: join dependencies
return from children to their parents. With work $T_1$ and span $T_\infty$,
their randomized algorithm has expected execution time:

$$
\mathbb E[T_p]\leq\frac{T_1}{p}+O(T_\infty).
$$

It also has expected $O(pT_\infty)$ steal **attempts**, including unsuccessful
ones. These results use the paper's computation and atomic-access machine
models, with bounded scheduler operations; they are not guarantees for arbitrary
blocking tasks or a different deque policy.
[BL-WORK-STEALING](references.md#bl-work-stealing), especially Sections 2, 4–6,
provides the assumptions and proofs.

In plaintext, the expected bound is `work/workers + a constant times span`.
The expectation is over scheduler randomness. Big-O hides constants, and the
model's instruction-time units do not directly give milliseconds for Node
messages. The span term remains: discovering more ready work cannot shorten a
dependency chain. For a flat batch with indivisible chunks, the longest chunk
is still an unavoidable tail.

For PJS, the question is what additional ready work a distributed queue would
expose. In a flat central queue, pending chunks are already unassigned and
available to the dispatcher. Stealing is more interesting when work is generated
or retained behind particular owners, especially with nested parallelism. That
is a different ownership and dependency problem from a host generating ranges.

```text
Central assignment:                 Distributed ready queues:

       [ready chunks]                [deque A] <--- idle worker B
          /     \                     owner A       steals ready work
       idle A   idle B
```

Both designs still need admission, data movement, results, and failure handling.
An executing chunk is not sitting in either ready queue. A favorable asymptotic
theorem does not settle whether distributing PJS's queues would improve a
particular workload after those costs are included.

## PJS v0.4: fixed boundaries, dynamic assignment

The v0.4 decision was to study explicit fixed grain while reusing the central
FIFO. The host owned the parent operation, generated immutable range descriptors
lazily, and used a synchronous factory to prepare each child's payload only
when admission was available. Children were ordinary registered tasks. Available
workers received successive chunks through the existing dispatcher; the design
did not pin an entire range region to a particular worker.

This is **fixed partitioning with dynamic assignment**. The report's term
“static grain” refers to boundaries, not a static worker mapping.
[ADR 0008](../docs/adr/0008-runtime-owned-partitioning.md) records why adaptive
splitting and work stealing were excluded: they would confound the fixed-grain
experiment. Worker-created parent operations were rejected to avoid exhausting
the pool with parents waiting for children. This is not general nested
structured parallelism.

Each parent had at most the worker count in unsettled children, subject to
global admission. Parents occupied neither workers nor FIFO task slots; their
records had a separate derived count bound. This made it possible to plan many
chunks without eagerly preparing a payload and Promise for every chunk.
[ADR 0009](../docs/adr/0009-partition-admission-and-metrics.md) defines the resource
domains. Its producer rotation does not promise fairness against continuous
external saturation.

The parent collected results by partition index even when completion order
differed. That preserves output order without prescribing worker assignment.
It also retains outputs: queue bounds did not bound collected result bytes.
Failure stopped production and rejected the parent while already running
siblings could remain physically occupied. These lifecycle obligations are
part of the engineering cost of a partitioner.

The current RC still exposes the range API as experimental; see
[stability](../docs/stability.md) and the
[core API guide](../docs/guide/core-api.md). Later batching, streaming,
and result-credit milestones have separate contracts. The following data are
the historical v0.4 campaign, not measurements of those later mechanisms.

## What the retained grain sweep found

The [v0.4 report](../docs/benchmarks-v0.4.md) and
[harness methodology](../benchmarks/partitioning/README.md) describe the campaign
run on 2026-09-27: Node v24.13.1, Linux 6.19.10-300.fc44.x86_64, AMD Ryzen 3 PRO
3300U, four available logical CPUs. Each configuration used a fresh process,
initialized persistent workers, two warmups, and five retained measured samples;
configuration order rotated. No outlier was deleted.

Timed operations included lazy factories, recurring slice preparation, dispatch,
kernel execution, results, collection, and matrix output assembly. Original
input generation and correctness oracles were outside the timer. Shared-backing
construction was measured separately and excluded from these operation times.
Small-grain instrumentation overhead is another limitation.

The following selection keeps the engine and worker count fixed: runtime-owned
PJS v0.4 with four workers. Entries are median operation wall times in ms.

| Workload and transport                                            | 4 chunks | 16 chunks | 128 chunks |
| ----------------------------------------------------------------- | -------: | --------: | ---------: |
| Sum 2,097,152 Float64 values, shared input                        |    4.358 |     8.031 |     23.807 |
| Increasing-cost kernel, 4,096 indices, metadata only              |   89.370 |    42.266 |     58.834 |
| 512×512 matrix multiply, shared B and transferred A/output slices |  130.054 |   108.708 |    149.927 |
| No-op dispatch control, 4,096 logical indices                     |    1.230 |     3.528 |     27.708 |

The [report](../docs/benchmarks-v0.4.md),
[raw range](../benchmarks/results/range-partition-v0.4.json),
[raw skew](../benchmarks/results/skew-partition-v0.4.json),
[raw matrix](../benchmarks/results/matrix-partition-v0.4.json), and
[raw dispatch](../benchmarks/results/dispatch-partition-v0.4.json) preserve every
configuration, not only these columns. Sixteen chunks correspond to grain
131,072 values, 256 skew indices, 32 matrix rows, or 256 no-op indices.

The uniform scan got slower as pieces multiplied. The skewed workload improved
at moderate subdivision, then lost some of that gain. Matrix work also benefited
from moderate subdivision here, despite uniform row operation counts; measured
worker rates need not be uniform. The no-op control shows substantial recurring
overhead when useful kernel work is negligible. It cannot identify a pure
per-dispatch constant: factory, message, result, and instrumentation costs also
contribute.

### A more balanced schedule, with an attribution limit

In the median-wall-time skew sample with four chunks, recorded kernel wall
intervals per worker were approximately `6.25, 34.91, 57.02, 87.88 ms`. With
sixteen chunks, each worker's accumulated intervals were approximately
`24.32, 31.81, 28.96, 32.97 ms`. The latter distribution is much more even.
These are particular samples from the
[report](../docs/benchmarks-v0.4.md) and
[raw skew artifact](../benchmarks/results/skew-partition-v0.4.json), not medians
formed independently for four worker identities.

The harness also records a kernel-wall occupancy proxy:

$$
Q=\frac{\sum_r K_r}{pT_{\mathrm{operation}}},
$$

where $K_r$ is accumulated measured kernel wall time on worker $r$.
In plaintext, `sum of worker kernel intervals / (workers × operation wall time)`.
Median $Q$ was approximately 0.535, 0.731, and 0.495 for 4, 16, and 128 chunks.
This describes how much of the operation rectangle was covered by measured
kernel intervals. It excludes work outside the instrumented kernel and includes
descheduling inside an interval. It is not an exact CPU-busy or worker-idle
metric. Near-zero average queue delay likewise does not prove perfect balance:
it only describes waiting at the measured queue boundary.

There is a crucial control: with **one worker**, the same owned skew workload
went from 183.142 ms at one chunk to 130.970 ms at 32 chunks, again in the
[report](../docs/benchmarks-v0.4.md) and
[raw artifact](../benchmarks/results/skew-partition-v0.4.json). There can be no
inter-worker balancing gain with one worker. Changing grain also changed kernel
timing; JIT behavior or call shape could contribute, but the experiment did not
isolate the cause. The four-worker improvement is consistent with reduced
imbalance, yet attributing all of it to balancing would contradict that control.

### Grain also changes the transport budget

For the scan's 16 MiB input, cloning the full input for every chunk meant 64 MiB
at four chunks and 2 GiB at 128 chunks. Compact disjoint slices kept total
transferred input at 16 MiB per operation across grains, with recurring slice
copying on the host. Shared input constructed one 16 MiB backing; the four-worker
owned configuration recorded about 14.474 ms preparation separately from timed
operations. A one-shot comparison must include its preparation, whereas repeated
operations can amortize it. See the
[report](../docs/benchmarks-v0.4.md) and
[raw range allocation/preparation records](../benchmarks/results/range-partition-v0.4.json).

For matrix multiplication, shared B was 2 MiB once; each operation transferred
2 MiB of compact A slices and 2 MiB of output slices, then copied 2 MiB into the
assembled output. Those byte budgets stayed constant across grains, while the
number of factories, transfers, and results changed. See the
[report](../docs/benchmarks-v0.4.md) and
[raw matrix allocation records](../benchmarks/results/matrix-partition-v0.4.json).
Constant bytes do not imply constant time.

### What the comparison does not establish

At four workers and sixteen matrix chunks, manual PJS orchestration measured
109.760 ms, owned PJS 108.708 ms, and manual Piscina 5.3.2 orchestration
110.045 ms. The [report](../docs/benchmarks-v0.4.md) and
[raw matrix comparison](../benchmarks/results/matrix-partition-v0.4.json) show
close results in that configuration, not a general library ranking. The manual
PJS engine used retained v0.3 code while the owned engine used v0.4; that
comparison changes both runtime version and orchestration.

Five observations describe a small local experiment, not a production tail
distribution. This campaign does not establish an optimal grain on other
hardware, under competing application load, or for arbitrary cost distributions.
Nor does it compare adaptive partitioning or work stealing. The evidence supports
keeping grain explicit and measuring it together with transport and worker count;
it supplies no theorem selecting one universal default.

## Choosing the next experiment

Begin with a correctness-preserving decomposition and an explicit serial
baseline. Estimate whether cost follows item count, position, or data content.
If position predicts cost, compare equal-width chunks with cost-aware boundaries
or cyclic blocks. If cost is unpredictable, test whether extra chunks let an
idle worker take enough remaining work to reduce the tail.

Sweep grain across a few pieces per worker and substantially more pieces,
keeping total useful work and transport semantics comparable. Include the
coarse losing rows, the fine losing rows, preparation, and output assembly.
Record operation wall time and per-worker intervals, then use a one-worker
grain sweep to check whether subdivision changes kernel behavior even without
balancing. Varying everything at once prevents useful attribution.

PJS chose a bounded central FIFO and explicit grain for a tractable contract and
a controlled experiment. Static assignment, cost-aware splitting, guided
production, and distributed stealing remain reasonable alternatives for
different constraints. A case for changing the runtime would need evidence
about its workload, resource domains, and lifecycle costs beyond this chapter.

## References and exercises

[CMU-WORK-SPAN](references.md#cmu-work-span) provides the capacity/span foundation.
[GRAHAM-LIST](references.md#graham-list) records the historical scheduling source;
the independent-job bound is derived above.
[OPENMP-SCHEDULE](references.md#openmp-schedule) specifies concrete static,
dynamic, and guided loop schedules.
[BL-WORK-STEALING](references.md#bl-work-stealing) gives the randomized theorem
and its assumptions.
[NODE-WORKERS](references.md#node-workers) describes Node's execution and
transport machinery; [ECMA-NUMBER](references.md#ecma-number) defines Number
addition. [PJS-V04-PARTITIONING](references.md#pjs-v04-partitioning)
links the complete retained campaign.

1. Partition `[5,19)` with grain 4. How many chunks are there, and why does
   `[17,19)` not share an index with its predecessor?
2. Two resources receive costs `9,9,1,1 ms`. Calculate the contiguous and cyclic
   makespans and balance ratios. What is the ideal lower bound?
3. For four resources, total work 100 ms, and longest chunk 12 ms, calculate
   the flat-batch lower bound and list-scheduling upper bound. Would either be
   a prediction for a runtime with slow payload factories?
4. In the increasing-cost kernel, compare loop work in `[0,4)` and `[4,8)`.
   Why does equal width fail to imply equal cost?
5. If local coordination is 0.02 ms per chunk, how much useful compute is
   needed for a 5% overhead fraction? Why might that condition still fail to
   predict a good grain for a full-input clone?
6. Forty chunks execute on four workers. Is that hardware oversubscription?
   Can an idle worker steal the remainder of an opaque running chunk?
7. Why is the randomized work-stealing theorem not a guarantee for arbitrary
   asynchronous Node tasks? What does the expectation range over?
8. What does the one-worker skew result rule out? Does it identify JIT as the
   cause, or rule out a balancing contribution in the four-worker result?

<details>
<summary>Solutions</summary>

1. `ceil(14/4)=4`: `[5,9)`, `[9,13)`, `[13,17)`, `[17,19)`. The predecessor
   excludes 17, so the new chunk is its sole owner.
2. Contiguous loads `18,2` give `M=18 ms`, `B≈0.556`. Cyclic loads `10,10`
   give `M=10 ms`, `B=1`. The lower bound is `max(20/2,9)=10 ms`.
3. Lower bound `max(100/4,12)=25 ms`; list upper bound
   `25+(1-1/4)×12=34 ms`. Both concern an ideal ready batch; factories can
   add work and violate the readiness premise.
4. `16×(1+2+3+4)=160` iterations versus `16×(5+6+7+8)=416`.
   Per-item weights differ by position.
5. At least `19×0.02=0.38 ms`. Full-input cloning adds a grain-dependent byte
   cost outside that fixed local-overhead assumption.
6. No: the resource count stays four. An executing chunk is absent from ready
   queues; redistributing its remainder needs a different execution contract.
7. Fully strict dependencies and the paper's machine/scheduler assumptions
   have not been established for arbitrary blocking, messaging, or async
   execution. The expectation is over randomized scheduling choices.
8. It rules out explaining the entire grain improvement by inter-worker load
   balance. It isolates neither JIT nor another kernel-timing cause, and does
   not rule out an additional balancing contribution with four workers.

</details>
