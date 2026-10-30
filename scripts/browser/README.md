# Installed browser checks

[Scripts index](../README.md)

Run `npm run test:browser` from the repository root. It builds the runtime,
checks browser types with both compilers, and runs [run.mjs](run.mjs) against an
installed package in Chromium. The runner exercises native module workers and
Vite development/production asset handling.

Install the matching browser build with `npx --no-install playwright install chromium`;
CI installs platform dependencies as well. The [fixtures](fixtures/) contain
consumer types, worker tasks, browser cases and a hanging task for lifecycle
checks. See the [browser guide](../../docs/guide/browser.md) for contracts.
