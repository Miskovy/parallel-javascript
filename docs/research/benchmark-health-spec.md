# Development benchmark and public API campaign

Specification fixed before retained performance execution, 23 October 2026.
The maintainer explicitly approves **P1, P2 and P3**. Benchmark acceptance
remains subject to review. This campaign prepares an unapplied promotion patch;
it does not authorize publication or change separately tracked release holds.
All six deprecated aliases remain. C4 and Stage F/G retain their separate gates.

## Baseline and provenance

Verified remote main: `9dec3ba422b1649d478ae520439a1a70dc34b8c8`, tree
`5b3b0e03fddffb96e3859c986aceaec6416d9673`. PR #30 is merged at that
commit; its head remains `cf6068b9692a036654338b7ce7c0097b8ae801a9`.
PRs #24–30 integrate B4, the C plan, C1 acceptance, C2/C3 transitions,
post-C3 guidance and floor qualification. No applicable AGENTS.md was found
in the workspace ancestry or tracked source. An isolated worktree preserves
the original checkout, untracked assets and previous evidence.

Every execution records its real clean source SHA/tree, Node executable hash,
Node/V8/npm, both locked compilers, CPU/topology, available parallelism, OS,
memory, power observations and host load. Build and pack both clean trees with
the same executing Node/npm. Install the actual tarballs offline into fresh
unrelated temporary consumers. Record SHA-256, reject links, and compare the
host and worker root-module resolution with that installation. Copy benchmark
code into the consumer; worker tasks import its installed package root.
Historical next/latest resolution and repository package links are prohibited.

## Workload plan and bounds

The executable configuration is `benchmarks/current-development/config.mjs`.
Use seed `20261023`, workers 1 and min(4, availableParallelism), at most four
workers per pool, one active benchmark child and at most 512 MiB declared
payload allocation. Skip before allocation if free memory is below 1 GiB.
No power, OS, dependency or toolchain installation changes are part of a run.

Cover prime counting (independent sieve), integer matrix multiplication
(independent loop order), clone/transfer/shared scans (arithmetic oracle),
partition boundaries/skew, dispatch 1/4/16, completion and shared output,
generic/typed mapping, count/exact/upper streams, zero and nonzero bytes,
capacities 1/4, fast/2 ms consumers, refunds, mixed fairness, a stream-to-run
pipeline, raw-deflate round trips, SHA/AES/scrypt and feature-detected optional
Argon2/bcrypt, and flagship aggregate/distribution Monte Carlo kernels.
Empty/tiny/medium/large sizes and uneven grains are selected axes, not a full
Cartesian product. All declared cases and skips remain in the receipts.

Use existing locked Piscina 5.3.2 for equivalent CPU/matrix controls. Native
crypto capability is detected without adding runtime dependencies. Historical
private profiling/held-credit controls remain diagnostics; they do not supply
public acceptance. No production hooks or implementation overrides are added.

## Execution and acceptance

Run suites sequentially in fresh child processes. For each configuration use
baseline/candidate/candidate/baseline order (ABBA), one first execution, one
warmup, three warm samples per child, normal GC and a 120 s child watchdog.
Record construction/readiness separately as cold startup. Serial controls use
the same kernel, partitions, outputs and useful work, including preparation,
copies, dispatch, result transport and assembly within the timed operation.
Validation/oracle construction and fault injection are outside timed samples.
Record every sample, warmup, first execution, error, order and configuration.
No discarded outliers, forced GC, shortened work or silent green replacement.

Correctness acceptance requires all declared outputs, cardinality, ordering,
transfer detachment, capacity/refund counters, caller settlement and completed
cleanup. Existing deterministic contract tests, installed JS/emitted TS
consumers, both compiler fixtures and unchanged standard R2/R3 supply focused
lease/deadline/restart/shutdown/physical-ownership evidence outside throughput.
Failed, skipped, missing, unavailable and accepted cases remain distinct.

Performance reports wall latency/throughput, process CPU, main-isolate heap,
process RSS sampled every 10 ms, external/arrayBuffers, visible result credits,
event-loop delay/utilization and timer drift. Sampled RSS can miss short peaks;
heap excludes worker isolates; credits do not limit total process memory or
backing-store retention. Instrumentation runs equally for both versions.

Predeclared assessment: use medians and coefficient of variation. A candidate
slowdown above 15% **and** 2 ms, with each arm CV <= 0.15 and both paired ABBA
comparisons slower by at least 10%, is a regression signal requiring a bounded
second ABBA block. Report a reproducible regression only if the second block
also signals; retain noisy or conflicting outcomes as inconclusive. At most
one additional block per signalled case; never tune tolerances to results.
For measurements below 2 ms report overhead without a regression verdict.
Pilot results are marked pilot and cannot count as retained acceptance.
Winning against serial or Piscina everywhere is not required. Report observed
crossover points only within measured sizes; CI timing is smoke evidence.

## Qualification scope

Required functional matrix: Linux/Windows x64 × Node **22.13.0, 24.0.0,
24.22.1**. The current 24 patch is deliberately pinned after checking the
official latest-v24 checksum index, not inferred from the floating selector.
Performance covers 22.13.0 and 24.22.1 on each available OS; 24.0.0 needs API
health and ordinary standard qualification. Local 24.21.0 may be used for a
labelled pilot only. Unavailable hosts remain unqualified for that scope.
Shared CI runners supply functional qualification and performance observations,
not stable hardware guarantees. Run the unchanged ordinary qualifier and
standard R2/R3 for the final clean candidate; retain raw child evidence and
independently reconcile source, tools, archives, outcomes and confirmed exits.

Every run creates a new directory and refuses reuse. Evidence stays under
ignored `.node-tools/` or an explicitly chosen external directory; every
retained file is hashed in a manifest. A final documentation-only head may
reuse execution only after explicit equality of runtime, declarations,
package and harness inputs; record original execution SHAs without relabeling.

## Commands

After building both clean trees, run the new runner via npm with
`--baseline=/absolute/clean/baseline --output=/absolute/NEW/directory`.
The runner and its README provide the exact command and profile interface.
Run `npm run runtime:qualify -- --release-npm-cli=/absolute/pinned/npm-cli.js
--output=.node-tools/NEW/ordinary.json` for ordinary and standard R2/R3 checks.
The coverage matrix maps every public root and executable family to commands
and receipt paths. The engineering report records actual outcomes and limits.
