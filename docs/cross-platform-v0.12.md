# v0.12 cross-platform campaign

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
Full mode adds ten fresh-process stress rounds, a 30-second soak, and the
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
| Fedora / AMD / Node 22    | Complete reduced campaign; full mode pending         |
| Fedora / AMD / Node 24    | Complete full campaign at the pinned reference       |
| Windows / Intel / Node 22 | Prepared; local milestone uses Node 24               |
| Windows / Intel / Node 24 | Local milestone validated; archived campaign pending |

Gate on both correctness and zero terminal reservation/correlation/operation
credit. Compare throughput only within controlled machine/power pairs. Existing
v0.11 Fedora battery and Windows Power saver numbers establish reproduction
more strongly than portable performance.

## Fedora campaign results

Generated directly from the pinned campaign JSON and companion metadata; raw
JSON was neither reformatted nor edited. The companion observer samples power,
load, memory, governor/frequency, temperatures and uptime every 30 seconds and
before/after each invocation. It does not change the prepared runner or source.

Validated source: `18f0c87e7b7920179403bbc396afabced6bb06c4`. Controller: `f5f461fa379451f41223f188c23d6f63f09f6e35`.

| Runtime / mode     | npm     | Normal pass / fail | Invariant pass / fail | Stress                       | Soak seconds / iterations |
| ------------------ | ------- | ------------------ | --------------------- | ---------------------------- | ------------------------- |
| v22.23.3 / reduced | 10.9.9  | 178/0              | 178/0                 | Not included in reduced mode | 5.08 / 138                |
| v24.21.0 / full    | 11.19.0 | 178/0              | 178/0                 | 10/10; 1780 test executions  | 30.13 / 952               |

Detected machine: Fedora Linux 44 (KDE Plasma Desktop Edition); kernel `6.19.10-300.fc44.x86_64`; AMD Ryzen 3 PRO 3300U w/ Radeon Vega Mobile Gfx;
x64; 4 logical CPUs / 4 available parallelism;
7.19 GiB total memory.

Build, type tests, TypeScript compatibility, lint and formatting passed in both
archives. Both reference source manifests and lockfile hashes remained unchanged.
The nested machine helper may report the controller commit or null in an archive;
`sourceCommit` and the archive/source hashes identify the tested implementation.

### Power and operating conditions

- v22.23.3 / reduced: 3 power samples, observed source AC;
  governor schedutil; one-minute load 0.55–2.84;
  CPU Tctl 46.4–66.6 °C.
- v24.21.0 / full: 10 power samples, observed source AC;
  governor schedutil; one-minute load 1.79–7.28;
  CPU Tctl 49.5–74.9 °C.

Power environment values reflect the initial observed source; the companion
metadata preserves subsequent observed states. Periodic samples do not prove
continuous conditions between samples. No power plan/governor was changed and
user applications were left running.

### Reservation ownership and soak

| Runtime  | Worker failures / replacements | Terminal tasks / operations / reservations / executions / credit operations | Reserved / unreconciled / reconciled bytes |
| -------- | ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------ |
| v22.23.3 | 24 / 24                        | 0 / 0 / 0 / 0 / 0                                                           | 0 / 0 / 0                                  |
| v24.21.0 | 166 / 166                      | 0 / 0 / 0 / 0 / 0                                                           | 0 / 0 / 0                                  |

Crash/replacement counts are intentional hostile lifecycle scenarios. Exact
and upper-bound scenarios share the existing mixed reservation soak. Elevated
RSS alone is not interpreted as a leak; full memory samples and scenario counts
remain in the original JSON.

### Node 24 full benchmark matrix

The complete prepared matrix retained 33 configurations × six trials
(198 measurements), with rotated/reversed case ordering, two warmups
and a fresh runtime per case inside the benchmark process. It includes slack
utilizations 1/0.75/0.5/0.25/0.1/0.01; byte capacities 1/4/16 blocks;
variable RLE under count/exact/upper/held-maximum modes with fast/slow consumers;
refund controls; and equal exact/upper clone/transfer controls. Every retained
matrix measurement ended with zero reservation, execution and operation records.

| Selected variable-RLE case       | Median results/s | Throughput CV | Median host sizing ms | Median refund MiB |
| -------------------------------- | ---------------- | ------------- | --------------------- | ----------------- |
| variable-count-consumer-0        | 3802.3           | 4.6%          | 0.00                  | 0.00              |
| variable-exact-consumer-0        | 2463.7           | 8.6%          | 137.21                | 0.00              |
| variable-upper-consumer-0        | 3798.1           | 4.9%          | 0.00                  | 379.22            |
| variable-held-maximum-consumer-0 | 3813.9           | 3.8%          | 0.00                  | 0.00              |
| variable-count-consumer-1        | 865.6            | 1.6%          | 0.00                  | 0.00              |
| variable-exact-consumer-1        | 727.0            | 2.2%          | 86.56                 | 0.00              |
| variable-upper-consumer-1        | 858.7            | 2.1%          | 0.00                  | 126.41            |
| variable-held-maximum-consumer-1 | 823.4            | 4.0%          | 0.00                  | 0.00              |

For this retained Fedora/Node 24 matrix, fast variable RLE upper-bound throughput
was 1.54× host-sized exact throughput. This ratio is specific to the measured
workload and conditions. All configuration summaries, variance, raw measurements,
event-loop, memory, occupancy, credit and refund data are embedded in the full
campaign JSON. The held-maximum control is the prepared benchmark-only runtime
instance override; no shipping runtime source was changed.

### Interpretation and remaining coverage

Fedora correctness and zero terminal ownership pass in both requested modes.
Node 22 reduced is correctness coverage, not a comparable performance campaign.
Its five-second soak is shorter coverage than the full 30-second Node 24 soak.
No Node 22/24 performance ratio is inferred from these unequal protocols.
Windows archived campaign cells and Fedora Node 22 full mode remain pending;
no absolute Fedora-versus-Windows timing comparison is made.
This execution stops at v0.12 validation and does not begin v0.13.

### Original evidence

- [v22.23.3 reduced campaign](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node22-reduced.json)
- [Companion machine/power metadata](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node22-reduced.metadata.json)
- [v24.21.0 full campaign](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node24-full.json)
- [Companion machine/power metadata](../benchmarks/results/cross-platform-v0.12-fedora-ryzen3300u-node24-full.metadata.json)
