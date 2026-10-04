# PJS V1.0.0-RC.1 LINUX QUALIFICATION

Fresh Fedora/Linux x64 RC qualification passed on the tested machine/environment.
Windows evidence is retained unchanged. No runtime or public semantic change.

| Requested field                      | Result                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| REMOTE LATEST COMMIT                 | `4a649c7afbb01609e9ec3246f0a6875a361da175` (later CI edit excluded from release branch)                                                        |
| CANDIDATE COMMIT                     | `cad38a178d19d42d4be1cb542ccd5e67be54896a`                                                                                                     |
| WINDOWS EVIDENCE COMMIT              | `36176d5e006f92684faa930afffe698d0c2c85f7`                                                                                                     |
| WORKTREE STATUS                      | Clean detached candidate; separate combined evidence branch at Windows evidence                                                                |
| FEDORA VERSION                       | Fedora Linux 44 KDE Plasma Desktop Edition, x64                                                                                                |
| KERNEL                               | 6.19.10-300.fc44.x86_64                                                                                                                        |
| CPU                                  | AMD Ryzen 3 PRO 3300U with Radeon Vega Mobile Gfx                                                                                              |
| PHYSICAL / LOGICAL / AVAILABLE CPUS  | 4 / 4 / 4                                                                                                                                      |
| RAM                                  | 7,715,655,680 bytes (7.2 GiB reported)                                                                                                         |
| POWER / GOVERNOR                     | AC connected; schedutil; powerprofilesctl unavailable; no policy modified                                                                      |
| NODE 22.13.0                         | Official portable exact 22.13.0, checksum verified                                                                                             |
| NODE 22.13 V8 / OPENSSL / NPM        | 12.4.254.21-node.22 / 3.0.15+quic / 10.9.2                                                                                                     |
| NODE 24                              | Fedora default `/usr/bin/node` 24.13.1                                                                                                         |
| NODE 24 V8 / OPENSSL / NPM           | 13.6.233.17-node.40 / 3.5.7 / 11.8.0                                                                                                           |
| NODE MINIMUM QUALIFICATION           | PASS                                                                                                                                           |
| NODE 24 QUALIFICATION                | PASS                                                                                                                                           |
| RUNTIME TESTS                        | 184/184 on each required Node and clean extended checkout; zero failed/cancelled/skipped                                                       |
| EXPORT FREEZE                        | PASS: 38 total / 16 runtime values / 22 type-only; no promotion                                                                                |
| SOURCE / DECLARATION FREEZE          | PASS: 25 source and 25 declaration files byte-identical to v0.15 freeze                                                                        |
| TYPE TESTS                           | PASS                                                                                                                                           |
| COMPATIBILITY TYPECHECK              | PASS                                                                                                                                           |
| LINT / FORMAT                        | PASS                                                                                                                                           |
| DOCUMENTATION                        | PASS                                                                                                                                           |
| STANDARD SOAK NODE 22.13             | PASS: 409 checks / 7,903 accepted tasks                                                                                                        |
| STANDARD SOAK NODE 24                | PASS: 409 checks / 7,903 accepted tasks                                                                                                        |
| EXTENDED CLEAN REPRODUCTION          | PASS: 2,009 checks / 38,405 tasks / 120 lifetimes; A/B clean builds                                                                            |
| TOTAL SCENARIO CHECKS                | 2,827 (installed smoke counted separately)                                                                                                     |
| TOTAL ACCEPTED LOGICAL TASKS         | 54,211 Linux retained standard/extended; Windows retained 70,017 separately                                                                    |
| QUEUED CANCELLATION                  | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| ACTIVE CANCELLATION                  | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| TIMEOUTS                             | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| ABORTSIGNAL CLEANUP                  | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| WORKER CRASH                         | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| CRASH STORM                          | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| WORKER REPLACEMENT                   | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| TASK ERRORS                          | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| QUEUE SATURATION                     | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| FIFO RECOVERY                        | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| STREAMRANGE                          | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| SLOW CONSUMER                        | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| CONSUMER BREAK / RETURN / THROW      | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| COUNT BACKPRESSURE                   | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| BYTE BACKPRESSURE                    | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| EXACT RESULT CREDIT                  | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| UPPER-BOUND RESULT CREDIT            | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| REFUND ACCOUNTING                    | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| CONTRACT VIOLATIONS                  | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| TRANSFER                             | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| SHARED INPUT                         | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| MIXED TRANSPORT                      | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| RANGE BOUNDARIES                     | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| PARALLELFOR                          | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| PARALLELMAPRANGE                     | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| SHUTDOWN MATRIX                      | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| MULTIPLE SHUTDOWN                    | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| SUBMISSION DURING SHUTDOWN           | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| SUBMISSION AFTER SHUTDOWN            | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| PROCESS NATURAL EXIT                 | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| MULTIPLE RUNTIMES                    | PASS: unchanged prepared assertions on both required Nodes and clean extended reproduction                                                     |
| REPEATED LIFETIMES                   | PASS: 120 fresh construct/run/shutdown lifetimes in extended                                                                                   |
| TERMINAL OWNERSHIP                   | Zero actual tasks/operations/queue/reservations/executions/credit operations/buffers/bytes/admission claims/reserved workers/busy/live workers |
| MEMORY OBSERVATION                   | Extended peak RSS 262,434,816; heapUsed 117,812,296; external 2,491,037; arrayBuffers 192,957 bytes. No RSS-baseline guarantee                 |
| RESOURCE LEAK STATUS                 | No residual owned state/workers/listeners/warnings/Timeout/MessagePort in bounded runs                                                         |
| PUBLIC ERROR MATRIX                  | PASS: all twelve concrete installed classes, PjsError ancestry/name/nonempty message/recovery                                                  |
| PACKAGE FILE COUNT                   | 128                                                                                                                                            |
| RUNTIME DEPENDENCIES                 | 0                                                                                                                                              |
| PACKAGE REPRODUCIBILITY              | PASS: clean Linux A/B byte-identical; Windows/Linux all file hashes and logical manifest equal                                                 |
| LINUX TARBALL SHA-256                | `079e81ae887669a2f99116f8a8596ad722d5db39210a9e7ec5718f5c3cfdd5f0`; 96,513 packed / 495,405 unpacked bytes                                     |
| JS CONSUMER                          | PASS: independent actual-tarball project                                                                                                       |
| TS CONSUMER                          | PASS: strict independent compile and emitted worker execution                                                                                  |
| WORKER PATH                          | PASS: installed node_modules; unrelated cwd and paths containing spaces                                                                        |
| EXAMPLES                             | PASS: basic-run, range-work, shared-input, streaming-binary, cancellation, transfer                                                            |
| WINDOWS VS LINUX SEMANTIC COMPARISON | PASS: identical contracts/API/types/errors/worker/resource invariants                                                                          |
| WINDOWS VS LINUX PACKAGE COMPARISON  | PASS: 128 logical file hashes equal; Fedora npm 11.8 archive differs; portable npm 10 archive matches Windows                                  |
| HISTORICAL ARTIFACT STATUS           | 182 historical docs/results and all three Windows RC artifacts byte-identical; v0.15 tag/release preserved                                     |
| RUNTIME SOURCE CHANGES               | ZERO                                                                                                                                           |
| PUBLIC SEMANTIC CHANGES              | ZERO                                                                                                                                           |
| LINUX-SPECIFIC FINDINGS              | Sandbox child-process EPERM before tests: unchanged runner passed outside sandbox; Fedora npm archive bytes differ without content drift       |
| BUGS FOUND                           | No candidate runtime/package/contract defect                                                                                                   |
| BLOCKERS                             | Linux blocker closed; clean final combined evidence-commit verification remains before tagging                                                 |
| LINUX EVIDENCE FILES                 | Three new Linux JSON artifacts; this report and contract/error/hardening/soak/readiness updates                                                |
| LINUX EVIDENCE COMMIT                | Commit containing this report; exact SHA retained in final release validation                                                                  |
| COMBINED FINAL RELEASE COMMIT        | Combined Windows/Linux evidence branch; exact SHA retained in release validation                                                               |
| FINAL CANDIDATE DIFF STATUS          | Evidence-only required and checked before release; later remote CI-only commit excluded                                                        |
| FINAL DECISION                       | A — authorize RC1 candidate; tagging follows clean combined-commit check                                                                       |
| RC1 TAG STATUS                       | NOT CREATED at Linux evidence snapshot                                                                                                         |
| GITHUB RC RELEASE STATUS             | NOT CREATED at Linux evidence snapshot                                                                                                         |
| NPM STATUS                           | NOT PUBLISHED                                                                                                                                  |
| V1.0.0-RC.1 STATUS                   | QUALIFIED; final combined-commit validation/release pending                                                                                    |
| NEXT STEP                            | Clean final combined-commit qualification, canonical package equality, annotated RC1 tag and GitHub prerelease; then external observation      |

