# R3: memory ownership and resource lifecycle qualification

R3 qualifies logical resource ownership independently of memory observations.
It is ordinary runtime development, not a modification of the immutable RC4
publication or historical qualification evidence. No total-process memory
guarantee follows from bounded queues, result credit, or this campaign.

## Preflight and ownership inventory

Before experiments, the clean local `main`, `origin/main`, and GitHub `main`
all resolved to `6d9f97457c6490c985bf1023d918fff72a428c0e`. It is the R2
merge and contains R1. Baseline CI [38170295900](https://github.com/Miskovy/parallel-javascript/actions/runs/38170295900)
completed successfully. Development uses `runtime/r3-memory-resource-lifecycle`.

The audit covered runtime composition, task/transfer/shared ownership,
dispatcher/FIFO, pool, worker/bootstrap, result credit, range/stream coordination
and telemetry. It inspected containment, physical-boundary, result-credit,
upper-bound, transfer, shared, memory-observability and model-lifecycle evidence;
reservation/RC soaks, R2 campaign, contract runner, runtime qualifier and CI;
memory/backpressure/lifecycle/telemetry guides, ADR 0021 and the R2 report.

The following inventory was recorded before implementing R3 experiments.
Inspection refers to emitted private JavaScript fields in tests, never a new
public inspection API. Application retention is independent of these owners.

| Resource / initial owner                              | Retention point                                                                  | Normal release                                                                            | Cancellation / failure release                                                                           | Physical proof required?                                             | Legitimate application retention / inspection                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Queued input / caller, then task coordinator          | `PendingTask.input`, FIFO or staged batch                                        | Successful or failed posting clears input in dispatcher `finally`                         | Settlement clears input and removes FIFO entry                                                           | No for host reference; receiver allocation lasts through execution   | Caller keeps clone original; inspect task input, task map and FIFO                                                             |
| Pending task record / coordinator                     | `tasks` map; batch leader's items                                                | `settle` removes map entry                                                                | Same idempotent delete; late results do not settle again                                                 | Logical settlement does not require exit                             | Caller promise can retain delivered result/error; inspect map and settled records                                              |
| Transfer intent / caller, then coordinator            | Snapshot list and release closure; module WeakMap claims                         | Dispatcher `finally` releases claim and empties list                                      | Queued settlement releases immediately; reentrant posting holds until post returns                       | Posting must finish, not physical task completion                    | Detached backing never restored; inspect list and attempt a second reservation                                                 |
| Shared backing / application                          | Helper copies visible slice once; queued input or worker views reference backing | Host input cleared on dispatch; worker invocation releases its view when done             | Cancellation does not revoke physical readers; exit ends isolate access                                  | Yes for physical readers                                             | App aliases/module globals can retain backing; inspect compact slice, references and controlled reads; no GC deadline          |
| Runtime registry / application configuration snapshot | Handle/descriptor maps, pool descriptors; worker module map                      | Runtime facade/worker isolate lifetime                                                    | Worker module map disappears at exit                                                                     | Exit for worker isolate                                              | Runtime deliberately retains bounded configuration while app retains facade; inspect map contents (no task payloads)           |
| Worker wrapper / pool                                 | `workers` map and callbacks                                                      | Reusable while active; retired worker deleted after stop before replacement               | Stop waits for termination; shutdown keeps bounded stopped diagnostic records                            | Yes before replacement                                               | Retaining a stopped facade is application retention; inspect confirmed exit, thread ID, listeners, leases and worker-map bound |
| Physical execution / worker                           | Correlation ID, per-batch task IDs, execution phase                              | Validated final response clears IDs                                                       | Failure/termination request retains IDs; confirmed exit clears                                           | Yes                                                                  | IDs retain no input payload; inspect correlations independently of `tasks.pending`                                             |
| Binary credit / result manager                        | Reservation map, operation map, execution-to-item IDs                            | Upper-bound success reconciles; delivery releases actual credit                           | Queued cancellation immediate; active cancellation waits for result/exit; buffered cancellation releases | Yes for posted execution                                             | Consumer outputs outside budget; inspect each owner, totals and refunds                                                        |
| Buffered output / range stream                        | Buffer entries, visible-byte counters                                            | `next` shifts/delivers; final delivery completes parent                                   | `return`, `throw`, failure, abort or forced shutdown clears                                              | No for buffered result; yes for active siblings' credit              | App keeps yielded outputs; inspect actual buffer, counters, waiter and callbacks                                               |
| Consumer waiter / stream                              | One pending `next` resolve/reject pair                                           | Push or completion clears waiter                                                          | Close/failure clears and settles waiter                                                                  | No                                                                   | Caller may keep iterator/promise; inspect waiter and callbacks                                                                 |
| Parent/factory / range coordinator                    | Operation map, children, output assembly, factory and declaration                | Finish deletes operation, clears factory/outputs/declaration, emits AsyncResource destroy | Terminal state set before sibling cancellation; same clearing                                            | Credit may legitimately retain terminal operation until physical end | Factory captures and collected/map outputs can be app-owned; inspect terminal operation and credit reachability                |
| Abort listener / coordinator                          | Per-task or parent signal subscription                                           | Cleanup removes listener on settlement                                                    | Same cleanup                                                                                             | No                                                                   | App owns signal/reason and its own listeners; compare `getEventListeners` against baseline                                     |
| Task/parent deadline / coordinator                    | Timeout closure                                                                  | Settlement clears timer                                                                   | Same cleanup                                                                                             | No                                                                   | Timer handle has no public ownership; observe async-hooks timer destruction and listener removal                               |
| Execution lease / worker                              | Token, deadline and timer closure; no input                                      | Final result clears token/timer                                                           | Failure, shutdown or exit clears token/timer                                                             | No to clear lease; yes to release physical slot                      | Inspect token and controlled timer cancellation; stale callbacks cannot affect new work                                        |
| Shutdown escalation / runtime                         | One timer; shared shutdown promise, drain waiter                                 | Completion clears timer and drain waiter                                                  | Escalation clears itself; rejected stop cannot report success                                            | Exit before successful shutdown                                      | Settled shutdown promise is bounded facade state; inspect timer/drain waiter and outcome                                       |
| Termination / worker                                  | Idempotent stop promise                                                          | Confirmed terminate resolution removes thread listeners                                   | Rejection preserves physical ownership; test must explicitly terminate real thread                       | Yes                                                                  | Settled promise is bounded per-wrapper state; inspect listeners, exit and rejection                                            |
| Replacement / pool                                    | `repairs` Set of promises, rolling restart timestamps                            | `finally` removes repair; timestamps expire lazily at window boundary                     | Shutdown awaits repairs; bootstrap failure is fatal without replay                                       | Yes before spawn                                                     | No app task replay; inspect repair Set, worker identities and bounded history                                                  |
| Scheduled continuation / range coordinator            | At most one `productionTick` immediate; temporary production claims              | Callback clears handle; production `finally` releases claim                               | Shutdown cancels tick; a pending no-op tick can drain after terminal operation                           | No                                                                   | Inspect immediate, admission reservations and reserved worker Set                                                              |

## Accounting model

Logical ownership is checked exactly: pending records, FIFO weight, correlations,
reservations and per-operation sums, stream buffers/waiters/callbacks, admission
claims, repair promises, leases, timers and signal listeners. Zero logical tasks
alone never establishes physical quiescence. Bounded stopped worker snapshots,
registry configuration and settled lifecycle promises are intentional facade
state, not live executions or retained payload history.

`heapUsed`, `heapTotal`, `external` and `arrayBuffers` from `process.memoryUsage()`
belong to the sampling isolate. `arrayBuffers` overlaps `external`; never add them.
RSS is process-wide even when sampled inside a worker. Worker memory is sampled
by an explicit application task; optional `getHeapStatistics` is feature-detected
and is not required on Node 22.13.0. Subtracting two RSS samples does not measure
one worker's exact memory.

Application-owned clone originals, returned/transferred buffers, shared views,
closure captures, module globals and native allocations remain outside PJS's
release obligation. Result credit measures declared/visible bytes, not backing
allocation, object-graph size, worker scratch space or RSS.

## Methodology and reproduction

[Ownership smoke tests](../../packages/runtime/test/memory-lifecycle.test.mjs)
add 17 cases to ordinary contract qualification. They reuse R1's held-exit gates,
controlled monotonic clocks and ownership checks. They test real clone/transfer
transport and real Worker exits, independently sum per-owner credit, inspect
terminal operations/streams, and observe destruction of actual timeout/immediate
resources with `async_hooks`. No WeakRef/finalizer deadline is asserted. The
existing 30-second per-file contract deadline is unchanged; an exploratory Linux
Node 24.13.1 smoke run took about 2.7 seconds.

[The campaign](../../scripts/qualification/memory/campaign.mjs) runs each scenario/seed in a fresh
[child](../../scripts/qualification/memory/child.mjs), sequentially. Original configurations are
saved before execution; partial reports, stdout/stderr and watchdog failures are
retained. Any existing output directory or result file is refused. Default paths
allocate a new ignored directory under `.node-tools/r3/`. A reproduction requires
the original source revision and a new result path. Reports also identify dirty
trees, exact Node/V8 versions, OS/architecture, workload sizes, seeds, counts,
worker exits, assertions, all samples and descriptive analysis. Dirty runs are
development evidence; ordinary qualification requires a committed candidate.

| Standard scenario        | Workers | Declared workload allocation / behavior                                                                                |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Clone scalar/object      | 1       | Small fixed object/array shape; no invented serialized byte size                                                       |
| Clone view               | 2       | 64 KiB visible view in backing with 32 additional bytes                                                                |
| Clone ArrayBuffer        | 4       | 256 KiB dedicated buffers, active and queued submissions                                                               |
| Transfer/recycle         | 1       | 1 KiB visible views; application recycles returned backing                                                             |
| Transfer view            | 2       | 64 KiB visible views; sender detachment and returned ownership                                                         |
| Shared retention/release | 4       | One compact 256 KiB shared input; application holds then drops its alias                                               |
| Clone cancellation       | 2       | 64 KiB buffers; abort active and queued work, then physically finish                                                   |
| Transfer containment     | 1       | 64 KiB buffers; repeated real infinite executions with controlled lease expiry                                         |
| Shared restart           | 2       | 256 KiB shared input across repeated real unexpected exits                                                             |
| Binary streams           | 4       | Two concurrent streams, physical batches of 2, 8 KiB visible results in 64 KiB backing; exact and maximum declarations |
| Shutdown/recreation      | 2       | 64 KiB views; successful work, graceful drain, active forced shutdown and repeated new runtimes                        |

Standard uses seed `20261019`, four warm-up waves and 48 measurement waves per
scenario, with 20 ms between measurement waves. Workload concurrency is bounded
by workers plus a small queue; streams also have explicit count and byte bounds.
Recovery scenarios make seven controlled failures per child. Four additional
create/shutdown cycles test facade recreation. Measurement samples distinguish
active, queued, cancelled-but-physical, buffered and quiescent states. Worker
isolate samples occur at phase boundaries; optional host heap-statistics calls
are separately labeled. Those calls and report serialization perturb allocation.
Sampling stores numbers and resource type names, never historical payloads,
tasks, workers or factories. The application-retention counter covers deliberately
long-lived shared/recycled backing, not every transient driver allocation.

The standard child watchdog is 30 seconds and the campaign watchdog is 120
seconds. These are harness budgets, not task API guarantees. The PR qualification
record must report the slowest measured supported CI cell before accepting these
budgets. An exploratory Linux Node 24.13.1 standard campaign took 17.6 seconds.
The existing R2 campaign and all other gates remain in place. CI uploads R3
artifacts with `always()` for Linux/Windows x64, Node 22.13.0/24; the runtime
qualifier checks source, platform, profile, execution count and GC mode.

Extended is manual: seeds `7`, `42`, `20261019`, eight warm-up waves, 256
measurement waves, a 2 MiB large-input allocation and twelve recreation cycles.
It uses 33 fresh children, 60-second child and 900-second campaign watchdogs.
It is not part of ordinary CI and is unqualified unless explicitly executed.

```bash
npm run test:r3:smoke
npm run test:r3 -- --output=.node-tools/r3/my-new-standard
npm run test:r3 -- --gc=diagnostic --output=.node-tools/r3/my-new-gc
npm run test:r3:extended -- --output=.node-tools/r3/my-new-extended
node scripts/qualification/memory/child.mjs .node-tools/r3/my-new-standard/clone-buffer-4-seed-20261019.config.json .node-tools/r3/my-new-replay.json
```

Use `node --expose-gc` for a diagnostic child replay. The parent adds that flag
only for `--gc=diagnostic`. Forced GC is confined to the diagnostic harness's
main isolate at application-held, application-released and after-shutdown
checkpoints. It is never needed for ownership correctness, never forces worker
GC and proves no deadline for collecting backing or returning RSS. Heap
snapshots are not taken in CI or this campaign. A confirmed suspect can be
investigated separately in an isolated, generously provisioned inspector run;
snapshot pause/extra allocation must be considered part of that investigation.

## Findings and interpretation

Exploratory runs found no concrete runtime cleanup defect, so R3 makes no runtime
source correction. The smoke tests cover R3-I1 through I7 and I9 with exact
ownership assertions. Independent credit sums and real thread exit counts
complement the production debug scanner. R3-I8 is enforced by the accounting
distinctions in samples and this report; R3-I10 is checked by the unchanged R1/R2
and package/type/release gates. This is finite experimental evidence, not an
exhaustive proof about arbitrary object graphs or application modules.

Clone inputs have independently allocated worker backing. Posting clears the
host task's input; queued abort removes its host reference. Transfer intent
survives reentrant cloning until posting finishes. Queued cancellation preserves
attachment; successful posting detaches permanently, including after cancellation,
crash and lease containment. Returned buffers retained by the test application
remain usable after runtime shutdown. Shared construction copies only the visible
slice; direct SABs and shared views remain shared. Cancelled callers do not revoke
physical readers. No shared-resource registration is added across replacements.

Stream delivery/abandonment clears buffers, waiters and callbacks. Parent cleanup
removes factories, output assembly and pending declarations. Active cancelled
batch items keep every reservation until a final physical response or exit.
Abnormal/abandoned work creates no successful refund. Worker replacement removes
the retired wrapper only after confirmed exit; repairs settle and leases clear.
Shutdown tests include pending termination/repair, rejected termination and
graceful escalation. A rejected stop keeps physical ownership and rejects
shutdown; the test separately terminates its own thread to clean up.

For one standard binary checkpoint, pre-dispatch declared visible credit was
196,608 bytes; successful current credit and buffered visible output were each
131,072 bytes, while the fixture's summed underlying ArrayBuffer lengths were
1,048,576 bytes. Sampled RSS was approximately 100 MiB. These are different
quantities; backing length itself is not a measurement of resident OS pages.

An exploratory four-worker clone child on Linux/Node 24.13.1 ranged from about
118 to 271 MiB RSS during measurement, despite zero task/queue/physical/credit
owners at every quiescent checkpoint. Main-isolate ArrayBuffer samples varied
with allocation and GC. The original run and a fresh optional-GC comparison were
preserved. In the latter, main ArrayBuffer accounting fell to about 0.02 MiB
after diagnostic GC, while RSS stayed about 267 MiB; after worker termination RSS
was about 152 MiB. A shared-input comparison retained about 0.27 MiB of main
ArrayBuffer accounting after dropping the application alias and main-only GC,
then about 0.02 MiB after worker exit. This does not establish a deterministic
SAB collection time. Both comparisons had exact logical cleanup.

These local measurements are illustrative observations, **not universal baseline
guarantees**. Residual RSS cannot be uniquely attributed to V8, native allocator
arenas, JIT or transport from these samples. It is not evidence of a retained
PJS-owned payload. Main heap includes the diagnostic report itself; external
accounting and ArrayBuffer accounting can update at different GC boundaries.
No experiment attempts to exhaust memory or promises that arbitrary trusted
application tasks cannot OOM.

## Production guidance and remaining limits

Budget input backing, copies, scratch/native allocations, independent stream
capacities and consumer-held outputs separately. A small binary view can retain
or transfer a much larger backing allocation. Limit concurrent application offers
and retained outputs; `maxQueue` and binary credit govern their documented
logical domains. Recycle transferred buffers only after receiving them back.
Keep published shared data immutable while any physical reader can execute.
Always close an abandoned iterator explicitly; merely dropping a JavaScript
variable does not notify an eagerly started stream. Await shutdown for physical
completion, including callers already cancelled or timed out.

When a suspect appears, preserve its config/report, reproduce in a fresh child,
inspect logical owners, compare application-held/released references and optional
GC, then compare confirmed worker exit and fresh runtime creation. Classify the
owner before changing runtime source. A concrete narrow defect needs a failing
regression first and preserved before/after evidence; broad physical-ownership
failures stop qualification. Do not tune expected memory or relax invariants.

The bounded campaign does not cover arbitrary native libraries, application
module globals, allocator implementations, long production lifetimes, hard
termination latency or every interleaving. GC timings and the precise cause of
residual RSS remain observational/inconclusive. Windows results and resolved
Node 24 versions must come from actual per-cell artifacts, never extrapolation
from Linux. The PR and retained qualification report identify the candidate,
matrix outcomes, measured budgets and any unexecuted profiles. R3 qualifies only
after all four supported cells and existing gates pass.
