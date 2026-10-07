# RC contract qualification

This tooling qualifies the exact `1.0.0-rc.4` candidate; it adds no product API.
[`frozen-rc4.json`](frozen-rc4.json) freezes all 25 production source files, all
24 runtime test/fixture/type/config files, 25 declarations, 38 named exports (16 runtime values), the full package manifest,
206 runtime contracts, 29 release/baseline regressions, the reviewed publication
toolchain and all 128 packed file hashes. Its runtime provenance is merged
R1A commit `2387e1efd0cfb225387132266d0152949315b411`. Qualification reports record
HEAD separately: the release candidate includes versioning, documentation and gates
on top of that runtime. The immutable [`frozen-rc3.json`](frozen-rc3.json), historical [`frozen-v015.json`](frozen-v015.json) and
v0.15.0 tag remain unchanged; they are no longer the active candidate baseline.

There are no repair allowlists or compatibility bypass flags. Unknown/duplicate
arguments fail closed. Whole source/declaration inventories detect added/removed
files. Package validation compares every artifact byte, including generated JS,
maps, README, LICENSE and metadata. Baselines are reviewed release inputs; no
build or qualification command regenerates them. A future candidate must explicitly
review and replace its baseline and version together.
All output paths must be new. Existing output is refused, including an incomplete
failed run: choose another filename to retain failures. Historical soaks are not
invoked because some overwrite historical research artifacts.

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
npm run rc:qualify -- --release-npm-cli=/absolute/new/release-cli/node_modules/npm/bin/npm-cli.js --profile=standard --output=/absolute/new/validation.json
npm run rc:repro -- --release-npm-cli=/absolute/new/release-cli/node_modules/npm/bin/npm-cli.js --scratch-dir=/absolute/sufficient-storage --output=/absolute/new/repro.json --canonical-dir=/absolute/new/package-dir
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

Ordinary npm (including Node 22.13.0's npm 10.9.2) performs dependency installation,
packing and installed-consumer validation. Publication-specific operations must
select the separately provisioned npm 11.19.0; unsupported publisher versions fail
before executing the fixture's lifecycle traps. Production publication additionally
requires Node 24.21.0. The version/integrity policy lives in
[`toolchain.json`](../release/toolchain.json) and its shared helper. CI exercises the
same publisher CLI on every runtime cell rather than skipping npm 10 cells.
Reports record both npm versions and whether live release qualification ran.

For constrained temporary filesystems, select a sufficiently large `--scratch-dir`
and set `TMPDIR` to a separate disposable directory on that filesystem so nested
consumer/fixture temporary files also fit. Preserve retained reports and canonical
artifacts; remove only reconstructible caches or dependency directories. Storage
failure does not satisfy any reproducibility gate.

## Isolated Windows Node minimum

Use existing portable binaries without changing PATH or the default Node. Example
paths below describe this Windows checkout's ignored local tooling:

```powershell
& .\.node-tools\node-v22.13.0-win-x64\node.exe scripts/rc/qualify.mjs --release-npm-cli=E:/reviewed-release-cli/node_modules/npm/bin/npm-cli.js --profile=standard --npm-cli=E:/Miskovy/Work/pjs/pjs/.node-tools/node-v22.13.0-win-x64/node_modules/npm/bin/npm-cli.js --output=.node-tools/rc4/new-minimum.json
```

Select the installed 22.23.3 executable/npm CLI similarly. Commands run tests and
compilers directly through that Node binary; invoking npm alone through a Node 22
wrapper would let literal node script commands resolve the default Node 24.
No persistent or process-local PATH override is used by the qualifier.

## Reduced individual checks

```sh
npm run test:rc:api
npm run test:rc:package -- --output=/absolute/new/package.json
npm run soak:rc:smoke -- --output=/absolute/new/smoke.json
npm run soak:rc -- --output=/absolute/new/standard.json
node scripts/rc/soak.mjs --profile=extended --seed=20261003 --output=/absolute/new/extended.json
```

CI runs Linux/Windows Node 22.13.0 and 24 in four jobs, each with all gates,
actual installed consumers and standard soak. workflow_dispatch selects standard or
extended. Evidence from CI is separate qualification, never inferred from this
host. See the [proposal](../../docs/proposal-v1.0.0-rc.1.md),
[contract inventory](../../docs/research/v1-rc1-contract-inventory.md),
[error matrix](../../docs/research/v1-rc1-error-matrix.md) and
[readiness gates](../../docs/research/v1-rc1-readiness.md).
