# The Science of PJS

PJS is an engineering project built on decades of work in concurrency, parallel
computing, operating systems, scheduling, memory models, and performance analysis.
This book explains those foundations from first principles and connects them to
decisions in a real Node.js runtime. You do **not** need PJS to learn from it.
PJS is the running engineering case study, not the source of the science.

The intended readers are students, backend and JavaScript developers, systems
programmers, runtime engineers, and PJS contributors. Basic programming knowledge
is enough to begin; no specialization in parallel computing is assumed. Intuition
comes before machinery and mathematics. Equations answer specific engineering
questions, and exercises include solutions.

## Reading paths

The beginner path is:

1. [Concurrency, Parallelism, and Computation](01-concurrency-parallelism-and-computation.md): distinguish overlapping activities from simultaneous execution, then reason about dependencies.
2. [How Node.js Actually Executes JavaScript](02-how-node-executes-javascript.md): locate computation, waiting, heaps, and communication in the whole process.
3. [The Cost Model of Parallelism](03-the-cost-model-of-parallelism.md): derive limits, account for overhead, and interpret retained experiments.

Keep the [glossary](glossary.md) beside you. Mathematics uses GitHub-compatible
`$$` display blocks; adjacent prose or plaintext gives the same calculation.

For systems readers and contributors, begin with the
[architecture](../docs/architecture.md) and [stability policy](../docs/stability.md),
then read these chapters selectively. Follow a scientific concept to its ADR,
then to its user guide and measured evidence. For example, shared backing leads
to [ADR 0007](../docs/adr/0007-shared-input-model.md), the
[ownership guide](../docs/guide/memory-ownership.md), and the
[v0.3 report](../docs/benchmarks-v0.3.md).

## What belongs where

| Area                      | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `science/`                | Principles, derivations, explanatory examples, and their limitations. |
| `docs/` and `docs/guide/` | Current product behavior and how to use it.                           |
| `docs/adr/`               | Decisions, alternatives, consequences, and revisit conditions.        |
| `docs/research/`          | Investigations tied to a milestone and its environment.               |
| `benchmarks/`             | Reproducible harnesses and retained raw observations.                 |

Current PJS descriptions here refer to the **1.0.0-rc.1** architecture inspected at
commit `6429357769545f1992e8344df006626cd6fc9a79`. This is a documentation baseline,
not a new contract or a declaration that experimental APIs are stable. The
[RC readiness report](../docs/research/v1-rc1-readiness.md) records qualification
boundaries. A historical v0.x measurement keeps its original version and scope.
No new experiment was run for this book, and no runtime change follows from it.

## How we make claims

The [canonical bibliography](references.md) records source titles, verified
metadata, URLs, sections used, and access details. Chapter links identify the
entry supporting the nearby claim; chapter reference sections explain what to
read. Definitions in the glossary use those same sources. Our conventions for
terms such as concurrency are stated explicitly because terminology differs
across literature.

We distinguish five kinds of statement:

- **Specification guarantee:** what ECMAScript or another relevant standard defines, with its scope preserved.
- **Implementation detail:** what Node, V8, or libuv documents for the cited version; it may change.
- **Mathematical model:** a deduction under stated assumptions, not a measured runtime promise.
- **PJS design choice:** what current code and its ADR choose, not a universal best practice.
- **Empirical observation:** what a retained experiment found on its stated host, version, workload, and timing boundary.

Prefer specifications, primary implementation documents, original papers,
established textbooks or university material, then PJS experiments for local
claims. Use secondary explanations only when necessary. Read the relevant
sections rather than citing a related title. Do not invent metadata or imply
that an inaccessible source was read; provide an accessible primary copy when
available. Links to living sources carry an access date and version where known.
Keep original prose and diagrams; use short quotations only when needed.

A numerical PJS claim should link its human-readable report and raw artifact.
Preserve losses, controls, outliers, platform limitations, and uncertainty. A
local benchmark is evidence about that experiment, not a theorem. If controls
reverse a result, revise the claim. Lack of a reproducible regression does not
prove zero overhead.

## Engineering principles

Measure before optimizing: first identify where time and memory go, then test
a change against the same useful work. Performance claims require controls
because changes in warmup, measurement order, and host conditions can imitate an
implementation effect.

Bound resources explicitly. A queue stores work waiting for capacity; it does
not create capacity. State the resource domain: a task-count limit and a result
byte-credit limit do not bound process RSS. More workers are a resource policy,
not an automatic improvement: other application work still needs CPU and memory.

Data movement is part of the parallel algorithm. Include preparation, messaging,
and output assembly when comparing strategies. Shared backing can avoid repeated
copies, but construction still costs something and mutation introduces a
synchronization responsibility.

Separate logical completion from physical execution. Resolving or rejecting a
caller does not by itself interrupt a computation or undo its effects. Resource
ownership must follow the work that is actually still running. These principles
are developed in the chapters and the linked ADRs, not assumed as slogans.

PJS did not invent worker pools, backpressure, Amdahl's law, shared memory,
queueing theory, structured clone, transfer semantics, or parallel partitioning.
It combines established ideas into one bounded Node runtime design. The reader
should be able to evaluate that design, including choosing a different one.

## Roadmap for later review

Only chapters 01–03 exist in this milestone. Subject to human review of their
tone, depth, citations, and accessibility, later material could cover:

| Proposed chapter | Focus                                                   |
| ---------------- | ------------------------------------------------------- |
| 04               | Partitioning, grain size, and load balance.             |
| 05               | Work, span, and scaling beyond the introductory models. |
| 06               | Scheduling and bounded admission.                       |
| 07               | Data movement and ownership.                            |
| 08               | Shared memory, Atomics, and memory models.              |
| 09               | Queueing theory and backpressure.                       |
| 10               | Streaming producer/consumer systems.                    |
| 11               | Cancellation, timeouts, and physical execution.         |
| 12               | Failure models and worker recovery.                     |
| 13               | Measuring parallel systems correctly.                   |
| 14               | Deriving the PJS architecture.                          |
| 15               | Open problems and future research.                      |

These are proposed topics, not additional files or authorized runtime features.
