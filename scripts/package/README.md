# Installed Node package checks

[Scripts index](../README.md)

Run `npm run test:package` from the repository root. It builds the runtime and
runs [smoke.mjs](smoke.mjs), which packs a tarball and installs it in an external
temporary consumer. Checks cover package contents, source maps, workers, errors,
ESM/CommonJS loading, both TypeScript consumers and all six examples.

The [consumer fixtures](consumer/) are also used by the
[release package gate](../rc/package.mjs) and [publication helper](../release/npm-release.mjs).
Runtime migration tests reuse [c3.mjs](consumer/c3.mjs) and [c4.mjs](consumer/c4.mjs).

See the [browser checks](../browser/README.md) for browser assets and workers,
and the [release procedure](../../docs/development/releasing.md) for canonical
candidate archives and release evidence.
