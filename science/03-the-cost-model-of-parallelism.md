# 03 — The Cost Model of Parallelism

[Previous: Node execution](02-how-node-executes-javascript.md) · [Book](README.md) · [Glossary](glossary.md)

## The missing terms in “four workers, four times faster”

If four people each perform one quarter of an independent calculation, a first
guess is one quarter of the original time. The guess omits preparing the work,
giving it to them, waiting for unequal pieces, and combining their answers. It
also assumes the four execution resources are equally fast and do not compete
for something else. A useful parallel cost model begins by making those
assumptions visible.

This chapter develops three kinds of reasoning. Speedup and efficiency describe
a comparison. Amdahl and Gustafson describe idealized scaling under different
workload assumptions. A practical runtime model helps identify overhead and
choose experiments. These tools are complementary; none is a complete prediction
of PJS wall time.

## Define the comparison before calculating the ratio

For the same useful workload and correctness requirement, let $T_1$ be elapsed
time on the chosen serial baseline, and $T_p$ be elapsed time using $p$ parallel
workers. Here $p$ is the configured worker count; it is not a measured physical
core count. Define speedup as:

$$
S(p) = \frac{T_1}{T_p}.
$$

If serial execution takes 100 ms and four-worker execution takes 30 ms,
`S(4) = 100/30 ≈ 3.33`. Speedup is dimensionless: both durations use the same unit.
Values below one mean the parallel strategy took longer. A ratio alone does not
tell us whether workers protected the main event loop or increased memory use.

Define parallel efficiency relative to that worker count:

$$
E(p) = \frac{S(p)}{p}.
$$

The example gives `E(4) ≈ 3.33/4 ≈ 0.833`, or 83.3%. This is an efficiency ratio,
not a hardware utilization counter. It does not prove workers were busy exactly
83.3% of the time. In ideal equal-resource models, speedup of $p$ corresponds to
efficiency one; real baseline differences, caching, JIT, and noise can produce
ratios above that value. The [PJS benchmark methodology](../benchmarks/README.md)
uses these definitions while warning about superlinear-looking results.

The baseline must be explicit. One PJS worker still pays runtime/transport costs
that direct serial execution does not. Comparing four workers to one worker in
the same pool measures pool scaling; comparing four workers to a direct serial
implementation measures a different engineering choice. If a native async API
exists, it is another necessary baseline for adoption, not a “serial” execution
by definition. Native APIs may already calculate concurrently.

Timing boundaries matter just as much. Comparing a warm parallel kernel against
a serial run that includes startup is misleading. So is timing shared-memory
execution after excluding construction while timing clone execution with all
copies included. Choose cold-start latency, warm request latency, session cost,
or sustained throughput according to the question, then apply it consistently.
Chapter 01's $T_1$ was ideal work for a fixed graph; here it is a measured baseline
unless a section explicitly says otherwise.

## Amdahl: the part additional processors cannot shorten

For a fixed workload, divide serial-baseline time into a serial fraction $f_s$
and a parallelizable fraction $1-f_s$, where $0 \leq f_s \leq 1$. Assume the
serial part is unchanged, the parallel part divides evenly over $p$ equally fast
resources, and there is no extra overhead or contention. Ideal parallel time is:

$$
T_p = T_1\left(f_s + \frac{1-f_s}{p}\right).
$$

Substitute into the speedup definition and cancel $T_1$:

$$
S(p) = \frac{1}{f_s + \frac{1-f_s}{p}}.
$$

