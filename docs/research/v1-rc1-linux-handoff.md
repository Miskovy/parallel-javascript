# v1 RC1 Linux qualification handoff

Windows is complete. **Stop until Linux qualifies the same candidate source.**
Exact commit: `cad38a178d19d42d4be1cb542ccd5e67be54896a`.
The Windows evidence follow-up changes only reports/JSON. Preserve all Fedora and
Windows evidence and the immutable v0.15.0 release/tag. No semantic adjustment.
Commits remain local. Transfer the retained Git bundle at
`.node-tools/rc1/pjs-rc1-windows-handoff.bundle`, or use an authorized remote push.
The bundle contains main and reachable history, including the candidate.

## Synchronize without discarding work

```sh
git status --short
git bundle verify /absolute/path/pjs-rc1-windows-handoff.bundle
git fetch /absolute/path/pjs-rc1-windows-handoff.bundle main:refs/remotes/windows/rc1-handoff refs/tags/v0.15.0:refs/tags/v0.15.0
git worktree add --detach ../pjs-rc1-linux cad38a178d19d42d4be1cb542ccd5e67be54896a
cd ../pjs-rc1-linux
git rev-parse HEAD
git status --short
```

Required: **Node 22.13.0** minimum and an actual current installed **Node 24.x**,
preferably 24.21.0 to align Windows. Node 22.23.3 is an optional middle cell.
Use explicit installed executables. If the minimum is absent, use a checksum-
verified official portable executable. Do not change default Node, PATH, power,
OS/CPU settings, UV_THREADPOOL_SIZE, prepared worker counts or fixtures.
Record actual Node/V8/OpenSSL/npm, architecture, distribution/kernel, topology,
RAM and existing power policy. Do not infer all Linux distributions from Fedora.

## Run sequentially on the exact candidate

Use ignored output until all checks complete so clean reproduction sees a clean
checkout. Replace executable/npm paths with actual installed paths:

```sh
npm ci
/absolute/node-v22.13.0-linux-x64/bin/node scripts/rc/qualify.mjs --npm-cli=/absolute/node-v22.13.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js --profile=standard --output=.node-tools/rc1/linux-minimum.json
/absolute/current-node24/bin/node scripts/rc/qualify.mjs --npm-cli=/absolute/current-node24/lib/node_modules/npm/bin/npm-cli.js --profile=standard --output=.node-tools/rc1/linux-node24.json
/absolute/current-node24/bin/node scripts/rc/repro.mjs --npm-cli=/absolute/current-node24/lib/node_modules/npm/bin/npm-cli.js --output=.node-tools/rc1/linux-repro.json --canonical-dir=.node-tools/rc1/linux-canonical
```

For system installations locate the actual npm-cli.js; do not assume the portable
layout. If default Node is the intended 24, npm selects the CLI automatically:

```sh
npm run rc:qualify -- --profile=standard --output=.node-tools/rc1/linux-node24.json
npm run rc:repro -- --output=.node-tools/rc1/linux-repro.json --canonical-dir=.node-tools/rc1/linux-canonical
```

Expected: **184/184 individual runtime contracts**, zero failed/cancelled/skipped;
38 exports (16 values/22 types); 25 frozen source/declaration files; full types/
compatibility/lint/format/docs; twelve installed error identities; independent
external JS/TS consumers; six installed examples; worker resolution and natural
exit. Standard has 409 scenario checks; extended has 2,009 and 120 fresh lifetimes.
All terminal invariants must pass; sibling counts/timing/RSS may differ. Package:
128 files, zero runtime dependencies. Compare logical hashes, not speed/RSS.

## Retain evidence, then decide

Create separate new files, refusing overwrite:

```text
benchmarks/results/validation-v1.0.0-rc.1-linux.json
benchmarks/results/package-v1.0.0-rc.1-linux.json
benchmarks/results/soak-v1.0.0-rc.1-linux.json
```

Aggregate the existing qualifier/reproduction records after each passed: validation
holds minimum/current commands/counts/environment; package holds clean A/B file
hashes/consumers/manifest; soak holds their standard runs and the clean extended
run under reproduction.states[0].qualification.soak. Keep actual Linux environment
alongside the JSON. Compare with [Windows package evidence](../../benchmarks/results/package-v1.0.0-rc.1-windows.json)
and [Windows invariants](../../benchmarks/results/soak-v1.0.0-rc.1-windows.json).
Do not replace the committed harness or alter any historical JSON.

Commit Linux reports/evidence on a separate branch from the detached worktree,
then merge with the Windows evidence follow-up. Candidate-to-final differences
must contain only reports/JSON, no source/package/tooling drift.

If correctness, cleanup, minimum or package fails, retain a minimal reproducer and
keep decision B. Public semantic changes require explicit review. Any fix creates
a new candidate requiring both-platform requalification; do not lower the gates.

Only after both platforms pass may the release engineer run clean final-commit
npm ci/build/tests/types/package/installed smoke, verify the canonical manifest,
and create the annotated RC tag/GitHub prerelease. No npm publication, RC2, final
1.0 or feature work follows this handoff.
