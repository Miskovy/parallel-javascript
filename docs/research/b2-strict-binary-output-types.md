# B2: strict binary output types

B2 implements the ordinary-backed output types specified by Stage A, as a
separate change dependent on independently reviewed B1
`5e5625bb97b12c3e5ed18fbc58177787cbb9c7b5`. The local branch is
`fix/v1-owned-binary-results`. S1 and corrected Stage A remain dependencies with
separate integration decisions. Streaming remains experimental; B3/B4, option
renames, promotion, release and publication are outside this change.

## Implementation and compatibility

PjsOwnedTypedArray is a type-only root export containing all eleven existing
typed-array kinds with ordinary ArrayBuffer backing. PjsBinaryResult now accepts
ArrayBuffer, that union, or DataView<ArrayBuffer>. ResultByteDeclaration is also
intentionally root-exported, preserving its number or synchronous per-partition
callback signature. Both strict stream overloads retain their constraints, option
exclusions, output inference and PjsRangeStream return type.

Only index.ts and partition/range.ts change in production source; both edits are
types, exports of types and documentation. All 36 emitted production JavaScript
files remain byte-identical to B1. Exactly index.d.ts and partition/range.d.ts
change. Source maps reflect the TypeScript edits and are outside the byte claim.
The inventory reconciles 44 roots (17 runtime values, 27 type-only names),
187 member entries, five reachable-only named types and 158 statistics leaves.
Relative to B1, PjsOwnedTypedArray is new and ResultByteDeclaration moves from
reachable-only to root. Runtime namespace keys and supported package specifiers
are unchanged. RC4 freeze inputs, manifests, lockfile and release tooling are
preserved.

This deliberately narrows a pre-v1 type that admitted shared backing already
rejected by workers. A widened Uint8Array<ArrayBufferLike>, including a bare
Uint8Array output annotation, must establish ordinary backing through inference,
an explicit Uint8Array<ArrayBuffer> task schema, or a copy. Shared output users can
copy, use count-only streams without byte guarantees, or retain the earlier
prerelease. PjsTypedArray, constructors, sharedReadonly, input and mapping
signatures remain unchanged. "Owned" does not establish unique references,
liveness or transferability. Clone remains default; offset views may retain a
larger backing allocation than their visible byteLength. transfer() retains its
own buffer checks. Buffer acceptance depends on the backing type established by
its declaration and the existing runtime checks.

## Verification and evidence protocol

The installed package harness packs the candidate, installs into an unrelated
temporary consumer and checks installed declarations without skipLibCheck under
both locked compilers: primary 7.0.2 and compatibility/checker 6.0.3 (compatibility
wrapper package 6.0.2). The complete type fixture checks ordinary ArrayBuffer,
all eleven owned views, DataView, offsets, empty views, exact and upper-bound
overloads, transfer envelopes, count-only shared outputs and shared inputs.
Targeted negative fixtures cover shared typed views and DataView, direct shared
buffers, object graphs, widened view schemas and async declarations. A tuple
eligibility check verifies each of the eleven shared typed kinds independently.
The compiled installed TS consumer executes an owned BigInt result directly and
through a transfer envelope under each compiler.

An installed JavaScript consumer adds 104 positive worker cases across all
thirteen binary kinds, direct/transfer paths, zero/nonzero visible bytes and both
strict modes. Views use offsets and larger backing stores. It checks upper-bound
refunds and zero capacity. Another 29 cases verify worker-side rejection of
shared buffers/views and object graphs both directly and inside genuine transfer
envelopes, detached values, exact size mismatches and maximum overruns. Empty
transfer lists on invalid shared payloads reach the binary validator. Failure
assertions include error identity, partition metadata, no produced result and
released credit. Count-only shared output and mapping still execute successfully.

Existing binary-result, upper-bound-result, result-credit, transfer,
physical-boundary and closeable-stream contracts supply callback reentrancy,
cancellation during reconciliation and credit retention until physical completion
or confirmed worker exit. No runtime implementation or accounting behavior changes.

Retain ordinary runtime qualification separately for Windows x64 exact Node
22.13.0 and 24.21.0, using their selected runtime npm and independently selected
release npm 11.19.0. Run build, contracts, both compiler gates, installed package,
release-tooling dry-run tests, lint, format, documentation and diff checks, then
standard R2 and R3 campaigns at a clean committed candidate. Supplement with the
compatibility type fixture, inventory check/output, inventory-script regressions
and emitted-artifact comparison. Record exact source/environment, results and
retained tarball hashes in ignored delivery/evidence files. Qualification is not
an immutable RC4 release freeze or authorization to publish development rc.4 bytes.

Audit raw R2 histories/observations and every R3 configuration/result against the
aggregate, including source identity, environment, measurements, ownership
checkpoints and created/confirmed-exit totals. Archive and extract the evidence,
then audit the retained files again; successful aggregates alone are insufficient.
Local delivery binds actual completed results to the final candidate. Linux B2
qualification requires a Linux environment; historical B1 results are not fresh
B2 evidence. No macOS ARM, Node 24.0.0 floor, extended GC campaign, performance
claim or final release qualification is supplied by this change.

## Independent B1 review and retained-file exception

The supplied 22 October independent review accepts B1 with no blocking
implementation findings. It independently confirms 36 identical production JS
files and reconciles Windows evidence, plus Linux x64 Node 22.13.0/24.21.0 at
304 contracts, 162 R2 histories / 2,746 actions and 11 accepted R3 children each.
Those are attributed B1 results, not a new inspection of its referenced archive
or B2 qualification.

Two earlier Linux Node 22 campaigns had retained-file mismatches despite successful
aggregates. Both remain preserved and excluded. The cause is unresolved; workspace
retention is a hypothesis. The accepted replacement is a complete standard
campaign whose raw files were validated/archived together and independently
reconciled after extraction. The review identifies
`b1-review/.node-tools/b1-review/linux-node22-r3-accepted/report.json`, its raw
children and `b1-review-tools/evidence-audit.json` as accepted R3 evidence; the
original qualification supplies the other Linux Node 22 gates and R2. Do not cite
the original aggregate alone as proof of reconciled R3 files. This discrepancy
requires investigation before relying on aggregate-only automation; B2 neither
diagnoses nor silently repairs it.
