# v0.15.0 — runtime stabilization

Prepared locally after correctness, type, package and style gates passed. No npm
publication or tag is created by this milestone. This is the first focused release
note; historical benchmark reports remain unchanged.

- Inventory and classify all 38 root exports, class members, options and errors.
- Reorganize the README and add core, lifecycle, ownership, backpressure,
  performance, error and diagnostic guides with executable consumer recipes.
- Add actual tarball installation, worker-path, public error, source-map,
  TypeScript and example checks, plus a small Linux/Windows Node 22/24 CI matrix.
- Add six public option-contract tests and positive/negative declaration tests.
- Include package README, MIT license and TypeScript sources for existing maps;
  add repository/type metadata. No production dependency is added.

## Compatibility and migration

No public runtime API breaking changes. No root export is added or removed, no
experimental prefix is removed, and runtime source/semantics remain unchanged.

| Old                                                | New                      | Reason                                                                          | Migration                                                                                             |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runtime engines >=22; workspace 22.13+ or any >=24 | Both ^22.13.0 or ^24.0.0 | Advertise the intended qualified families instead of untested odd/future majors | Use a qualified installed Node 22/24 for this package; validate other majors before extending support |

Node selection on the developer's machine is not changed. TypeScript examples
continue to register caller-visible output types. Experimental binary output
requires owned live ArrayBuffer backing at runtime, even where broad view types
accept shared backing. Registry.snapshot is explicitly unsupported despite its
current declaration visibility; applications should use register.

See the [audit](research/v0.15-public-api-inventory.md),
[final validation report](research/v0.15-stabilization.md) and
[1.0 readiness matrix](research/v0.15-v1-readiness.md). The proposed next milestone
is release-candidate qualification, not another workload or feature campaign.
