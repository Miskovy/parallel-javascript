# Routine checks

[Scripts index](../README.md)

| Script                                                             | Purpose                                                      | Run from the repository root                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| [docs.mjs](docs.mjs)                                               | Local Markdown links, anchors and the README example.        | `npm run test:docs`                                          |
| [contracts.mjs](contracts.mjs)                                     | Individual runtime test files and contract totals.           | `npm run test:contracts`                                     |
| [api-contract-inventory.mjs](api-contract-inventory.mjs)           | Structural Node/browser API discovery and inventory checks.  | `node scripts/checks/api-contract-inventory.mjs --check`     |
| [api-contract-inventory.test.mjs](api-contract-inventory.test.mjs) | Deterministic inventory generation and output-file handling. | `node --test scripts/checks/api-contract-inventory.test.mjs` |

Use `--entry=browser` for the browser inventory and `--output=<new-file.json>`
to retain machine-readable output. The [API contract document](../../docs/research/v1-api-contract-inventory.md)
owns policy; structural discovery does not change it.
