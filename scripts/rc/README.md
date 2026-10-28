# RC contract qualification

The active review candidate is **1.0.0-rc.5**, not a publication. Explicit
version selection in [baseline.mjs](baseline.mjs) registers only RC4 and RC5.
[frozen-rc4.json](frozen-rc4.json) remains immutable and applies to its original
source/tag; its 206-test/38-export evidence must not be attributed to RC5.
[frozen-rc5.json](frozen-rc5.json) freezes the integrated implementation's source,
tests, declarations, both export sets, complete package/lock metadata, release
inputs and packed files/archive. Validation never regenerates expected hashes.
All six deprecated aliases and existing release holds remain unchanged.

Prepare explicitly after intended input changes (existing RC5 output requires
--replace=true), review the resulting baseline, then commit before qualification:

```sh
npm run build
node scripts/rc/prepare.mjs --version=1.0.0-rc.5 --npm-cli=/absolute/reviewed/npm-cli.js
```

No self-referential commit/hash is stored in the baseline. Its explicit exclusions
are recorded there; qualification receipts record actual clean SHA/tree, selected
baseline hash and artifact SHA-256. Unknown versions, mismatched versions/tags,
missing baselines and drift fail closed. Output receipts must use new paths;
failed attempts are retained. Historical research artifacts are never overwritten.

## Profiles and bounds

| Profile  | Repetition cycles | Mixed run batch/cycle | Fresh-runtime cycles | Controlled main-pool exits |
| -------- | ----------------: | --------------------: | -------------------: | -------------------------: |
| smoke    |                 2 |                    16 |                    3 |                          2 |
| standard |                80 |                    32 |                   30 |                          6 |
| extended |               400 |                    32 |                  120 |                         12 |

Every profile runs every named scenario family. Seed `20261003` controls synthetic
values. Scenario order and offered workload are fixed; OS scheduling can change
how many siblings are admitted before an injected failure. Record actual accepted
task counts rather than pretending scheduling is deterministic. Standard covers
thousands of accepted logical tasks. Extended remains a bounded manual check,
not an unbounded endurance claim. Poll watchdogs are 15 seconds, worker gates
30 seconds and the qualification child watchdog 15 minutes. Heavy profiles run
sequentially on one host. At most two primary workers, fixed queue capacities,
small synthetic payloads and a maximum of 1,000 memory samples bound the harness.
The large map control is 10,001 elements. No live credentials or external data.

Terminal zero assertions inspect existing runtime bookkeeping; no counters or
public accessors are invented. The final resource check rejects leftover Timeout
or MessagePort resources. It permits normal stdio resources. The parent requires
natural child exit; the harness never calls process.exit. Only injected worker
tasks exit deliberately. RSS is observational; arrayBuffers overlaps external.
Logical accounting and listener/worker/timer cleanup are the release gates.

## Current Node

From a clean exact candidate checkout:

```sh
npm ci
npm run release:npm -- /absolute/new/release-cli
npm run rc:qualify -- --npm-cli=/absolute/new/release-cli/node_modules/npm/bin/npm-cli.js --release-npm-cli=/absolute/new/release-cli/node_modules/npm/bin/npm-cli.js --profile=standard --output=/absolute/new/validation.json
npm run rc:repro -- --npm-cli=/absolute/new/release-cli/node_modules/npm/bin/npm-cli.js --release-npm-cli=/absolute/new/release-cli/node_modules/npm/bin/npm-cli.js --scratch-dir=/absolute/sufficient-storage --output=/absolute/new/repro.json --canonical-dir=/absolute/new/package-dir
```