## Exact commands and provenance

All qualification commands ran against the clean detached `cad38a1` worktree at
`/home/miskovy/Documents/pjs/.node-tools/rc1-linux`, sequentially. No PATH, default
Node, UV_THREADPOOL_SIZE, CPU governor, power profile, worker count or fixture change.
Locked development dependencies were installed with explicit Node 24/npm before
the matrix; the qualifier invokes each gate with its selected Node executable.

```sh
/usr/bin/node /usr/lib/node_modules_24/npm/bin/npm-cli.js ci --no-audit --no-fund --cache=/tmp/pjs-rc1-npm-cache
/tmp/pjs-rc1-linux/.node-tools/rc1/node-download/node-v22.13.0-linux-x64/bin/node scripts/rc/qualify.mjs --npm-cli=/tmp/pjs-rc1-linux/.node-tools/rc1/node-download/node-v22.13.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js --profile=standard --output=.node-tools/rc1/linux-minimum.json
/usr/bin/node scripts/rc/qualify.mjs --npm-cli=/usr/lib/node_modules_24/npm/bin/npm-cli.js --profile=standard --output=.node-tools/rc1/linux-node24.json
/usr/bin/node scripts/rc/repro.mjs --npm-cli=/usr/lib/node_modules_24/npm/bin/npm-cli.js --output=.node-tools/rc1/linux-repro.json --canonical-dir=.node-tools/rc1/linux-canonical
```

