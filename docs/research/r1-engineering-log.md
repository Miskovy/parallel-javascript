# R1 engineering log: preflight stop

The original preflight entries below are preserved as discovery evidence. R1A
converts the probe into corrected regression tests; the historical diagnostic
script is not retained as an executable expecting the bug.

## Starting state

- Starting commit: `835eb5054a3309b3f4d86d45cb55a3964e77ac6e`.
- Original branch: `main`, tracking `origin/main`; clean working tree.
- Working branch: `runtime/physical-containment-and-recovery`.
- Fetch/push remote: `git@github.com:Miskovy/parallel-javascript.git`.
- Local platform: Linux x64, Node `v24.13.1`, npm `11.8.0`.
- No package version, runtime source, dependency, or publication changes.

## Stop decision

The requested pre-design inventory found an existing ownership discrepancy.
Sections 6 and 74 of the R1 instructions require stopping and reporting rather
than building the feature over it. Inspection therefore stopped before the full
source/test/ADR inventory and before selecting a public API. This is preflight
evidence, not a completed R1 implementation or qualification.

The lifecycle guide says active cancellation retains physical occupancy and
binary reservations until execution ends. Architecture documentation likewise
requires a failure/crash/termination that proves execution ended. However,
`ExecutionDispatcher` calls `ResultCreditManager.markExecutionEnded()` immediately
on the pool's `failed` callback. `PjsWorker.fail()` can invoke that callback from a
protocol violation while application execution continues. `PjsPool.failed()`
forwards the notification before `replace()` awaits `worker.stop()`.

The resulting order is:

```text
protocol violation observed
  -> worker marked failed
  -> dispatcher marks physical execution ended
  -> caller/parent failed and result reservation released
  -> worker termination requested
  -> termination completes / exit confirmed later
```

This conflates infrastructure failure notification with proof of physical
completion. The replacement ordering itself does await old worker termination.

## Current contract inventory

These observations come from the inspected paths; they are not a claim that the
entire required inspection or adversarial qualification has completed.

| Required behavior                                       | Preflight finding                                                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Caller cancellation differs from physical completion | Abort settles through TaskCoordinator without stopping the worker.                                                                                                          |
| 2. Caller timeout differs from physical completion      | Logical deadline settles through TaskCoordinator without stopping the worker.                                                                                               |
| 3. Caller settles at most once                          | Task-map deletion guards settlement.                                                                                                                                        |
| 4. Late results cannot settle again                     | Missing logical task record suppresses result settlement.                                                                                                                   |
| 5. Queued cancellation releases ownership               | Settlement removes queue entry; cleanup releases queued transfer claims; undispatched credit releases.                                                                      |
| 6. Running cancellation retains physical ownership      | Normal abort path retains worker correlation and dispatched result credit; abnormal failure path has the discrepancy below.                                                 |
| 7. Transfer detachment cannot be rolled back            | Successful Node post transfers backing; host metadata cleanup supplies no restoration mechanism.                                                                            |
| 8. Unexpected exit fails occupied work and can replace  | Exit invokes guarded failure; active pool schedules replacement.                                                                                                            |
| 9. Old worker exits before successor is created         | Pool replacement awaits worker.stop() before spawn.                                                                                                                         |
| 10. No automatic task replay                            | Replacement path spawns capacity without resubmitting affected work.                                                                                                        |
| 11. Bootstrap failure differs from task failure         | Starting worker failure takes fatal pool path; ordinary task failure returns the slot to idle.                                                                              |
| 12. Graceful shutdown waits for physical execution      | Normal path checks logical records, operations, and busy slots; failed/stopped statuses omit threads awaiting exit from the busy count. Pool stop still awaits termination. |
| 13. Non-draining shutdown terminates workers            | Runtime cancels accepted work and awaits dispatcher/pool stop.                                                                                                              |
| 14. Result credits require physical completion proof    | **Violated on protocol failure: credit releases before confirmed exit.**                                                                                                    |
| 15. Protocol correlation remains exact                  | Worker validates current physical task/batch ID and start/result phase; batch logical ID list is validated.                                                                 |

## Controlled reproduction

Build, then run:

```bash
rtk npm run build
rtk proxy node scripts/r1/preflight-credit-probe.mjs
rtk proxy env PJS_DEBUG_RESERVATION_INVARIANTS=1 node scripts/r1/preflight-credit-probe.mjs
```

