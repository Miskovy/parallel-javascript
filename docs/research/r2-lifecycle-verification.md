# R2: deterministic lifecycle model and adversarial verification

R2 adds verification machinery, without changing runtime source, public APIs,
dependencies, versions or release semantics. It preserves the R1A physical
completion boundary and the experimental R1 containment contract. It does not
constitute exhaustive formal verification of arbitrary Node interleavings.

## Baseline and audit

Remote `main` and the clean local checkout were verified as
`a51ee70b2be16e473448b14a40eb51bd4b76da5e`, PR #15's merge commit, before
creating `runtime/r2-model-based-lifecycle-verification`. Any subsequent remote
change must be recorded in the PR qualification record; it is not silently adopted.
The historical RC4 freeze, RC evidence and release-publishing infrastructure are
unchanged. Ordinary runtime development qualification is separate from RC4.

The audit inspected the runtime facade, task coordinator, dispatcher, pool,
worker/protocol, credit manager, range/stream coordinators and telemetry; the
containment, physical-boundary, result-credit, upper-bound and stream tests; the
architecture, ADR 0021, lifecycle guide and R1 engineering log; and the contract
runner, runtime qualifier, RC soak and CI workflow.

| Existing evidence                      | Covered boundary                                                             | R2 challenge                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Containment clocks and held exit gates | Lease token identity, error/exit deduplication, restart boundary, escalation | Compose with queued cancellation, timeout, duplicate error, late result and replacement readiness |
| Physical-boundary regressions          | Posting claim, invalid batch response, delayed physical completion           | Independent expected ownership after every generated action                                       |
| Credit and upper-bound tests           | Reservation, reconciliation, delivery, cancellation, abnormal exit           | Compare exact per-owner balances and refunds in stream batch histories                            |
| Stream tests and RC soak               | Consumer return, deadlines, capacity, teardown                               | Combine stream abandonment with protocol failure and delayed exit                                 |
| Runtime qualifier and contract runner  | Sequential gates, per-file 30-second budget, platform matrix                 | Small smoke corpus; separate bounded standard campaign and retained histories                     |

The existing containment helper supplies clocks, exit gates, polling watchdogs
and cross-owner checks. R2 reuses these rather than creating another timer or
termination framework. Expected worker ownership, outcomes, credits, dispatch
counts, restart decisions and shutdown behavior can be calculated independently.
Private emitted-JS records provide narrow test-only inspection: task maps, FIFO
size, dispatcher admission claims, worker correlations/lease tokens, repair
promises, credit owners, stream buffers/waiters, timer handles and abort listeners.
No public mutable inspection API is added.

Actual Worker termination, unexpected exit, infinite CPU execution, timer delivery,
module bootstrap and Node result transport require real-worker validation.
Synthetic protocol delivery cannot prove those Node boundaries on its own.

## Model and controller

[The model](../../packages/runtime/test/helpers/lifecycle-model.mjs) is
`r2-model-1`; [the generator](../../packages/runtime/test/helpers/lifecycle-generator.mjs)
is `r2-generator-1`. The model imports no production code. Its rules derive from
the [lifecycle contract](../guide/lifecycle.md),
[architecture](../architecture.md) and [ADR 0021](../adr/0021-physical-execution-containment.md).
It independently predicts FIFO ownership, first caller outcome, credit retention,
rolling-budget age boundaries and one-way shutdown. A failure requires classifying
the discrepancy as a runtime defect, model error or invalid injection; passing
production invariant scans alone is not an oracle.

| Dimension    | Abstract states / distinction                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | created, starting, running, stopping, stopped, failed                                                                                           |
| Logical task | queued, scheduled, running, settled; outcome completed/failed/cancelled/timed_out                                                               |
| Physical     | not posted, posting, occupied, termination requested, completion observed, exit confirmed; ended by validated result or exit                    |
| Worker       | starting, idle, busy, failed, stopped; fresh identity per replacement; live until Node exit                                                     |
| Credit       | absent, reserved, dispatching, dispatched, caller settled, execution ended, reconciled/buffered, released; exact and upper-bound modes distinct |
| Recovery     | unexpected failure, budget consumed, termination pending, exit confirmed, replacement spawned/ready, exhaustion/fatal                           |
| Shutdown     | graceful drain, forced shutdown, exit waiting, completed, failed termination; intent differs from confirmation                                  |

Posting is an atomic abstract action with explicit intermediate ownership checks
inside synchronous clone. The model records posting transitions; the controller
checks the actual posting claim before and during reentrant getters. Admission,
post failure, synchronous cancellation and successful posting have different
expected final ownership. Exactly-once checks instrument actual resolve/reject
calls, since native Promise assimilation alone would hide duplicate invocations.
Public ordinary-task promises are also observed independently, including error
class and task/worker identity.

[The runner](../../packages/runtime/test/helpers/lifecycle-runner.mjs) uses actual
PJS host objects with real bootstrap and exit. It holds readiness notifications,
intercepts per-instance postMessage, performs Node structuredClone (including
getters), and delivers selected host protocol events. Application computations
are not posted to these controlled threads. Worker exits use the existing held
termination gates and are confirmed by actual Node exit events. Replacement
readiness remains a separate action. Neither global timers nor the global Worker
constructor is replaced. OS thread scheduling is outside the controller.

Caller timeout actions deliver the task coordinator's timeout settlement boundary
directly; they do not claim to test Node timer wiring. Separate real-worker
histories exercise actual caller and lease timers. Lease, restart-window and
shutdown clocks are per-owner monotonic controls. A stale lease callback can be
invoked after cancellation of its timer, including during a later execution.
Wrong or malformed protocol messages are explicitly fault injections.

## Actions, invariants and coverage

