# Historical experiment tools

[Scripts index](../README.md)

Use the source commit, Node version, dependencies and environment recorded by
each campaign. Exact-hash validators need their original checkout; moving a
script does not renew qualification or rewrite retained evidence. See the
[historical reports](../../docs/benchmarks/README.md) and [research index](../../docs/research/README.md).

| Milestone | Tools                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.11      | Cross-platform [runner](cross-platform-v011/run.mjs), [report generator](cross-platform-v011/report.mjs), [environment inspection](cross-platform-v011/environment.mjs), [binary probe](cross-platform-v011/binary.mjs) and [supplement](cross-platform-v011/supplement.mjs). |
| 0.12      | Cross-platform [runner](cross-platform-v012/run.mjs), [observer](cross-platform-v012/observe.mjs), [report generator](cross-platform-v012/report.mjs) and [exact-hash validator](validate-v012.mjs).                                                                          |
| 0.13      | [Windows crypto observer](crypto-windows-observe.mjs).                                                                                                                                                                                                                        |
| 0.14      | [Compression memory campaign](compression-memory-v014.mjs), [compression supplement](compression-supplement-v014.mjs) and [qualification validator](validate-v014.mjs).                                                                                                       |

The cross-platform wrappers locate the current repository, then extract the
recorded source into an isolated reference directory. Script paths executed
inside that reference retain its original layout. Wrapper usage and report
regeneration commands use the paths in this directory.