Portable source: `https://nodejs.org/dist/v22.13.0/node-v22.13.0-linux-x64.tar.xz`.
SHA-256 `3ff0d57063c33313d73d0bdcebc4c778ad6be948234584694a042c6fe57164f6`
matched the official `SHASUMS256.txt` before extraction. npm-cli.js was discovered
in the portable tree; Fedora npm resolved to `/usr/lib/node_modules_24/npm/bin/npm-cli.js`.
The advertised available CPU count comes from `require('node:os').availableParallelism()`;
Node has no `process.availableParallelism()` method.

## Contract and memory interpretation

Gated active cancellation/timeout proved caller settlement keeps the worker busy
and 1024 maximum-byte credits for a one-byte result until physical completion.
No sentinel starts early, late results are discarded, and release occurs exactly
once. Queued cancellation never starts the body and keeps never-posted transfer
input attached/reusable. The prepared eight shutdown states, shared promise and
first-call mode were preserved. All twelve installed error classes were exercised
without treating message text as a protocol.

RSS/heap/external/arrayBuffers are observations; arrayBuffers overlaps external.
Extended retained 367 samples and 136 zero-ownership terminals. Final RSS
238,284,800 and heapUsed 102,116,352 include retained harness/application reports
and GC/allocator effects. No Linux GC control or unbounded memory claim is made.
Final resources were only normal PipeWrap stdio; workers/listeners/timers/ports
and PJS bookkeeping did not remain. Timing/RSS differences from Windows are not
release-equivalence requirements. macOS and ARM64 remain NOT CLAIMED.

[Validation, commands, counts, freeze and environment](../../benchmarks/results/validation-v1.0.0-rc.1-linux.json),
[clean packages and independent consumers](../../benchmarks/results/package-v1.0.0-rc.1-linux.json),
[raw scenarios, counters, terminals and memory](../../benchmarks/results/soak-v1.0.0-rc.1-linux.json),
[readiness](v1-rc1-readiness.md), [Windows hardening](v1-rc1-hardening.md),
[contracts](v1-rc1-contract-inventory.md), [errors](v1-rc1-error-matrix.md) and
[soak report](v1-rc1-soak.md). Historical evidence, Windows JSON and v0.15 release
remain unchanged. No npm publication, RC2, final v1.0 or new feature work.
