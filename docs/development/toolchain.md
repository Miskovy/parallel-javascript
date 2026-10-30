# Toolchain choices

The compiler migration introduced in v0.2 uses **TypeScript 7.0.2**. ESLint continues to use the TypeScript 6 compiler API through a compatibility package. All compiler and lint dependencies are development-only; the runtime has no external runtime dependencies.

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

Both runtime and workspace manifests declare **`^22.23.4 || ^24.22.1 || ^26.12.1`**.
The existing six validation cells run these exact minimums on Linux/Windows x64
with the locked development tools and unchanged R2/R3 checks. Each cell records
its executing Node version. `scripts/qualification/node-floor.mjs` additionally verifies
the expected version/executable SHA-256, both compilers' public fixtures and API
inventory. Its [binary identities](../../scripts/qualification/node-floor-binaries.json) come from
official archives verified against the
[22.23.4](https://nodejs.org/dist/v22.23.4/SHASUMS256.txt),
[24.22.1](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt) and
[26.12.1](https://nodejs.org/dist/v26.12.1/SHASUMS256.txt) manifests.

Prefer current patched releases within those majors; changing engines does not
upgrade installed Node. See the [support policy](../reference/stability.md#proposed-node-and-platform-policy)
for lifecycle status. The [24.0.0 report](../research/node24-floor-qualification.md)
is historical evidence for its named candidate, not proof for these minimums.
Node typings and declarations alone cannot establish runtime compatibility.

CommonJS development support adds a require condition for the same ESM index.js
and index.d.ts, without another build or declaration shim. The installed package
harness executes plain .cjs and mixed import/require consumers, then both locked
compilers check and emit .cts/.mts consumers and execute their .cjs/.mjs output
from an unrelated CWD. Use NodeNext `import PJS = require(...)` in .cts for typed
loading; an unannotated JavaScript-style require call alone is not a declaration
inference guarantee. Worker task modules may await imports; the host's synchronous
public module graph must remain free of top-level await.

The original compiler-migration validation used Node 24.21.0 on Windows. Later
evidence retains its own attribution and does not qualify published RC4. The
publication toolchain now pins patched **Node 24.22.1** while retaining independent
release npm **11.19.0** and its existing SHA-512 integrity. Runtime npm is recorded
separately; bundled npm versions are not publication pins. Exact passes do not
establish every patch or grant release approval.

## Scope of the migration

The original TypeScript 5.9 choice was a conservative default, not an architectural requirement. v0.2 replaces that compiler after testing the build, lint integration, API declarations, and runtime behavior. It does not claim a measured compiler speedup, nor attribute worker benchmark changes to TypeScript 7. Runtime benchmarks measure separately introduced transfer behavior.
