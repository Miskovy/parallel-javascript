# PJS 1.0.0-rc.5 candidate

**Status: prepared for review, not published.** As checked read-only on 28 October
2026, npm latest/next still select RC4; RC5's npm version and GitHub release return
explicit 404s and the remote tag is absent. This note authorizes no publication,
tag, alias removal or final-v1.0 readiness claim. Separately tracked release holds
and their applicability remain unresolved; see [releasing](../development/releasing.md).

The candidate contains integrated Checkpoints 1–4, patched Node support, the
browser no-replacement graceful-drain correction and typed host-boundary cleanup.
There are zero production dependencies. The baseline intentionally differs from
immutable RC4: compare semantics and supported contracts across releases; require
exact source/declaration/package identity only within the selected release baseline.

## Included behavior

- Opt-in physical cancellation on run and all four range APIs. Default cancellation
  still settles callers logically. Node retains occupancy/credits until validated
  completion or confirmed exit; terminate work and leases use exclusive placement.
- Bounded opt-in ordinary/per-partition retries require repeatable: true. Successful
  or delivered partitions do not replay. One registered-task fallback follows
  eligible primary retries. Replacement restores capacity, not task success; a
  crash does not prove an execution had no side effects.
- Explicit rebuildInput reconstructs recovery inputs after dispatch capacity is
  claimed, using fresh transfer lists. It never repairs detached buffers or inserts
  hidden backup copies. Initial inputs still use the ordinary input/factory path.
- Cooperative cancellation uses shared atomic polling for CPU loops and an
  invocation-local signal for async cleanup. Ignoring it does not force escalation.
  Caller rejection alone never releases an occupied execution slot.
- Elastic min/max worker bounds with opt-in idleTimeout, and selected Node worker
  resourceLimits. Limits cover selected JS-engine resources, not total RSS/native
  allocation. Fixed pools remain the default without elasticity.
- Stable dispatch priorities, guarded custom comparison and configurable async
  concurrency per worker. Overlapping waits does **not** add CPU threads. Synchronous
  JavaScript remains on each worker's one JS thread. Destructive work is exclusive.
- Bounded, deliberately lossy progress uses invocation-local contexts. Progress is
  informational, not a result or a credit release. Payloads are runtime-validated
  bounded JSON even when an application declares an unconstrained progress schema.
  Default invocation is still exactly execute(input); cooperative/progress opt-in
  supplies execute(input, context).
- Synchronous CommonJS require and ESM import share one Node ESM graph, constructors,
  errors, task handles and transfer helpers. Registered Node modules retain file:
  URLs and support callable namespace exports, then callable own properties of a
  CommonJS default object. Task modules may import asynchronously inside workers.
- Explicit @pjavascript/runtime/browser uses real dedicated module workers, HTTP(S)
  registered ESM and Node-free/inert public graphs. Copied-asset native modules and
  Vite dev/production under non-root bases are the defined loading profiles, not a
  universal bundler claim. Bootstrap and helper assets must share a canonical graph.

## RC4 migration

Node minimums are **22.23.4, 24.22.1, 26.12.1** within their majors:
`^22.23.4 || ^24.22.1 || ^26.12.1`. Stay on current patched releases; installing PJS
does not upgrade Node. Node 20 is unsupported. Consult the
[official Node lifecycle schedule](https://github.com/nodejs/Release/blob/main/schedule.json);
the supported exact minimum is independent of lifecycle labels.

Use the [core guide](../guide/core-api.md) for full signatures and examples. TypeScript
consumers should compile against the selected candidate, rather than RC4 declarations:

| RC4 spelling / declaration             | RC5 contract                                                   |
| -------------------------------------- | -------------------------------------------------------------- |
| experimentalDispatchBatchSize          | dispatchBatchSize                                              |
| experimentalMaxBufferedResults         | maxBufferedResults                                             |
| experimentalOutputConstructor          | outputConstructor                                              |
| experimentalResultBytes                | resultBytes                                                    |
| experimentalMaxResultBytes             | maxResultBytes                                                 |
| experimentalMaxReservedResultBytes     | maxReservedResultBytes                                         |
| Generic async iterator stream view     | Named closeable PjsRangeStream; iterator return/throw clean up |
| Broad binary backing types             | Strict byte-result types require ordinary ArrayBuffer backing  |
| Unsupported registry.snapshot() access | Register before construction; snapshot remains internal        |
| Inferred diagnostic/error shapes       | Named PjsRuntimeStats and diagnostic/error context types       |

All **six deprecated aliases remain accepted**. Supplying both spellings of a pair
rejects, including inherited or undefined presence. No removal version is selected.
The shared transition window starts only with a deliberately published release,
not version preparation, this PR, merge or successful validation. New resilience,
priority, concurrency and progress controls are opt-in; their defaults retain prior
behavior. Map/stream modes, clone/transfer/shared ownership, result ordering, parent
deadlines and exactly-once caller settlement remain in their existing owners.

Ordinary CommonJS applications can synchronously require the root; .cts and .mts
consumers use the same NodeNext declaration graph under both locked compilers. See
the [CommonJS example](../guide/core-api.md#commonjs-consumption-development). Browser
users explicitly import /browser and follow [deployment/CSP/CORS/MIME guidance](../guide/browser.md).
Raw task URLs do not compile TypeScript or bundle dependencies. PJS executes trusted
application task modules; workers are not an untrusted-code sandbox.

## Browser and memory boundaries

Worker.terminate() exposes no observable native join. Browser revocation commits
local retirement/terminal accounting only after posting/input cleanup; it does not
certify native exit or shared backing safe to reuse. Worker bounds count managed
endpoints. Replacement never replays ambiguous old execution. Browser retries and
fallback support validated task-error recovery and genuine skipped suffixes only;
worker-crash/execution-lease recovery causes reject before factories/transfers.

Browser cooperation requires usable shared memory in page and worker, normally
with cross-origin isolation. Without it, cooperation rejects and progress uses
bounded message credits; a CPU loop may send only its first update until it yields.
Browser resourceLimits presence rejects. Silent self-close is not completion
evidence. Shutdown is local retirement, not a shared-memory quiescence certificate.
Shared inputs remain the application's responsibility; cancellation/retry never
roll back effects. Result-byte credits do not cap total RSS.

## Candidate evidence and remaining decisions

The explicit [RC5 baseline](../../scripts/rc/frozen-rc5.json) freezes intended inputs;
clean committed receipts identify actual SHA/tree, baseline digest and archive
SHA-256. [Existing tooling](../../scripts/rc/README.md) performs independent clean-build
reproduction and stages one canonical archive. Installed Node/browser consumers
and the existing dry-run publication helper must consume that exact archive.
Large receipts and failed attempts remain outside Git; actual outcomes and paths
are reported in the preparation PR, not inferred from historical passing runs.

Chromium evidence does not establish Firefox/WebKit, macOS or ARM64 support.
Normal minimum-version CI and candidate reproduction do not satisfy unresolved
final-readiness/hold requirements by implication. Remaining maintainer decisions
are review of this version/baseline/migration contract, applicability and disposition
of the existing holds/Stage F requirements, and any **separate future authorization**
for release actions. No publication eligibility is asserted here.
