# v1.0.0-rc.1 readiness

**Decision A: Windows PASS and fresh Fedora/Linux x64 PASS on the same frozen candidate.**
Exact candidate: `cad38a178d19d42d4be1cb542ccd5e67be54896a`.
The combined evidence branch descends from Windows evidence `36176d5`; its final
diff may contain only qualification JSON/reports/status documentation.

| Gate                                    | Status           | Evidence / requirement                                                                    |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| Baseline v0.15 contracts/package        | PASS             | Historical evidence/tag/release preserved                                                 |
| Public API/runtime freeze               | PASS             | Both platforms: 38 exports, 25 source/25 declarations byte-identical                      |
| Minimum Node 22.13.0 Windows            | PASS             | Retained exact-candidate full qualification                                               |
| Windows Node 22.23.3 / 24.21.0          | PASS             | Retained exact-candidate qualification and clean reproduction                             |
| Minimum Node 22.13.0 Fedora/Linux       | PASS             | Fresh 184/184 tests, package/consumers/errors/examples, 409-check standard soak           |
| Installed Node 24.13.1 Fedora/Linux     | PASS             | Same complete gates and 409-check standard soak                                           |
| Linux clean extended reproduction       | PASS             | 2,009 checks, 38,405 tasks, 120 fresh lifetimes                                           |
| Clean package reproducibility           | PASS             | Linux A/B archive bytes equal; all 128 file hashes match Windows                          |
| Logical resources / natural exit        | PASS             | All terminal owners zero; no warnings/listeners/timers/ports/workers left                 |
| Memory observation                      | PASS WITH CAVEAT | Bounded owned-state checks pass; RSS is host-specific, no baseline guarantee              |
| Final release-commit clean verification | PENDING          | Clean npm ci/full gates/installed smoke/canonical manifest before tag                     |
| macOS / ARM64                           | NOT CLAIMED      | No fresh evidence; outside claimed RC platform scope                                      |
| Experimental ranges/result controls     | PASS WITH CAVEAT | Still experimental; no promotion                                                          |
| CI matrix                               | PASS WITH CAVEAT | Candidate configuration retained; CI execution is not claimed by local evidence           |
| Historical evidence/release             | PASS             | 182 historical docs/results and three Windows RC artifacts unchanged; v0.15 tag preserved |
| RC publication                          | PENDING          | Only after combined evidence commit and final clean check                                 |

No runtime defect, public semantic change, package semantic change or qualification
harness change was required. Default Node/npm, PATH, UV_THREADPOOL_SIZE and power
policy were preserved. Archive bytes may differ across npm implementations while
logical package contents remain identical. Linux timing and RSS are not Windows
equivalence gates.

See [Linux qualification](v1-rc1-linux-qualification.md),
[Linux validation](../../benchmarks/results/validation-v1.0.0-rc.1-linux.json),
[Linux package](../../benchmarks/results/package-v1.0.0-rc.1-linux.json),
[Linux soak](../../benchmarks/results/soak-v1.0.0-rc.1-linux.json),
[Windows validation](../../benchmarks/results/validation-v1.0.0-rc.1-windows.json),
[Windows package](../../benchmarks/results/package-v1.0.0-rc.1-windows.json),
[Windows soak](../../benchmarks/results/soak-v1.0.0-rc.1-windows.json),
[hardening](v1-rc1-hardening.md), [contracts](v1-rc1-contract-inventory.md),
[errors](v1-rc1-error-matrix.md) and [soak report](v1-rc1-soak.md).

No npm publication, RC2, final v1.0 or feature work is authorized here. After RC1
release, the next step is external installed-consumer observation.