In plaintext: divide one by the sum of the serial fraction and the parallel
fraction divided by resource count. This familiar normalized formulation derives
from the serial-limit argument associated with
[Amdahl's original paper](references.md#amdahl); it is not a claim about the exact
notation printed in 1967.

If the serial fraction is 10%, four resources give
`1/(0.1 + 0.9/4) = 1/0.325 ≈ 3.08`. Eight give about 4.71. With arbitrarily many
resources the parallel term approaches zero, leaving a limit of `1/0.1 = 10`.
For positive $f_s$, the general limit is $1/f_s$. If $f_s=0$, the ideal model
instead gives $S(p)=p$; that still says nothing about real transport overhead.

This explains declining ideal efficiency: the serial part occupies an increasing
share of the remaining elapsed time as parallel compute shrinks. It also gives a
practical question: would reducing serial preparation or assembly help more than
adding another worker?

Amdahl does not tell us how long worker startup takes, whether clone is expensive,
or how the OS schedules threads. Its assumptions exclude those effects. Fitting
one measured ratio to a “serial fraction” can conflate algorithmic dependencies,
transport, imbalance, and contention. Without additional evidence, that fitted
number is not a measurement of fundamentally un-parallelizable source code.

## Gustafson: a different workload question

Amdahl holds the problem fixed. Sometimes the goal is instead doing more useful
work within an approximately fixed time budget: a finer simulation grid, more
independent samples, or a larger dataset. [Gustafson's paper](references.md#gustafson)
examines scaled workloads and credits E. Barsis for the alternative formulation.
It changes the question, rather than invalidating fixed-workload arithmetic.

Normalize a parallel run's time to one. Let $\alpha$ be the fraction of **that
parallel run** spent on serial work; the rest is $1-\alpha$. Assume $p$ resources
each contribute useful work during the parallel portion. On one resource, doing
the same scaled work would cost $\alpha + p(1-\alpha)$. Thus scaled speedup is:

$$
S_G(p) = \alpha + p(1-\alpha) = p - (p-1)\alpha.
$$

For $\alpha=0.1$ and $p=4$, this gives 3.7. Do not compare it directly with the
3.08 Amdahl example as if one model improved the same run: $\alpha$ is a
parallel-run serial fraction, while $f_s$ was a serial-baseline fraction, and the
workload construction differs. For any particular fixed workload the durations
must still be consistent with its actual dependencies.

The relation to runtime grain size is suggestive, not an identity. Larger useful
tasks can make roughly fixed messaging overhead less significant, helping a
parallel strategy cross from losing to winning. Gustafson's scaled model is not
an equation for that overhead crossover. If enlarging inputs also grows copying,
assembly, or serial parsing, its simplifying scaling assumptions may fail. A
latency-sensitive request cannot always be enlarged merely to improve efficiency.

## An engineering ledger for elapsed time

Now include the things an actual runtime has to do. For an operation using a warm
or newly created pool, an explanatory ledger is:

$$
\begin{aligned}
T_p \approx {}& T_{\text{startup}} + T_{\text{admission}} + T_{\text{dispatch}}
 + T_{\text{transport}} \\
&+ T_{\text{compute-parallel}} + T_{\text{imbalance}}
 + T_{\text{result}} + T_{\text{assembly}}.
\end{aligned}
$$

All terms have units of time. Startup establishes the pool; admission includes
waiting for permission/capacity; dispatch accounts for host bookkeeping;
transport covers input preparation and movement; compute is useful worker work;
imbalance is the extra wait for uneven assignments; result is output transport
and host settlement; assembly forms the caller's final output. Under ideal
balance and equal resource speeds, parallel compute is approximately $C/p$,
where $C$ is the serial time of the parallelizable compute portion.

This is an explanatory approximation, **not an exact sum of runtime counters**.
Workers can compute while the host dispatches later pieces; input preparation and
posting may be nested; multiple messages travel concurrently. Adding overlapping
intervals double counts wall time. A more precise model would use a dependency
graph with resource constraints and measure its critical path. PJS
[ADR 0010](../docs/adr/0010-dispatch-efficiency.md) specifically rejects treating
profile stages as cleanly additive public telemetry.

Use the ledger to ask what an experiment should isolate. A no-op kernel can
reveal a floor for orchestration, but removing computation also changes overlap
and pressure. A dedicated buffer round trip narrows a transport question but
omits application preparation. Kernel-only worker time cannot be subtracted
from whole-operation time to reveal one universal “scheduler cost.” The
[architecture](../docs/architecture.md) maps current owners of these costs without
making this ledger a contract.

## Persistent workers and amortization

For an illustrative sequential series of jobs, let startup cost be $A$ and warm
per-job cost be $b$, including that job's messaging and work. Creating a new
worker for each job costs approximately $A+b$ per job. Reusing one initialized
worker for $N$ jobs gives session cost $A+Nb$, hence:

$$
\bar{T} \approx \frac{A}{N} + b.
$$

In plaintext: average cost is startup divided by job count, plus recurring cost.
If invented values are `A=40 ms`, `b=2 ms`, and `N=100`, the session average is
2.4 ms instead of 42 ms for repeated creation. These are arithmetic examples,
not measured PJS startup values. [Node's worker guidance](references.md#node-workers)
and [PJS ADR 0002](../docs/adr/0002-worker-pool-model.md) motivate persistent pools.

Amortization does not erase first-request latency, preparation for every task,
restarts, retained module memory, or shutdown. For concurrently overlapping jobs,
dividing session duration by job count describes average throughput cost, not
each job's response latency. A heavily queued job can wait a long time even when
average throughput is good. State which interpretation a report uses.

## Grain size, imbalance, and the crossover

**Grain size** is the useful work contained in one schedulable unit. Suppose
$n$ items are divided into chunks of $g$ items, with approximately uniform serial
per-item compute $c$. There are $m=\lceil n/g\rceil$ chunks. Let $h$ be a host-side
overhead per chunk that cannot overlap other host overhead. A simplified model is
`T_p ≈ nc/p + mh + L`, where $L$ represents imbalance and other unmodeled costs.

Smaller $g$ gives more opportunities to distribute work, but increases $m$ and
the `mh` term. Larger $g$ reduces recurring overhead while making assignments
less flexible. If $m<p$, some workers cannot receive a chunk at all. Uniform item
counts do not guarantee uniform costs: parsing records, searching candidates,
and traversing sparse structures may have variable work per item. This model
assumes a particular host bottleneck; overhead distributed across workers would
need a different expression.

For four concurrently assigned independent partitions with compute times
10, 10, 10, and 100 ms, computation cannot finish before 100 ms. More generally,
for that assignment $T_p \geq \max_i T_i$, where $T_i$ is a partition's execution
duration measured from the common start. Unequal dispatch times only add waiting.
The total work is 130 ms, so perfect balance would suggest 32.5 ms, but the
unsplit 100 ms partition is a straggler. This is an application of the critical
path reasoning in [CMU-WORK-SPAN](references.md#cmu-work-span).

Smaller partitions or cost-aware partition boundaries may reduce the straggler.
Per-worker queues can support locality; work stealing can redistribute ready
work under suitable ownership rules; priorities can serve latency classes. Each
adds policy and accounting obligations and cannot divide an already running
opaque task automatically. PJS currently uses bounded central FIFO, with
runtime-owned range production and optional experimental batching, because
retained evidence has not justified more sophisticated scheduling.
[ADR 0003](../docs/adr/0003-scheduler-interface.md),
[ADR 0008](../docs/adr/0008-runtime-owned-partitioning.md), and
[ADR 0011](../docs/adr/0011-batched-partition-dispatch.md) record the choices.

For a simple crossover estimate, let direct serial useful compute be $C$, let
ideal parallel compute be $C/p$, and let all additional non-overlapped parallel
cost be $H$. Parallel execution wins when:

$$
C > \frac{C}{p} + H
\quad\Longleftrightarrow\quad
C\left(1-\frac{1}{p}\right) > H.
$$

Saved compute must exceed overhead. For $p=4$ and an illustrative $H=3$ ms,
the model requires `C > 4 ms`. At equality it merely ties. In real applications
$H$ changes with payload, output, workers, and load; serial preparation and
contention may need separate terms. There is no universal PJS byte threshold.
Kernel, transport, hardware, Node/V8, memory hierarchy, output size, and workload
concurrency all affect the crossing.

## Data movement belongs in the algorithm

Clone, transfer, and shared backing are different ownership strategies, not three
positions on a universal speed ranking. Clone produces separate ordinary data
without sender detachment. Transfer changes who may access selected backing,
but surrounding metadata and dispatch still have costs. Shared backing can remove
repeated backing-byte copies, but needs preparation and a stable-input or
synchronization contract. [Node's transport documentation](references.md#node-workers)
defines the mechanics; [PJS ADR 0005](../docs/adr/0005-transfer-ownership.md) and
[ADR 0007](../docs/adr/0007-shared-input-model.md) explain the current choices.

If every worker needs a common input, transfer may require preparing a separate
copy for each worker so the original remains reusable. Moving those copies does
not eliminate their construction. A shared input prepared once may instead
amortize that cost across many jobs. Compact disjoint transfers are another
legitimate algorithm when each worker only needs its own range.

The historical **v0.3** measurements used Node v24.13.1 on Linux
6.19.10-300.fc44.x86_64, AMD Ryzen 3 PRO 3300U, four available logical CPUs.
The one-worker round-trip probe alternated clone/transfer order, reused returned
buffers, excluded allocation/validation equally, and retained twenty samples per
mode after five warmups. The
[report](../docs/benchmarks-v0.3.md#clone-transfer-and-shared-results) and
[raw transport artifact](../benchmarks/results/transfer-v0.3.json) report:

| Payload | Clone median ms | Transfer median ms |
| ------- | --------------: | -----------------: |
| 1 KiB   |           0.204 |              0.288 |
| 8 MiB   |           9.232 |              0.655 |

The small transfer lost while the large transfer reduced round-trip time. These
are probe observations, not an end-to-end application crossover or a proof of
which internal substage caused the difference. Preparation excluded from this
probe would have to be included in a workload comparison.

On that same host and Node version, the standalone v0.3 16 MiB common-input range
sum gave another useful pair. With one worker and one execution, shared mode
took 20.556 ms versus clone's 13.886 ms. With four workers and five-iteration
reuse, per-iteration session medians were 63.262 ms clone, 35.254 ms transfer,
and 12.019 ms shared. Shared construction was included once and amortized over
the session. See the same report and
[raw shared sessions](../benchmarks/results/shared-v0.3.json). This evidence
teaches that avoiding repeated copies can matter while one-time construction can
still lose. It does not establish optimal range-sum partitioning: each task
received the full input; compact per-range transfers would be another workload.

## Hardware capacity is more than a core count

Workers compete for cache capacity, memory bandwidth, native allocation resources,
and sometimes shared-data coordination. A scan with little arithmetic per byte
can exhaust useful memory throughput before exhausting arithmetic capacity. More
workers then provide little benefit and may add pressure. To express the
bandwidth constraint simply, if $D$ bytes must pass through a bottleneck whose
effective aggregate bandwidth is $B$ bytes/s, then time is at least $D/B$ seconds.
“Effective” bandwidth and actual traffic must be measured; source array length
is not automatically memory-bus traffic.

The [Roofline paper](references.md#roofline) formalizes a related ceiling for
floating-point performance using compute capacity, bandwidth, and operational
intensity. Its lesson here is that adding computation resources cannot remove a
different bottleneck. This is introductory reasoning, not a fitted hardware
model for JavaScript.

In the v0.3 range-sum reuse benchmark on the stated Ryzen/Node host, shared mode
took 7.387 ms with two workers and 12.019 ms with four. The
[report](../docs/benchmarks-v0.3.md#unexpected-findings-and-remaining-bottlenecks)
and [artifact](../benchmarks/results/shared-v0.3.json) retain both rows.
Bandwidth, dispatch, and host contention are plausible contributors, but hardware
counters were not collected, so the experiment does not identify the cause.
Explaining an observed loss is a separate task from observing it.

**Oversubscription** occurs when runnable demands exceed the useful execution
capacity available to them. It can add context switches, disturb cache residency,
and increase contention or latency. OS thread switching is described in
[OSTEP](references.md#ostep); [LINUX-SMT](references.md#linux-smt) documents shared
resources among sibling hardware threads. Do not turn this into “one worker per
physical core always wins.” SMT, blocking intervals, native pools, nested native
threads, CPU restrictions, and application headroom complicate the policy. Node's
[parallelism estimate](references.md#node-parallelism) is an input to that choice.

The **v0.13** scrypt contention benchmark illustrates competing goals even without
an above-core-count worker sweep. On Fedora 44, the same Ryzen 3 PRO 3300U
(4 physical/4 logical), Node v24.13.1, default four-thread libuv pool,
N=16384/r=8/p=1, and 16 client jobs, two PJS workers delivered about
42.3 operations/s with filesystem probe p95 1.31 ms; four delivered about
66.0 with 7.62 ms. See the
[worker-count report](../docs/benchmarks-v0.13.md#worker-count-findings) and
[raw campaign](../benchmarks/results/crypto-v0.13-fedora-node24.json).
Reported throughput is a median across trials; reported filesystem p95 is a
median of per-trial percentiles, not a pooled percentile.
Counts above four were not tested in that campaign. Sparse finite probe samples
do not establish production tail guarantees or an oversubscription threshold.

## Crossover evidence that includes losing rows

The same v0.13 Fedora/Node campaign measured independent native SHA-256 jobs.
PJS used four workers and 16 logical jobs in flight, while the serial baseline
executed one job at a time. Six trials per cell retained throughput observations.
The [SHA report](../docs/benchmarks-v0.13.md#sha-results),
[measurement appendix](../docs/research/v0.13-crypto-measurements.md), and
[raw campaign](../benchmarks/results/crypto-v0.13-fedora-node24.json) give:

| Input per job | Serial ops/s | PJS clone ops/s | PJS shared ops/s |
| ------------- | -----------: | --------------: | ---------------: |
| 1 KiB         |      246,267 |          22,442 |           21,605 |
| 1 MiB         |        1,571 |           1,479 |            2,797 |
| 8 MiB         |          192 |             310 |              534 |

Tiny jobs lost substantially. At 1 MiB, shared beat the serial baseline while
clone still lost; at 8 MiB both beat serial throughput. These are throughput
comparisons under the stated concurrency, not individual request-latency speedups.
The tested shared/transfer crossover for SHA-256 lies between 64 KiB and 1 MiB,
not at a precisely inferred intermediate byte count. Warm fixed-input corpora,
finite bursts, host load, native implementations, and transport all limit
generalization. The task is native crypto inside JS workers, not a measurement
of a pure JS SHA implementation.

Historical pool comparisons also resist a single ranking. In **v0.3**, PJS and
Piscina **5.3.2** used the same prime-search kernel, N=1,000,000, 32 chunks,
fixed worker counts, matched message contents, fresh processes, two warmups, and
five retained samples on the stated Linux Ryzen/Node v24.13.1 host. Two-worker
medians were 217.957 ms PJS and 161.030 ms Piscina; four-worker medians were
140.646 ms and 181.678 ms. See the
[comparison report](../docs/benchmarks-v0.3.md#piscina-comparison) and
[raw artifact](../benchmarks/results/piscina-v0.3.json).

The ordering reverses. Library policy, transport, grain, kernel, and experimental
conditions all matter; this evidence does not establish the cause of each ratio
or a current RC1 ranking. Cancellation and failure semantics were not compared.
Repeating controlled sessions is more valuable than converting mixed rows into
a “winner” narrative.

## Measurement can change the apparent conclusion

Warmup matters because execution may change as code is compiled and optimized.
GC and allocation history change timing and memory. Frequency/thermal variation,
background load, process startup, measurement order, and outliers can change
which configuration appears faster. These are potential confounders, not a list
of causes established for every slow sample. A benchmark should retain raw
observations and an independent correctness check, state what timing includes,
and balance or alternate comparison order where practical.

The historical **v0.3** CPU investigation is valuable precisely because its first
answer did not survive better controls. On the same Linux Ryzen/Node v24.13.1
host, the initial one-worker prime-search N=1,000,000 comparison rose from
295.583 ms in the local v0.2 baseline to 574.878 ms in v0.3. The serial controls
also drifted; a large timing ratio was insufficient to identify a runtime defect.

Fresh-process baseline/candidate/candidate/baseline controls with retained samples
reduced that particular difference to about +2.0%. Other small/medium four-worker
rows reversed their earlier direction, and substantial variance remained. Read
the [investigation](../docs/benchmarks-v0.3.md#cpu-observations-and-regression-investigation),
[initial baseline](../benchmarks/results/cpu-v0.2-local.json),
[initial candidate](../benchmarks/results/cpu-v0.3.json), and
[alternating artifact](../benchmarks/results/cpu-regression-v0.3.json).

The warranted conclusion is that the initial large slowdown failed to reproduce
under those controls. It is not proof of zero overhead, and the experiment did
not isolate frequency, thermal, JIT, or GC contributions. A result that reverses
under better controls should not become a performance claim. Even a stable
median does not describe a population tail without enough suitable samples.

## What the model asks of PJS

PJS's current design makes CPU work and transport explicit, keeps workers
persistent, and bounds waiting work. These choices address identifiable cost and
resource questions; they do not guarantee favorable ratios. FIFO and batching
have a measured design history, while work stealing and elastic populations
remain alternatives to evaluate if evidence justifies their extra ownership and
lifecycle complexity. No algorithmic alternative discussed here authorizes a
runtime change.

Admission also changes the question from “how fast could this batch run alone?”
to “what happens under sustained offered load?” A larger queue can accept more
waiting work without raising service capacity, increasing delay and retention.
PJS result credits bound declared/actual visible binary result credit in their
defined domain; they do not bound scratch allocations, inputs, worker heaps,
process RSS, or consumer retention. The
[backpressure guide](../docs/guide/backpressure.md) and
[result-credit ADR](../docs/adr/0019-upper-bound-result-reservations.md) give current
contracts. Full queueing theory belongs in a later chapter.

For a new workload, compare equal correct work against direct serial, an
appropriate native async path, and warm/cold worker execution as needed. Include
preparation and results; vary grain, transport, and worker count; observe the
surrounding application's latency as well as compute throughput. Keep the losing
rows and state unmeasured conditions. The model is useful when it identifies a
testable question, not when it decorates a preselected conclusion.

## References and exercises

[AMDAHL](references.md#amdahl), [GUSTAFSON](references.md#gustafson),
[CMU-WORK-SPAN](references.md#cmu-work-span), and [ROOFLINE](references.md#roofline)
provide the theoretical foundations. The four historical evidence entries
[PJS-V03-TRANSPORT](references.md#pjs-v03-transport),
[PJS-V03-PISCINA](references.md#pjs-v03-piscina),
[PJS-V03-CONTROL](references.md#pjs-v03-control), and
[PJS-V13-CRYPTO](references.md#pjs-v13-crypto) record report/artifact scope.

1. Given `T1=800 ms` and `T4=260 ms`, calculate speedup and efficiency.
2. Given fixed-workload serial fraction 0.15 and eight ideal resources, calculate
   Amdahl speedup and its infinite-resource limit.
3. A warm four-worker model has 6 ms extra overhead. How large must useful serial
   compute be to win under ideal balance?
4. Why might a 64-byte task lose even when its compute is perfectly parallel?
5. Does the two-to-four-worker shared-scan loss prove memory bandwidth saturation?
6. Why is comparing shared execution-only time to clone session time invalid?
7. A parallel run has serial fraction 0.2 on four resources. Find its scaled
   speedup. Why is 0.2 not automatically the Amdahl serial-baseline fraction?

<details>
<summary>Solutions</summary>

1. `S(4)=800/260≈3.077`; `E(4)=3.077/4≈0.769`, or 76.9%.
2. `1/(0.15+0.85/8)=1/0.25625≈3.902`. The limit is `1/0.15≈6.667`.
3. `C(1-1/4)>6`, hence `C>8 ms`; equality only ties. Real imbalance or
   contention would change the condition.
4. Saved compute can be less than preparation, dispatch, metadata, and result
   costs. Payload size alone does not determine compute cost.
5. No. Dispatch, host load, and other effects could contribute; distinguishing
   them requires measurements this experiment did not collect.
6. It excludes construction on one side but includes recurring preparation on
   the other, answering different timing questions.
7. `4-(4-1)×0.2=3.4`. The fraction is measured against parallel elapsed time
   for the scaled workload; Amdahl uses serial time for a fixed workload.

</details>
