# 0006: Native TypeScript build with a compatibility API for linting

## Context

The v0.1 compiler was TypeScript 5.9 without a runtime requirement for that version. TypeScript 7 is available, but its compiler API is not a drop-in replacement for the API consumed by the installed typescript-eslint. Removing lint checks or forcing incompatible peer dependencies is unnecessary.

## Decision

Use npm aliases: `@typescript/native` resolves to TypeScript 7 and supplies `tsc`; `typescript` resolves to `@typescript/typescript6` and supplies the compiler API plus `tsc6`. Follow Microsoft's [documented coexistence arrangement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/). Declare `types: ["node"]` explicitly in the runtime tsconfig and retain its existing strict settings, NodeNext modules, and ES2022 target.

## Alternatives

Replacing the single TypeScript dependency with 7 breaks the installed linter's API assumptions. Staying on 5.9 unnecessarily prevents the requested upgrade. Dropping ESLint or introducing a different linter would add unrelated migration scope.

## Consequences

Builds and public API type tests use TypeScript 7. Linting uses the TypeScript 6 compatibility API; an extra no-emit command checks runtime source with it. The lockfile includes native compiler packages for supported platforms and fixes actual resolutions. Developers must distinguish the native build compiler from an editor configured to load the package named `typescript`. Both dependencies remain development-only. No compiler-speed claim follows from the runtime transfer benchmarks.
