# Choosing useful CPU work

The retained [v0.13](../cross-platform-v0.13.md) and
[v0.14](../cross-platform-v0.14.md) evidence supports specific principles, not a
universal speedup or byte threshold. Tiny work loses to transport/orchestration;
coarse work can amortize those costs. No v0.15 performance campaign is needed
when runtime source is unchanged.

## Find your crossover

1. Compare the same useful work and output against serial and the library's native
   async path, where one exists. Verify outputs outside timing.
2. Measure startup separately from a warm persistent runtime. Include input
   preparation, clone/transfer/recycling and output consumption fairly.
3. Sweep explicit job/grain sizes and workers with bounded offers. Retain repeated
   trials and variability; do not infer p99 from a handful of timing samples.
4. Measure application headroom too: event-loop delay, filesystem response,
   memory and CPU. A throughput gain may hurt the surrounding application.

The crossover depends on the task body, ownership path, native implementation,
machine and consumer. There is no universal “above 1 MiB” rule. Reusing shared
input and moving buffers can change transport cost; neither erases task overhead.

## Workers are a resource policy

More workers can increase compute throughput and also increase memory pressure,
timer tails, cache contention and filesystem latency. availableParallelism() is
an availability estimate, not proof that using that many workers is best. SMT
logical threads share physical execution resources; the retained Intel system
had four physical/eight logical CPUs, while the Fedora AMD system had four/four.
These different topologies do not establish a universal worker ratio. Leave
measured headroom for the host, I/O, other processes and native threads.

PJS selects a fixed population. Its min/max settings are construction bounds, not
automatic resizing. Explicit batch/grain settings remain application choices.
Queue depth absorbs bursts; once compute saturates, a deeper queue mostly adds
waiting and can worsen p95/p99. See [backpressure](backpressure.md).

## Dedicated compute isolation recipe

A latency-sensitive Node application can run a synchronous native CPU-heavy
function in a registered PJS task, keeping its own event loop available and
avoiding submission of that call to the application's shared libuv pool. The
[range example](../../examples/range-work.mjs) includes a trusted
synchronous native hash task to demonstrate the pattern, not a crypto API.

The v0.13 scrypt research demonstrated this resource separation under contention.
It still competes for CPU, memory, cache and system resources. Native libraries
may create their own threads; workers × native parallelism can oversubscribe
the host. Node/library builds differ, and a healthy native async baseline can be
better. Do not copy crypto research settings as security recommendations.

## When not to use PJS

Avoid tiny transforms, ordinary network/database/filesystem I/O, single cheap
native calls, and tasks whose native async path already meets application needs.
Do not use deep queues as pretend compute capacity. An independent-block range
pipeline does not preserve one continuous compression context; choose the codec
semantics your application requires. No new convenience API is needed to avoid
these mismatches.