The probe uses the public stream API, a real worker, and exact/upper-bound 8-byte
reservations. A trusted fixture posts an invalid protocol message and then updates
a shared atomic counter indefinitely. Fault injection delays the actual Node
termination call at the Worker boundary until the host releases a gate. This
exposes event ordering without relying on natural termination latency. Counter
progress proves continued execution; an exit listener verifies no confirmed exit.

Both modes report:

```json
{
  "reservedBeforeFailure": 8,
  "reservedBeforeExit": 0,
  "terminationRequested": true,
  "exitConfirmed": false,
  "workerStillExecuting": true,
  "reportedBusyWorkers": 0
}
```

The probe releases its termination gate in finally, awaits non-draining shutdown,
checks confirmed exit and zero final credit, removes its temporary fixture, and
has a 10-second outer watchdog. It is explicitly a diagnostic asserting the
baseline defect, not an acceptance test asserting correct R1 behavior. Convert
it to a regression requiring retained credit when repairing the boundary.

The probe also reproduces with existing reservation invariant scans enabled.
Those scans verify accounting consistency but do not independently verify worker
exit evidence. Across the initial temporary probe and the three retained-probe
runs, eight real workers reached protocol failure and were terminated after the
gate was released. No execution leases or generated histories were tested.

## Node documentation

Official [Node Worker documentation](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate)
describes termination as asynchronous, with its promise fulfilled when the exit
event is emitted. A failure notification or invocation of terminate therefore
does not itself establish that boundary. Documentation consulted is the current
Node 24 documentation; controlled execution used installed Node 24.13.1 only.
No native-call, Atomics.wait, Node 22, or Windows containment conclusions are
claimed from this probe.

## Required next decision

Resolve the existing failure-versus-confirmed-exit contract before designing R1.
A narrowly scoped repair should distinguish logical failure notification from
physical exit notification, retain result execution correlations until result or
confirmed exit, and keep terminating occupancy observable until proof arrives.
It must preserve immediate single caller failure, no task replay, exact protocol
correlation, and exit-before-replacement ordering. This is a repair direction,
not an implemented or reviewed R1 design.

No feature commits or R1 completion PR were created at this stop condition.

## Validation at the stop

- Build passed.
- All 184 existing contract tests passed; none detects this ordering defect.
- Documentation check passed: 662 local links across 126 Markdown files.
- Probe lint and formatting checks passed; whitespace diff check passed.
- The final retained probe reproduced both reservation modes with scans enabled.
- Initial restricted contract/docs commands hit child-process `EPERM`; reruns
  with normal child-process permissions passed.
- Type tests, compiler compatibility, package smoke, whole-repository lint and
  formatting, RC smoke/soak, and the proposed R1 qualifications were not run at
  this preflight stop. No cross-platform result is inferred from older evidence.

The working branch remains at the starting commit. The engineering log and
diagnostic probe are uncommitted review artifacts; runtime implementation is
unchanged.

## R1A: restore the physical completion boundary

R1A starts from clean `main` at
`835eb5054a3309b3f4d86d45cb55a3964e77ac6e`, on
`runtime/physical-completion-boundary`, with Node `24.13.1` and npm `11.8.0`.
The uncommitted preflight files were preserved outside the tree before checking
out main. The engineering log is retained here; the useful probe is now
[physical-boundary.test.mjs](../../packages/runtime/test/physical-boundary.test.mjs).

### Ownership-path audit before editing

| Path                                                      | Classification and evidence                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dispatcher successful single/batch post -> markDispatched | Physical dispatch; runs only after successful posting.                                                                                                  |
| Input post throws                                         | Not dispatched; worker claim rolls back, logical failure releases undispatched reservation immediately.                                                 |
| Valid final success/completed/task-failure response       | Physical completion; validated correlation/phase/list, worker correlation cleared, dispatcher marks execution ended before logical response processing. |
| error/messageerror/protocol/bootstrap failure callback    | Physical failure notification; caller may fail immediately, but this is not physical end.                                                               |
| TaskCoordinator settle -> markCallerSettled               | Logical completion; retains dispatched credit until physical end.                                                                                       |
| RangeCoordinator cancelOperation                          | Logical parent completion; retains dispatched credit until physical end.                                                                                |
| Stream yield -> releaseForPartition                       | Result ownership delivery; only results from valid final responses can be yielded.                                                                      |
| Worker.stop -> terminateThread                            | Termination requested; preserves correlation until actual exit.                                                                                         |
| Worker exit callback                                      | Confirmed thread exit; logical failure first for unexpected exit, then clears physical correlation and notifies dispatcher exactly once.                |
| Pool.replace                                              | Awaits old stop/exit, then removes old worker and spawns successor; no task replay.                                                                     |
| Shutdown -> dispatcher.stop -> releaseAll                 | Runtime cleanup after all worker termination promises and repair promises complete.                                                                     |
| Fatal runtime -> dispatcher.stop().then(releaseAll)       | Same confirmed-stop boundary; no earlier bulk release.                                                                                                  |

