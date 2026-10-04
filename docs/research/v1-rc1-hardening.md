# PJS V1.0.0-RC.1 HARDENING REPORT

**Decision A: the frozen RC candidate passes Windows and fresh Fedora/Linux qualification.**
No runtime defect or public semantic change was found. The combined evidence
commit must pass clean final validation and canonical logical package comparison
before tagging. See [readiness](v1-rc1-readiness.md) and
[Linux qualification](v1-rc1-linux-qualification.md).

## Retained Windows qualification

The following Windows report records its original handoff status. Its raw evidence
and historical observations remain unchanged; Linux closure is recorded below.

| Requested field                      | Result                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STARTING RELEASE                     | v0.15.0, unchanged annotated tag and GitHub prerelease                                                                                                         |
| STARTING COMMIT                      | `58a3ce056d8ef9b7cf6991a37fcc7fcffc018e7c`                                                                                                                     |
| WORKING TREE                         | Initially clean; candidate committed; this follow-up contains evidence/reports only                                                                            |
| HOST                                 | Windows 10 Pro 10.0.19045 build 19045, x64; i3-10100F, 4 physical/8 logical CPUs; 17,037,594,624 bytes RAM                                                     |
| NODE MATRIX                          | 22.13.0 / 22.23.3 / 24.21.0, explicit executables; default 24.21.0 unchanged                                                                                   |
| NODE 22.13.x RESULT                  | Earliest boundary 22.13.0 PASS: full exact-candidate gates, package, installed consumers, standard soak                                                        |
| NODE 24 RESULT                       | 24.21.0 PASS; same gates plus clean extended reproduction                                                                                                      |
| PUBLIC EXPORT DIFF                   | Zero; 38 symbols: 16 values, 22 types; 25 source/declaration files identical                                                                                   |
| STABILITY SURFACE                    | Preserve v0.15 core candidates, specialized ownership, experimental ranges/options, diagnostic stats and unsupported internal composition                      |
| BASELINE VALIDATION                  | build, npm test, test:types, typecheck:compat, lint, format:check, diff check, docs, contracts, package and CPU example PASS before changes                    |
| RUNTIME TEST COUNT                   | 184/184 individual tests on each Node; zero failed/cancelled/skipped; unchanged test count                                                                     |
| CONTRACT TESTS                       | Independent direct-file counts plus full node:test; new scenario checks protect repetition/pressure without inflating unit count                               |
| LIFECYCLE SOAK                       | Three standard runs, one clean extended, one independent standard GC control; all PASS                                                                         |
| OPERATIONS EXECUTED                  | 70,017 accepted logical tasks; each standard 7,903, extended 38,405; installed smoke additionally repeated                                                     |
| QUEUED CANCELLATION                  | Body never starts; buffer remains attached; ownership claim reusable                                                                                           |
| ACTIVE CANCELLATION                  | Caller settles while worker stays occupied; late results ignored, no early reuse                                                                               |
| TIMEOUTS                             | Queued, physically running and consumer-delivery waiting scenarios PASS                                                                                        |
| ABORTSIGNAL CLEANUP                  | getEventListeners verifies zero remaining abort listeners; no suppressed warnings                                                                              |
| WORKER CRASHES                       | Controlled worker process exits, simultaneous two-worker storm and exhausted restart budget PASS                                                               |
| WORKER REPLACEMENT                   | Fixed target restored; new work correct; bounded restarts; no replay/duplicate worker IDs                                                                      |
| ERRORING TASKS                       | Throws/rejections retain concrete task errors; future work succeeds                                                                                            |
| QUEUE SATURATION                     | Gated single-worker queue 128 fills/rejects with PjsQueueFullError; FIFO 0..127, drain and recovery PASS                                                       |
| STREAMRANGE                          | Completion order explicitly demonstrated with first partition gated; no missing/duplicate/overlapping range elements                                           |
| SLOW CONSUMER                        | Controlled yield delay with live count/byte invariants; no performance-latency claim                                                                           |
| CONSUMER BREAK                       | break/return/throw clean production and buffers; active posted jobs may finish                                                                                 |
| COUNT BACKPRESSURE                   | Actual buffered plus admitted-unsettled children <= cap 1/2/4, including zero-byte output                                                                      |
| EXACT RESULT CREDIT                  | Correct varied lengths PASS; smaller/larger mismatches reject before successful delivery                                                                       |
| UPPER-BOUND RESULT CREDIT            | Maximum enforced; actual reconciliation/refund and terminal release PASS                                                                                       |
| REFUND ACCOUNTING                    | M-A sums/event counts verified for zero, small and equal-to-maximum actual output                                                                              |
| RESULT CONTRACT VIOLATIONS           | Binary/map/capacity errors have concrete identity, clean accounting and healthy followup                                                                       |
| TRANSFER                             | Eligible input detaches at posting; output returned correctly; queued cancellation preserves ownership                                                         |
| SHARED INPUT                         | Concurrent immutable shared reuse agrees with clone sum; mixed transports do not contaminate state                                                             |
| RANGE BOUNDARIES                     | Empty, one, partial tail, oversized grain, divisible/nondivisible; typed 10,001-element tail; completion-only uncloneable discard PASS                         |
| SHUTDOWN MATRIX                      | Idle/completed/active/queued/stream/cancelled/replacement states; graceful/forced behavior PASS                                                                |
| MULTIPLE SHUTDOWN                    | Same promise before/after completion; first call fixes drain mode                                                                                              |
| SUBMISSION DURING SHUTDOWN           | Concrete PjsRuntimeStateError                                                                                                                                  |
| SUBMISSION AFTER SHUTDOWN            | Concrete PjsRuntimeStateError                                                                                                                                  |
| PROCESS EXIT                         | Installed children naturally exit; watchdog only fails hangs; no parent process.exit                                                                           |
| MULTIPLE RUNTIMES                    | Independent worker IDs/queues/counters/shutdown, no interference                                                                                               |
| REPEATED CONSTRUCT / RUN / SHUTDOWN  | 120 fresh lifetimes inside extended; all terminal owners/workers zero                                                                                          |
| MEMORY OBSERVATION                   | PASS WITH CAVEAT; fields separate; fresh GC control reduces heap 15.1 MB to 8.1 MB; RSS high-water remains                                                     |
| RESOURCE LEAK STATUS                 | No growing PJS-owned task/operation/credit/worker/listener/timer residue in bounded campaigns; no unlimited-memory claim                                       |
| PUBLIC ERROR MATRIX                  | All twelve concrete classes triggered in monorepo and actual installed JS package; types independently compiled                                                |
| PACKAGE REPRODUCIBILITY              | Two independent clean npm-ci/build states have identical 128 file hashes and archive bytes; three-Node packages share hashes                                   |
| PACKAGE CONTENT MANIFEST             | 100 dist JS/declaration/map files, 25 matching sources, package.json/README/LICENSE; 96,450 packed / 495,405 unpacked bytes; zero runtime dependencies         |
| JAVASCRIPT CONSUMER                  | Separate external actual-tarball project; core/range/shared/transfer/stream/error/shutdown PASS                                                                |
| TYPESCRIPT CONSUMER                  | Independent strict project with no inherited repo config/skipLibCheck; generics/options/signal/stream/ownership/errors; emitted workers PASS                   |
| WORKER PATH                          | Installed artifact works from unrelated cwd and paths with spaces                                                                                              |
| EXAMPLES                             | Six installed examples PASS on three Nodes and both clean builds                                                                                               |
| LINUX QUALIFICATION                  | BLOCKER: fresh exact-candidate minimum/current 24 still required; historical Fedora not reused                                                                 |
| WINDOWS QUALIFICATION                | PASS on exact candidate, three Nodes, clean packages and bounded soaks                                                                                         |
| MACOS STATUS                         | NOT CLAIMED; ARM64 also unqualified; not an RC blocker                                                                                                         |
| CI MATRIX                            | Four jobs, Linux/Windows 22.13.0/24; actual installed package + smoke each; standard/extended manual; execution not claimed here                               |
| DOCUMENTATION                        | Proposal preceded implementation; contracts/errors/readiness/soak/report/handoff; internal link check PASS                                                     |
| HISTORICAL ARTIFACT PRESERVATION     | 182 old docs/result artifacts byte-identical, including all Fedora/Windows campaign evidence; tag unchanged                                                    |
| RUNTIME SOURCE CHANGES               | None; all 25 files identical to v0.15.0                                                                                                                        |
| PUBLIC SEMANTIC CHANGES              | None: scheduling/admission/settlement/cancellation/credits/replacement/ordering/shutdown unchanged                                                             |
| BUGS FOUND                           | No runtime defect; tooling development exposed relative npm CLI, compiler alias path and formatter/lint iterator-chain issues                                  |
| BUGS FIXED                           | Tooling corrected before candidate commit; no runtime fix required                                                                                             |
| REMAINING BLOCKERS                   | Fresh Linux qualification on same candidate, then clean final release-commit verification before tagging                                                       |
| PACKAGE VERSION                      | Prepared 1.0.0-rc.1; lockfile metadata updated, dependency records unchanged                                                                                   |
| FINAL CANDIDATE COMMIT               | `cad38a178d19d42d4be1cb542ccd5e67be54896a`                                                                                                                     |
| CANONICAL TARBALL                    | Windows qualified candidate `.node-tools/rc1/canonical/pjs-runtime-1.0.0-rc.1.tgz`; final release pack awaits remaining gates                                  |
| TARBALL SHA-256                      | `56cedf9ba5b03b445ce8fa44c6c72fde78fc75a10731632d27a2338bbbc02b3a`                                                                                             |
| TAG STATUS                           | RC tag NOT CREATED; v0.15.0 unchanged                                                                                                                          |
| GITHUB RELEASE STATUS                | RC release NOT CREATED; existing v0.15.0 release unchanged                                                                                                     |
| NPM STATUS                           | NOT PUBLISHED                                                                                                                                                  |
| FINAL DECISION                       | B: qualification gate blocked; no Windows runtime defect identified                                                                                            |
| V1.0.0-RC.1 STATUS                   | BLOCKED                                                                                                                                                        |
| RECOMMENDED POST-RC OBSERVATION PLAN | After Linux/release gates: external installed-consumer observation and incident reproduction; RC2 only for demonstrated fixes; no automatic final 1.0/features |
| COMMITS CREATED                      | Candidate `cad38a178d19d42d4be1cb542ccd5e67be54896a`; evidence-only commit containing this report; full evidence SHA supplied with handoff                     |

