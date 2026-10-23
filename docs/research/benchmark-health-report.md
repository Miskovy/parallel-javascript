# Development benchmark and public API qualification

**Decision:** the exercised public contracts pass the pinned six-cell matrix.
Performance assessment is mixed: 399 accepted, 15 inconclusive and four optional
native skips across 418 configured cases; zero correctness failures or reproduced
regressions. **P1/P2/P3 are maintainer-approved**, with benchmark acceptance and
the [unapplied promotion patch](../review/p1-p2-p3-promotion.patch) still for review.
No production source, feature annotation, alias, release hold, version, frozen
input or publication setting is changed by this campaign. Stage F/G and C4's
actual shared transition window remain separate.

## Source, methodology and artifacts

Remote main was reconfirmed as `9dec3ba422b1649d478ae520439a1a70dc34b8c8`,
tree `5b3b0e03fddffb96e3859c986aceaec6416d9673`. PR #30 was merged, with
the supplied head `cf6068b9692a036654338b7ce7c0097b8ae801a9` unchanged.
Recent merges integrate B4, C1 acceptance, C2/C3, post-C3 guidance and floor
qualification. No applicable AGENTS.md was found. Work used the isolated
`benchmark/public-api-health` branch, preserving the original checkout/assets.

The [specification](benchmark-health-spec.md) was committed at `95d19ea` before
retained performance runs. The [coverage matrix](benchmark-health-coverage.md)
and [runner instructions](../../benchmarks/current-development/README.md) map
all **61 roots, 342 members and 158 diagnostic leaves** to executable/compiler
checks and enumerate all 100 historical benchmark modules with imports, write
sites, limitations and current replacements. Historical experiments/artifacts,
including flagship's RC2 preparation, remain untouched.

Accepted six-cell execution is [run 40001264862](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862).
Its reports identify the actual synthetic merge
`b4032a503c1c067916a5487a0fdfaec1dbd2294e`, tree
`2b53da0c04970664690ac72802e8037998bf1ed0`. Fetching PR #31's merge ref
proved tree equality with reviewed head
`3f2ad930b366706ef6a77898d62b503f5fc86f7e`. Original execution SHAs are retained.
The later report-only commit does not change runtime/package, harness, compiler,
fixture, seed, watchdog or workflow inputs; qualification is attributed to the
executed source above, with that explicit relevant-input equivalence.

Both arms built clean source with the same Node/npm, packed real archives and
installed those exact tarballs offline into unrelated temporary consumers.
Host and worker root resolution matched each installation; every installed file
was checked against the built package. All baseline/candidate/ordinary archives
have the same SHA-256:

`00ecfac40befa2409b2d579011e1aca98b409fdc08fccd37087628462e5611a3`

This is development package identity, not published RC4 identity. Runtime bytes
did not change, so ABBA compares repeatability of identical package bytes; it
cannot establish an optimization attributable to this branch. The prepared
promotion patch would change packed comments/documentation and needs its own
artifact identity and review before application.

## Exact qualification and performance scope

Every cell passed ordinary build/contracts, both locked complete public compiler
fixtures, installed JS and both emitted TS consumers, inventory/declaration
parity and inventory-tool regressions, 34 release-tooling dry-run regressions,
lint, formatting, documentation and diff checks. Standard R2/R3 were unchanged.

