# B3: Internal registry snapshots

B3 implements the registry-composition boundary specified by Stage A. Its base is
main `2ae078b93c8b819d2d843ecb32ffb1fc5e6728f7`, the PR #22 integration of S1,
corrected Stage A, B1 and B2. The separate branch is
`fix/v1-internal-registry-snapshots`. Baseline inspection confirmed the main tree
matches the reviewed integration candidate and read the actual registry,
composition, descriptor consumers, boundary tests and installed fixtures.

## Intentional contract change

The unsupported public PjsTaskRegistry.snapshot() method and its declaration are
removed. There is no deprecated alias, public symbol, new root export or global
stripInternal change. Introspection callers must retain their own registration
metadata. This is an explicit pre-v1 JS/TS removal, absent from published RC4;
unchanged development rc.4 manifests do not authorize publication of these bytes.

Registry entries move from the emitted TS-private entries property to one
module-private WeakMap keyed by actual instances. The constructor initializes
each instance's map. register() and the internal snapshotRegistry(registry)
function use one guarded lookup; an unrecognized receiver throws TypeError
without reading forged properties. Instances initialized through the constructor
remain valid, including normal subclasses. This prevents forged/borrowed receiver
storage access; it is not a security sandbox or a module-loading boundary.

Production composition alone imports the internal accessor. Worker, dispatcher,
pool and coordinator descriptor type imports stay internal. TaskDescriptor and
the accessor can appear in the packed internal module/declaration; neither is
root-exported or reachable through supported root signatures, and package
subpaths remain blocked. Removing the private entries declaration also removes
that class-private structural constraint; a fabricated compatible TS shape still
does not establish a valid runtime instance and is rejected by the WeakMap guard.

The public register generic signature and zero-argument constructor contract stay
the same. Valid registration validation/error ordering, URL reads, default export
name and lazy bootstrap validation remain intact. Handles remain frozen identity
keys. Each snapshot is a fresh map with fresh descriptor objects; snapshot mutation
and later registration cannot change an existing runtime or its replacement-worker
configuration. Scalar normalization still precedes snapshot capture, then the
queue getter, complete graph construction and synchronous worker startup.

Only tasks/registry.ts and composition/create-runtime-components.ts change in
production. Only their emitted JavaScript changes; the remaining 34 of 36 JS
files stay byte-identical. Exactly tasks/registry.d.ts changes among declarations:
the private entries field and public snapshot() disappear, constructor() becomes
explicit and the module gains internal snapshotRegistry(). Runtime facade,
lifecycle, worker bootstrap/protocol, dispatch and physical-result ownership code
are unchanged. No additional state owner or production test hook is introduced.

The independently derived source/declaration inventory retains 44 roots (17
runtime values and 27 type-only names) and all 158 statistics leaves. It changes
187 to 186 member entries and five to four reachable-only named types, retiring
MEM.PjsTaskRegistry.snapshot and REACH.TaskDescriptor. No ID is reused. Canonical
locations and current support text are reconciled from checker output. ADR 0023
remains proposed as a whole; B4, Stage C and experimental promotion are untouched.

## Regression coverage

Seven registry cases cover absence of instance/prototype storage/snapshot access;
fresh maps/descriptors and frozen handle identity; duplicate/invalid registration
errors and URL getter timing; invalid snapshot/borrowed receiver guards without
forged property reads; registrations before/after construction, foreign same-ID
handles and mutation isolation; replacement workers using the captured descriptors;
and ignored unsupported snapshot properties plus invalid-registry rejection before
the queue getter. A late missing-module registration makes accidental live-registry
reuse by replacement workers observable. Every created runtime is shut down and
awaited; replacement readiness uses the existing bounded observation helper.

The S1 construction test no longer intercepts the removed public method. A task
registered in the registry getter is usable; a task registered in the queue getter
is rejected by that runtime. Together with the unchanged getter event order and
synchronous startup callback, these assert snapshot timing without a replacement
public inspection method or production test hook.

Installed JS checks snapshot absence, no registry own storage/symbol fields,
supported task execution, late/foreign handle rejection and blocked registry
subpaths. The existing namespace assertion verifies the same 17 runtime root
values. Both locked compiler fixtures reject registry.snapshot() and root imports
of TaskDescriptor and snapshotRegistry while retaining registration/construction
and the complete existing API fixtures. Installed declarations are checked without
skipLibCheck and emitted consumer programs execute against the actual tarball.

## Qualification and provenance

Commit implementation, tests and current documentation before qualification. Each
clean-candidate report records the actual source SHA, platform, architecture,
exact Node, selected runtime npm and separately selected release npm. Ignored
delivery and the draft PR bind final results to the delivered candidate without
a self-referential report commit. Development focused runs are not a substitute
for that clean committed-candidate qualification.

Run ordinary runtime qualification on available Windows x64 exact Node 22.13.0
and 24.21.0: build, full contracts, public types, compatibility, installed package,
release-tooling dry-run tests, lint, formatting, docs/diff and fresh standard R2/R3.
Use the independently selected integrity-pinned release npm 11.19.0; runtime npm
and compiler versions remain separately recorded. Supplement with full type
fixtures under the compatibility compiler, inventory parity/output and script
regressions, emitted-artifact comparison and protected-input checks. Release tests
are dry-run only; do not run publication or weaken frozen RC4 baselines.

Audit raw R2 histories/observations, real-worker/negative/replay/cleanup evidence,
and each R3 config/result against its aggregate, including exact source/environment,
measurements, quiescent ownership and created/confirmed exits. Retain raw files,
tarball digests and failed attempts under fresh exclusive output paths. Successful
aggregates alone are insufficient, and no historical report is relabeled as fresh
B3 evidence. CI's Node 24 selector floats; capture its actual patch and source
identity before accepting remote qualification.

Historical B2 Linux qualification remains incomplete: Node 22 evidence combined
separately successful retained runs without a completed ordinary qualifier; Node
24 was incomplete/failed. Those supplied accounts are not fresh B3 qualification.
Unavailable B3 Linux cells remain unqualified until actually executed and their
raw evidence reconciled. No Node 24.0.0 floor, macOS/ARM, extended GC/memory-pressure,
performance, reproduction or final publication qualification is inferred.

Separately tracked release holds remain open and outside this change; they were
not investigated. No version/tag/publication, auto-merge, B4, Stage C, Rust or
unrelated refactoring is authorized by this report. Stop after B3 delivery.
