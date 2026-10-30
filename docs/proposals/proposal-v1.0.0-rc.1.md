# PJS v1.0.0-rc.1: contract hardening

Starting boundary: immutable `v0.15.0`, commit
`58a3ce056d8ef9b7cf6991a37fcc7fcffc018e7c`. Baseline Windows gates pass:
184 individual runtime contracts, build, types, compatibility compiler, lint,
formatting, documentation, actual tarball consumers and installed examples.

## Goal and frozen contracts

Try to break the existing runtime under repetition, failure, admission pressure,
cancellation and hostile lifecycle timing. Preserve all 38 named root exports,
public declarations, options, error classes and existing lifecycle semantics.
Registration, bounded admission, worker execution, caller settlement, physical
execution, ownership and shutdown are frozen for this campaign. Range methods
and every experimental-prefixed option remain experimental. Diagnostics remain
diagnostics; private inspection in the harness does not create a public API.

## Non-goals

No primitives, scheduler tuning, work stealing, automatic sizing/chunking/batching,
ordered streams, cooperative cancellation, nested parallel API, global pool,
GPU/distribution, crypto/compression package, framework, syntax or compiler work.
No benchmark campaign, universal performance claim, or npm publication.

## Qualification matrix

Windows x64: exact Node 22.13.0 minimum, installed Node 22.23.3 and default
Node 24.21.0. Use explicit executables without changing PATH, default Node,
UV_THREADPOOL_SIZE, power plan or OS configuration. Record actual environment.
Linux x64 needs fresh minimum and Node 24 qualification of the same candidate
commit. This Windows host cannot establish Linux qualification. Commit a precise
handoff and stop before an RC tag/release. macOS/ARM64 remain NOT CLAIMED.

## Failure injection and bounded soaks

Add deterministic seeded fixed-operation smoke, standard and extended manual
profiles. Run heavier profiles sequentially. Cover repeated lifecycle success,
queued/active abort, queued/running/consumer deadlines, abort-listener cleanup,
controlled exits and bounded crash storms, queue saturation/FIFO recovery,
completion-order streams, slow consumers/break/return, count/byte credit caps,
exact/maximum violations, refund accounting, mixed clone/transfer/shared input,
range boundaries, typed maps, completion-only output suppression, shutdown modes
and identity, separate pools, and repeated construct/run/shutdown.

Use gates rather than performance timing to prove caller settlement does not
release active physical work or its maximum byte reservation. Sample actual
PJS-owned bookkeeping, public resource diagnostics and Node memory fields.
Require terminal zero tasks, operations, reservations, correlations, credit
owners, retained buffers and busy/live workers after shutdown. Do not require
RSS to return to baseline or sum overlapping memory fields.

## Distribution and documentation

Compare source/declarations and export conditions explicitly against v0.15.0.
Create two equivalent clean candidate builds, compare all logical package file
hashes and manifest, and record archive SHA-256/sizes/count. Install actual
tarballs into separate external JS/TS projects, including paths with spaces;
execute from an unrelated directory. Check workers, source maps, all public
error identities, type fixtures, examples, natural process exit and shutdown.
Keep dependencies unchanged and package free of research/test/temp files.

Produce a contract inventory, public-error matrix, soak report, hardening report,
readiness matrix and separate new Windows machine-readable evidence. Preserve
every historical artifact byte-for-byte. CI covers Linux/Windows Node 22.13.0
and 24, installed packages and smoke; heavier profiles require manual dispatch.

## Gates and hard stops

Run baseline gates before implementation and repeat candidate gates under each
qualified Windows Node. Set version `1.0.0-rc.1` only after hardening is ready;
commit candidate source separately from resulting evidence. Qualify that exact
commit. No tag until fresh Windows AND Linux gates pass on identical candidate
source, all blockers close, and final clean package verification passes.

Correctness defects, leaks, deadlocks, lost/duplicate results, premature credit
release, broken replacement/shutdown, unusable package or minimum Node failures
block release. Any proposed public semantic change stops tagging for explicit
review. For a bug, first retain a minimal reproducer and regression, then explain
the smallest fix and its contract effects. Optional features and unclaimed
platforms do not block. Never retag v0.15.0, rewrite historical measurements,
start RC2/final 1.0, or publish npm during this task.
