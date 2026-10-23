# Executable API and benchmark coverage

The [specification](benchmark-health-spec.md) fixes acceptance. The checker-derived
matrix is produced by `node benchmarks/current-development/audit.mjs NEW.json`:
**61 public roots: 17 values, 44 type-only; 342 members; 158 diagnostic leaves**.
It enumerates every root individually and all 100 historical benchmark modules,
including executable/report entrypoints, helpers, imports and write sites.
Type-only exports receive compiler/contract coverage, never throughput rankings.

Run commands from a clean candidate root; replace paths with absolute paths.
`C` below means `npm run benchmark:current -- --baseline=BASELINE
--output=NEW --profile=performance`. `Q` means `npm run runtime:qualify --
--release-npm-cli=PINNED_CLI --output=NEW/ordinary.json`. `S` means
`node benchmarks/current-development/qualify.mjs NEW`, after C and Q. Each
required case maps to a receipt, rather than an inferred family-wide pass.

| Public contract / required case                                                                                 | Executable cases / command                                                                                                          | Retained receipt                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Registry registration/default and named exports; runtime construction/readiness                                 | C health registration + Q registry/runtime/installed consumers                                                                      | `candidate-health.json`; `ordinary.json.contracts.json`; `ordinary.json.package.json` |
| `run()` scalar/object/ArrayBuffer/view/DataView; cloning, input/output transfer and shared input                | C health run/transfer/shared cases; CPU/matrix/transport sizes 0–3M                                                                 | Health case IDs; each transport `*.result.json`                                       |
| `transfer()` detachment and alias effects                                                                       | C health validates dispatch detachment and retained worker-output buffer detachment on the next task; Q transfer/physical contracts | Health receipt and contract children                                                  |
| `sharedReadonly()` all five overloads, offset visible copy                                                      | C health overloads plus shared transport/matrix/shared output; Q shared contracts                                                   | Health receipt and transport/matrix children                                          |
| `partitionRange()` boundaries, order, empty/tiny and uneven grains                                              | C dispatch/skew; Q partition/batch contracts                                                                                        | Cases 040–045; contract receipt                                                       |
| `parallelFor()` pre-serialization discard and shared output                                                     | C completion returns an unserializable function; shared-output cases empty/17/1,048,579                                             | Cases 046–049; health completion case                                                 |
| `parallelMapRange()` generic/typed overloads, assembly/order                                                    | C generic/typed maps empty/17/65,539; Q map/type/installed contracts                                                                | Cases 050–055; compiler and package receipts                                          |
| `streamRange()` count/exact/upper, clone/transfer, capacities 1/4, fast/slow, zero bytes, callbacks and refunds | C stream configurations; Q binary/upper/result-credit contracts                                                                     | Cases 056–070 with arrival order, credit/buffer counters and phases                   |
| Iterator direct `next`, `return`, `throw`, identity and for-await early exit                                    | C health each mode; Q closeable-stream + physical/lifecycle tests                                                                   | Three health stream case IDs; contract children                                       |
| Current C2/C3 names, all six legacy aliases                                                                     | C health aliases and current-name throughput; Q c2-options/c3-options + both compiler fixtures + installed positives/negatives      | Health aliases; named contract children; S fixtures                                   |
| Duplicate presence, inherited/undefined exclusions, getter/proxy order, reentrant cancellation/shutdown         | Q unchanged C2/C3/map/runtime boundary suites                                                                                       | Raw contract output, not throughput                                                   |
| Diagnostics, defensive copies, error exports and metadata                                                       | C health all 13 error constructors + Q diagnostics/error/negative contracts                                                         | Health error case; contract and installed receipts                                    |
| Cancellation/deadlines, ordinary leases, first-shutdown identity/escalation, restart budgets/recovery           | Q containment/physical/R2/R3 corpus, outside timed samples                                                                          | Raw `ordinary.json.r2/` histories and `ordinary.json.r3/` children                    |
| Physical ownership retained until validated completion/confirmed exit                                           | Q deterministic controls and unchanged R2/R3 assertions                                                                             | Physical-boundary/credit/memory contracts, owner checkpoints, confirmed exits         |
| All 44 public type roots, meaningful overloads, backing constraints and negative assignability                  | Q installed JS/both emitted TS consumers; S both complete public compiler fixtures + inventory parity/regressions                   | Ordinary package report; S reconciliation/coverage and compiler receipts              |

| Historical family                     | Current campaign / reuse                                                                                                       | Historical limitation preserved                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| CPU / matrix                          | Same prime and i-k-j kernels; independent sieve/i-j-k oracles; serial and locked Piscina                                       | Fixed historical artifact names and old version comparisons                                    |
| Clone / transfer / shared input       | Scan arithmetic oracle; shared matrix B; preparation inside timing                                                             | Old process launchers and sizes remain history                                                 |
| Partition / dispatch                  | Uneven skew grains and batches 1/4/16                                                                                          | Historical private profiling is diagnostic only                                                |
| Completion / streams / mapping        | Completion discard/shared output; count/exact/upper streams; generic/typed maps                                                | Old output filenames remain untouched                                                          |
| Reservations / refunds / pipelines    | Exact/upper modes and slow consumers; stream-to-run pipeline; Q failure/refund contracts                                       | Held-maximum/private accounting overrides never count as public acceptance                     |
| Fairness / architecture / regressions | Mixed bounded ordinary/range/completion/stream work; same-harness ABBA for every case                                          | Historical implementation overrides/forced GC remain diagnostic controls                       |
| Compression                           | Existing seeded high/moderate/poor corpora and level-6 raw-deflate kernel; independent inflate round trips                     | No native bound/codec qualification is invented; this campaign uses count/collect transport    |
| Crypto                                | Existing SHA/AES/scrypt/Argon2/bcrypt jobs; hash/KDF checks, AES decrypt, bcrypt verify                                        | Native capabilities are detected; locked bcrypt installation stays optional                    |
| Flagship Monte Carlo                  | Existing model/PRNG/kernel/reducer; aggregate/distribution; exact paths/checksums and tolerance for changed reduction grouping | Original preparation still pins public next=RC2; current runner installs its own exact tarball |

Every performance child retains first execution, warmup, three measurements,
CPU, memory and responsiveness. Configuration includes workers, grain, batch,
capacity, seed and ordering. `report.json` separately records correctness and
performance assessment. Missing child receipts are failures; unavailable hosts
remain unavailable; feature skips include reasons; noisy samples remain
inconclusive. A digest manifest binds all files. The engineering report records
actual per-environment outcomes and links the machine-readable matrix and tables.
