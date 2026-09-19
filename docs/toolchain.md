# Toolchain choices

PJS v0.2 builds with **TypeScript 7.0.2**. ESLint continues to use the TypeScript 6 compiler API through a compatibility package. All compiler and lint dependencies are development-only; the runtime has no external runtime dependencies.

## Compiler commands and aliases

| Dependency key       | Package specification                | Locked package                  | Purpose                                                               |
| -------------------- | ------------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| `@typescript/native` | `npm:typescript@^7.0.2`              | `typescript@7.0.2`              | Supplies `tsc` for builds, declarations, and public API type tests    |
| `typescript`         | `npm:@typescript/typescript6@^6.0.2` | `@typescript/typescript6@6.0.2` | Supplies the API expected by typescript-eslint and the `tsc6` command |

The compatibility package itself resolves `@typescript/old` to TypeScript **6.0.3**, so `tsc6 --version` and `require('typescript').version` report 6.0.3. This is expected; the wrapper version and underlying compiler version differ.

Microsoft documents this alias arrangement because TypeScript 7.0 does not expose the previous compiler API. The installed typescript-eslint supports TypeScript `>=4.8.4 <6.1.0`. Using separate aliases gives the native compiler its own binary while preserving the linter's API dependency. See the [official migration notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and [typescript-eslint dependency policy](https://typescript-eslint.io/users/dependency-versions/).

`npm run build` uses TypeScript 7. `npm run typecheck:compat` checks the same runtime source with TypeScript 6 without emitting files. `npm test` builds with 7, checks the public declarations against positive and negative type cases, and runs the runtime tests. The tsconfig explicitly includes Node globals using `types: ["node"]`, preserving its existing NodeNext modules, ES2022 target, strict checks, and output directory.

For editor integration, use an editor/language-server configuration that supports TypeScript 7. Selecting this workspace's package named `typescript` alone selects the compatibility API. The compiler upgrade does not automatically change an editor's language service.

## Other development packages

| Package             | Declared range | Locked version | Reason                                                 |
| ------------------- | -------------- | -------------- | ------------------------------------------------------ |
| `@types/node`       | `^22.19.0`     | `22.20.4`      | Align declarations with the oldest Node major targeted |
| `eslint`            | `^10.11.0`     | `10.11.0`      | Linter used by the flat configuration                  |
| `@eslint/js`        | `^10.0.1`      | `10.0.1`       | Recommended JavaScript rules compatible with ESLint 10 |
| `typescript-eslint` | `^8.48.0`      | `8.70.0`       | TypeScript parsing/rules using the compatibility API   |
| `prettier`          | `^3.7.0`       | `3.9.8`        | Formatting, fixed by the lockfile for `npm ci`         |

Declared ranges allow compatible updates; the lockfile records the tested resolutions. The older lower bounds were not individually proved to be minimum supported versions. Prettier recommends exact pinning; our lockfile fixes clean installs, while deliberate formatter updates still need formatting review. See [Prettier's guidance](https://prettier.io/docs/install).

## Node runtime versus development tools

The runtime package targets Node `>=22.0.0`; the workspace declares `^22.13.0 || >=24.0.0` to match the supported development-tool range. ESLint 10 requires newer Node versions than the runtime implementation. See [ESLint's requirements](https://eslint.org/docs/latest/use/getting-started).

Local validation used Node 24.21.0 on Windows. Broader engine declarations are targets, not evidence of completed cross-platform/version validation. Node typings cannot prove compatibility with every Node 22 minor.

## Scope of the migration

The original TypeScript 5.9 choice was a conservative default, not an architectural requirement. v0.2 replaces that compiler after testing the build, lint integration, API declarations, and runtime behavior. It does not claim a measured compiler speedup, nor attribute worker benchmark changes to TypeScript 7. Runtime benchmarks measure separately introduced transfer behavior.