## Node, V8, OpenSSL and environment

| Node    | V8                  | OpenSSL     | npm     |
| ------- | ------------------- | ----------- | ------- |
| 22.13.0 | 12.4.254.21-node.22 | 3.0.15+quic | 10.9.2  |
| 22.23.3 | 12.4.254.21-node.57 | 3.5.8       | 10.9.9  |
| 24.21.0 | 13.6.233.17-node.53 | 3.5.8       | 11.18.0 |

Active power: Balanced, GUID `381b4222-f694-41f0-9685-ff5bb260df2e`.
Before/after PATH hashes, Node/npm resolution, default versions, power and unset
UV_THREADPOOL_SIZE match. Node 22.13.0 was an isolated official portable download,
checksum `b0feb09ebf41328628e7383f7a092fb7342ce1e05c867a90cf8f1379205a8429`;
Node 22.23.3 already existed. No uninstall, nvm/default/PATH/power/CPU change.

## Files added and modified

Added: [proposal](../proposal-v1.0.0-rc.1.md),
[contracts](v1-rc1-contract-inventory.md), [errors](v1-rc1-error-matrix.md),
this report, [readiness](v1-rc1-readiness.md), [soak](v1-rc1-soak.md),
[Linux handoff](v1-rc1-linux-handoff.md), and nine files under
[scripts/rc](../../scripts/rc/README.md). New raw evidence:

