# Current development campaign

This is separate from the preserved historical experiments. Read the committed
[acceptance specification](../../docs/research/benchmark-health-spec.md) first.

Build/install the existing lockfile in two clean worktrees. The baseline is
`9dec3ba422b1649d478ae520439a1a70dc34b8c8`. Select the same Node executable and
npm CLI for both arms; invoke from the candidate root:

```sh
npm ci
npm ci --prefix benchmarks/real-world/crypto --ignore-scripts
npm run benchmark:current:test
npm run benchmark:current -- --baseline=/absolute/baseline --output=/absolute/NEW/campaign --profile=performance
node benchmarks/current-development/audit.mjs .node-tools/NEW-inventory.json
```

`--profile=pilot` labels a non-acceptance harness check. `health` executes public
contracts and a representative case from each family; `performance` executes
the complete bounded configuration. All use fresh installed exact tarballs,
host/worker resolution checks, sequential children and retained ABBA receipts.
`--npm-cli=/absolute/npm-cli.js` overrides npm selection explicitly. Use Windows
`npm.cmd` where PowerShell execution policy blocks `npm.ps1`.

Every output directory is exclusive. Consumers are created under the OS temporary
directory, outside the repository, and retained at paths in `report.json`.
Tarballs and installed-file digests are retained in the campaign. The final
`digests.json` covers every retained campaign file; source status is checked
before building and after execution. No public registry package is substituted.
Optional bcrypt is copied only from the existing locked crypto installation;
an absent native capability produces an explicit skip. Result credits and
sampled RSS describe different memory scopes.

`report.json` retains configuration, order, package/source/tool identity, setup
commands, health outcomes and per-case assessment. Each child has a config,
result and process receipt, including failures. First execution and warmups are
retained separately from warm samples. Ordinary qualification supplies the full
deterministic lifecycle corpus and both installed compiler consumers; its output
is additional evidence, not inferred from throughput. The inventory command
emits every discovered public root and historical executable/helper, imports,
write sites, limitations, replacement cases, commands and receipt locations.

At most one additional ABBA block runs for a predeclared regression signal.
Noisy cases remain inconclusive. A skipped case makes the campaign incomplete;
an incomplete performance assessment does not silently become API acceptance.
CI timings are observations on shared runners, not hardware guarantees.
