# v0.12 cross-platform campaign preparation

This is a separate campaign for upper-bound semantics. The v0.11 Fedora and
Windows JSON and report are preserved. Local implementation evidence belongs to
the [v0.12 report](benchmarks-v0.12.md); this document does not claim unrun cells.

The completed implementation reference is
`18f0c87e7b7920179403bbc396afabced6bb06c4`. The commands below pin that committed
source, independently of later report or campaign updates.

Use `scripts/cross-platform-v012/run.mjs` only with an explicit committed v0.12
source hash. It extracts that commit into a fresh temporary archive, installs
locked dependencies, records source/lock/archive hashes and machine metadata,
and refuses to overwrite an existing output. Source hashes must agree afterward.
All runs preserve the archive, all check output, and failures without silent retry.

Reduced mode runs build, type/compatibility, lint/format, the complete normal and
invariant suites, and a five-second mixed exact/upper-bound reservation soak.
Full mode adds ten fresh-process stress rounds, a final 30-second soak, and the
complete upper-bound slack/capacity/RLE/consumer/overhead matrix. Full mode does
not repeat unrelated v0.11 CPU/matrix/Piscina campaigns. Same-machine v0.11/v0.12
regression controls remain a separately interleaved local experiment.

```sh
node scripts/cross-platform-v012/run.mjs --commit 18f0c87e7b7920179403bbc396afabced6bb06c4 --mode reduced --label fedora-ryzen3300u --node /path/to/node22 --npm /path/to/npm-cli.js
node scripts/cross-platform-v012/run.mjs --commit 18f0c87e7b7920179403bbc396afabced6bb06c4 --mode full --label windows-i3-10100f --node /path/to/node24 --npm /path/to/npm-cli.js
```

Repeat for Node 22.13+ and Node 24 on each actual machine; use a new `--output`
directory for repeat measurements. `--offline` permits a populated npm cache.
Set `PJS_POWER_MODE` to the actual plan/source before execution. Prefer AC and
unchanged power settings within comparisons; record battery runs honestly.
The controller does not alter governors or power plans. Unsupported/unavailable
cells stay pending. macOS/ARM64 would add useful independent coverage.

| Cell                      | v0.12 campaign state                                 |
| ------------------------- | ---------------------------------------------------- |
| Fedora / AMD / Node 22    | Prepared, not run in this workspace                  |
| Fedora / AMD / Node 24    | Prepared, not run in this workspace                  |
| Windows / Intel / Node 22 | Prepared; local milestone uses Node 24               |
| Windows / Intel / Node 24 | Local milestone validated; archived campaign pending |

Gate on both correctness and zero terminal reservation/correlation/operation
credit. Compare throughput only within controlled machine/power pairs. Existing
v0.11 Fedora battery and Windows Power saver numbers establish reproduction
more strongly than portable performance.
