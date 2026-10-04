# References

This is the canonical bibliography for the first three chapters and glossary.
Identifiers are stable within this book. External sources were consulted on
**2026-10-04**. Living specifications and implementation pages can change; Node
API references below use the 24.x documentation, which identified itself as
v24.21.0 when consulted. That does not change the Node versions of historical
PJS experiments. Publication years are omitted for undated living documents.

## Specifications

### ECMA-AGENTS

Ecma International / TC39. _ECMAScript Language Specification_, living draft,
“Jobs and Host Operations to Enqueue Jobs,” “Agents,” and “Agent Clusters.”
[Execution contexts and agents](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html#sec-agents).
Used for execution contexts, serialized execution within an agent, and the
distinction between specification machinery and host threads. An agent is not
mandated to be a particular OS artefact.

### ECMA-MEMORY

Ecma International / TC39. _ECMAScript Language Specification_, living draft,
“Memory Model,” particularly “Data Races,” “Data Race Freedom,” and “Shared Memory
Guidelines.” [Memory model](https://tc39.es/ecma262/multipage/memory-model.html#sec-memory-model).
For the glossary's atomic-operation terminology, also see
[the Atomics object](https://tc39.es/ecma262/multipage/structured-data.html#sec-atomics-object).
Used for shared-memory terminology and the need to coordinate conflicting
accesses. The glossary gives an introductory description, not a substitute for
the specification's event-level definition.

### HTML-CLONE

WHATWG. _HTML Standard_, living standard, “Safe passing of structured data,”
including structured serialization, deserialization, and transfer.
[Structured data](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data).
Used because Node explicitly describes its messaging in terms of this model;
this does not import the browser event loop into Node.

## Runtime and operating-system implementation sources

### NODE-WORKERS

Node.js contributors. _Node.js 24.x API documentation: Worker threads_.
[Worker threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html).
Sections used: opening CPU-work/pool guidance, `port.postMessage()`,
ArrayBuffer/view transfer considerations, `Worker`, worker events, resource
limits, and `worker.terminate()`. Supports parallel JS workers, separate
environments, transport semantics, and lifecycle; no universal speedup promised.

### NODE-LOOP

Node.js contributors. _The Node.js Event Loop_, Node.js Learn.
[Event loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick).
Used for callback dispatch, poll/readiness, timer thresholds, and the distinction
between a callback running and the loop handling other events. Detailed phases
are deliberately outside the introductory chapter's scope.

### NODE-BLOCKING

Node.js contributors. _Don't Block the Event Loop (or the Worker Pool)_, Node.js
Learn. [Blocking and offloading](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop).
Sections used: summary, worker-pool API list, event-loop blocking, partitioning,
and offloading. Supports the specific filesystem, DNS, crypto, and zlib examples.

### LIBUV-DESIGN

libuv contributors. _Design overview_, libuv 1.x documentation.
[Design overview](https://docs.libuv.org/en/v1.x/design.html).
Used for loop/thread relationships, network I/O polling/completion, and
filesystem operations. The loop is associated with a thread; it is not a pool
for executing arbitrary JS callbacks in parallel.

### LIBUV-POOL

libuv contributors. _Thread pool work scheduling_, libuv 1.x documentation.
[Thread pool](https://docs.libuv.org/en/v1.x/threadpool.html).
Used for the default four threads, `UV_THREADPOOL_SIZE`, pool sharing across
event loops, work execution, and callback delivery to the submitting loop.

### V8-EMBED

V8 project. _Getting started with embedding V8_.
[Embedder guide](https://v8.dev/docs/embed).
Used for the distinction between an isolate with its own heap and contexts
within an isolate; not a claim of OS process isolation.

### NODE-PARALLELISM

Node.js contributors. _Node.js 24.x API documentation: OS_,
`os.availableParallelism()` and `os.cpus()`.
[OS API](https://nodejs.org/docs/latest-v24.x/api/os.html#osavailableparallelism).
Used for the estimate of default parallelism and why CPU enumeration is not a
workload optimum.

### NODE-MEMORY

Node.js contributors. _Node.js 24.x API documentation: Process_,
`process.memoryUsage()`.
[Memory usage](https://nodejs.org/docs/latest-v24.x/api/process.html#processmemoryusage).
Used for RSS versus V8 heap measurements, process-wide RSS with workers, and
the limits of heap-only reasoning.

### LINUX-SMT

Linux kernel contributors. _Core Scheduling_, Linux kernel documentation.
[Core scheduling](https://www.kernel.org/doc/html/latest/admin-guide/hw-vuln/core-scheduling.html).
Opening discussion used only to support shared hardware resources among sibling
hardware threads. Its security-specific core-scheduling mechanism is not a PJS
policy and is not needed to understand these chapters.

## Academic and educational sources

### OSTEP

Remzi H. Arpaci-Dusseau and Andrea C. Arpaci-Dusseau. _Operating Systems: Three
Easy Pieces_, online edition, version 1.10.
[The abstraction: the process](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-intro.pdf)
and [Concurrency: an introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-intro.pdf).
Used for address spaces, threads, context switching, and interleaved execution.
These are textbook models, not a specification of every OS.

### CMU-WORK-SPAN

Carnegie Mellon University, course 15-210. _Overview and Introduction_, lecture
notes in the Fall 2026 course materials.
[Introduction notes](https://www.cs.cmu.edu/~15210/notes/01-introduction.pdf).
Used for work/span analysis and the processor/time lower bounds. The URL is a
living course resource; numerical dependency examples in the book are original.

### AMDAHL

Gene M. Amdahl. _Validity of the single processor approach to achieving large
scale computing capabilities_. AFIPS Spring Joint Computer Conference, 1967,
pp. 483–485. [DOI: 10.1145/1465482.1465560](https://doi.org/10.1145/1465482.1465560).
[Accessible original paper at CMU](https://www.cs.cmu.edu/~18742/papers/Amdahl1967.pdf).
The original paper's serial-overhead argument was read in the CMU copy; the
publisher endpoint denied access. The chapter derives the familiar normalized
equation rather than claiming the original paper printed that exact notation.

### GUSTAFSON

John L. Gustafson. _Reevaluating Amdahl's law_. Communications of the ACM 31(5),
1988, pp. 532–533. [DOI: 10.1145/42411.42415](https://doi.org/10.1145/42411.42415).
[Accessible paper at CMU](https://course.ece.cmu.edu/~ece600/fall16/references/gustafson.pdf).
Used for fixed-size versus scaled-size reasoning and the parallel-run serial
fraction. The paper credits E. Barsis for the alternative scaled formulation.

### ROOFLINE

Samuel Williams, Andrew Waterman, and David Patterson. _Roofline: An Insightful
Visual Performance Model for Multicore Architectures_. Communications of the ACM
52(4), 2009. [DOI: 10.1145/1498765.1498785](https://doi.org/10.1145/1498765.1498785).
[Institutional record and accessible manuscript](https://escholarship.org/uc/item/78h8v7mr).
Used for the computation/bandwidth ceiling and operational intensity. The
deposited manuscript has an expanded title mentioning floating-point programs.
The chapter does not fit a Roofline model to PJS data or infer hardware counters.

## PJS evidence

PJS project reports are repository primary evidence with their own experimental
limitations. Dates and environments below come from the reports/artifacts;
milestone labels are not the current public contract. ADR and guide links in
chapters are design/contract navigation, not additional benchmark sources.

### PJS-V03-TRANSPORT

PJS. _v0.3 technical report: reusable shared inputs_, 2026-09-27, Node v24.13.1,
Linux 6.19.10-300.fc44.x86_64, AMD Ryzen 3 PRO 3300U, four available logical CPUs.
[Report](../docs/benchmarks-v0.3.md#clone-transfer-and-shared-results),
[raw transport](../benchmarks/results/transfer-v0.3.json),
[raw shared-input sessions](../benchmarks/results/shared-v0.3.json).
Used for contrasting payload sizes, preparation amortization, and worker counts.

### PJS-V03-PISCINA

PJS. Same v0.3 report and host; comparison with exact Piscina 5.3.2.
[Report](../docs/benchmarks-v0.3.md#piscina-comparison),
[raw comparison](../benchmarks/results/piscina-v0.3.json).
Used for mixed prime-search results, not a general library ranking.

### PJS-V03-CONTROL

PJS. Same v0.3 report and host; alternating baseline/candidate control.
[Report](../docs/benchmarks-v0.3.md#cpu-observations-and-regression-investigation),
[initial local baseline](../benchmarks/results/cpu-v0.2-local.json),
[initial candidate](../benchmarks/results/cpu-v0.3.json),
[alternating control](../benchmarks/results/cpu-regression-v0.3.json).
Used for the failure to reproduce the initial one-worker slowdown and remaining
variance. It does not establish zero overhead.

### PJS-V13-CRYPTO

PJS. _PJS v0.13 — real-world hashing and crypto evaluation_, campaign 2026-10-02,
Fedora 44, AMD Ryzen 3 PRO 3300U (4 physical/4 logical), Node v24.13.1,
V8 13.6.233.17-node.40, default libuv pool of four.
[Report](../docs/benchmarks-v0.13.md),
[measurement appendix](../docs/research/v0.13-crypto-measurements.md),
[raw campaign](../benchmarks/results/crypto-v0.13-fedora-node24.json),
[harness methodology](../benchmarks/real-world/crypto/README.md).
Used for SHA workload crossover, scrypt/filesystem interference, and the
throughput/latency tradeoff. The report discusses finite probes and sparse tail
samples; later cross-platform evidence is separate, not silently pooled here.

### PJS-RC1

PJS. _v1.0.0-rc.1 readiness_ and associated qualification reports, inspected at
the book's starting commit on 2026-10-04.
[Readiness](../docs/research/v1-rc1-readiness.md),
[Linux validation](../benchmarks/results/validation-v1.0.0-rc.1-linux.json),
[Windows validation](../benchmarks/results/validation-v1.0.0-rc.1-windows.json).
Used for version/platform awareness only. Qualification is not a performance
comparison, and it does not establish macOS or ARM64 support.
