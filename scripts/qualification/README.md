# Runtime qualification and campaigns

[Scripts index](../README.md)

Run commands from the repository root. See the [release procedure](../../docs/development/releasing.md)
for exact candidate qualification and the required environment.

| Tool                                         | Purpose                                                                    | Entry point                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [runtime.mjs](runtime.mjs)                   | Ordinary qualification of a clean committed checkout.                      | `npm run runtime:qualify -- --release-npm-cli=<absolute-npm-cli.js>` |
| [node-floor.mjs](node-floor.mjs)             | Exact supported-minimum Node identity and compatibility checks used by CI. | `node scripts/qualification/node-floor.mjs`                          |
| [Lifecycle campaign](lifecycle/campaign.mjs) | R2 deterministic histories, real workers and lifecycle invariants.         | `npm run test:r2`                                                    |
| [Lifecycle replay](lifecycle/replay.mjs)     | Replay a retained R2 history.                                              | `npm run test:r2:replay -- --history=<history.json>`                 |
| [Memory campaign](memory/campaign.mjs)       | R3 ownership, retention and resource lifecycle in fresh processes.         | `npm run test:r3`                                                    |
| [Reservation soak](reservation-soak.mjs)     | Seeded result-credit and reservation invariants.                           | `npm run soak:reservations:smoke`                                    |
| [Stress runner](stress.mjs)                  | Repeated fresh-process runtime test rounds.                                | `npm run test:stress`                                                |

Lifecycle and memory correspond to the R2 and R3 research milestones. Their
reports continue to use `.node-tools/r2/` and `.node-tools/r3/`. Extended profiles
remain available through `test:r2:extended` and `test:r3:extended`. The memory
campaign launches [child.mjs](memory/child.mjs) and uses [analysis.mjs](memory/analysis.mjs).

The Node checker reads [node-floor-binaries.json](node-floor-binaries.json) and
expects the exact CI Node selection and an independently selected release npm CLI.
Reservation soak commands write versioned output under `benchmarks/results/`;
use a separate checkout when preserving an existing retained report.
