# 05 — Work, Span, and Scaling

[Previous: Partitioning and load balance](04-partitioning-grain-size-and-load-balance.md) · [Book](README.md) · [Glossary](glossary.md)

## Two different reasons to ask for more processors

An engineer asking whether a calculation scales may want the same answer sooner.
Another may want to process a larger problem within the same time budget. Both
can use more processors, but their experiments answer different questions. A
third engineer may want enough memory for a problem that cannot fit on one
machine. “It scales” is incomplete until we state what grows and what stays fixed.

The dependency graph adds another distinction. A calculation can contain many
operations without having many operations ready together. Adding execution
resources cannot make a dependent step consume an answer that has not been
computed. Conversely, a highly parallel graph can still run poorly when moving
its data or finding its ready work costs too much.

This chapter develops the work/span model from
[Chapter 01](01-concurrency-parallelism-and-computation.md), connects it to
scheduling guarantees, and distinguishes strong, weak, and other scaling
questions. It then examines the ratios we report: what they measure, what their
baselines hide, and why a result above linear speedup needs explanation. PJS's
retained experiments provide concrete cases for interpreting these ideas.

## Name the computation before timing it

Fix an input and a correct algorithm. Represent its operations by a directed
acyclic graph, or **DAG**. A vertex represents computation; an edge says that
one operation must finish before another can begin. An acyclic graph has no
dependency cycle. Data-dependent algorithms can produce different graphs for
different inputs of the same size.

Assign each vertex $v$ a positive cost $w(v)$ in ideal execution-time units.
Assume identical processors, fixed costs, and free scheduling and communication.
Define **work** $W$ and **span** $D$ as:

$$
W=\sum_v w(v),\qquad
D=\max_{\pi}\sum_{v\in\pi}w(v),
$$

where $\pi$ ranges over directed paths. In plaintext, work is the sum of all
operation costs; span is the cost of the longest dependency path. These are
the $T_1$ and $T_\infty$ of the earlier chapters. We use $W,D$ here to keep
graph costs separate from measured serial and pool durations.

Work is the time needed on one ideal processor for this computation. Span is
the time needed with unlimited ideal processors: start each operation as soon
as its predecessors finish. Neither is automatically the duration measured on
one Node worker. That duration can include messaging, a different execution
rate, and runtime work absent from the graph.

