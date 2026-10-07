# PJS v1.0.0-rc.3 candidate

RC3 contains the merged R1A physical-completion repair. RC2 can release binary
result reservations and report zero physical busy occupancy after abnormal worker
failure while the old thread still executes. RC3 retains physical correlation,
result credit and occupied capacity until confirmed thread exit. A valid final
response still completes its physical correlation immediately; ordinary task
exceptions do not require worker exit. Failed-worker replacement waits for exit.

Affected accounting includes experimental exact and upper-bound binary result
reservations, supported batch reservations and diagnostic busy occupancy. Callers
can fail before execution ends. Posted transfers remain detached; shared memory
can contain partial writes. Workers run trusted application modules. This is a
correctness/resource-governance fix; security impact has not been established.

The runtime is byte-identical to merged R1A commit
`2387e1efd0cfb225387132266d0152949315b411`. The root API remains 38 named exports,
including 16 values. No configuration, runtime dependencies, task retries,
execution leases, restart-window policy or shutdown escalation are added.
No performance campaign or new platform claim accompanies this candidate.

The [RC3 baseline](../scripts/rc/frozen-rc3.json) replaces temporary repair
allowances with exact source, declaration, manifest and packed-file hashes.
Qualification requires 206 passing contracts, all 22 physical-boundary regressions,
release/baseline regressions, build/types/compatibility/package/lint/format/docs
checks and bounded lifecycle soak. Required CI cells are Linux x64 and Windows
x64 on Node 22.13.0 and Node 24. Two independent clean builds must produce identical
archives and retain the canonical artifact/checksum. macOS and ARM64 are unclaimed.

This note describes a candidate, not a publication. RC2 remains published until
the [release procedure](releasing.md) tags an approved commit and publishes its
GitHub prerelease. Tag/version mismatch, stale baselines, altered artifacts and
existing immutable registry versions fail closed. Qualification evidence records
the exact candidate commit; any change requires qualification again.
