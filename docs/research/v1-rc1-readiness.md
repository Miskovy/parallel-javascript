# v1.0.0-rc.1 readiness

**Decision B: RC release blocked pending exact-candidate platform qualification.**
This document initially records the source-preparation boundary. Windows
development checks pass, including the minimum Node boundary; candidate evidence
will be appended after source is committed. Linux must qualify that exact source.
No RC tag/release or npm publication is authorized by a one-platform result.

| Gate                                     | Status at source preparation | Required evidence                                                       |
| ---------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| Baseline v0.15 contracts/package         | PASS                         | 184 individual tests; all baseline gates                                |
| Public API freeze / runtime semantics    | PASS                         | 38 exports, 25 source and declaration files identical                   |
| Minimum Node 22.13.0 development package | PASS                         | Build/types/184 contracts/actual JS+TS/examples; new installed RC smoke |
| Windows exact candidate, three Nodes     | BLOCKER                      | Fresh 22.13.0/22.23.3/24.21.0 gates and standard soak                   |
| Clean package reproducibility            | BLOCKER                      | Two independent committed clean npm-ci/build states                     |
| Standard / extended repetition           | BLOCKER                      | Fresh candidate retained Windows results                                |
| Linux exact candidate minimum and 24     | BLOCKER                      | Fresh same-source gates/package/contracts/soaks                         |
| macOS / ARM64                            | NOT CLAIMED                  | No fresh evidence; no inferred support                                  |
| Experimental range/result controls       | PASS WITH CAVEAT             | Remain experimental; no promotion                                       |
| Memory observation                       | PASS WITH CAVEAT             | Owned bookkeeping zero; RSS not a return-to-baseline guarantee          |
| CI matrix                                | PASS WITH CAVEAT             | Configuration prepared; execution is separate evidence                  |
| Historical release/evidence              | PASS                         | Immutable v0.15 boundary; historical hashes preserved                   |
| RC publication                           | BLOCKER                      | Both qualified platforms, then final clean verification/tag/release     |

Feature freeze is absolute. Optional features do not block. Core correctness,
leaks/deadlocks, settlement/credit/worker/shutdown defects, package/minimum Node
failures and public semantic redesign do block. No such runtime defect has been
observed in development smoke. See [proposal](../proposal-v1.0.0-rc.1.md),
[contract inventory](v1-rc1-contract-inventory.md), [errors](v1-rc1-error-matrix.md),
[soak](v1-rc1-soak.md), [hardening report](v1-rc1-hardening.md) and
[commands](../../scripts/rc/README.md).

Stop after Windows handoff. Linux must not rewrite Windows/Fedora evidence, change
the candidate's runtime/package semantics, start RC2/final 1.0, or publish npm.