The qualification command requires a clean tree and performs explicit process.execPath gates, release/baseline regressions (including credential-free real selected-npm dry-run), runtime test runner
and independently counted contracts, source/export/declaration freeze, types,
lint, formatting, docs, CPU smoke, actual pack, separate external JS/TS projects,
six installed examples, all error identities, installed smoke, full release-artifact
validation with the selected npm CLI and standard soak. Raw npm version/stdout/stderr
are retained in the qualification parts, including failures. Test scripts are
blocked by `--ignore-scripts`; publication commands are always `--dry-run`.
The reproduction command creates two independent clean states at HEAD, runs npm ci in
each, full current-Node qualification plus extended soak in A, build/package in B,
then requires identical packed file hashes and archive bytes. It retains the canonical tarball/checksum.
Dependencies and package sources come from the exact committed candidate.

For candidate packing/reproduction select the independently reviewed npm CLI
for both --npm-cli and --release-npm-cli. Ordinary runtime CI still records its
own npm separately for dependency installation and normal consumer checks. Publication-specific operations must
select the separately provisioned npm 11.19.0; unsupported publisher versions fail
before executing the fixture's lifecycle traps. Production publication additionally
requires Node 24.22.1. The version/integrity policy lives in
[`toolchain.json`](../release/toolchain.json) and its shared helper. CI exercises the
same publisher CLI on every runtime cell rather than skipping npm 10 cells.
Reports record both npm versions and whether live release qualification ran.

For constrained temporary filesystems, select a sufficiently large `--scratch-dir`
and set `TMPDIR` to a separate disposable directory on that filesystem so nested
consumer/fixture temporary files also fit. Preserve retained reports and canonical
artifacts; remove only reconstructible caches or dependency directories. Storage
failure does not satisfy any reproducibility gate.

## Exact staged artifact

Reproduction independently packs A and B and compares their file hashes and
complete compressed archives. It stages A only after equality is established.
It removes any inherited staged-artifact override so the comparison cannot reuse
the same archive twice. Preserve candidate.json, reports and checksum together.

```sh
PJS_CANDIDATE_TARBALL=/absolute/canonical/package.tgz npm run test:package
PJS_CANDIDATE_TARBALL=/absolute/canonical/package.tgz npm run test:browser
npm run test:rc:package -- --tarball=/absolute/canonical/package.tgz --npm-cli=/absolute/reviewed/npm-cli.js --output=/absolute/new/staged-package.json
```

These paths validate the selected baseline and install the exact archive without
repacking it. RC qualification accepts --tarball=absolute/path too and forwards
it to the Node consumers. The existing release helper tarball mode is the sole
publication rehearsal: selected npm publish --dry-run --ignore-scripts plus an
offline install, never publication. No OIDC, tag, release or registry mutation is
authorized by these commands. Browser execution is separately performed by the
existing real native/Vite fixtures; retain actual engine/version output.

## Isolated Windows minimums

Use the existing Linux/Windows x64 matrix at Node 22.23.4, 24.22.1 and 26.12.1.
Direct manual invocations must use the intended node.exe and absolute reviewed
npm CLI paths. Reports record process.execPath and actual versions. No evidence
from another host is inferred for an unexecuted cell.

## Reduced individual checks

```sh
npm run test:rc:api
npm run test:rc:package -- --output=/absolute/new/package.json
npm run soak:rc:smoke -- --output=/absolute/new/smoke.json
npm run soak:rc -- --output=/absolute/new/standard.json
node scripts/rc/soak.mjs --profile=extended --seed=20261003 --output=/absolute/new/extended.json
```

Active CI runs Linux/Windows x64 Node 22.23.4, 24.22.1 and 26.12.1 in six jobs,
using ordinary runtime validation; the RC4 examples and frozen reports above are
historical. Each job retains actual installed consumers and the existing standard
R2/R3 profiles; manual RC commands above do not replace active CI. Evidence from
CI is separate qualification, never inferred from this
host. See the [proposal](../../docs/proposal-v1.0.0-rc.1.md),
[contract inventory](../../docs/research/v1-rc1-contract-inventory.md),
[error matrix](../../docs/research/v1-rc1-error-matrix.md) and
[readiness gates](../../docs/research/v1-rc1-readiness.md).