- [validation-v1.0.0-rc.1-windows.json](../../benchmarks/results/validation-v1.0.0-rc.1-windows.json)
- [package-v1.0.0-rc.1-windows.json](../../benchmarks/results/package-v1.0.0-rc.1-windows.json)
- [soak-v1.0.0-rc.1-windows.json](../../benchmarks/results/soak-v1.0.0-rc.1-windows.json)

Existing files modified: `.github/workflows/ci.yml`, `.gitignore`, `README.md`,
`package.json`, `package-lock.json`, `packages/runtime/package.json`. The evidence
follow-up updates only the newly added research reports and raw JSON. No historical
report/artifact or runtime source was edited. Canonical tarball/checksum, transfer
bundle and local diagnostic helpers are ignored workspace artifacts.

Full outputs/counts/environment/hashes are in [validation evidence](../../benchmarks/results/validation-v1.0.0-rc.1-windows.json);
all manifest/file hashes and consumer commands in [package evidence](../../benchmarks/results/package-v1.0.0-rc.1-windows.json);
invariants, memory fields and the exact GC-control script in [soak evidence](../../benchmarks/results/soak-v1.0.0-rc.1-windows.json).

## Fresh Linux qualification and cross-platform result

Exact candidate `cad38a178d19d42d4be1cb542ccd5e67be54896a` passed on Fedora 44
KDE x64, kernel 6.19.10-300.fc44.x86_64, Ryzen 3 PRO 3300U, 4 physical/logical/available
CPUs, 7,715,655,680 bytes RAM, AC connected, schedutil governor. Default Node
24.13.1/npm 11.8.0 and power/CPU/PATH/UV_THREADPOOL_SIZE settings were preserved.
Official portable minimum Node 22.13.0/npm 10.9.2 was checksum-verified.

