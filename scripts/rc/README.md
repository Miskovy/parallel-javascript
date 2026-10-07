# RC contract qualification

This tooling exercises the frozen v0.15 runtime; it adds no product API.
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
npm run rc:qualify -- --profile=standard --output=/absolute/new/validation.json
npm run rc:repro -- --output=/absolute/new/repro.json --canonical-dir=/absolute/new/package-dir
```

The second command performs explicit process.execPath gates, runtime test runner
and independently counted contracts, source/export/declaration freeze, types,
lint, formatting, docs, CPU smoke, actual pack, separate external JS/TS projects,
six installed examples, all error identities, installed smoke and standard soak.
The third command creates two independent clean states at HEAD, runs npm ci in
each, full current-Node qualification plus extended soak in A, build/package in B,
then compares every packed file hash. It retains the canonical tarball/checksum.
Dependencies and package sources come from the exact committed candidate.

## Isolated Windows Node minimum

Use existing portable binaries without changing PATH or the default Node. Example
paths below describe this Windows checkout's ignored local tooling:

```powershell
& .\.node-tools\node-v22.13.0-win-x64\node.exe scripts/rc/qualify.mjs --profile=standard --npm-cli=E:/Miskovy/Work/pjs/pjs/.node-tools/node-v22.13.0-win-x64/node_modules/npm/bin/npm-cli.js --output=.node-tools/rc2/new-minimum.json
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
actual installed consumers and smoke. workflow_dispatch selects standard or
extended. Evidence from CI is separate qualification, never inferred from this
host. See the [proposal](../../docs/proposal-v1.0.0-rc.1.md),
[contract inventory](../../docs/research/v1-rc1-contract-inventory.md),
[error matrix](../../docs/research/v1-rc1-error-matrix.md) and
[readiness gates](../../docs/research/v1-rc1-readiness.md).

R1A CI passes `--physical-boundary-repair` to the qualifier. This explicitly
permits source differences in the six repaired owners and declaration changes
in the three internal worker/dispatcher/credit modules; public declarations, root exports,
and package contracts retain their baseline checks. It expects 206 contracts,
including the 22 physical-boundary regressions. Historical byte-freeze mode and
its baseline JSON remain unchanged when the flag is omitted.
