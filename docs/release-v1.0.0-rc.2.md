# PJS RC2 package identity

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

RC2 is a candidate awaiting qualification and human review; it has not been tagged,
released, or published to npm. Evaluate the locally packed RC2 tarball. After
publication, the intended registry installation will be
`npm install @pjavascript/runtime@next`; registry availability is not claimed here.

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
- Root README and security policy: the existing RC1 release remains the latest
  released candidate while RC2 awaits review; links use the canonical repository.

Package-name differences in current freeze tooling are explicit comparisons against
the preserved old manifest. All other frozen contract fields are still required
to match exactly.