The action vocabulary includes construction/readiness, ordinary submission
(leased or unleased), startup queueing, cancellation, timeout delivery, start,
valid success/task failure, malformed protocol/error injection, lease expiry,
stale lease/result/exit callbacks, confirmed exit, replacement readiness,
bootstrap failure, rolling-window advancement, binary stream batch admission,
delivery/abandonment, graceful/forced/concurrent shutdown, escalation and
termination rejection. Preconditions reject nonexecutable deletion candidates
before allocating workers. Normal results require posted, started executions.
Range/stream histories remain unleased.

The fixed corpus guarantees important race prefixes; seeded suffixes choose
enabled actions, rather than arbitrary invalid API calls. Configurations cover
1/2/4 workers, queue limits 0/1/3, leases and omission, lifetime and rolling
budgets. Restart records expire at age >= 100 controlled milliseconds.

[The oracles](../../packages/runtime/test/helpers/lifecycle-oracles.mjs) compare
model predictions with normalized public observations and narrowly inspected
ownership. UUIDs, thread IDs, durations and memory samples are excluded from
deterministic semantic comparisons. I1–I9 cover physical ownership, physical
population, caller settlement, credit conservation, posting ownership, restart
accounting, stale-event isolation, shutdown monotonicity and no replay. I10 checks
quiescence: tasks, FIFO, physical correlations, reservations, operation records,
repair promises, admission claims, production ticks, timers, listeners and stream
waiters. Exceptional termination histories must reject shutdown while retaining
physical ownership, then explicitly terminate test-owned threads for cleanup.

Coverage reports count runtime/action edges and logical, physical, worker, credit,
recovery and shutdown state edges. These are observed coverage counts, not a proof
that every possible edge or combination is covered. Invariant counts refer to
action checkpoints; the final and cleanup scans add quiescent evidence.

Negative-detection tests mutate observed snapshots from a controlled runtime to
report premature physical completion or duplicate resolve/reject invocation.
They must fail I1/I3 and still clean up. Separate observation doubles demonstrate
excess population and stale-lease counter divergence. No deliberate fault is
introduced into production source. A bounded deletion reducer retains only
valid, closed histories reproducing the same invariant identifier. The negative
settlement test demonstrates successful reduction and replay.

## Profiles and reproduction

| Profile  | Seeds                          | Cases per seed | Generated suffix bound |
| -------- | ------------------------------ | -------------- | ---------------------- |
| Smoke    | 123456                         | 18             | 6 actions              |
| Standard | 7, 42, 123456                  | 54             | 16 actions             |
| Extended | 12 explicit seeds in generator | 72             | 32 actions             |

Smoke and negative-detection tests run in the existing contract runner, without
changing its 30-second timeout. Local Linux Node 24 development measurements were
about 3–4 seconds for the smoke/oracle file and 2 seconds for real workers. The
standard campaign took about 28 seconds before final qualification. CI evidence
records actual elapsed time on each supported cell; no Windows duration is
inferred from Linux. Extended runs are manual, outside the per-file runner.

```bash
npm run test:contracts
npm run test:r2 -- --output=.node-tools/r2/my-new-standard-run
npm run test:r2:replay -- --seed=123456 --case=0 --profile=smoke
npm run test:r2:replay -- --history=.node-tools/r2/my-run/seed-7-case-0.minimized.json
npm run test:r2:extended -- --output=.node-tools/r2/my-new-extended-run
```

Use the same source revision, generator version, profile, seed and case ID.
Existing report directories refuse overwriting; default runs allocate new ignored
directories under `.node-tools/r2`. Original histories are saved before execution.
Failure artifacts retain the ordered actions, configuration, expected/actual
observations, first invariant, replay command and bounded reduction. History-file
replay also supports reduced sequences. Every standard campaign repeats one
history and compares its entire normalized observation sequence.

Reports identify source commit, dirty-tree status, exact Node version (including
resolved Node 24), OS/architecture, model/generator version, corpus, counts,
coverage, checks, failures, reductions, real-worker results, cleanup and memory
diagnostics. Memory high-water marks are diagnostic; RSS need not return to its
initial value. CI uploads R2 artifacts with `always()` for each Linux/Windows x64
Node 22.13.0/24 cell. The runtime qualifier validates the R2 report's revision and
platform, or runs a fresh standard campaign itself.

## Real-worker evidence and limits

Eight focused scenarios cover infinite CPU lease containment, logical timeout
before expiry, both final-response/lease callback orders, unexpected exit,
two overlapping lease failures in four workers, rolling-window recovery,
graceful-to-forced shutdown with held exit and repeated create/teardown. They use
watchdogs and explicit cleanup. Callback order is selected using host controls;
CI does not rely on winning an improbable natural race.

No runtime defect was confirmed during the development corpus. Harness corrections
included normalizing terminal task statuses and rejecting unterminated reducer
candidates before execution; the latter could otherwise await an unsettled caller.
Generated events were retained, rather than suppressed to obtain passing results.
Any later confirmed runtime defect must be disclosed with its original and minimized
history and a permanent regression.

Known gaps include native-call termination latency, process/OOM failure, arbitrary
OS interleavings, unbounded parent production, every stream/deadline/factory
permutation, every malicious protocol shape, and allocator leak inference. Existing
R1/R1A/stream regressions retain broader hand-authored boundary coverage. Generated
binary streams use one bounded physical batch, with full delivery or abandonment;
they do not model every multi-operation credit fairness schedule. No unsupported
range execution lease is injected. Nondeterministic OS evidence must be labeled
as such, rather than assigned a false deterministic replay guarantee.

The milestone is qualified only after all existing gates and all four supported
CI cells pass for the reviewed candidate. The PR and machine-readable artifacts
are the qualification record; an unrun or failed mandatory gate means R2 is not
yet qualified.