Both Node cells passed 184/184 contracts, types, compatibility, lint/format/docs,
38 exports (16 values/22 types), and byte-identical 25 source/25 declaration files.
Both passed independent installed JS/TS projects, twelve public error identities,
six examples, worker resolution with spaces/unrelated cwd and natural process exit.
Standard runs each passed 409 checks/7,903 accepted tasks. Clean Node 24 extended
passed 2,009 checks/38,405 tasks and 120 lifetimes. Total Linux retained hardening:
**2,827 checks and 54,211 accepted tasks**. All terminal owners/credits/workers
returned to zero; no abort-listener, warning, timer or port residue.

Clean A/B packages were byte-identical on Fedora, with all 128 logical file hashes
matching Windows. Fedora npm 11.8 packed 96,513 bytes/495,405 unpacked bytes;
SHA-256 `079e81ae887669a2f99116f8a8596ad722d5db39210a9e7ec5718f5c3cfdd5f0`.
The portable npm 10 package matched Windows archive bytes too. Archive differences
under Fedora npm 11.8 do not change logical package contents. Zero runtime dependencies.

Caller settlement retained the busy physical worker and 1024 maximum credits until
physical completion. All prepared cancellation, timeout, crash/replacement/storm,
FIFO, stream/consumer/backpressure/refund/transport/boundary and shutdown assertions
passed unchanged. RSS and timing observations are host-specific. No runtime, public
contract, package semantics, exports, declarations or harness changed. macOS/ARM64
remain NOT CLAIMED. Historical evidence and Windows JSON remain byte-identical.

Remote `main` includes later CI-only commit `4a649c7`; the combined RC evidence
branch starts at Windows evidence `36176d5` so candidate-to-release changes remain
reports/JSON only. No tag is created from the detached candidate worktree.

[Linux validation](../../benchmarks/results/validation-v1.0.0-rc.1-linux.json),
[Linux package](../../benchmarks/results/package-v1.0.0-rc.1-linux.json),
[Linux soak](../../benchmarks/results/soak-v1.0.0-rc.1-linux.json) and
[qualification report](v1-rc1-linux-qualification.md) retain the fresh results.
