# Repository scripts

Run scripts from the repository root. Prefer the npm commands in
[package.json](../package.json); their names remain stable when implementation
files move. See [CONTRIBUTING](../CONTRIBUTING.md#validation-commands) for the
validation required by a change.

| Section                                        | Purpose                                                                       | Common commands                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Checks](checks/README.md)                     | Documentation links, API inventory and contract-test counts.                  | `npm run test:docs`, `npm run test:contracts`                    |
| [Package](package/README.md)                   | Installed Node package checks and consumer fixtures.                          | `npm run test:package`                                           |
| [Browser](browser/README.md)                   | Installed browser declarations and native/Vite module workers.                | `npm run test:browser`                                           |
| [Qualification](qualification/README.md)       | Runtime qualification, Node minimums, lifecycle, memory and stress campaigns. | `npm run runtime:qualify`, `npm run test:r2`, `npm run test:r3`  |
| [Release candidates](rc/README.md)             | Registered candidate baselines, preparation, package gates and reproduction.  | `npm run test:rc:api`, `npm run rc:qualify`                      |
| [Release tooling](release/README.md)           | Pinned publication toolchain and npm release helpers.                         | `npm run test:release`, `npm run release:npm -- <new-directory>` |
| [Historical experiments](historical/README.md) | Versioned cross-platform, crypto and compression campaigns.                   | Use the recorded milestone and environment.                      |

Keep executable files in the matching section, alongside their tests and local
fixtures. Reserve this directory's root for the index. When moving a script,
update npm commands, imports, CI, documentation and candidate preparation inputs.
Historical receipts and published release baselines keep their original paths
and hashes.
