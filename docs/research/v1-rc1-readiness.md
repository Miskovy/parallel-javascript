# v1.0.0-rc.1 readiness

**Decision B: Windows qualified; RC release BLOCKED pending fresh Linux qualification.**
Exact candidate: `cad38a178d19d42d4be1cb542ccd5e67be54896a`.
This evidence follow-up changes reports/JSON only. Runtime source, declarations,
package metadata and qualification tooling remain exactly that candidate state.
The v0.15.0 release/tag remain immutable. No RC tag/release or npm publication.

| Gate                                    | Status           | Evidence / remaining requirement                                                          |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| Baseline v0.15 contracts/package        | PASS             | Clean release; 184 individual tests; all baseline gates                                   |
| Public API/runtime freeze               | PASS             | 38 exports, 25 source and 25 declaration files byte-identical                             |
| Minimum Node 22.13.0 Windows            | PASS             | Exact-candidate full gates, installed JS/TS, errors/examples, standard soak               |
| Node 22.23.3 Windows                    | PASS             | Same exact-candidate gates and standard soak                                              |
| Current Node 24.21.0 Windows            | PASS             | Same exact-candidate gates and standard soak                                              |
| Clean package reproducibility           | PASS             | Two independent clean npm-ci/build states; all 128 hashes and archive bytes equal         |
| Standard / extended repetition          | PASS             | 70,017 accepted logical tasks in five retained runs                                       |
| Logical resources / natural exit        | PASS             | Terminal zero ownership; no abort-listener/warning/timer/port residue                     |
| Memory observation                      | PASS WITH CAVEAT | Heap collectible in fresh GC control; retained RSS is not a baseline guarantee            |
| Linux exact candidate minimum and 24    | BLOCKER          | Fresh same-source package/contracts/soaks; historical Fedora insufficient                 |
| Final release-commit clean verification | BLOCKER          | After both-platform evidence, clean npm ci/build/tests/types/installed package before tag |
| macOS / ARM64                           | NOT CLAIMED      | No fresh evidence; not an RC blocker                                                      |
| Experimental ranges/result controls     | PASS WITH CAVEAT | Still experimental; no promotion or new options                                           |
| CI matrix                               | PASS WITH CAVEAT | Four jobs configured: Windows/Linux 22.13.0/24; execution not claimed here                |
| Historical evidence/release             | PASS             | 182 historical docs/result artifacts hash-identical; v0.15 tag unchanged                  |
| RC publication                          | BLOCKER          | Wait for both platforms and final clean verification                                      |

Actual npm versions are 10.9.2 / 10.9.9 / 11.18.0 respectively. Default Node
24.21.0, PATH, UV_THREADPOOL_SIZE (unset), Balanced power and system settings
remain unchanged. No runtime defect or public semantic change was found.
Preparing package version 1.0.0-rc.1 does not release it.

See [validation](../../benchmarks/results/validation-v1.0.0-rc.1-windows.json),
[package](../../benchmarks/results/package-v1.0.0-rc.1-windows.json),
[soak evidence](../../benchmarks/results/soak-v1.0.0-rc.1-windows.json),
[hardening report](v1-rc1-hardening.md), [soak report](v1-rc1-soak.md),
[contracts](v1-rc1-contract-inventory.md), [errors](v1-rc1-error-matrix.md),
[Linux handoff](v1-rc1-linux-handoff.md) and [commands](../../scripts/rc/README.md).

Stop at this one-platform handoff. Linux must preserve Windows/Fedora evidence
and investigate contradictions before release. Any semantic fix creates a new
candidate requiring requalification. No automatic RC2/final 1.0, feature or npm
publication follows this work.
