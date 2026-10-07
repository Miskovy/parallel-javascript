# PJS v1.0.0-rc.4 candidate

RC4 contains the same R1A runtime correction qualified in RC3. RC3 reached an
immutable GitHub prerelease, but its npm workflow stopped before publication:
PJS's release validator expected a direct JSON record, whereas npm 11.19.0 on
the GitHub release runner returned a map keyed by package name. OIDC publication
was never attempted and no registry mutation occurred. See the preserved
[RC3 run](https://github.com/Miskovy/parallel-javascript/actions/runs/37605190163).
RC4 hardens that CLI contract and is the next npm publication candidate.

The R1A correction retains binary result reservations and physical busy occupancy
after abnormal worker failure until confirmed thread exit. Valid final responses
still end their physical correlations immediately; replacement waits for exit.
RC4 changes no runtime source, runtime test, public API, dependencies or behavior.
No execution leases, retries, restart windows or shutdown escalation are added.

## Observed npm contract and repair

Before changing the parser, the same RC3 tarball was inspected with Node 24.13.1,
npm 11.8.0 and isolated npm 11.19.0. Both commands exited zero without credentials:

```sh
npm publish <rc3-tarball> --dry-run --ignore-scripts --access public --tag next --json --registry=https://registry.npmjs.org/
```

npm 11.8.0 returned a direct record with `name`, `version` and `entryCount` at the
top level. npm 11.19.0 returned one top-level key, `@pjavascript/runtime`, containing
the same record fields. Both reported RC3 and 128 entries. Exact stdout, stderr,
exit status, executable and shape observations were retained in local investigation
evidence; the release test records fresh evidence with the selected CLI on every
qualification run. npm 11.19.0's installed `publish.js` explicitly passes
`key: pkgContents.name` when producing JSON.

The narrow parser supports those two observed object forms. It rejects arrays,
multiple package keys, duplicate/escaped keys, unknown fields, arbitrary nesting,
malformed JSON and missing/invalid required fields. Identity, version and exact
file count are validated separately after normalization. No speculative singleton
array support is added. A future unknown CLI shape must fail qualification.

PR CI now packs a temporary package and runs the selected real npm CLI with
`--dry-run --ignore-scripts`, empty user/global configs and an isolated cache.
Failing lifecycle scripts prove they are not executed. The test needs no token,
retains raw CLI evidence and exercises the production parser. Qualification also
passes the actual RC4 tarball through full release validation and an offline
worker consumer before release approval.

The adjacent JSON audit found `npm pack --json` returns the existing singleton
array on both observed npm versions. The release helper already requires one
pack record; selected-workspace qualification and the real CLI regression check
the pack output. `npm view --json` remains a version string, a dist-tag object,
or an explicit error object; existing identity/tag/E404 guards stay intact.

## Qualification boundary repairs

Node 22.13.0 bundles npm 10.9.2, which executed the fixture's failing `prepare`
script despite `npm pack --ignore-scripts`. That CLI remains usable for ordinary
runtime installation and consumer qualification; it is outside the maintainer
publisher contract. The lifecycle traps remain unchanged.

The reviewed publication toolchain is now exactly Node 24.21.0 / npm 11.19.0,
recorded once in [toolchain.json](../scripts/release/toolchain.json). Publication
fails before registry operations if either version differs. Runtime CI still
qualifies Node 22.13.0 and the Node 24 line independently. Each cell provisions
npm 11.19.0 from its official archive, verifies the committed SHA-512 integrity
before an offline, scripts-disabled install, and executes both the live fixture
and actual artifact validator through that CLI. Reports distinguish runtime npm,
publisher npm, support classification and actual live-contract execution.
The direct npm 11.8.0 JSON form remains a parser regression, not an approved
publication toolchain. Toolchain upgrades require a reviewed pin/integrity change,
all four qualification cells and fresh candidate reproducibility; runner updates
cannot silently change the publisher.

A diagnostic Windows Node 24 run captured `tar -tzf` stdout before changing its
parser: 128 CRLF separators, zero LF-only separators and zero bare CR characters
([run 37619823168](https://github.com/Miskovy/parallel-javascript/actions/runs/37619823168)).
The old LF-only split retained carriage returns in filenames. The narrow parser
now accepts uniform LF or CRLF, removes only structural separators and one
optional final terminator, and preserves spaces in paths. NUL, bare CR, mixed
line endings and empty records fail closed. Exact entry count, duplicates, path
allowlist, traversal checks, required files and complete frozen hashes remain
mandatory. The release-critical line-output audit found no analogous uncorrected
tar-list parser in adjacent tooling.

## Exact candidate and release boundary

The [RC4 baseline](../scripts/rc/frozen-rc4.json) freezes all source, runtime tests,
declarations, exports, metadata, contracts and packed file hashes. Source and
tests are identical to RC3 commit `bf11b5db8a6fbe389210102e8f2ceacf62e35b87`;
the [RC3 baseline](../scripts/rc/frozen-rc3.json), tag and GitHub Release are preserved.
Only packaged README wording and package version differ from the RC3 artifact.
Clean qualification and two-build reproducibility retain the exact candidate SHA,
canonical tarball and SHA-256. Linux/Windows x64 on Node 22.13.0/24 remain required;
macOS and ARM64 remain unclaimed.

This work stops at human review. No merge, tag, GitHub Release, registry write or
Trusted Publishing attempt occurs. The release flow stays `release.published`,
exact artifact validation, OIDC Trusted Publishing, registry verification and a
clean public-registry consumer that executes a worker task. No npm token, manual
login, dispatch bypass or repack between validation and publication is introduced.
