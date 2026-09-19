# Toolchain choices

This records the foundation's actual setup, reviewed on 2026-09-19. The selected versions are a working baseline, not a claim that older versions are inherently better. No runtime behavior requires TypeScript 5.9 specifically, and no comparative compiler benchmark justified that initial choice.

## Declared ranges versus installed versions

`package.json` declares compatible update ranges; `package-lock.json` records exact resolutions. For example, `^5.9.3` allows compatible 5.x updates but excludes 6.x and 7.x. `npm ci` installs the locked dependency graph.

| Development package | Declared range | Locked version | Reason for this family                                                                                                                                         |
| ------------------- | -------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript`        | `^5.9.3`       | `5.9.3`        | Conservative initial compiler with strict checking, NodeNext modules, and declaration emit; not a PJS requirement                                              |
| `@types/node`       | `^22.19.0`     | `22.20.4`      | Align declarations with the oldest Node major the runtime targets; this helps avoid newer-major APIs but does not prove compatibility with every Node 22 minor |
| `eslint`            | `^10.11.0`     | `10.11.0`      | Linter used by the current configuration; replaced the initially installed deprecated ESLint 9                                                                 |
| `@eslint/js`        | `^10.0.1`      | `10.0.1`       | ESLint's recommended JavaScript rules, with a peer requirement for ESLint 10                                                                                   |
| `typescript-eslint` | `^8.48.0`      | `8.70.0`       | TypeScript parser/rules compatible with ESLint 10 and the installed compiler                                                                                   |
| `prettier`          | `^3.7.0`       | `3.9.8`        | Formatting only; the lockfile fixes the formatter used by `npm ci`                                                                                             |

The exact lower bounds on the initially chosen TypeScript, Node typings, typescript-eslint, and Prettier ranges were not individually established as minimum supported versions. They should not be presented as necessary compatibility thresholds. The tested dependency graph is the lockfile.

Prettier recommends exact version pinning because formatting can change between releases. The repository lockfile makes `npm ci` reproducible, but a deliberate formatter update still needs a formatting review. See [Prettier's installation guidance](https://prettier.io/docs/install).

## Why not TypeScript 7?

TypeScript 7.0 was released on July 8, 2026. Keeping 5.9 cannot be justified by calling 7.0 unreleased or merely experimental. The original choice should have included this release check.

There is a migration constraint: the installed `typescript-eslint` declares a TypeScript peer range of `>=4.8.4 <6.1.0`. TypeScript 7.0 lacks the earlier programmatic compiler API. Microsoft documents using TypeScript 7 for compilation alongside a TypeScript 6 compatibility package for tools such as typescript-eslint. See the [official release and migration notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and [typescript-eslint dependency policy](https://typescript-eslint.io/users/dependency-versions/).

That means a direct replacement of our `typescript` dependency with 7.x is not a validated upgrade of the whole toolchain. It does **not** mean PJS's source or runtime cannot use TypeScript 7.

The recommended next compiler evaluation is TypeScript 7 for builds, with a supported compiler API dependency for linting as needed. Check explicit Node types, configuration changes, emitted JavaScript/declarations, build/lint/tests, and editor support. Measure build time separately from CPU runtime benchmarks: a faster compiler does not by itself demonstrate faster worker execution.

The README badges show the current setup. This documentation change does not migrate the compiler or alter the lockfile.

## Node runtime versus development tools

The runtime package targets Node `>=22.0.0`; the workspace declares `^22.13.0 || >=24.0.0` because ESLint 10 requires newer Node releases than the runtime implementation does. The installed ESLint engine range is `^20.19.0 || ^22.13.0 || >=24`; PJS intentionally does not target Node 20. See [ESLint's supported Node versions](https://eslint.org/docs/latest/use/getting-started).

The runtime has been tested locally on Node 24.21.0 on Windows. The package's broader engine range is a target, not evidence of completed cross-version/platform testing. Node typings and an engine declaration cannot replace that testing.

All six packages above are development dependencies. PJS's execution path uses Node built-ins and has no external runtime dependencies.
