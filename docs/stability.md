# API stability and compatibility

PJS is pre-1.0. A **core candidate** has enough evidence to consider freezing its
contract; it is not a claim that 1.0 has shipped. The exhaustive
[inventory](research/v0.15-public-api-inventory.md) classifies all 38 root exports,
members, options and signature-reachable types.

| Surface                                                                                              | v0.15 status                          | Compatibility expectation                                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Registry registration, runtime construction, ready/run/shutdown, their core options and basic errors | CORE CANDIDATE                        | Deliberate, documented changes during 0.x; intended stable core for 1.x  |
| transfer/sharedReadonly and ownership types                                                          | SPECIALIZED BUT SUPPORTED             | Explicit ownership contracts and regression coverage                     |
| partitionRange, parallelFor, streamRange, parallelMapRange and range/result types/errors             | EXPERIMENTAL                          | Existing behavior documented and tested; no promotion in v0.15           |
| All experimental-prefixed options                                                                    | EXPERIMENTAL                          | Keep prefix and restrictions; no implicit promotion through examples     |
| stats, task/worker snapshots                                                                         | SPECIALIZED BUT SUPPORTED diagnostics | Meanings documented; nested field layout is not a stable 1.x promise yet |
| Registry.snapshot and internal descriptor                                                            | INTERNAL LEAK — SHOULD NOT BE PUBLIC  | Unsupported composition detail despite public JavaScript visibility      |

No deprecation candidate or supported API removal was justified. No runtime
warnings are added. Internal classes, protocol, profile sink, reservation debug
flag and private-field inspection are unsupported. The package export map blocks
internal package subpaths; absolute filesystem access does not create an API.

0.x changes may break compatibility but need release notes and migration guidance.
Within 1.x, a declared stable core would follow SemVer: incompatible stable
behavior or types require a major version. Experimental advanced controls can
coexist with a stable core if documented separately. We have not made that freeze.

## R1 development additions

The historical inventory describes RC4's 38 root exports. Development adds the
experimental `PjsExecutionLeaseError` value and `RestartPolicy` type,
`RunOptions.executionLease`, `PjsRuntimeOptions.restartPolicy`,
`ShutdownOptions.forceAfter`, and `stats().containment` diagnostics.
Their absence in the already-published RC4 package is deliberate; no publication
or version bump accompanies this feature work. None is promoted into the stable
core by its unprefixed spelling. Range leases are explicitly unsupported.
See [ADR 0021](adr/0021-physical-execution-containment.md) for the full contract.

## Platform and module policy

PJS is an **ESM Node package**. Use `import`; compile TypeScript tasks to JavaScript
and register file URLs relative to their calling module. No CommonJS entrypoint,
bundler/browser support or TypeScript loader is promised.

The v0.15 qualified version families are Node **22.13+ within 22.x** and **24.x**.
Manifests express `^22.13.0 || ^24.0.0`. This narrows the former runtime `>=22`
and workspace future-major ranges to the intended policy; it does not claim that
every patch was tested. Historical Windows/Fedora x64 evidence used 22.23.3 and
24.21.0. Fresh package results, exact versions and pending platforms are in the
[readiness matrix](research/v0.15-v1-readiness.md). Other majors, macOS and ARM64
are unqualified, not inferred from successful Linux x64 execution.

No production dependencies are required. Development compiler, lint and benchmark
dependencies do not become application dependencies. A local tarball installation
is the tested distribution procedure; v0.15 does not publish an npm release.
