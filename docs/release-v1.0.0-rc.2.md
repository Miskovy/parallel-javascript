# PJS RC2 release and package identity

RC1 used the pre-publication package identity `@pjs/runtime@1.0.0-rc.1`.
The maintainer could not obtain the `@pjs` npm scope and now controls the
`pjavascript` organization. Before first npm publication, PJS adopted the
permanent identity `@pjavascript/runtime@1.0.0-rc.2` and the repository
`https://github.com/Miskovy/parallel-javascript`.

The runtime implementation and public API are unchanged from RC1. RC2 exists
solely to establish the permanent npm package/repository identity before first
registry publication. The project remains PJS — Parallel JavaScript.

RC1 was never published to npm. Its GitHub tag, release, assets, hashes, and
qualification evidence remain immutable and describe the old identity. Consumers
of its GitHub tarball still use that artifact's original package name.

## Publication outcome

The [GitHub prerelease](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.2)
was created and public npm publication completed:

- Package: [`@pjavascript/runtime`](https://www.npmjs.com/package/@pjavascript/runtime).
- Version: `1.0.0-rc.2`; prerelease dist-tag: `next`.
- Clean external installation from the public registry passed.
- Real worker execution from the registry-installed package passed.
- Runtime dependencies: zero; Piscina and development tooling absent.

```sh
npm install @pjavascript/runtime@next
```

Qualified: Windows x64, Fedora/Linux x64, Node 22.13+ within 22.x and Node 24.x.
macOS and ARM64 remain unclaimed. Final v1.0.0 has not been released.

Qualification covers source/API freeze, contracts, installed JS and TypeScript
consumers, package metadata/dependency isolation, bounded RC smoke, and the existing
Ubuntu/Windows Node 22.13/24 CI matrix. RC2 does not claim to repeat every RC1
extended campaign.

## Reference preservation

Active manifests, examples, guides, executable benchmark sources, package consumer
fixtures, workspace selectors, and community links use the permanent identity.
Executable historical harnesses also use the current package so they can run;
their retained results are untouched.

The following references deliberately retain their original identity/version:

- `benchmarks/results/**`: raw retained package, validation, and benchmark evidence.
- `scripts/rc/frozen-v015.json`: frozen historical source/API/manifest contract.
- `docs/research/**` and `docs/proposal-v*.md`: milestone reports and proposals.
- `benchmarks/README.md` and `benchmarks/partitioning/README.md`: historical
  experiment instructions, including the baseline checkout's old package path.
- `science/README.md` and `science/references.md`: the inspected RC1 architecture
  baseline and bibliography, with the original commit and qualification links.

The root README and security policy now identify RC2 as the current published
candidate. The repository's new package `homepage` metadata takes effect with the
next published version; it does not retroactively change RC2 on npm. RC2 will not
be republished. See [maintainer releasing instructions](releasing.md).

Package-name differences in current freeze tooling are explicit comparisons against
the preserved old manifest. All other frozen contract fields are still required
to match exactly.