| Environment                                                                                                           | Functional qualification      | Performance profile                            | Assessment: accepted / inconclusive / skipped |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- | --------------------------------------------- |
| [Linux x64, 22.13.0](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862/job/120577648892)        | Accepted                      | 97 configurations                              | 89 / 6 / 2                                    |
| [Linux x64, exact 24.0.0](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862/job/120577648822)   | Accepted                      | 15-family health profile only                  | 15 / 0 / 0                                    |
| [Linux x64, 24.22.1](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862/job/120577648556)        | Accepted                      | 97 configurations                              | 97 / 0 / 0                                    |
| [Windows x64, 22.13.0](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862/job/120577648709)      | Accepted                      | 97 configurations + one bounded ABBA follow-up | 88 / 7 / 2                                    |
| [Windows x64, exact 24.0.0](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862/job/120577648635) | Accepted                      | 15-family health profile only                  | 15 / 0 / 0                                    |
| [Windows x64, 24.22.1](https://github.com/Miskovy/parallel-javascript/actions/runs/40001264862/job/120577648070)      | Accepted                      | 97 configurations                              | 95 / 2 / 0                                    |
| Local Windows 10 x64, 22.13.0                                                                                         | Installed API health accepted | 97 configurations                              | 89 / 6 / 2                                    |
| Local Windows 10 x64, 24.22.1                                                                                         | Installed API health accepted | 97 configurations                              | 87 / 10 / 0                                   |

The two skipped configurations in each Node 22 performance cell are serial/PJS
Argon2 controls: that Node lacks `crypto.argon2Sync`. Locked bcrypt 6.0.0 worked.
These explicit capability skips do not become missing PJS API tests. Full
97-configuration performance at 24.0.0 was not attempted. A dedicated Linux
performance host was unavailable; Linux measurements are shared CI observations,
not stable hardware guarantees. No macOS/ARM64 or every-patch claim follows.

Primary/compatibility compilers are **7.0.2 / 6.0.3**. Runtime npm is **10.9.2**
on 22.13.0, **11.3.0** on 24.0.0 and **11.19.1** on 24.22.1. Independently
provisioned release npm is **11.19.0**, checked against its unchanged pinned
archive integrity. Each receipt records executing binary SHA-256 and Node/V8.
Current 24.22.1 was selected from the official latest-v24 checksum index; the
local Windows archive and executable were independently checksum-verified.

CI hosts expose four logical CPUs/two physical cores and about 16 GiB RAM:
AMD EPYC 7763/9V45 VMs, Linux kernel 6.17.0-1022-azure or Windows Server build
10.0.26100. Different cells can have different CPU models; compare arms within
each cell, not absolute times across these hosts. Local measurements used an
i3-10100F, four cores/eight logical CPUs, 16 GiB RAM, Windows 10 Pro 10.0.19045,
Balanced power scheme. A read-only CIM supplement retained topology/frequency/
load after sandbox CIM access proved unavailable. No machine setting changed.

## Reconciliation and retained evidence

Independent archive audit verified **all six GitHub ZIP SHA-256 digests**, each
ZIP entry/CRC, **19,224 extracted files**, nested digest manifests, actual packed
bytes, installed-file digests, sample validation and package/source identities.
Across the six cells: **1,676 benchmark children**, 1,660 first executions,
1,660 warmups and **4,980 warm measurements** remain retained. No outlier was
deleted. Per-cell raw reconciliation found:

- **339/339 contracts**, zero skipped/cancelled/failed.
- **162 R2 histories / 2,746 actions**, matching raw transitions/invariants,
  162 cleanup records, replay, three negative controls and eight real-worker checks.
- **11 R3 children**, original standard seed/config and GC off; **1,261 samples,
  612 ownership checkpoints, 47 threads created / 47 confirmed exits**. Pending
  tasks, physical/credit owners, reservations, queues and buffers reconcile to zero.

Each CI artifact `benchmark-health-<os>-node-<version>` contains `campaign/`,
`ordinary.json*`, raw R2/R3 children, `coverage.json`, `results.md`, compiler
receipts, `reconciliation.json` and digest manifests. Raw tables list every case.
The independent local archive/index/audit helpers and receipts remain under the
original workspace's ignored `.node-tools/benchmark-health/`; accepted local
campaigns are in its `worktree/.node-tools/health-win24-final/` and
`worktree/.node-tools/health-win22-final-02/`. `evidence-index.json` binds paths
and digests without registry credentials or expiring download URLs.

Reproduce with the runner/qualifier commands in the specification. Independently
audit downloaded artifacts with retained `audit_archives.py ARCHIVES.json NEW_DIR`;
the script refuses existing destinations, verifies ZIP/extracted/manifest/package
digests and recomputes raw contract/R2/R3 aggregates. The committed qualifier
performs equivalent raw reconciliation on each executing host.

## Measurements and practical limits

Normal GC, one warmup and three warm observations per ABBA child were retained.
Cold metrics cover pool construction/readiness; host process/module import and
oracle construction are outside them. First workload execution is separate.
End-to-end warm timing includes preparation/copying, dispatch, transport,
assembly and defined consumer work. CPU, main-isolate heap/external/arrayBuffers,
sampled process RSS, credits, event-loop delay/utilization and timer drift are
separate observations. Ten-millisecond RSS sampling can miss transient peaks;
credits do not bound backing allocation or total process memory. Equal observation
overhead applies to both arms; no private profiling sink or forced GC is used.

On local Windows, four-worker prime counting at 500,000 inputs measured
**40.07 → 16.72 ms** on Node 22 and **40.00 → 18.97 ms** on Node 24, about
**2.40× / 2.11×** versus equivalent serial partitioning. At 3,000,000 inputs,
both majors measured about **2.41×**. Tiny inputs lost to messaging; 50,000
inputs were not a reliable crossover across both majors. Begin evaluating
parallel CPU work around the measured 500,000-input region for this kernel,
then tune against the actual application rather than treating it as a rule.

Local 1 MiB moderate/poor compression saw **1.65–2.35×** on Node 24 and
**2.04–2.32×** on Node 22; highly compressible input was too cheap to amortize
dispatch. Four-job SHA/scrypt/bcrypt controls benefited in measured cases;
AES and small matrices/Monte Carlo often did not. Matrix 192 and aggregate
Monte Carlo had material variation; no universal winner or regression is claimed.
The Windows CI Node 22 CPU-500,000 signal (1.159× slower initially) became
0.976× on its single predeclared follow-up block and remains **inconclusive**.

Use a persistent pool, keep offers bounded and test one versus four workers for
coarse work on this host. Grain and batch defaults remain unchanged: the measured
grain sweep is 1/17/128 and dispatch batches 1/4/16; no automatic batching policy
is justified. Transfers move ownership and detach aliases; shared input is useful
for repeated immutable reuse, while this campaign's transport samples include
shared-copy setup. Capacities 1/4 trade buffering against consumer pace; use a
valid maximum-byte declaration for variable results and size credits independently
of process memory. Refunds were validated per invocation, not inferred from a
cumulative nonzero counter. These are bounded observations, not tuning guarantees.

## Failures, completed fixes and review boundary

The first pilot's npm cache EPERM is retained; the runner now contains all npm
writes in the campaign cache. The original 97-case Windows run at `337c032`
is retained separately (81 accepted / 16 inconclusive), not relabeled as final.
Per-stream refund deltas, explicit partition boundaries and normalized provenance
paths were tightened before the accepted local/final CI executions.

[Initial CI run 39999585350](https://github.com/Miskovy/parallel-javascript/actions/runs/39999585350)
failed before measurement because the evidence parent directory was missing.
The fix creates it explicitly; raw failure logs are retained.
[Run 40000495822](https://github.com/Miskovy/parallel-javascript/actions/runs/40000495822)
then measured successfully but Windows ordinary qualification lacked forwarded
npm arguments under PowerShell. Using the existing CI's `cmd`/`npm.cmd` launcher
fixed that harness error. Its partial Windows floor archive remains independently
audited and explicitly unqualified for ordinary scope; later results do not repair it.
The first local Node 22 attempt stopped at an EPERM ancestor `lstat` in unrelated
temporary-consumer verification; rerunning unchanged code with authorized filesystem
access succeeded in a new directory. All failed/incomplete attempts remain evidence.

No runtime correctness defect or reproducible resource/performance regression was
demonstrated, so no production fix or redesign was made. The promotion artifact
removes only the reviewed 28 markers and corresponding status wording, retaining
all six aliases and behavior; `git apply --check` passes. It remains unapplied.
This campaign supports acceptance review and does not replace Stage F's final
candidate/reproducibility gates or separate publication authorization.
