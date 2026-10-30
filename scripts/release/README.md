# Publication tooling

[Scripts index](../README.md)

Follow the [release procedure](../../docs/development/releasing.md) for candidate
preparation and publication. The [release-candidate tools](../rc/README.md)
handle freezes, installed consumers, soak gates and reproducibility.

| File                                         | Purpose                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| [toolchain.json](toolchain.json)             | Reviewed Node/npm versions and npm archive integrity.                        |
| [toolchain.mjs](toolchain.mjs)               | Toolchain checks and pinned npm CLI provisioning.                            |
| [npm-release.mjs](npm-release.mjs)           | Metadata/archive validation, publication rehearsal and registry convergence. |
| [npm-release.test.mjs](npm-release.test.mjs) | Release policy, archive and registry-contract regressions.                   |
| [npm-cli.test.mjs](npm-cli.test.mjs)         | Selected npm CLI and publication-toolchain regressions.                      |

Run `npm run test:release` for the tests. Provision the reviewed CLI into a new
directory with `npm run release:npm -- <new-directory>`.