No other production markExecutionEnded/releaseAll call sites exist. Queued
transfer claims release on queued settlement; successful post releases transfer
metadata without undoing detachment. The result-credit owner gains no Worker
dependency. Cross-owner checks in tests independently compare occupied worker
correlations with result execution mappings and assert physical ownership is gone
before any markExecutionEnded invocation.

The extended audit also found two related proof gaps. Before successful posting,
the new markDispatching claim prevents reentrant cancellation inside clone from
releasing credit. rollbackDispatch handles a failed post without declaring
physical completion. A final single-item response with a batch leader's ID is
now rejected as a protocol failure rather than accepted as batch completion.
These paths have five additional regressions across the two reservation modes.

Two deliberate mutations were detected: restoring markExecutionEnded on failure,
and restoring status-only occupancy. Each made the delayed-exit regression fail;
the repair was restored and rebuilt after each mutation.

### Repair

Worker failure notification remains immediate. One narrow exited callback carries
the old worker identity and retained task/batch correlation after confirmed exit.
The worker guards exit observation, retains its correlation and batch IDs during
failure/termination, and ignores subsequent messages. Pool occupancy counts
correlations independently of status; telemetry uses that count. Exit requests
the existing guarded pump, including drain checks. Normal results still end physical execution immediately. Batch response kind
validation now rejects a single-item response for a physical batch. Result credit
also retains a posting claim through reentrant caller settlement during clone;
a failed post rolls the claim back without claiming physical completion.

The private terminateThread method is the only termination test seam. Regression
tests gate that method on one worker instance and keep a real worker updating a
shared atomic counter. They never patch the global Node Worker API. Per-test
10-second and polling 5-second watchdogs bound observation; finally/after hooks
release the termination gate and await cleanup. A final atomic snapshot stays
unchanged after exit.

### Qualification policy

R1A deliberately changes the frozen v0.15 implementation. The RC qualifier has
an explicit physical-boundary-repair mode allowing only the six repaired source
owners and three internal declaration files to differ. Every public declaration,
root export and package manifest contract remains checked against the original
baseline. Historical default byte-freeze mode and baseline hashes remain intact.
The existing Linux/Windows x64 Node 22.13.0/24 CI matrix uses the repair mode and
includes the 22 added contracts, for 206 total. No historical research evidence,
package version, runtime dependencies or task retry policy is changed.

### Affected release and security assessment

Published `@pjavascript/runtime@1.0.0-rc.2` has premature abnormal-failure credit
release in exact/upper-bound binary streamRange, including physical batches, and
premature busy accounting for ordinary/range work. This is a correctness and
resource-governance defect. The bound is experimental and governs visible result
credit, not process memory. A protocol failure while execution continues can
misreport retained ownership; exploitation by untrusted input alone has not been
established. Registered modules are trusted. Security impact is not established;
no CVE/security-release classification is claimed.

### R1A local evidence

Full qualification on isolated official Linux x64 Node 22.13.0 passed with
reservation invariant scans enabled: 206 contracts, both compiler/type checks,
lint, formatting, documentation links, whitespace checks, unchanged public
contracts, actual installed consumers/examples/error identities, and the bounded
19-scenario RC smoke soak (426 accepted tasks). Output is retained locally at
`/tmp/pjs-r1a-node22-final.json`. It records the dirty working candidate at the
starting commit; committed-candidate CI evidence is required independently.

Node 24.13.1 passed the original 184 contracts plus the expanded 22-regression
file, installed-package smoke, and the 19-scenario RC smoke. The full committed
candidate still needs the four configured CI cells before R1's resume gate can
pass. No execution-lease or recovery-policy work is included in R1A.

After qualification, a narrow bug-fix prerelease is preferable to waiting for the
larger execution-lease feature: this repairs an existing public ownership promise
and busy metric. This is a release recommendation, not publication authorization
or a version change in this branch.