For sequential composition, add both work and span. For independent parallel
branches, add their work and take the maximum of their spans. Preparation,
forking, joining, and combining are additional graph operations if the model
charges for them. [BLELLOCH-WORK-DEPTH](references.md#blelloch-work-depth) explains
these composition rules and the distinction between an abstract cost model and
a physical machine.

An important algorithmic question is **work efficiency**: does exposing
parallelism preserve approximately the work of a good serial algorithm? Count
only unit-time additions, with input values already available. Summing $n$
values by a chain needs $n-1$ additions and has span $n-1$. An ideal balanced
tree, for $n$ a power of two, still needs $n-1$ additions but has span
$\log_2 n$. It changes the dependencies without multiplying arithmetic work.
Actual JavaScript still needs storage, scheduling, and a numerical correctness
contract; the regrouping caveat in
[Chapter 04](04-partitioning-grain-size-and-load-balance.md#partitioning-is-part-of-the-algorithm)
applies. A promise tree alone does not execute its additions on separate CPUs.

## Average parallelism and its limits

Let $T_p$ be the ideal makespan of a schedule on $p\geq1$ processors. The
work and span laws give:

$$
T_p\geq\max\left(\frac{W}{p},D\right).
$$

The capacity argument is `processors × elapsed time >= total work`. The
dependency argument is that successive operations on a path cannot overlap.
The laws hold for every valid schedule under this model; they do not claim the
lower bound is always attainable.

Define **average parallelism** $A=W/D$ for a nonempty graph. Then ideal speedup
and efficiency satisfy:

$$
S_{\mathrm{ideal}}(p)=\frac{W}{T_p}\leq\min(p,A),
\qquad
E_{\mathrm{ideal}}(p)=\frac{W}{pT_p}\leq\min\left(1,\frac{A}{p}\right).
$$

In plaintext, graph speedup cannot exceed either the processor count or
`work/span`. The ratio $A$ is dimensionless. It summarizes the graph's opportunity,
not a measured utilization percentage or the number of ready operations at every
instant. [UWO-PARALLELISM](references.md#uwo-parallelism) develops these bounds.

Consider a unit-cost example: eight sequential operations prepare
input, eight independent one-step operations process it, and one final step
combines their answers.

```text
                      +--> B1 --+
                      +--> B2 --+
                      |   ...   |
prepare: 8-step chain -+--> B8 --+--> combine: 1 step
```

Work is `8+8+1=17` units; span is `8+1+1=10` units; average parallelism is
$17/10=1.7$. Peak available width is eight, but that width exists for only one
ideal phase. The long preparation chain dominates the graph.

On the unlimited-processor timeline, preparation uses one processor for eight
steps, processing uses eight for one step, and combination uses one for one
step. The time-average executing count is `(8×1+1×8+1×1)/10=1.7`. This explains
the word “average”; the peak of eight is a different quantity.

Its ideal optimal time is `8 + ceil(8/p) + 1`. Two processors take 13 steps,
four take 11, and eight take 10. Four-processor speedup is only `17/11≈1.545`;
unlimited processors cannot exceed 1.7. More processors cannot shorten the
preparation dependencies. Calling this “eight parallel tasks” describes a phase
while concealing the complete operation.

Average parallelism also does not uniquely determine a finite-processor
schedule. Width may vary, and indivisible operations may not fit evenly into
the available capacity. It provides a ceiling; scheduling theory tells us how
close particular schedulers can get under additional assumptions.

## From lower bounds to a scheduling guarantee

The [flat-batch proof in Chapter 04](04-partitioning-grain-size-and-load-balance.md#what-greedy-assignment-can-guarantee)
assumed that every chunk was ready at time zero. A DAG scheduler must also
respect readiness as predecessor operations finish. For a useful general
result, restrict the graph to unit-time vertices and discrete execution steps.
The processor count is a positive integer; ready vertices and their dependencies
are known without cost. There is no blocking, transport, or competing work.

A **greedy schedule** executes $p$ ready vertices when at least $p$ are ready,
and all ready vertices when fewer are ready. Let $T_p^{\mathrm g}$ be its
makespan. The classical work/span guarantee is:

$$
T_p^{\mathrm g}\leq\frac{W-D}{p}+D
\leq\frac{W}{p}+D.
$$

In plaintext, greedy time is at most `work/processors + span`, with the
slightly tighter first expression avoiding some double counting. Brent's
[original simulation lemma](references.md#brent-simulation) gives the same first
expression for simulating an unlimited-processor computation. The greedy
work/span theorem is stated in Section 2 of
[BL-WORK-STEALING](references.md#bl-work-stealing), with earlier scheduling work
credited to Brent and Graham. The argument below specializes to unit-cost DAGs.

Call a step **full** if it executes $p$ vertices and **partial** if it executes
fewer. During a partial step all currently ready vertices run. Every longest
path in the remaining graph begins at a ready vertex; executing all those
vertices reduces the remaining span by at least one. Therefore there can be at
most $D$ partial steps.

Let $F$ be the number of full steps and $I$ the number of partial steps. Until
completion, each partial step executes at least one vertex. Consequently:

$$
W\geq pF+I,\qquad I\leq D,
$$

and so:

$$
T_p^{\mathrm g}=F+I
\leq\frac{W}{p}+\left(1-\frac1p\right)I
\leq\frac{W}{p}+\left(1-\frac1p\right)D.
$$

In plaintext, full steps consume work efficiently; the number of partially
filled steps is limited by dependency depth. They need not be consecutive or
at the end. That is why this proof applies beyond an initially ready batch.

The lower bound also implies `W/p + D <= 2×T_opt`, where $T_{\mathrm{opt}}$ is
the best makespan for the same graph. Thus every such greedy schedule is within
a factor of two of the ideal optimum. This is a worst-case guarantee, not an
assertion that greedy schedules routinely take twice as long.

For the 17-work, 10-span example on four processors, the bounds give
`10 <= T4 <= (17-10)/4+10 = 11.75` steps. Its actual ideal time is 11 steps.
The bounds constrain the answer without identifying it exactly.

Weighted operations require care. An integer-cost operation may be modeled as
a chain of unit steps only if that representation permits the scheduling being
analyzed. It does not make a running opaque function preemptible. Node messages,
late payload factories, and finite memory bandwidth also violate the free,
always-accessible readiness assumptions. The theorem is about a computation
model, not a service-level promise from a worker pool.

## Slackness: leave room below the ceiling

Define **parallel slackness** at processor count $p$ as:

$$
\sigma=\frac{A}{p}=\frac{W}{pD}.
$$

In plaintext, slackness is `average parallelism / processors`. This convention
and the importance of operating below the average-parallelism ceiling are
discussed in [UWO-PARALLELISM](references.md#uwo-parallelism).

If $\sigma<1$, span alone prevents unit ideal efficiency: there are more
processors than the graph's average parallelism. If $\sigma$ is much larger
than one, the useful work per processor is large relative to the span. For the
ideal unit-cost greedy schedule, the simpler upper bound gives:

$$
E_{\mathrm{ideal}}^{\mathrm g}(p)
\geq\frac{W}{p(W/p+D)}
=\frac{1}{1+1/\sigma}.
$$

With average parallelism 40 and four processors, slackness is 10, and this
conservative efficiency guarantee is `10/11≈0.909`. At forty processors,
slackness is one; the same bound guarantees only one half. Neither statement
predicts a measured Node efficiency.

The randomized work-stealing result from
[Chapter 04](04-partitioning-grain-size-and-load-balance.md#work-stealing-a-theorem-with-a-computation-model)
has the expected-time form `W/p + O(D)` for fully strict computations under its
machine assumptions. If the span term's constant is $c$, making it relatively
small requires `W/p >> cD`, or `σ >> c`. A large ratio on paper is useful only
relative to the scheduler costs and assumptions being modeled.

This is also different from creating many chunks. The count ratio `chunks/p`
measures over-partitioning; $W/(pD)$ measures slack in the dependency graph.
A thousand chunks chained by dependencies can have almost no parallel slackness.
A large queue cannot make those dependencies disappear, and a highly parallel
graph does not justify retaining every future payload at once.

## Strong scaling: finish the fixed problem sooner

Let $n$ denote the workload parameters, which may include input shape, accuracy,
and iteration count rather than a single byte length. Let $t(p,n)$ be a measured
end-to-end time using $p$ execution resources and a specified timing boundary.
Lowercase $t$ distinguishes observations from the ideal $T_p$ above.

**Strong scaling** fixes $n=n_0$ and varies $p$. For a chosen measured baseline
$t_{\mathrm{base}}(n_0)$, define:

$$
S_{\mathrm{strong}}(p,n_0)
=\frac{t_{\mathrm{base}}(n_0)}{t(p,n_0)},\qquad
E_{\mathrm{strong}}=\frac{S_{\mathrm{strong}}}{p}.
$$

The practical question is whether the same correct answer arrives sooner.
An ideal graph cannot exceed its average-parallelism ceiling. A physical
implementation can lose efficiency earlier because work per processor shrinks
while coordination, transport, or assembly remain substantial.

[CMU-SCALING](references.md#cmu-scaling) distinguishes this fixed-problem question
from scaled-workload and memory-constrained questions. The Amdahl model in
[Chapter 03](03-the-cost-model-of-parallelism.md#amdahl-the-part-additional-processors-cannot-shorten)
is one special model of strong scaling: a fixed serial fraction and perfectly
divisible remaining work. General graphs have more varied readiness profiles.
The ratio $D/W$ summarizes a critical path; it is not automatically the fraction
of code that belongs to one globally serial region.

A strong-scaling curve should include absolute time. Suppose one implementation
takes 400 ms on one processor and 120 ms on four, while a good serial algorithm
takes 80 ms. Its internal speedup is `400/120≈3.333`, yet its four-processor
execution is slower than the serial alternative: `80/120≈0.667`. These invented
numbers demonstrate that attractive pool scaling can coexist with an unattractive
engineering choice.

More generally, let $R=t(1,n_0)/t_{\mathrm{seq}}(n_0)$, the ratio of the parallel
implementation's one-resource time to the direct serial baseline. Then:

$$
S_{\mathrm{application}}(p)
=\frac{S_{\mathrm{pool}}(p)}{R}.
$$

In plaintext, divide pool speedup by the one-worker baseline's relative cost.
State both baselines rather than selecting whichever makes the curve steeper.

## Weak scaling: choose the growth rule explicitly

**Weak scaling** conventionally keeps a fixed amount of problem per processor.
If each item costs roughly the same, this means increasing the total item count
in proportion to $p$. For a comparison intended to keep useful computation per
processor constant, choose a workload family $n_p$ satisfying:

$$
W(n_p)\approx pW(n_0).
$$

The notation describes workload selection, not a theorem that wall time stays
constant. Here is a weak-scaling efficiency convention:

$$
E_{\mathrm{weak}}(p)
=\frac{t(1,n_0)}{t(p,n_p)}.
$$

In plaintext, divide the time for the small one-resource problem by the time
for the larger $p$-resource problem. The same implementation and timing boundary
should appear on both sides. Under ideal constant work per resource and no
growing overhead, the ratio is one. Do not divide it by $p$ again.

For an illustrative baseline of 40 ms and a four-times-work problem completed
on four processors in 48 ms, weak efficiency is `40/48≈0.833`. Throughput in
useful work units improved by `4×40/48≈3.333`, but the larger problem did not
finish four times faster than the smaller one. It took 20% longer. This is not
fixed-workload speedup.

Larger inputs alone do not identify a weak-scaling experiment. A matrix of
dimension $d$ has $d^2$ elements, while a conventional dense multiplication
performs work proportional to $d^3$. To keep arithmetic work per processor
constant, choose `d_p ≈ d_0×p^(1/3)`. On eight processors, doubling the dimension
gives eight times the arithmetic work. Keeping matrix elements per processor
constant instead requires `d_p ≈ d_0×sqrt(p)`, assuming storage can be divided
across resources: that is a memory-oriented growth rule. At four processors,
doubling the dimension gives eight times the work, so ideal time doubles despite
perfect arithmetic balance.

These calculations assume the same multiplication algorithm and arithmetic
costs, ignoring communication and representation changes. Independent records
with constant per-record cost would instead use `records_p = p×records_0`.
Irregular inputs need a cost distribution as well as a count. State the growth
rule in the caption; “problem size” is too ambiguous.

Adding Node workers within one process also does not multiply that machine's
physical RAM or memory bandwidth. Memory-constrained cluster scaling and
worker-count scaling on a fixed host are different resource experiments. The
Gustafson perspective in [Chapter 03](03-the-cost-model-of-parallelism.md#gustafson-a-different-workload-question)
asks about larger useful problems within a time budget; it is not evidence that
every workload family satisfies a particular weak-scaling efficiency.

## How much growth preserves efficiency?

Weak scaling may still lose efficiency as coordination grows. Another question
is how rapidly useful work must grow to hold efficiency near a target. This is
the idea behind **isoefficiency**, developed in
[GRAMA-ISOEFFICIENCY](references.md#grama-isoefficiency). We can expose its
algebra without fitting a runtime model.

For a fixed-cost ideal graph and a particular schedule, define excess
processor-time $H=pT_p-W$. It is nonnegative by the work law and can include
unused capacity caused by dependencies. Then:

$$
E=\frac{W}{pT_p}=\frac{W}{W+H}.
$$

For target $0<e<1$, maintaining $E\geq e$ requires:

$$
W\geq\frac{e}{1-e}H.
$$

In plaintext, useful work must stay large relative to excess resource-time.
For an illustrative timing model `T_p = W/p + α×log2(p)`, where
$\alpha$ is a positive time cost, `H = α×p×log2(p)`. An 80% target requires
`W >= 4×α×p×log2(p)`. Increasing work merely in proportion to $p$ eventually
fails that condition. The model supplies its own growth requirement; it is
not a claim that PJS coordination follows a logarithm.

Span supplies another necessary condition: since `E <= A/p`, a target $e$
requires `A(n) >= e×p`. Growing work without growing parallelism enough is
insufficient. Runtime costs, data movement, and memory capacity can impose
further constraints. [CMU-SCALING](references.md#cmu-scaling) emphasizes choosing
the scaling constraint appropriate to the application.

Do not compute $H$ from a measured baseline and call it scheduler overhead
without establishing comparable work costs. With changed caching or algorithms,
`p×t_parallel - t_serial` can even be negative. It is a comparison quantity,
not a measurement of instructions spent in the scheduler.

## Superlinear results do not overturn the work law

A finite measured result is usually called **superlinear speedup** when its
reported ratio exceeds $p$. In the fixed-cost model, `W/T_p > p` is impossible
because `T_p >= W/p`. A real result above $p$ therefore asks which model premise
or comparison boundary changed. The measurement can be real while the ideal
interpretation is inappropriate.

One possibility is locality. Dividing a working set can make each processor's
portion fit in a private cache, lowering the cost per operation. More machines
can also add memory and avoid paging. [CMU-SCALING](references.md#cmu-scaling)
discusses these mechanisms. They require a memory hierarchy that actually
changes the relevant access costs; one process does not acquire unlimited cache
or RAM by creating threads.

As an invented example, suppose the same operations take 100 time units on one
processor, but four independent portions each take 20 units after a locality
change. Completion in 20 gives speedup five. Their summed execution cost is
now 80, not the original 100. The fixed-cost premise changed; no processor
performed five processors' worth of fixed-cost work per time unit.

Other possibilities include different algorithmic work, input distributions,
JIT state, or timing boundaries. A search that finds a solution earlier may
visit fewer states, even when the answer is correct. That can be a valuable
algorithmic result, but it does not measure speedup of the same fixed DAG.
A cold or unusually slow serial baseline can also inflate the ratio.

First verify equal answers and included costs. Then compare a good direct serial
implementation, the parallel decomposition executed on one resource, and the
multi-resource version. Repeat comparisons in balanced order and keep the raw
samples. If a cache explanation matters, investigate cache behavior rather than
inferring it from `speedup > p`. A plausible mechanism is a hypothesis until
the experiment distinguishes it from the alternatives.

## Effective serial fraction as a diagnostic

The **Karp–Flatt metric** rearranges Amdahl's equation for a measured fixed-work
speedup $S(p)$, with $p>1$:

$$
f_{\mathrm{eff}}(p)
=\frac{1/S(p)-1/p}{1-1/p}.
$$

It answers: which serial fraction would reproduce this ratio in that simple
model? [KARP-FLATT](references.md#karp-flatt) introduces the diagnostic and shows
that it absorbs effects such as imbalance and coordination. It is not a direct
measurement of time spent in serial code.

With `p=4` and speedup three, the result is `(1/3-1/4)/(1-1/4)=1/9≈0.111`.
That does not prove 11.1% of source instructions cannot run in parallel. If
speedup is five, the metric becomes about `-0.067`. Negative output is an
algebraic sign that the nonnegative fixed-cost Amdahl decomposition does not
describe the comparison, not evidence of negative serial work.

Compare the metric across processor counts for the same workload and baseline.
Changes can suggest additional scaling costs, but cannot identify their causes
alone. A flat value is consistent with the model, not proof of its mechanism.
Do not feed weak-scaling ratios or throughput from differently sized jobs into
this fixed-work formula and interpret the result as a serial fraction.

## PJS evidence: the baseline can change the story

The historical v0.3 CPU suite searched for primes over `[0,1,000,000)` using
trial division. Worker runs used 32 contiguous chunks independent of worker
count; direct serial ran the same kernel monolithically. An independent sieve
checked correctness. This is a fixed-workload worker-count sweep, with timing
including dispatch and result handling rather than only arithmetic.

The campaign ran on 2026-09-27 with Node v24.13.1, Linux
6.19.10-300.fc44.x86_64, and an AMD Ryzen 3 PRO 3300U with four available logical
CPUs. It used fresh processes per worker count, reused pools across input sizes,
two warmups, and five retained timed samples. Startup was separate. Order was
serial, four, two, one workers; this was not a randomized multi-session study.
See [the report](../docs/benchmarks-v0.3.md#cpu-observations-and-regression-investigation),
[methodology](../benchmarks/README.md), and
[raw CPU artifact](../benchmarks/results/cpu-v0.3.json).

The following values are ratios of configuration medians, calculated from the
unrounded raw durations. The direct serial median was **280.231 ms**.

| Workers | Median operation ms | Speedup versus direct serial | Speedup versus one pool worker |
| ------- | ------------------: | ---------------------------: | -----------------------------: |
| 1       |             574.878 |                        0.487 |                          1.000 |
| 2       |             155.554 |                        1.802 |                          3.696 |
| 4       |              92.074 |                        3.044 |                          6.244 |

Against direct serial, the four-worker efficiency ratio is approximately
`3.044/4=0.761`. Against one pool worker it is approximately
`6.244/4=1.561`. Neither ratio is a CPU utilization percentage. The latter
looks superlinear, but these measurements do not establish constant per-operation
costs across processes or isolate a hardware mechanism.

The report explicitly investigated the unusually slow one-worker phase. In the
alternating follow-up, candidate v0.3 medians for this input were approximately
276.354 ms direct serial, 310.509 ms one worker, and 181.219 ms four workers.
Those give roughly 1.525 application speedup and 1.713 pool speedup. See the
[investigation](../docs/benchmarks-v0.3.md#cpu-observations-and-regression-investigation)
and [all control samples](../benchmarks/results/cpu-regression-v0.3.json).
The earlier curve is not a stable scalability finding. Nor is the follow-up
a precise universal bound: substantial variance and reversals remained.

This is why we retain an uncomfortable result rather than promote its steepest
ratio. The one-worker gap cannot all be called runtime overhead; changing host
conditions and execution rates were not isolated. The experiment did not
measure graph span. Solving Amdahl's equation for a measured ratio would not
recover that missing dependency measurement.

### A scaling loss worth preserving

The same milestone's reused shared-input scan processed 2,097,152 Float64 values
per execution. One, two, and four workers recorded approximately 8.491, 7.387,
and 12.019 ms amortized per execution. Each timed session included one shared
construction and five executions. These numbers come from the
[report](../docs/benchmarks-v0.3.md#clone-transfer-and-shared-results) and
[raw shared sessions](../benchmarks/results/shared-v0.3.json).

Two workers were faster than four in that local experiment. Memory bandwidth,
dispatch, and host interference are possible contributors, but no hardware
counters separated them. Independent arithmetic does not ensure favorable
machine scaling. Comparing those session costs with execution-only values
would also change the timing boundary and the resulting speedup claim.

These are strong-scaling observations for particular fixed inputs and
representations. The chapter does not extract a weak-scaling curve by combining
unmatched sizes, milestones, or different machines. A proper weak experiment
would need an explicit growth rule and matched measurements; none was run here.

## Reading a scalability claim responsibly

A useful claim names the correct workload and algorithm, the growth rule, the
baseline, the timing boundary, and the resource domain. Report absolute time
beside ratios. Distinguish configured worker count from physical cores and
from all other runnable native threads, as
[Chapter 02](02-how-node-executes-javascript.md) explains. Increasing logical
concurrency above worker capacity changes queueing, not the processor count.

Use a graph argument for work and span, timed experiments for actual speedup,
and instrumentation for execution activity. Their outputs are different kinds
of evidence. Process CPU time includes multiple threads; worker-body wall
occupancy can include OS descheduling. Neither reveals the dependency graph.
High CPU use can coexist with redundant work or expensive copying, and low
efficiency can still be acceptable if absolute time meets the application's
goal with a reasonable resource budget.

Choose summaries that match the question. A ratio of two medians is not a
median of paired ratios; paired comparisons need actual paired trials.
Report variability and controls, especially when effects are small or order
matters. A handful of repeated batches does not establish production p99
latency, and closed-loop throughput does not establish an open-loop server's
latency under overload. The retained
[crypto methodology](../benchmarks/real-world/crypto/README.md) and
[measurement appendix](../docs/research/v0.13-crypto-measurements.md) illustrate
these boundary and sampling distinctions.

PJS's persistent workers and explicit task boundaries make some costs
observable, but they do not supply arbitrary nested DAG scheduling or the
work-stealing theorem's contract. Its
[architecture](../docs/architecture.md),
[FIFO decision](../docs/adr/0003-scheduler-interface.md), and
[stability policy](../docs/stability.md) retain authority over current behavior.
The theory helps decide what to measure and which decomposition to consider;
it does not select a universal worker count or authorize a scheduler change.

## References and exercises

[BLELLOCH-WORK-DEPTH](references.md#blelloch-work-depth) develops compositional
graph costs. [BRENT-SIMULATION](references.md#brent-simulation) supplies the
original simulation lemma; [BL-WORK-STEALING](references.md#bl-work-stealing)
states greedy and randomized scheduling results with their assumptions.
[UWO-PARALLELISM](references.md#uwo-parallelism) develops average parallelism
and slackness. [CMU-SCALING](references.md#cmu-scaling) discusses growth rules,
baselines, and cache effects. [KARP-FLATT](references.md#karp-flatt) derives the
effective serial-fraction diagnostic.
[GRAMA-ISOEFFICIENCY](references.md#grama-isoefficiency) analyzes the growth of
work needed to preserve efficiency.
[PJS-V03-SCALING](references.md#pjs-v03-scaling),
[PJS-V03-CONTROL](references.md#pjs-v03-control), and
[PJS-V03-TRANSPORT](references.md#pjs-v03-transport) preserve the local evidence
and its limitations.

1. A graph prepares input in three unit steps, executes two independent chains
   of lengths six and two, then combines in one step. Find work, span, average
   parallelism, and the four-processor speedup ceiling.
2. A unit-cost DAG has `W=120`, `D=12`, and `p=6`. Calculate the time lower
   bound and the tighter greedy upper bound. Do they determine the actual time?
3. For average parallelism 80 and eight processors, calculate slackness and
   the conservative ideal greedy efficiency guarantee. How does this differ
   from observing ten ready chunks per worker?
4. A one-worker pool takes 500 ms, four workers take 150 ms, and direct serial
   takes 100 ms. Calculate both speedups and decide whether the parallel run
   improves time to solution relative to direct serial.
5. A small one-resource job takes 30 ms; eight times its useful work takes
   36 ms on eight resources. Calculate weak efficiency and useful-throughput
   growth. Is this a fixed-workload speedup?
6. Conventional dense multiplication has cubic arithmetic work. How should
   matrix dimension grow on eight processors for constant arithmetic work per
   processor? What happens if dimension instead grows by $\sqrt8$?
7. For `T_p=W/p+α×log2(p)`, derive the useful-work requirement for 90%
   efficiency. Does this expression demonstrate a PJS coordination law?
8. With four processors and measured fixed-work speedup five, calculate the
   Karp–Flatt metric. Which inference would be incorrect?
9. Why do the initial v0.3 pool ratios not prove superlinear hardware scaling?
   Why does the scan's four-worker loss not prove bandwidth saturation?

<details>
<summary>Solutions</summary>

1. `W=3+6+2+1=12`; `D=3+6+1=10`; `A=1.2`. The ideal speedup ceiling is
   `min(4,1.2)=1.2`, even though the middle phase contains independent work.
2. Lower bound `max(120/6,12)=20` steps; upper bound `(120-12)/6+12=30`
   steps. Different dependency graphs or schedules can lie within that range.
3. `σ=80/8=10`; guarantee `10/11≈0.909`. Ready-chunk count describes a
   moment and decomposition; slackness describes complete graph work and span.
4. Pool speedup `500/150≈3.333`; application speedup `100/150≈0.667`.
   Four-worker execution is slower than the direct serial alternative.
5. Weak efficiency `30/36≈0.833`; throughput growth `8×30/36≈6.667`.
   The amount of work changed, so this is not fixed-workload speedup.
6. Double dimension because `8^(1/3)=2`. Growing by `sqrt(8)` makes total
   arithmetic work grow by `8^(3/2)`; ideal time grows by `sqrt(8)` after
   dividing among eight resources. Fixed storage per resource is a different
   scaling constraint.
7. `H=α×p×log2(p)` and `e/(1-e)=9`, hence
   `W>=9×α×p×log2(p)`. It is a deduction from the assumed model, not a fit
   to PJS or a statement about its implementation.
8. `(1/5-1/4)/(1-1/4)=-1/15≈-0.067`. Interpreting this as negative actual
   serial work is incorrect; the model does not explain the comparison.
9. The pool baseline was unusually slow and the curve changed under better
   controls; no constant-cost or hardware explanation was established. The
   scan collected no counters isolating bandwidth from other costs.

</details>
