# Current API contract inventory and proposed v1 dispositions

C2 development transition inventory from main
`3e0381317fde3438e1a3008dc8c4e84257ff066a` (PR #26 C1-A/Q integration).
**S1, corrected Stage A and B1–B4 are integrated; C2's three alias pairs are
implemented. Feature promotions and broader policy remain separately governed.
No feature is promoted.**
This is the canonical current inventory. The [v0.15 inventory](v0.15-public-api-inventory.md)
and [RC1 freeze inventory](v1-rc1-contract-inventory.md) are historical, including
their old `@pjs/runtime` spelling and 38-export count.

## Source identity and evidence limits

B4 was merged through [PR #24](https://github.com/Miskovy/parallel-javascript/pull/24).
The B4 merge main 35f2aac, reviewed B4 head e78b773 and CI synthetic merge c8c1576 have the
same tree `48bb493a6717dfbd2259af017937ca623110b044`. Those B4 revisions share
the reviewed/tested tree; this is historical tree equivalence, not qualification
of a later C1 candidate. The [Stage C qualification ledger](v1-api-migration-plan.md#verified-starting-state-and-qualification-ledger)
records the re-inspected four-cell B4 CI evidence and separate local results.
Current experimental annotations remain. C2 adds the three batch/count/constructor
names with deprecated aliases; C3 byte names remain unavailable. See the
[C2 engineering report](c2-range-option-transition.md) for the source/declaration
comparison and qualification procedure.

Historically, C1-A/Q added acceptance and installed-package evidence and clarified declaration
comments without changing any supported signature/field/modifier. All 37
pre-existing production JS files remain identical to its untouched main baseline;
all 37 declaration token streams are unchanged, with comments changing only in
types/index.d.ts and configuration/runtime-options.d.ts. The 61/322/0/158 graph
and seventeen runtime values remained intact. C2 adds eleven inherited/public
member entries, retaining every root, diagnostic leaf and pre-existing field.
The five transition option interfaces become exclusive-pair type aliases;
individual constructor fields are optional in the union but one spelling is
required. Runtime checks reject both spellings even when TypeScript's optional
never rules admit undefined without exact optional types. Locations below are refreshed from
the checker; historical reports and the existing field meanings remain untouched.
See [C1 evidence and pending promotion](c1-containment-acceptance.md). C1-P is not
approved by this acceptance work, and hold applicability remains unresolved.

B4's implementation base was main `e58e792a2069a9ac72cc13fe2309eb1e3c2b7dab`, including
[PR #23](https://github.com/Miskovy/parallel-javascript/pull/23) and reviewed
S1, corrected Stage A and B1–B3. Its isolated B4 branch was
`feat/v1-explicit-diagnostic-contracts`. B4 adds seventeen type-only root names
for diagnostics and error contexts/details. All 158 statistics leaves retain
their types and optionality; all 36 existing production JavaScript files retain
their bytes. A new diagnostics module emits only an empty ESM module. B3's removed
snapshot method and internal descriptor remain absent from the public graph.
See the [B4 engineering report](b4-explicit-diagnostic-contracts.md) for exact
validation commands, environment attribution and remaining promotion gates.
B3 CI Linux Node 22.13.0/24.22.1 and Windows 22.13.0/24.21.0 are historical B3
evidence, not fresh B4 results. Historical B2 Linux qualification remains incomplete.

The supplied readiness plan revision 3 (20 October) and Stage A handoff report
independent Linux x64 Node 22.13.0/24.21.0 S1 qualification: 293 contracts,
162 R2 histories / 2,746 actions and 11 R3 children per cell. The independent
addendum and ZIP are unavailable in this checkout, so those results are
**attributed, not newly inspected**. In that handoff, `linux-node24-confirmed.json`
and its checked children are the accepted rerun; the original Node 24 aggregate
with an incomplete retained child is excluded. Do not combine their evidence.
The locally retained S1 Windows reports identify the same exact candidate and
versions; their historical counts are not fresh Stage A runtime qualification.
See the [S1 engineering report](s1-runtime-api-boundaries.md).

Read-only public metadata checked on 22 October 2026 reports npm `latest` and
`next` at `1.0.0-rc.4`, published 7 October, and GitHub's latest listed release
as the [RC4 prerelease](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4).
The [registry metadata](https://registry.npmjs.org/@pjavascript%2fruntime)
and historical repository PR listing distinguish published RC4 from development.
S1/Stage A/B1–B3 are integrated at the current main base above. The unchanged `rc.4` manifest on development does not make it the
published artifact; it must never be published as replacement RC4 bytes.

## Extraction and scope

`npm run build` uses locked TypeScript 7.0.2; compatibility checking and the
inventory checker use the locked TypeScript 6.0.3 dependency. Run:

```sh
npm run build
node scripts/api-contract-inventory.mjs --check --output=.node-tools/stage-a/inventory.json
```

Run from the repository root after the normal locked `npm ci` and build; no
manual output-directory preparation is required. With `--output`, the tool
creates missing parent directories recursively and exclusively creates the file.
An existing output path fails without changing its contents; choose a fresh path
for each retained report. Without `--output`, no report directory/file is created.
The focused output-handling regression command (after build) is:

```sh
node --test scripts/api-contract-inventory.test.mjs
```

The script independently follows source and built root declarations with the
TypeScript checker, compares public structures, discovers repository-owned
signature-reachable types, enumerates statistics leaves, and verifies inventory
IDs. It normalizes compiler symbol IDs and object/union ordering, not method
overload order. It excludes TypeScript-private/protected members and standard
library member graphs; native boundaries are explicitly listed below. This is
an inspection aid, not a declaration-byte or release-artifact freeze. Ignored
JSON includes exact source and declaration locations, signatures and optionality.

Reconciled current counts: **61 root names = 17 JavaScript values (15 classes,
two functions) + 44 type-only names; 0 additional named reachable types;
158 statistics leaf paths; 333 repository-owned member entries**. Each public class value also has a TypeScript
instance type; those are not counted twice. Constructor overloads inherited
from a base class remain visible. `PjsRuntime` has eight methods, ten declared
method overloads and one constructor; `sharedReadonly` has five overloads.
No default export exists. Relative to Stage A's 40/175/7/158: CountOnlyStreamRangeOptions
moves from reachable-only to root (retiring `REACH.CountOnlyStreamRangeOptions`
in favor of `ROOT.CountOnlyStreamRangeOptions`), with eight member entries;
PjsRangeStream adds one root and four member entries. B2 adds the PjsOwnedTypedArray
root and moves ResultByteDeclaration from reachable-only to root, retiring
REACH.ResultByteDeclaration in favor of ROOT.ResultByteDeclaration. Relative to
B1's 42/187/6/158 this yielded B2's 44/187/5/158. B3 now retires
MEM.PjsTaskRegistry.snapshot and REACH.TaskDescriptor, giving 44/186/4/158.
The constructor remains new PjsTaskRegistry(), now explicitly declared; public
register signatures are unchanged. No diagnostic leaf changes. B4 adds seventeen type-only root names and 136 member
entries, yielding 61/322/0/158. Retired reachable IDs REACH.ErrorContext,
REACH.BinaryResultErrorContext, REACH.OperationStatus and REACH.RangeResultMode
move to ROOT.PjsErrorContext, ROOT.PjsBinaryResultErrorContext,
ROOT.PjsOperationStatus and ROOT.PjsRangeResultMode respectively.
See [ADR 0023](../adr/0023-v1-api-stability-decisions.md) for broader proposed decisions.

IDs are stable names: `ROOT.*`, `MEM.*`, `REACH.*`, `STAT.*`; renaming or removing
a future surface requires a recorded migration rather than reusing its ID.
Owners below are responsible runtime components, not assignments to people.
All target dispositions are recommendations. `S` means stabilize after B/core
gates; `P1` containment promotion; `P2` range/batching/map promotion; `P3` strict
binary promotion; `D` named diagnostic contract in B4; `I` internalize in B3.
The [migration specification](v1-api-migration-plan.md) defines those gates and
the [B specification](v1-api-corrections.md) gives exact proposed signatures.

## Root exports

The sole supported package specifier is `@pjavascript/runtime`.
[The manifest](../../packages/runtime/package.json) exposes `.` with ESM `import`
and `types` conditions. `src/` and `dist/` files being packed does not authorize
package subpaths, CJS, browsers, bundlers or TypeScript loaders. Worker tasks are
compiled JavaScript local `file:` module exports; no closures or new language.

| ID / name                                 | Visibility       | Source; declaration                                                                                                                                   | Owner; current status                                                                | Proposed disposition / evidence                                                                                     |
| ----------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `ROOT.BinaryStreamRangeOptions`           | TS only          | [src/partition/range.ts:90](../../packages/runtime/src/partition/range.ts#L90); `dist/partition/range.d.ts:61`                                        | Result credits / worker validation / stream API; Experimental binary result contract | B2 then P3/C3; binary-result, upper-bound-result, result-credit, physical-boundary; B2 negative TS                  |
| `ROOT.CountOnlyStreamRangeOptions`        | TS only          | [src/partition/range.ts:58](../../packages/runtime/src/partition/range.ts#L58); `dist/partition/range.d.ts:46`                                        | Stream API / delivery; experimental, B1 implemented in development                   | P2/C2 promotion pending; closeable-stream, stream and installed two-compiler consumers                              |
| `ROOT.PartitionInput`                     | TS only          | [src/partition/range.ts:16](../../packages/runtime/src/partition/range.ts#L16); `dist/partition/range.d.ts:14`                                        | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.PartitionOptions`                   | TS only          | [src/partition/range.ts:22](../../packages/runtime/src/partition/range.ts#L22); `dist/partition/range.d.ts:19`                                        | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.PartitionRange`                     | TS only          | [src/partition/range.ts:2](../../packages/runtime/src/partition/range.ts#L2); `dist/partition/range.d.ts:2`                                           | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.PjsBinaryResult`                    | TS only          | [src/partition/range.ts:82](../../packages/runtime/src/partition/range.ts#L82); `dist/partition/range.d.ts:57`                                        | Result credits / worker validation / stream API; Experimental binary result contract | B2 then P3/C3; binary-result, upper-bound-result, result-credit, physical-boundary; B2 negative TS                  |
| `ROOT.PjsBinaryResultContractError`       | JS + TS class    | [src/errors/index.ts:64](../../packages/runtime/src/errors/index.ts#L64); `dist/errors/index.d.ts:54`                                                 | Result credits / worker validation / stream API; Experimental binary result contract | B2 then P3/C3; binary-result, upper-bound-result, result-credit, physical-boundary; B2 negative TS                  |
| `ROOT.PjsCancelledError`                  | JS + TS class    | [src/errors/index.ts:59](../../packages/runtime/src/errors/index.ts#L59); `dist/errors/index.d.ts:44`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsError`                           | JS + TS class    | [src/errors/index.ts:24](../../packages/runtime/src/errors/index.ts#L24); `dist/errors/index.d.ts:21`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsExecutionLeaseError`             | JS + TS class    | [src/errors/index.ts:56](../../packages/runtime/src/errors/index.ts#L56); `dist/errors/index.d.ts:38`                                                 | Containment; experimental; C1-A/Q acceptance implemented                             | P1 pending explicit approval/eligibility; C1 failure-path and installed JS/both emitted TS controls; see C1 report  |
| `ROOT.PjsMapContractError`                | JS + TS class    | [src/errors/index.ts:63](../../packages/runtime/src/errors/index.ts#L63); `dist/errors/index.d.ts:52`                                                 | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.PjsOwnedTypedArray`                 | TS only          | [src/partition/range.ts:68](../../packages/runtime/src/partition/range.ts#L68); `dist/partition/range.d.ts:55`                                        | Result credits / stream API; experimental, B2 implemented in development             | P3/C3 promotion pending; both installed compilers and binary worker guards                                          |
| `ROOT.PjsQueueFullError`                  | JS + TS class    | [src/errors/index.ts:57](../../packages/runtime/src/errors/index.ts#L57); `dist/errors/index.d.ts:40`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsRangeStream`                     | TS only          | [src/partition/stream.ts:9](../../packages/runtime/src/partition/stream.ts#L9); `dist/partition/stream.d.ts:7`                                        | Stream API / delivery; experimental, B1 implemented in development                   | P2/C2 promotion pending; closeable-stream, stream and installed two-compiler consumers                              |
| `ROOT.PjsResultCapacityError`             | JS + TS class    | [src/errors/index.ts:75](../../packages/runtime/src/errors/index.ts#L75); `dist/errors/index.d.ts:60`                                                 | Result credits / worker validation / stream API; Experimental binary result contract | B2 then P3/C3; binary-result, upper-bound-result, result-credit, physical-boundary; B2 negative TS                  |
| `ROOT.PjsRuntime`                         | JS + TS class    | [src/runtime.ts:29](../../packages/runtime/src/runtime.ts#L29); `dist/runtime.d.ts:9`                                                                 | API / controller / engine owners; Core plus experimental methods                     | S/P1/P2/P3/D by CALL rows; B1–B4; runtime, public-options, runtime-boundaries; B/C gates                            |
| `ROOT.PjsRuntimeOptions`                  | TS only          | [src/configuration/runtime-options.ts:6](../../packages/runtime/src/configuration/runtime-options.ts#L6); `dist/configuration/runtime-options.d.ts:3` | Configuration / task / controller; Core plus experimental R1 fields                  | S base; P1 R1 fields/C1; public-options, containment, runtime-boundaries; C1 installed fixture                      |
| `ROOT.PjsRuntimeStateError`               | JS + TS class    | [src/errors/index.ts:61](../../packages/runtime/src/errors/index.ts#L61); `dist/errors/index.d.ts:48`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsSerializationError`              | JS + TS class    | [src/errors/index.ts:60](../../packages/runtime/src/errors/index.ts#L60); `dist/errors/index.d.ts:46`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsTask`                            | TS only          | [src/tasks/registry.ts:6](../../packages/runtime/src/tasks/registry.ts#L6); `dist/tasks/registry.d.ts:3`                                              | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsTaskError`                       | JS + TS class    | [src/errors/index.ts:43](../../packages/runtime/src/errors/index.ts#L43); `dist/errors/index.d.ts:30`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsTaskRegistrationError`           | JS + TS class    | [src/errors/index.ts:62](../../packages/runtime/src/errors/index.ts#L62); `dist/errors/index.d.ts:50`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsTaskRegistry`                    | JS + TS class    | [src/tasks/registry.ts:27](../../packages/runtime/src/tasks/registry.ts#L27); `dist/tasks/registry.d.ts:12`                                           | Registry/composition; Core candidate; B3 encapsulation implemented in development    | S registration; unsupported snapshot removed; registry/runtime-boundaries and installed two-compiler absence checks |
| `ROOT.PjsTimeoutError`                    | JS + TS class    | [src/errors/index.ts:58](../../packages/runtime/src/errors/index.ts#L58); `dist/errors/index.d.ts:42`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.PjsTransfer`                        | TS only          | [src/tasks/transfer.ts:10](../../packages/runtime/src/tasks/transfer.ts#L10); `dist/tasks/transfer.d.ts:2`                                            | Transfer claims / shared helper; Specialized supported                               | S specialized; preserve ownership; transfer, shared, physical-boundary, package-smoke                               |
| `ROOT.PjsTypedArray`                      | TS only          | [src/partition/range.ts:104](../../packages/runtime/src/partition/range.ts#L104); `dist/partition/range.d.ts:73`                                      | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.PjsTypedArrayConstructor`           | TS only          | [src/partition/range.ts:118](../../packages/runtime/src/partition/range.ts#L118); `dist/partition/range.d.ts:75`                                      | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.PjsWorkerError`                     | JS + TS class    | [src/errors/index.ts:54](../../packages/runtime/src/errors/index.ts#L54); `dist/errors/index.d.ts:35`                                                 | Registry / task / errors; Core candidate                                             | S; B4 intentional error names; runtime, public-options, transfer, package-smoke; B4 errors                          |
| `ROOT.RangePartition`                     | TS only          | [src/partition/range.ts:9](../../packages/runtime/src/partition/range.ts#L9); `dist/partition/range.d.ts:8`                                           | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.RestartPolicy`                      | TS only          | [src/types/index.ts:69](../../packages/runtime/src/types/index.ts#L69); `dist/types/index.d.ts:55`                                                    | Containment; experimental; C1-A/Q acceptance implemented                             | P1 pending explicit approval/eligibility; C1 failure-path and installed JS/both emitted TS controls; see C1 report  |
| `ROOT.ResultByteDeclaration`              | TS only          | [src/partition/range.ts:86](../../packages/runtime/src/partition/range.ts#L86); `dist/partition/range.d.ts:59`                                        | Result credits / stream API; experimental, B2 implemented in development             | P3/C3 promotion pending; both installed compilers and binary worker guards                                          |
| `ROOT.RunOptions`                         | TS only          | [src/types/index.ts:41](../../packages/runtime/src/types/index.ts#L41); `dist/types/index.d.ts:29`                                                    | Configuration / task / controller; Core plus experimental R1 fields                  | S base; P1 R1 fields/C1; public-options, containment, runtime-boundaries; C1 installed fixture                      |
| `ROOT.RuntimeState`                       | TS only          | [src/types/index.ts:1](../../packages/runtime/src/types/index.ts#L1); `dist/types/index.d.ts:1`                                                       | Telemetry / worker / task; Supported diagnostics; shape unfrozen                     | D/B4; preserve listed vocabulary; runtime, containment, memory-observability; B4 per-field assertions               |
| `ROOT.sharedReadonly`                     | JS + TS function | [src/tasks/shared.ts:16](../../packages/runtime/src/tasks/shared.ts#L16); `dist/tasks/shared.d.ts:7`                                                  | Transfer claims / shared helper; Specialized supported                               | S specialized; preserve ownership; transfer, shared, physical-boundary, package-smoke                               |
| `ROOT.ShutdownOptions`                    | TS only          | [src/types/index.ts:56](../../packages/runtime/src/types/index.ts#L56); `dist/types/index.d.ts:43`                                                    | Configuration / task / controller; Core plus experimental R1 fields                  | S base; P1 R1 fields/C1; public-options, containment, runtime-boundaries; C1 installed fixture                      |
| `ROOT.StreamRangeOptions`                 | TS only          | [src/partition/range.ts:42](../../packages/runtime/src/partition/range.ts#L42); `dist/partition/range.d.ts:35`                                        | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.StreamRangeResult`                  | TS only          | [src/partition/stream.ts:3](../../packages/runtime/src/partition/stream.ts#L3); `dist/partition/stream.d.ts:2`                                        | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.TaskSnapshot`                       | TS only          | [src/types/index.ts:24](../../packages/runtime/src/types/index.ts#L24); `dist/types/index.d.ts:13`                                                    | Telemetry / worker / task; Supported diagnostics; shape unfrozen                     | D/B4; preserve listed vocabulary; runtime, containment, memory-observability; B4 per-field assertions               |
| `ROOT.TaskStatus`                         | TS only          | [src/types/index.ts:4](../../packages/runtime/src/types/index.ts#L4); `dist/types/index.d.ts:3`                                                       | Telemetry / worker / task; Supported diagnostics; shape unfrozen                     | D/B4; preserve listed vocabulary; runtime, containment, memory-observability; B4 per-field assertions               |
| `ROOT.transfer`                           | JS + TS function | [src/tasks/transfer.ts:16](../../packages/runtime/src/tasks/transfer.ts#L16); `dist/tasks/transfer.d.ts:7`                                            | Transfer claims / shared helper; Specialized supported                               | S specialized; preserve ownership; transfer, shared, physical-boundary, package-smoke                               |
| `ROOT.TypedMapRangeOptions`               | TS only          | [src/partition/range.ts:132](../../packages/runtime/src/partition/range.ts#L132); `dist/partition/range.d.ts:77`                                      | Range engine / API / map assembly; Experimental range/result contract                | P2/C2 (strict byte additions P3/C3); partition, completion, stream, map, batch; installed B1/C2/C3 fixtures         |
| `ROOT.UpperBoundBinaryStreamRangeOptions` | TS only          | [src/partition/range.ts:97](../../packages/runtime/src/partition/range.ts#L97); `dist/partition/range.d.ts:67`                                        | Result credits / worker validation / stream API; Experimental binary result contract | B2 then P3/C3; binary-result, upper-bound-result, result-credit, physical-boundary; B2 negative TS                  |
| `ROOT.WorkerState`                        | TS only          | [src/types/index.ts:14](../../packages/runtime/src/types/index.ts#L14); `dist/types/index.d.ts:4`                                                     | Telemetry / worker / task; Supported diagnostics; shape unfrozen                     | D/B4; preserve listed vocabulary; runtime, containment, memory-observability; B4 per-field assertions               |
| `ROOT.WorkerStatus`                       | TS only          | [src/types/index.ts:3](../../packages/runtime/src/types/index.ts#L3); `dist/types/index.d.ts:2`                                                       | Telemetry / worker / task; Supported diagnostics; shape unfrozen                     | D/B4; preserve listed vocabulary; runtime, containment, memory-observability; B4 per-field assertions               |

| `ROOT.PjsBinaryResultErrorContext` | TS only | [src/errors/index.ts:11](../../packages/runtime/src/errors/index.ts#L11); `dist/errors/index.d.ts:10` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsContainmentStats` | TS only | [src/diagnostics.ts:14](../../packages/runtime/src/diagnostics.ts#L14); `dist/diagnostics.d.ts:12` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsDispatchStats` | TS only | [src/diagnostics.ts:95](../../packages/runtime/src/diagnostics.ts#L95); `dist/diagnostics.d.ts:85` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsErrorContext` | TS only | [src/errors/index.ts:1](../../packages/runtime/src/errors/index.ts#L1); `dist/errors/index.d.ts:1` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsMapResultStats` | TS only | [src/diagnostics.ts:81](../../packages/runtime/src/diagnostics.ts#L81); `dist/diagnostics.d.ts:73` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsOperationSnapshot` | TS only | [src/diagnostics.ts:109](../../packages/runtime/src/diagnostics.ts#L109); `dist/diagnostics.d.ts:96` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsOperationStats` | TS only | [src/diagnostics.ts:51](../../packages/runtime/src/diagnostics.ts#L51); `dist/diagnostics.d.ts:45` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsOperationStatus` | TS only | [src/diagnostics.ts:104](../../packages/runtime/src/diagnostics.ts#L104); `dist/diagnostics.d.ts:93` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsOutcomeStats` | TS only | [src/diagnostics.ts:4](../../packages/runtime/src/diagnostics.ts#L4); `dist/diagnostics.d.ts:3` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsPartitionStats` | TS only | [src/diagnostics.ts:87](../../packages/runtime/src/diagnostics.ts#L87); `dist/diagnostics.d.ts:78` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsQueueStats` | TS only | [src/diagnostics.ts:36](../../packages/runtime/src/diagnostics.ts#L36); `dist/diagnostics.d.ts:32` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsRangeResultMode` | TS only | [src/diagnostics.ts:106](../../packages/runtime/src/diagnostics.ts#L106); `dist/diagnostics.d.ts:94` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsRuntimeStats` | TS only | [src/diagnostics.ts:142](../../packages/runtime/src/diagnostics.ts#L142); `dist/diagnostics.d.ts:128` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsStreamResultStats` | TS only | [src/diagnostics.ts:60](../../packages/runtime/src/diagnostics.ts#L60); `dist/diagnostics.d.ts:53` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsTaskErrorDetails` | TS only | [src/errors/index.ts:18](../../packages/runtime/src/errors/index.ts#L18); `dist/errors/index.d.ts:16` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsTimingStats` | TS only | [src/diagnostics.ts:42](../../packages/runtime/src/diagnostics.ts#L42); `dist/diagnostics.d.ts:37` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |
| `ROOT.PjsWorkerStats` | TS only | [src/diagnostics.ts:25](../../packages/runtime/src/diagnostics.ts#L25); `dist/diagnostics.d.ts:22` | Diagnostic/error contracts; B4 implemented in development | D/B4; explicit preserved shapes; both installed compilers, diagnostics and lifecycle contracts; group promotion remains pending |

### Exact constructor and helper signatures

Current declarations, not proposed signatures. Repeated inherited error constructors are intentional.

#### PjsBinaryResultContractError

```ts
(message: string, context?: import("./errors/index.js").PjsBinaryResultErrorContext): import("./errors/index.js").PjsBinaryResultContractError
```

#### PjsCancelledError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsCancelledError
```

#### PjsError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsError
```

#### PjsExecutionLeaseError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsExecutionLeaseError
```

#### PjsMapContractError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsMapContractError
```

#### PjsQueueFullError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsQueueFullError
```

#### PjsResultCapacityError

```ts
(message: string, context?: import("./errors/index.js").PjsBinaryResultErrorContext): import("./errors/index.js").PjsResultCapacityError
```

#### PjsRuntime

```ts
(options: import("./runtime.js").PjsRuntimeOptions): import("./runtime.js").PjsRuntime
```

#### PjsRuntimeStateError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsRuntimeStateError
```

#### PjsSerializationError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsSerializationError
```

#### PjsTaskError

```ts
(error: import("./errors/index.js").PjsTaskErrorDetails, context: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsTaskError
```

#### PjsTaskRegistrationError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsTaskRegistrationError
```

#### PjsTaskRegistry

```ts
(): import("./tasks/registry.js").PjsTaskRegistry
```

#### PjsTimeoutError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsTimeoutError
```

#### PjsWorkerError

```ts
(message: string, context?: import("./errors/index.js").PjsErrorContext): import("./errors/index.js").PjsWorkerError
```

#### sharedReadonly

```ts
(source: Uint8Array): Uint8Array<SharedArrayBuffer>
(source: Int32Array): Int32Array<SharedArrayBuffer>
(source: Uint32Array): Uint32Array<SharedArrayBuffer>
(source: Float32Array): Float32Array<SharedArrayBuffer>
(source: Float64Array): Float64Array<SharedArrayBuffer>
```

#### transfer

```ts
<Output>(value: Output, transferList: readonly ArrayBuffer[]): import("./tasks/transfer.js").PjsTransfer<Output>
```

### Current aliases without object members

```ts
type PjsOperationStatus =
  'created' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
type PjsRangeResultMode = 'collect' | 'discard' | 'stream' | 'map';

type PjsBinaryResult =
  | ArrayBuffer
  | import('./partition/range.js').PjsOwnedTypedArray
  | DataView<ArrayBuffer>;
type PjsOwnedTypedArray =
  | Int8Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Uint8ClampedArray<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int32Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Float32Array<ArrayBuffer>
  | Float64Array<ArrayBuffer>
  | BigInt64Array<ArrayBuffer>
  | BigUint64Array<ArrayBuffer>;
type ResultByteDeclaration = number | ((partition: RangePartition) => number);
type PjsTypedArray =
  | Int8Array<ArrayBufferLike>
  | Uint8Array<ArrayBufferLike>
  | Uint8ClampedArray<ArrayBufferLike>
  | Int16Array<ArrayBufferLike>
  | Uint16Array<ArrayBufferLike>
  | Int32Array<ArrayBufferLike>
  | Uint32Array<ArrayBufferLike>
  | Float32Array<ArrayBufferLike>
  | Float64Array<ArrayBufferLike>
  | BigInt64Array<ArrayBufferLike>
  | BigUint64Array<ArrayBufferLike>;
type PjsTypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;
type RuntimeState =
  'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
type TaskStatus =
  | 'created'
  | 'running'
  | 'failed'
  | 'queued'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'timed_out';
type WorkerStatus = 'starting' | 'stopped' | 'failed' | 'idle' | 'busy';
```

## JavaScript visibility, TypeScript access and support

| Surface                                          | JavaScript                                                                              | Current declaration                                                                  | Intended support / proposed action                                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root classes/functions, prototype methods        | Callable                                                                                | Declared as listed below                                                             | Preserve public prototype receivers; no per-instance binding or async facade wrappers                                                                                              |
| Type-only root names                             | No runtime value                                                                        | Importable with `import type`                                                        | Govern their structural contract; no corresponding runtime namespace promise                                                                                                       |
| `PjsTaskRegistry.snapshot()`                     | Absent from public prototype in B3                                                      | Absent from public declaration in B3                                                 | Unsupported pre-v1 method removed; introspection callers retain their own registration metadata                                                                                    |
| Registry storage                                 | Module-private WeakMap; no instance field or public symbol                              | Absent from the public class declaration                                             | B3 internal storage; callers retain their own metadata                                                                                                                             |
| Runtime `components`                             | Emitted ordinary property                                                               | Private; TS access rejected                                                          | Unsupported transitive component graphs, clocks, methods and mutable maps                                                                                                          |
| Registry descriptors                             | Internal composition/worker descriptors only                                            | `TaskDescriptor` is neither root-exported nor root-reachable                         | B3 internalized storage/access; never a task-input schema or supported module-resolution API                                                                                       |
| Task brand                                       | Handles are frozen `{ id }`; no type brand at runtime                                   | Optional unique-symbol phantom function preserves generic input/output relationships | Preserve handle identity; don't promise a runtime branding symbol or accept forged handles                                                                                         |
| Transfer brand/envelope                          | Frozen envelope has `value` and a module-local symbol; WeakMap records ownership intent | Required readonly symbol brand; symbol itself not exported                           | Public payload is `value`; only envelopes constructed in the worker isolate are recognized. Reflection does not make the private key a supported export                            |
| Standard `Error`, Object and iterable prototypes | Normal JavaScript inheritance                                                           | Supplied by platform typings                                                         | No promise over enumeration order, constructor arity, arbitrary prototype monkey-patching or stack bytes. Actual user getters/reentrant callbacks still require the ordering below |

No global `stripInternal` change, inspection API or public component context is
proposed. Signature-reachable named types are not supported package entrypoints.

## Calls, overloads and temporal contract

| ID / method                                                | Current call and return                                                                                                                                              | Owner; outcome/ordering contract; target and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CALL.registry.constructor`                                | `new PjsTaskRegistry()`                                                                                                                                              | Registry; empty independent registration set. S/B3; runtime/shared tests                                                                                                                                                                                                                                                                                                                                                                                                              |
| `CALL.registry.register`                                   | `register<Input, Output>(id: string, module: URL, exportName?: string): PjsTask<Input, Output>`                                                                      | Default export name `default`. Synchronous registration errors for falsey/duplicate ID, non-URL/non-file URL or falsey export. No synchronous import/export existence check; bootstrap later validates it. Task handle identity and copied descriptors isolate later registrations. S/B3; runtime/public-options/package tests                                                                                                                                                        |
| `CALL.runtime.constructor`                                 | `new PjsRuntime(options: PjsRuntimeOptions)`                                                                                                                         | Configuration and composition; synchronous scalar/registry/queue validation. Snapshots registry before queue read, completes graph, synchronously starts workers. `ready()` then observes async bootstrap. Initial population fixed; bounds are normalization controls, not autoscaling. S; public-options/runtime-boundaries                                                                                                                                                         |
| `CALL.runtime.ready`                                       | `ready(): Promise<void>`                                                                                                                                             | Controller; original shared promise before/after settlement; bootstrap rejection preserves exported error identity. S; runtime/containment/runtime-boundaries                                                                                                                                                                                                                                                                                                                         |
| `CALL.runtime.run`                                         | `run<Input, Output>(task, input, options?): Promise<Output>`                                                                                                         | Task coordinator; accepts during starting/running. Registry/state check precedes option reads; lease, timeout, signal and transfer checks precede admission; getters can abort/reenter. Most invalid requests reject, but arbitrary uncaught option/signal getters can throw synchronously. Queue/physical admission precede posting getters. Payload referenced until dispatch, then cleared. S/P1; transfer/physical-boundary/containment                                           |
| `CALL.runtime.partitionRange`                              | `partitionRange<Input, Output>(task, range, createInput, options?): Promise<Output[]>`                                                                               | Range engine; synchronous host factory runs lazily with admission reserved. Outputs indexed by partition, not completion order. Full results retained; no byte bound. Parent owns one deadline, AsyncResource and cleanup. P2; partition/memory/context tests                                                                                                                                                                                                                         |
| `CALL.runtime.parallelFor`                                 | `parallelFor<Input>(task: PjsTask<Input, unknown>, range, createInput, options?): Promise<void>`                                                                     | API selects discard mode; workers ignore output before serialization. Side effects may be partial on failure; no rollback. P2; completion/batch/containment                                                                                                                                                                                                                                                                                                                           |
| `CALL.runtime.parallelMapRange.array`                      | `parallelMapRange<Input, Output>(task: PjsTask<Input, readonly Output[]>, range, createInput, options?): Promise<Output[]>`                                          | Full flat ordinary-array target; every block cardinality must equal partition span, copied to logical offset. No partial target returned. P2; map/runtime-boundaries                                                                                                                                                                                                                                                                                                                  |
| `CALL.runtime.parallelMapRange.typed`                      | `<Input, C extends PjsTypedArrayConstructor>(task: PjsTask<Input, InstanceType<C>>, range, createInput, options: TypedMapRangeOptions<C>): Promise<InstanceType<C>>` | Built-in constructor selected by property presence before engine validation. Its getter may synchronously throw. Empty ranges still return correct typed target. Result-constructor getters can abort; validate before reading coordinator target. P2; map/runtime-boundaries                                                                                                                                                                                                         |
| `CALL.runtime.streamRange.count`                           | `streamRange<Input, Output>(task, range, createInput, options?: CountOnlyStreamRangeOptions): PjsRangeStream<Output>`                                                | Eager start, completion order, bounded count, single iterator instance. B1 exposes required direct cleanup; P2 promotion remains pending. closeable-stream, stream/memory/runtime-boundaries and installed consumers                                                                                                                                                                                                                                                                  |
| `CALL.runtime.streamRange.binary`                          | `<Input, Output extends PjsBinaryResult>(task, range, createInput, options: BinaryStreamRangeOptions \| UpperBoundBinaryStreamRangeOptions): PjsRangeStream<Output>` | Same delivery, with paired exact/maximum byte declaration and capacity. B2 result type requires ordinary backing, matching worker checks; P3 remains proposed. binary-result/upper-bound/physical-boundary and installed JS/two-compiler consumers                                                                                                                                                                                                                                    |
| `CALL.runtime.stats`                                       | `stats():` inferred copied object                                                                                                                                    | Telemetry projects actual owners. Snapshot values can be mutated by caller without mutating engine. No terminal history, reset, payload graph or latency quantiles. Reading rolling-window utilization can expire old budget records. D/B4; all `STAT.*` rows below                                                                                                                                                                                                                   |
| `CALL.runtime.shutdown`                                    | `shutdown(options?: ShutdownOptions): Promise<void>`                                                                                                                 | Controller; admission closes synchronously. Existing promise checked before reading/validating later options. First call owns mode/timer/promise; invalid first options synchronously throw. Graceful waits accepted ungenerated range work and stream delivery. Forced/expiry cancels callers, requests termination, then awaits confirmed cleanup. Termination rejection rejects without declaring stopped or releasing physical credit. S/P1; containment/physical-boundary/memory |
| `CALL.transfer`                                            | `transfer<Output>(value: Output, transferList: readonly ArrayBuffer[]): PjsTransfer<Output>`                                                                         | Transfer helper; synchronous list validation/copy, no detachment at helper call. Output moves when posted by worker; caller receives unwrapped payload, not envelope. Supports live unique transferable ordinary buffers only. S specialized; transfer/binary/package tests                                                                                                                                                                                                           |
| `CALL.sharedReadonly.{Uint8,Int32,Uint32,Float32,Float64}` | Five same-kind overloads: `sharedReadonly(source: K): K<SharedArrayBuffer>`                                                                                          | Copies visible bytes into new compact shared backing; source clone/transfer/shared backing can be read if live. SAB writes remain technically possible; source stable during copy and published input immutable by contract. No lease/cancellation restores ownership. S specialized; shared/memory/package tests                                                                                                                                                                     |

Range requests check main-thread restriction, forbidden lease property, plan,
factory function, timeout/signal/batch/constructor options before runtime state,
registry, pre-abort and parent capacity. Common caught validation returns rejected
promise; stream adaptation instead returns a failed iterator. Range getters are
read `start`, `end`, `grainSize`; options read timeout, signal, batch size. Stream
count/byte normalization comes first; rejected accounting precedes catch-path
property tests. A map output-constructor getter runs before range rejection.
C2 probes each current spelling followed by its deprecated alias, by presence,
at these same boundaries; both presence rejects before either value read. Only
the selected property is read once; absent pairs use their existing defaults
without reading either value. These additional Proxy has operations are
intentional. There are no warning reads or eager reads of unrelated properties.
Application proxies/getters can throw outside catch scopes; the stable API must
not advertise that every invalid JavaScript value becomes an async rejection.

Factories must synchronously return `{ input, transferList? }`; async factories
fail. Claims precede reentrant factories and serialization getters. Parent terminal
state precedes sibling cancellation. Range factory/settlement AsyncResource and
ordinary Promise continuation context must remain. Streams hold one pending read;
concurrent `next()` rejects that second read without cancelling the first. Close
or failure clears buffer, callbacks/waiter and parent factory; logical cancellation
does not release posting/dispatched physical credit until response/confirmed exit.

## Options and value fields

All optional fields below are omitted by default; explicit `undefined` does not
mean omission for `in`-based exclusion rules. Numbers are runtime validated, not
encoded as TypeScript integer subtypes. Default time unit is milliseconds.

| Field                                                    | Current default, limit and delivery                                                                                                                                                                                             | Target / gate                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PjsRuntimeOptions.registry`                             | Required actual registry; internal snapshotRegistry synchronously after scalar normalization                                                                                                                                    | B3 implemented: public registration retained, invalid snapshot receivers reject with TypeError                                                                            |
| `minWorkers`, `maxWorkers`, `workers`                    | Min defaults 1; max defaults `max(min, workers ?? availableParallelism())`; workers defaults clamped available parallelism. Safe integers, `1 <= min <= workers <= max`, each <= MAX_SAFE_INTEGER. Validate min → max → workers | S, fixed initial population; no dynamic scaling promise                                                                                                                   |
| `maxQueue`                                               | 1024; safe integer 0..MAX_SAFE_INTEGER; scheduler validates after registry snapshot. Counts queued logical tasks, including batch weight                                                                                        | S; 0 permits direct idle admission, not a waiting slot                                                                                                                    |
| `startupTimeout`                                         | 30,000; integer 1..2^31-1 per initial/replacement bootstrap                                                                                                                                                                     | S; startup failure async via readiness/runtime                                                                                                                            |
| `maxRestarts`                                            | `workers * 4`; integer 0..MAX_SAFE_INTEGER, lifetime pool replacement-decision budget                                                                                                                                           | S compatibility; reject simultaneous defined restartPolicy                                                                                                                |
| `restartPolicy.maxRestarts`, `.windowMs`                 | No policy by default; max >= 0, window >= 1, both safe integers; copied at construction; rolling monotonic age >= window expires                                                                                                | P1; counts decisions before exit, replacement only after exit; no replay. Type currently permits a combination runtime rejects                                            |
| `RunOptions.signal`, `PartitionOptions.signal`           | Omitted; AbortSignal pre-abort rejected; listener removed once. Timeout/cancel settles caller only while physical execution can continue                                                                                        | S / P2; no worker AsyncLocalStorage inheritance                                                                                                                           |
| `timeout`                                                | Omitted: no caller/parent deadline. Integer 1..2^31-1; run includes startup/queue; range includes factory, children, stream consumer delivery                                                                                   | S / P2; a deadline is not execution termination                                                                                                                           |
| `RunOptions.executionLease`                              | Omitted: no physical lease. Integer 1..2^31-1; starts after successful posting/credit claim, before start acknowledgement; excludes queue wait                                                                                  | P1; ordinary exclusive run only; presence of batching property rejected with a defined lease                                                                              |
| `PartitionOptions.executionLease?: never`                | Any property presence, including undefined/inherited, rejected before factory/execution                                                                                                                                         | P2; keep exclusion                                                                                                                                                        |
| `RunOptions.transferList`, `PartitionInput.transferList` | Omitted: clone. Copied live unique ordinary buffer list; no SAB, views, marked/untransferable/detached buffers. Rechecked before posting; posted sender views detach                                                            | S / P2; queued cancellation releases claims without detachment, posted failure never restores them                                                                        |
| `ShutdownOptions.drain`                                  | true; false explicitly forces cancellation/termination. First options win, later getters never read                                                                                                                             | S/P1; no implicit escalation when omitted                                                                                                                                 |
| `ShutdownOptions.forceAfter`                             | Omitted; integer 1..2^31-1 from first call, includes startup; requires graceful mode. Early timer wakes reschedule remaining monotonic time                                                                                     | P1; deadline for requesting escalation, not a hard exit-latency bound                                                                                                     |
| `PartitionRange.start/end/grainSize`                     | Safe integer endpoints, end >= start, safe span; grain >= 1. Half-open; chunks = ceiling(span/grain). Collect/map <=2^32-1 chunks, completion/stream <=MAX_SAFE_INTEGER; map span <=2^32-1 elements                             | P2; empty range valid; allocations may still fail before acceptance                                                                                                       |
| `RangePartition.index/start/end`                         | Frozen zero-based chunk descriptor; end is clipped final endpoint                                                                                                                                                               | P2; immutable metadata; not a copy of mutable input range                                                                                                                 |
| `experimentalDispatchBatchSize`                          | 1; integer 1..16. Sequential children from same parent/task. Live window workers × batch size, bounded physical production per turn                                                                                             | P2; reject child input transfers when configured >1, even a single physical item; first item failure skips rest, no rollback. C2 alias transition implemented; P2 pending |
| `experimentalMaxBufferedResults`                         | workers; positive safe integer. Buffered + admitted-unsettled logical results per stream; bounded batch admission                                                                                                               | B1 implemented; P2/C2; not bytes or consumer-retained results                                                                                                             |
| `experimentalResultBytes` / `experimentalMaxResultBytes` | No byte mode unless paired with byte capacity; exact vs maximum mutually exclusive by presence. Number >=0 safe integer or synchronous per-partition callback                                                                   | B2/P3; invalid literal wrapped binary-contract error; callback evaluated in parent AsyncResource and may fail lazily before that factory                                  |
| `experimentalMaxReservedResultBytes`                     | No default; paired field, nonnegative safe integer. Per-stream declared/unreconciled maximum/reconciled actual visible bytes. Declaration over capacity rejected, no successful refund on failure                               | B2/P3; rename C3; 0 allows zero-byte results; not RSS/backing-store bound                                                                                                 |
| `experimentalOutputConstructor`                          | Omitted: ordinary array. Exactly one of the eleven built-in typed constructors; no subclass. Array/typed blocks must match kind and partition span                                                                              | P2 pending; C2 aliases retained; mapping/input types remain shared-capable despite strict-binary narrowing                                                                |

`PjsTypedArray`/constructor enumerate Int8, Uint8, Uint8Clamped, Int16, Uint16,
Int32, Uint32, Float32, Float64, BigInt64 and BigUint64, retaining ArrayBufferLike
backing. B2's `PjsOwnedTypedArray` enumerates those eleven kinds with ArrayBuffer
backing; `PjsBinaryResult` includes it, ordinary ArrayBuffer and
DataView<ArrayBuffer>. These types do not prove unique references, liveness or
transferability. Root-exported `ResultByteDeclaration` is a
number or `(partition: RangePartition) => number`, never an async declaration.
`PjsTask<Input, Output>`'s types describe the registered schema, not verified
worker code. `PjsTransfer<Output>.value` retains its payload's ordinary mutability.

### Declared member map

The following generated rows reconcile all repository-owned public members,
including inherited error/context and option fields. Locations distinguish
source (`src`) from built declaration (`dist`); exact type text and overloads are
in the inspection JSON. Semantic decisions are the root, call, option, error and
statistics sections, rather than a second policy in these lookup rows.

### BinaryStreamRangeOptions

| ID                                                                | Current type / modifiers                                                                     | Source; declaration                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MEM.BinaryStreamRangeOptions.dispatchBatchSize`                  | optional; `number`                                                                           | [src/partition/range.ts:30](../../packages/runtime/src/partition/range.ts#L30); `dist/partition/range.d.ts:26` |
| `MEM.BinaryStreamRangeOptions.maxBufferedResults`                 | optional; `number`                                                                           | [src/partition/range.ts:46](../../packages/runtime/src/partition/range.ts#L46); `dist/partition/range.d.ts:37` |
| `MEM.BinaryStreamRangeOptions.executionLease`                     | optional; `never`                                                                            | [src/partition/range.ts:24](../../packages/runtime/src/partition/range.ts#L24); `dist/partition/range.d.ts:21` |
| `MEM.BinaryStreamRangeOptions.experimentalDispatchBatchSize`      | optional; `number`                                                                           | [src/partition/range.ts:32](../../packages/runtime/src/partition/range.ts#L32); `dist/partition/range.d.ts:28` |
| `MEM.BinaryStreamRangeOptions.experimentalMaxBufferedResults`     | optional; `number`                                                                           | [src/partition/range.ts:48](../../packages/runtime/src/partition/range.ts#L48); `dist/partition/range.d.ts:39` |
| `MEM.BinaryStreamRangeOptions.experimentalMaxReservedResultBytes` | required; `number`                                                                           | [src/partition/range.ts:93](../../packages/runtime/src/partition/range.ts#L93); `dist/partition/range.d.ts:64` |
| `MEM.BinaryStreamRangeOptions.experimentalMaxResultBytes`         | optional; `never`                                                                            | [src/partition/range.ts:92](../../packages/runtime/src/partition/range.ts#L92); `dist/partition/range.d.ts:63` |
| `MEM.BinaryStreamRangeOptions.experimentalResultBytes`            | required; `number \| ((partition: import("./partition/range.js").RangePartition) => number)` | [src/partition/range.ts:91](../../packages/runtime/src/partition/range.ts#L91); `dist/partition/range.d.ts:62` |
| `MEM.BinaryStreamRangeOptions.signal`                             | optional; `AbortSignal`                                                                      | [src/partition/range.ts:25](../../packages/runtime/src/partition/range.ts#L25); `dist/partition/range.d.ts:22` |
| `MEM.BinaryStreamRangeOptions.timeout`                            | optional; `number`                                                                           | [src/partition/range.ts:26](../../packages/runtime/src/partition/range.ts#L26); `dist/partition/range.d.ts:23` |

### CountOnlyStreamRangeOptions

| ID                                                                   | Current type / modifiers | Source; declaration                                                                                            |
| -------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `MEM.CountOnlyStreamRangeOptions.dispatchBatchSize`                  | optional; `number`       | [src/partition/range.ts:30](../../packages/runtime/src/partition/range.ts#L30); `dist/partition/range.d.ts:26` |
| `MEM.CountOnlyStreamRangeOptions.maxBufferedResults`                 | optional; `number`       | [src/partition/range.ts:46](../../packages/runtime/src/partition/range.ts#L46); `dist/partition/range.d.ts:37` |
| `MEM.CountOnlyStreamRangeOptions.executionLease`                     | optional; `never`        | [src/partition/range.ts:24](../../packages/runtime/src/partition/range.ts#L24); `dist/partition/range.d.ts:21` |
| `MEM.CountOnlyStreamRangeOptions.experimentalDispatchBatchSize`      | optional; `number`       | [src/partition/range.ts:32](../../packages/runtime/src/partition/range.ts#L32); `dist/partition/range.d.ts:28` |
| `MEM.CountOnlyStreamRangeOptions.experimentalMaxBufferedResults`     | optional; `number`       | [src/partition/range.ts:48](../../packages/runtime/src/partition/range.ts#L48); `dist/partition/range.d.ts:39` |
| `MEM.CountOnlyStreamRangeOptions.experimentalMaxReservedResultBytes` | optional; `never`        | [src/partition/range.ts:61](../../packages/runtime/src/partition/range.ts#L61); `dist/partition/range.d.ts:49` |
| `MEM.CountOnlyStreamRangeOptions.experimentalMaxResultBytes`         | optional; `never`        | [src/partition/range.ts:60](../../packages/runtime/src/partition/range.ts#L60); `dist/partition/range.d.ts:48` |
| `MEM.CountOnlyStreamRangeOptions.experimentalResultBytes`            | optional; `never`        | [src/partition/range.ts:59](../../packages/runtime/src/partition/range.ts#L59); `dist/partition/range.d.ts:47` |
| `MEM.CountOnlyStreamRangeOptions.signal`                             | optional; `AbortSignal`  | [src/partition/range.ts:25](../../packages/runtime/src/partition/range.ts#L25); `dist/partition/range.d.ts:22` |
| `MEM.CountOnlyStreamRangeOptions.timeout`                            | optional; `number`       | [src/partition/range.ts:26](../../packages/runtime/src/partition/range.ts#L26); `dist/partition/range.d.ts:23` |

### PartitionInput

| ID                                | Current type / modifiers           | Source; declaration                                                                                            |
| --------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MEM.PartitionInput.input`        | required; `Input`                  | [src/partition/range.ts:17](../../packages/runtime/src/partition/range.ts#L17); `dist/partition/range.d.ts:15` |
| `MEM.PartitionInput.transferList` | optional; `readonly ArrayBuffer[]` | [src/partition/range.ts:18](../../packages/runtime/src/partition/range.ts#L18); `dist/partition/range.d.ts:16` |

### PartitionOptions

| ID                                                   | Current type / modifiers | Source; declaration                                                                                            |
| ---------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `MEM.PartitionOptions.dispatchBatchSize`             | optional; `number`       | [src/partition/range.ts:30](../../packages/runtime/src/partition/range.ts#L30); `dist/partition/range.d.ts:26` |
| `MEM.PartitionOptions.executionLease`                | optional; `never`        | [src/partition/range.ts:24](../../packages/runtime/src/partition/range.ts#L24); `dist/partition/range.d.ts:21` |
| `MEM.PartitionOptions.experimentalDispatchBatchSize` | optional; `number`       | [src/partition/range.ts:32](../../packages/runtime/src/partition/range.ts#L32); `dist/partition/range.d.ts:28` |
| `MEM.PartitionOptions.signal`                        | optional; `AbortSignal`  | [src/partition/range.ts:25](../../packages/runtime/src/partition/range.ts#L25); `dist/partition/range.d.ts:22` |
| `MEM.PartitionOptions.timeout`                       | optional; `number`       | [src/partition/range.ts:26](../../packages/runtime/src/partition/range.ts#L26); `dist/partition/range.d.ts:23` |

### PartitionRange

| ID                             | Current type / modifiers | Source; declaration                                                                                         |
| ------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `MEM.PartitionRange.end`       | required; `number`       | [src/partition/range.ts:4](../../packages/runtime/src/partition/range.ts#L4); `dist/partition/range.d.ts:4` |
| `MEM.PartitionRange.grainSize` | required; `number`       | [src/partition/range.ts:5](../../packages/runtime/src/partition/range.ts#L5); `dist/partition/range.d.ts:5` |
| `MEM.PartitionRange.start`     | required; `number`       | [src/partition/range.ts:3](../../packages/runtime/src/partition/range.ts#L3); `dist/partition/range.d.ts:3` |

### PjsBinaryResultContractError

| ID                                                | Current type / modifiers                  | Source; declaration                                                                                   |
| ------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsBinaryResultContractError.actualBytes`    | required; readonly; `number \| undefined` | [src/errors/index.ts:66](../../packages/runtime/src/errors/index.ts#L66); `dist/errors/index.d.ts:56` |
| `MEM.PjsBinaryResultContractError.actualType`     | required; readonly; `string \| undefined` | [src/errors/index.ts:67](../../packages/runtime/src/errors/index.ts#L67); `dist/errors/index.d.ts:57` |
| `MEM.PjsBinaryResultContractError.declaredBytes`  | required; readonly; `number \| undefined` | [src/errors/index.ts:65](../../packages/runtime/src/errors/index.ts#L65); `dist/errors/index.d.ts:55` |
| `MEM.PjsBinaryResultContractError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsBinaryResultContractError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsBinaryResultContractError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsBinaryResultContractError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsBinaryResultContractError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsBinaryResultContractError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsBinaryResultErrorContext

| ID                                                   | Current type / modifiers | Source; declaration                                                                                   |
| ---------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsBinaryResultErrorContext.actualBytes`        | optional; `number`       | [src/errors/index.ts:13](../../packages/runtime/src/errors/index.ts#L13); `dist/errors/index.d.ts:12` |
| `MEM.PjsBinaryResultErrorContext.actualType`         | optional; `string`       | [src/errors/index.ts:14](../../packages/runtime/src/errors/index.ts#L14); `dist/errors/index.d.ts:13` |
| `MEM.PjsBinaryResultErrorContext.cause`              | optional; `unknown`      | [src/errors/index.ts:4](../../packages/runtime/src/errors/index.ts#L4); `dist/errors/index.d.ts:4`    |
| `MEM.PjsBinaryResultErrorContext.declaredBytes`      | optional; `number`       | [src/errors/index.ts:12](../../packages/runtime/src/errors/index.ts#L12); `dist/errors/index.d.ts:11` |
| `MEM.PjsBinaryResultErrorContext.operationId`        | optional; `string`       | [src/errors/index.ts:5](../../packages/runtime/src/errors/index.ts#L5); `dist/errors/index.d.ts:5`    |
| `MEM.PjsBinaryResultErrorContext.partitionIndex`     | optional; `number`       | [src/errors/index.ts:6](../../packages/runtime/src/errors/index.ts#L6); `dist/errors/index.d.ts:6`    |
| `MEM.PjsBinaryResultErrorContext.rangeEnd`           | optional; `number`       | [src/errors/index.ts:8](../../packages/runtime/src/errors/index.ts#L8); `dist/errors/index.d.ts:8`    |
| `MEM.PjsBinaryResultErrorContext.rangeStart`         | optional; `number`       | [src/errors/index.ts:7](../../packages/runtime/src/errors/index.ts#L7); `dist/errors/index.d.ts:7`    |
| `MEM.PjsBinaryResultErrorContext.resultByteCapacity` | optional; `number`       | [src/errors/index.ts:15](../../packages/runtime/src/errors/index.ts#L15); `dist/errors/index.d.ts:14` |
| `MEM.PjsBinaryResultErrorContext.taskId`             | optional; `string`       | [src/errors/index.ts:2](../../packages/runtime/src/errors/index.ts#L2); `dist/errors/index.d.ts:2`    |
| `MEM.PjsBinaryResultErrorContext.workerId`           | optional; `number`       | [src/errors/index.ts:3](../../packages/runtime/src/errors/index.ts#L3); `dist/errors/index.d.ts:3`    |

### PjsCancelledError

| ID                                     | Current type / modifiers                  | Source; declaration                                                                                   |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsCancelledError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsCancelledError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsCancelledError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsCancelledError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsCancelledError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsCancelledError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsContainmentStats

| ID                                                 | Current type / modifiers        | Source; declaration                                                                                |
| -------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsContainmentStats.confirmedLeaseExits`      | required; `number`              | [src/diagnostics.ts:17](../../packages/runtime/src/diagnostics.ts#L17); `dist/diagnostics.d.ts:15` |
| `MEM.PjsContainmentStats.leaseExpirations`         | required; `number`              | [src/diagnostics.ts:15](../../packages/runtime/src/diagnostics.ts#L15); `dist/diagnostics.d.ts:13` |
| `MEM.PjsContainmentStats.leaseTerminationRequests` | required; `number`              | [src/diagnostics.ts:16](../../packages/runtime/src/diagnostics.ts#L16); `dist/diagnostics.d.ts:14` |
| `MEM.PjsContainmentStats.restartBudgetExhaustions` | required; `number`              | [src/diagnostics.ts:21](../../packages/runtime/src/diagnostics.ts#L21); `dist/diagnostics.d.ts:19` |
| `MEM.PjsContainmentStats.restartWindowUtilization` | required; `number \| undefined` | [src/diagnostics.ts:20](../../packages/runtime/src/diagnostics.ts#L20); `dist/diagnostics.d.ts:18` |
| `MEM.PjsContainmentStats.shutdownEscalations`      | required; `number`              | [src/diagnostics.ts:22](../../packages/runtime/src/diagnostics.ts#L22); `dist/diagnostics.d.ts:20` |
| `MEM.PjsContainmentStats.workerReplacements`       | required; `number`              | [src/diagnostics.ts:18](../../packages/runtime/src/diagnostics.ts#L18); `dist/diagnostics.d.ts:16` |

### PjsDispatchStats

| ID                                                   | Current type / modifiers | Source; declaration                                                                                  |
| ---------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `MEM.PjsDispatchStats.averageLogicalTasksPerExecute` | required; `number`       | [src/diagnostics.ts:101](../../packages/runtime/src/diagnostics.ts#L101); `dist/diagnostics.d.ts:91` |
| `MEM.PjsDispatchStats.batchedExecuteMessages`        | required; `number`       | [src/diagnostics.ts:98](../../packages/runtime/src/diagnostics.ts#L98); `dist/diagnostics.d.ts:88`   |
| `MEM.PjsDispatchStats.executeMessages`               | required; `number`       | [src/diagnostics.ts:96](../../packages/runtime/src/diagnostics.ts#L96); `dist/diagnostics.d.ts:86`   |
| `MEM.PjsDispatchStats.logicalPartitions`             | required; `number`       | [src/diagnostics.ts:100](../../packages/runtime/src/diagnostics.ts#L100); `dist/diagnostics.d.ts:90` |
| `MEM.PjsDispatchStats.logicalTasks`                  | required; `number`       | [src/diagnostics.ts:99](../../packages/runtime/src/diagnostics.ts#L99); `dist/diagnostics.d.ts:89`   |
| `MEM.PjsDispatchStats.resultMessages`                | required; `number`       | [src/diagnostics.ts:97](../../packages/runtime/src/diagnostics.ts#L97); `dist/diagnostics.d.ts:87`   |

### PjsError

| ID                            | Current type / modifiers                  | Source; declaration                                                                                   |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsErrorContext

| ID                                   | Current type / modifiers | Source; declaration                                                                                |
| ------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsErrorContext.cause`          | optional; `unknown`      | [src/errors/index.ts:4](../../packages/runtime/src/errors/index.ts#L4); `dist/errors/index.d.ts:4` |
| `MEM.PjsErrorContext.operationId`    | optional; `string`       | [src/errors/index.ts:5](../../packages/runtime/src/errors/index.ts#L5); `dist/errors/index.d.ts:5` |
| `MEM.PjsErrorContext.partitionIndex` | optional; `number`       | [src/errors/index.ts:6](../../packages/runtime/src/errors/index.ts#L6); `dist/errors/index.d.ts:6` |
| `MEM.PjsErrorContext.rangeEnd`       | optional; `number`       | [src/errors/index.ts:8](../../packages/runtime/src/errors/index.ts#L8); `dist/errors/index.d.ts:8` |
| `MEM.PjsErrorContext.rangeStart`     | optional; `number`       | [src/errors/index.ts:7](../../packages/runtime/src/errors/index.ts#L7); `dist/errors/index.d.ts:7` |
| `MEM.PjsErrorContext.taskId`         | optional; `string`       | [src/errors/index.ts:2](../../packages/runtime/src/errors/index.ts#L2); `dist/errors/index.d.ts:2` |
| `MEM.PjsErrorContext.workerId`       | optional; `number`       | [src/errors/index.ts:3](../../packages/runtime/src/errors/index.ts#L3); `dist/errors/index.d.ts:3` |

### PjsExecutionLeaseError

| ID                                          | Current type / modifiers                  | Source; declaration                                                                                   |
| ------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsExecutionLeaseError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsExecutionLeaseError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsExecutionLeaseError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsExecutionLeaseError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsExecutionLeaseError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsExecutionLeaseError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsMapContractError

| ID                                       | Current type / modifiers                  | Source; declaration                                                                                   |
| ---------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsMapContractError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsMapContractError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsMapContractError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsMapContractError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsMapContractError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsMapContractError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsMapResultStats

| ID                                 | Current type / modifiers | Source; declaration                                                                                |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsMapResultStats.assemblyMs` | required; `number`       | [src/diagnostics.ts:84](../../packages/runtime/src/diagnostics.ts#L84); `dist/diagnostics.d.ts:76` |
| `MEM.PjsMapResultStats.blocks`     | required; `number`       | [src/diagnostics.ts:82](../../packages/runtime/src/diagnostics.ts#L82); `dist/diagnostics.d.ts:74` |
| `MEM.PjsMapResultStats.elements`   | required; `number`       | [src/diagnostics.ts:83](../../packages/runtime/src/diagnostics.ts#L83); `dist/diagnostics.d.ts:75` |

### PjsOperationSnapshot

| ID                                                   | Current type / modifiers                                                                    | Source; declaration                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsOperationSnapshot.admitted`                  | required; `number`                                                                          | [src/diagnostics.ts:119](../../packages/runtime/src/diagnostics.ts#L119); `dist/diagnostics.d.ts:106` |
| `MEM.PjsOperationSnapshot.assembledBlocks`           | optional; `number`                                                                          | [src/diagnostics.ts:136](../../packages/runtime/src/diagnostics.ts#L136); `dist/diagnostics.d.ts:123` |
| `MEM.PjsOperationSnapshot.assemblyMs`                | optional; `number`                                                                          | [src/diagnostics.ts:137](../../packages/runtime/src/diagnostics.ts#L137); `dist/diagnostics.d.ts:124` |
| `MEM.PjsOperationSnapshot.bufferedKnownPayloadBytes` | optional; `number`                                                                          | [src/diagnostics.ts:133](../../packages/runtime/src/diagnostics.ts#L133); `dist/diagnostics.d.ts:120` |
| `MEM.PjsOperationSnapshot.bufferedResults`           | optional; `number`                                                                          | [src/diagnostics.ts:125](../../packages/runtime/src/diagnostics.ts#L125); `dist/diagnostics.d.ts:112` |
| `MEM.PjsOperationSnapshot.cancelled`                 | required; `number`                                                                          | [src/diagnostics.ts:124](../../packages/runtime/src/diagnostics.ts#L124); `dist/diagnostics.d.ts:111` |
| `MEM.PjsOperationSnapshot.chunkCount`                | required; `number`                                                                          | [src/diagnostics.ts:117](../../packages/runtime/src/diagnostics.ts#L117); `dist/diagnostics.d.ts:104` |
| `MEM.PjsOperationSnapshot.completed`                 | required; `number`                                                                          | [src/diagnostics.ts:122](../../packages/runtime/src/diagnostics.ts#L122); `dist/diagnostics.d.ts:109` |
| `MEM.PjsOperationSnapshot.end`                       | required; `number`                                                                          | [src/diagnostics.ts:115](../../packages/runtime/src/diagnostics.ts#L115); `dist/diagnostics.d.ts:102` |
| `MEM.PjsOperationSnapshot.failed`                    | required; `number`                                                                          | [src/diagnostics.ts:123](../../packages/runtime/src/diagnostics.ts#L123); `dist/diagnostics.d.ts:110` |
| `MEM.PjsOperationSnapshot.generated`                 | required; `number`                                                                          | [src/diagnostics.ts:118](../../packages/runtime/src/diagnostics.ts#L118); `dist/diagnostics.d.ts:105` |
| `MEM.PjsOperationSnapshot.grainSize`                 | required; `number`                                                                          | [src/diagnostics.ts:116](../../packages/runtime/src/diagnostics.ts#L116); `dist/diagnostics.d.ts:103` |
| `MEM.PjsOperationSnapshot.id`                        | required; `string`                                                                          | [src/diagnostics.ts:110](../../packages/runtime/src/diagnostics.ts#L110); `dist/diagnostics.d.ts:97`  |
| `MEM.PjsOperationSnapshot.knownBufferedPayloadBytes` | optional; `number`                                                                          | [src/diagnostics.ts:129](../../packages/runtime/src/diagnostics.ts#L129); `dist/diagnostics.d.ts:116` |
| `MEM.PjsOperationSnapshot.mappedElements`            | optional; `number`                                                                          | [src/diagnostics.ts:135](../../packages/runtime/src/diagnostics.ts#L135); `dist/diagnostics.d.ts:122` |
| `MEM.PjsOperationSnapshot.producedResults`           | optional; `number`                                                                          | [src/diagnostics.ts:127](../../packages/runtime/src/diagnostics.ts#L127); `dist/diagnostics.d.ts:114` |
| `MEM.PjsOperationSnapshot.queued`                    | required; `number`                                                                          | [src/diagnostics.ts:120](../../packages/runtime/src/diagnostics.ts#L120); `dist/diagnostics.d.ts:107` |
| `MEM.PjsOperationSnapshot.reservedResultBytes`       | optional; `number`                                                                          | [src/diagnostics.ts:131](../../packages/runtime/src/diagnostics.ts#L131); `dist/diagnostics.d.ts:118` |
| `MEM.PjsOperationSnapshot.resultBufferCapacity`      | optional; `number`                                                                          | [src/diagnostics.ts:126](../../packages/runtime/src/diagnostics.ts#L126); `dist/diagnostics.d.ts:113` |
| `MEM.PjsOperationSnapshot.resultByteCapacity`        | optional; `number`                                                                          | [src/diagnostics.ts:134](../../packages/runtime/src/diagnostics.ts#L134); `dist/diagnostics.d.ts:121` |
| `MEM.PjsOperationSnapshot.resultMode`                | required; `"collect" \| "discard" \| "stream" \| "map"`                                     | [src/diagnostics.ts:113](../../packages/runtime/src/diagnostics.ts#L113); `dist/diagnostics.d.ts:100` |
| `MEM.PjsOperationSnapshot.running`                   | required; `number`                                                                          | [src/diagnostics.ts:121](../../packages/runtime/src/diagnostics.ts#L121); `dist/diagnostics.d.ts:108` |
| `MEM.PjsOperationSnapshot.start`                     | required; `number`                                                                          | [src/diagnostics.ts:114](../../packages/runtime/src/diagnostics.ts#L114); `dist/diagnostics.d.ts:101` |
| `MEM.PjsOperationSnapshot.status`                    | required; `"created" \| "running" \| "failed" \| "completed" \| "cancelled" \| "timed_out"` | [src/diagnostics.ts:112](../../packages/runtime/src/diagnostics.ts#L112); `dist/diagnostics.d.ts:99`  |
| `MEM.PjsOperationSnapshot.taskName`                  | required; `string`                                                                          | [src/diagnostics.ts:111](../../packages/runtime/src/diagnostics.ts#L111); `dist/diagnostics.d.ts:98`  |
| `MEM.PjsOperationSnapshot.typedOutput`               | optional; `string \| undefined`                                                             | [src/diagnostics.ts:138](../../packages/runtime/src/diagnostics.ts#L138); `dist/diagnostics.d.ts:125` |
| `MEM.PjsOperationSnapshot.unknownBufferedResults`    | optional; `number`                                                                          | [src/diagnostics.ts:130](../../packages/runtime/src/diagnostics.ts#L130); `dist/diagnostics.d.ts:117` |
| `MEM.PjsOperationSnapshot.yieldedResults`            | optional; `number`                                                                          | [src/diagnostics.ts:128](../../packages/runtime/src/diagnostics.ts#L128); `dist/diagnostics.d.ts:115` |

### PjsOperationStats

| ID                                 | Current type / modifiers                               | Source; declaration                                                                                |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsOperationStats.accepted`   | required; `number`                                     | [src/diagnostics.ts:5](../../packages/runtime/src/diagnostics.ts#L5); `dist/diagnostics.d.ts:4`    |
| `MEM.PjsOperationStats.cancelled`  | required; `number`                                     | [src/diagnostics.ts:10](../../packages/runtime/src/diagnostics.ts#L10); `dist/diagnostics.d.ts:9`  |
| `MEM.PjsOperationStats.capacity`   | required; `number`                                     | [src/diagnostics.ts:52](../../packages/runtime/src/diagnostics.ts#L52); `dist/diagnostics.d.ts:46` |
| `MEM.PjsOperationStats.collecting` | required; `import("./diagnostics.js").PjsOutcomeStats` | [src/diagnostics.ts:53](../../packages/runtime/src/diagnostics.ts#L53); `dist/diagnostics.d.ts:47` |
| `MEM.PjsOperationStats.completed`  | required; `number`                                     | [src/diagnostics.ts:8](../../packages/runtime/src/diagnostics.ts#L8); `dist/diagnostics.d.ts:7`    |
| `MEM.PjsOperationStats.completion` | required; `import("./diagnostics.js").PjsOutcomeStats` | [src/diagnostics.ts:54](../../packages/runtime/src/diagnostics.ts#L54); `dist/diagnostics.d.ts:48` |
| `MEM.PjsOperationStats.failed`     | required; `number`                                     | [src/diagnostics.ts:9](../../packages/runtime/src/diagnostics.ts#L9); `dist/diagnostics.d.ts:8`    |
| `MEM.PjsOperationStats.mapping`    | required; `import("./diagnostics.js").PjsOutcomeStats` | [src/diagnostics.ts:56](../../packages/runtime/src/diagnostics.ts#L56); `dist/diagnostics.d.ts:50` |
| `MEM.PjsOperationStats.pending`    | required; `number`                                     | [src/diagnostics.ts:7](../../packages/runtime/src/diagnostics.ts#L7); `dist/diagnostics.d.ts:6`    |
| `MEM.PjsOperationStats.rejected`   | required; `number`                                     | [src/diagnostics.ts:6](../../packages/runtime/src/diagnostics.ts#L6); `dist/diagnostics.d.ts:5`    |
| `MEM.PjsOperationStats.streaming`  | required; `import("./diagnostics.js").PjsOutcomeStats` | [src/diagnostics.ts:55](../../packages/runtime/src/diagnostics.ts#L55); `dist/diagnostics.d.ts:49` |
| `MEM.PjsOperationStats.timedOut`   | required; `number`                                     | [src/diagnostics.ts:11](../../packages/runtime/src/diagnostics.ts#L11); `dist/diagnostics.d.ts:10` |

### PjsOutcomeStats

| ID                              | Current type / modifiers | Source; declaration                                                                                |
| ------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsOutcomeStats.accepted`  | required; `number`       | [src/diagnostics.ts:5](../../packages/runtime/src/diagnostics.ts#L5); `dist/diagnostics.d.ts:4`    |
| `MEM.PjsOutcomeStats.cancelled` | required; `number`       | [src/diagnostics.ts:10](../../packages/runtime/src/diagnostics.ts#L10); `dist/diagnostics.d.ts:9`  |
| `MEM.PjsOutcomeStats.completed` | required; `number`       | [src/diagnostics.ts:8](../../packages/runtime/src/diagnostics.ts#L8); `dist/diagnostics.d.ts:7`    |
| `MEM.PjsOutcomeStats.failed`    | required; `number`       | [src/diagnostics.ts:9](../../packages/runtime/src/diagnostics.ts#L9); `dist/diagnostics.d.ts:8`    |
| `MEM.PjsOutcomeStats.pending`   | required; `number`       | [src/diagnostics.ts:7](../../packages/runtime/src/diagnostics.ts#L7); `dist/diagnostics.d.ts:6`    |
| `MEM.PjsOutcomeStats.rejected`  | required; `number`       | [src/diagnostics.ts:6](../../packages/runtime/src/diagnostics.ts#L6); `dist/diagnostics.d.ts:5`    |
| `MEM.PjsOutcomeStats.timedOut`  | required; `number`       | [src/diagnostics.ts:11](../../packages/runtime/src/diagnostics.ts#L11); `dist/diagnostics.d.ts:10` |

### PjsPartitionStats

| ID                                | Current type / modifiers | Source; declaration                                                                                |
| --------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsPartitionStats.admitted`  | required; `number`       | [src/diagnostics.ts:89](../../packages/runtime/src/diagnostics.ts#L89); `dist/diagnostics.d.ts:80` |
| `MEM.PjsPartitionStats.cancelled` | required; `number`       | [src/diagnostics.ts:92](../../packages/runtime/src/diagnostics.ts#L92); `dist/diagnostics.d.ts:83` |
| `MEM.PjsPartitionStats.completed` | required; `number`       | [src/diagnostics.ts:90](../../packages/runtime/src/diagnostics.ts#L90); `dist/diagnostics.d.ts:81` |
| `MEM.PjsPartitionStats.failed`    | required; `number`       | [src/diagnostics.ts:91](../../packages/runtime/src/diagnostics.ts#L91); `dist/diagnostics.d.ts:82` |
| `MEM.PjsPartitionStats.generated` | required; `number`       | [src/diagnostics.ts:88](../../packages/runtime/src/diagnostics.ts#L88); `dist/diagnostics.d.ts:79` |

### PjsQueueFullError

| ID                                     | Current type / modifiers                  | Source; declaration                                                                                   |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsQueueFullError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsQueueFullError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsQueueFullError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsQueueFullError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsQueueFullError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsQueueFullError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsQueueStats

| ID                           | Current type / modifiers | Source; declaration                                                                                |
| ---------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsQueueStats.capacity` | required; `number`       | [src/diagnostics.ts:38](../../packages/runtime/src/diagnostics.ts#L38); `dist/diagnostics.d.ts:34` |
| `MEM.PjsQueueStats.size`     | required; `number`       | [src/diagnostics.ts:37](../../packages/runtime/src/diagnostics.ts#L37); `dist/diagnostics.d.ts:33` |

### PjsRangeStream

| ID                                    | Current type / modifiers                                                                                                       | Source; declaration                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `MEM.PjsRangeStream.__@asyncIterator` | required; `() => import("./partition/stream.js").PjsRangeStream<Output>`                                                       | [src/partition/stream.ts:19](../../packages/runtime/src/partition/stream.ts#L19); `dist/partition/stream.d.ts:11` |
| `MEM.PjsRangeStream.next`             | required; `() => Promise<IteratorResult<import("./partition/stream.js").StreamRangeResult<Output>, undefined>>`                | [src/partition/stream.ts:14](../../packages/runtime/src/partition/stream.ts#L14); `dist/partition/stream.d.ts:8`  |
| `MEM.PjsRangeStream.return`           | required; `() => Promise<IteratorResult<import("./partition/stream.js").StreamRangeResult<Output>, undefined>>`                | [src/partition/stream.ts:15](../../packages/runtime/src/partition/stream.ts#L15); `dist/partition/stream.d.ts:9`  |
| `MEM.PjsRangeStream.throw`            | required; `(error?: unknown) => Promise<IteratorResult<import("./partition/stream.js").StreamRangeResult<Output>, undefined>>` | [src/partition/stream.ts:16](../../packages/runtime/src/partition/stream.ts#L16); `dist/partition/stream.d.ts:10` |

### PjsResultCapacityError

| ID                                              | Current type / modifiers                  | Source; declaration                                                                                   |
| ----------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsResultCapacityError.declaredBytes`      | required; readonly; `number \| undefined` | [src/errors/index.ts:76](../../packages/runtime/src/errors/index.ts#L76); `dist/errors/index.d.ts:61` |
| `MEM.PjsResultCapacityError.operationId`        | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsResultCapacityError.partitionIndex`     | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsResultCapacityError.rangeEnd`           | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsResultCapacityError.rangeStart`         | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsResultCapacityError.resultByteCapacity` | required; readonly; `number \| undefined` | [src/errors/index.ts:77](../../packages/runtime/src/errors/index.ts#L77); `dist/errors/index.d.ts:62` |
| `MEM.PjsResultCapacityError.taskId`             | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsResultCapacityError.workerId`           | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsRuntime

| ID                                | Current type / modifiers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Source; declaration                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `MEM.PjsRuntime.parallelFor`      | required; `<Input>(task: import("./tasks/registry.js").PjsTask<Input, unknown>, range: import("./partition/range.js").PartitionRange, createInput: (partition: import("./partition/range.js").RangePartition) => import("./partition/range.js").PartitionInput<Input>, options?: import("./partition/range.js").PartitionOptions) => Promise<void>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [src/runtime.ts:62](../../packages/runtime/src/runtime.ts#L62); `dist/runtime.d.ts:23`   |
| `MEM.PjsRuntime.parallelMapRange` | required; `{ <Input, Constructor extends import("./partition/range.js").PjsTypedArrayConstructor>(task: import("./tasks/registry.js").PjsTask<Input, InstanceType<Constructor>>, range: import("./partition/range.js").PartitionRange, createInput: (partition: import("./partition/range.js").RangePartition) => import("./partition/range.js").PartitionInput<Input>, options: import("./partition/range.js").TypedMapRangeOptions<Constructor>): Promise<InstanceType<Constructor>>; <Input, Output>(task: import("./tasks/registry.js").PjsTask<Input, readonly Output[]>, range: import("./partition/range.js").PartitionRange, createInput: (partition: import("./partition/range.js").RangePartition) => import("./partition/range.js").PartitionInput<Input>, options?: import("./partition/range.js").PartitionOptions): Promise<Output[]>; }`                                                                                     | [src/runtime.ts:78](../../packages/runtime/src/runtime.ts#L78); `dist/runtime.d.ts:25`   |
| `MEM.PjsRuntime.partitionRange`   | required; `<Input, Output>(task: import("./tasks/registry.js").PjsTask<Input, Output>, range: import("./partition/range.js").PartitionRange, createInput: (partition: import("./partition/range.js").RangePartition) => import("./partition/range.js").PartitionInput<Input>, options?: import("./partition/range.js").PartitionOptions) => Promise<Output[]>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [src/runtime.ts:43](../../packages/runtime/src/runtime.ts#L43); `dist/runtime.d.ts:18`   |
| `MEM.PjsRuntime.ready`            | required; `() => Promise<void>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [src/runtime.ts:34](../../packages/runtime/src/runtime.ts#L34); `dist/runtime.d.ts:12`   |
| `MEM.PjsRuntime.run`              | required; `<Input, Output>(task: import("./tasks/registry.js").PjsTask<Input, Output>, input: Input, options?: import("./types/index.js").RunOptions) => Promise<Output>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [src/runtime.ts:137](../../packages/runtime/src/runtime.ts#L137); `dist/runtime.d.ts:31` |
| `MEM.PjsRuntime.shutdown`         | required; `(options?: import("./types/index.js").ShutdownOptions) => Promise<void>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [src/runtime.ts:149](../../packages/runtime/src/runtime.ts#L149); `dist/runtime.d.ts:33` |
| `MEM.PjsRuntime.stats`            | required; `() => import("./diagnostics.js").PjsRuntimeStats`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [src/runtime.ts:145](../../packages/runtime/src/runtime.ts#L145); `dist/runtime.d.ts:32` |
| `MEM.PjsRuntime.streamRange`      | required; `{ <Input, Output extends import("./partition/range.js").PjsBinaryResult>(task: import("./tasks/registry.js").PjsTask<Input, Output>, range: import("./partition/range.js").PartitionRange, createInput: (partition: import("./partition/range.js").RangePartition) => import("./partition/range.js").PartitionInput<Input>, options: import("./partition/range.js").BinaryStreamRangeOptions \| import("./partition/range.js").UpperBoundBinaryStreamRangeOptions): import("./partition/stream.js").PjsRangeStream<Output>; <Input, Output>(task: import("./tasks/registry.js").PjsTask<Input, Output>, range: import("./partition/range.js").PartitionRange, createInput: (partition: import("./partition/range.js").RangePartition) => import("./partition/range.js").PartitionInput<Input>, options?: import("./partition/range.js").CountOnlyStreamRangeOptions): import("./partition/stream.js").PjsRangeStream<Output>; }` | [src/runtime.ts:107](../../packages/runtime/src/runtime.ts#L107); `dist/runtime.d.ts:29` |

### PjsRuntimeOptions

| ID                                     | Current type / modifiers                                  | Source; declaration                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEM.PjsRuntimeOptions.maxQueue`       | optional; `number`                                        | [src/configuration/runtime-options.ts:11](../../packages/runtime/src/configuration/runtime-options.ts#L11); `dist/configuration/runtime-options.d.ts:8`  |
| `MEM.PjsRuntimeOptions.maxRestarts`    | optional; `number`                                        | [src/configuration/runtime-options.ts:14](../../packages/runtime/src/configuration/runtime-options.ts#L14); `dist/configuration/runtime-options.d.ts:11` |
| `MEM.PjsRuntimeOptions.maxWorkers`     | optional; `number`                                        | [src/configuration/runtime-options.ts:10](../../packages/runtime/src/configuration/runtime-options.ts#L10); `dist/configuration/runtime-options.d.ts:7`  |
| `MEM.PjsRuntimeOptions.minWorkers`     | optional; `number`                                        | [src/configuration/runtime-options.ts:9](../../packages/runtime/src/configuration/runtime-options.ts#L9); `dist/configuration/runtime-options.d.ts:6`    |
| `MEM.PjsRuntimeOptions.registry`       | required; `import("./tasks/registry.js").PjsTaskRegistry` | [src/configuration/runtime-options.ts:7](../../packages/runtime/src/configuration/runtime-options.ts#L7); `dist/configuration/runtime-options.d.ts:4`    |
| `MEM.PjsRuntimeOptions.restartPolicy`  | optional; `import("./types/index.js").RestartPolicy`      | [src/configuration/runtime-options.ts:19](../../packages/runtime/src/configuration/runtime-options.ts#L19); `dist/configuration/runtime-options.d.ts:16` |
| `MEM.PjsRuntimeOptions.startupTimeout` | optional; `number`                                        | [src/configuration/runtime-options.ts:12](../../packages/runtime/src/configuration/runtime-options.ts#L12); `dist/configuration/runtime-options.d.ts:9`  |
| `MEM.PjsRuntimeOptions.workers`        | optional; `number`                                        | [src/configuration/runtime-options.ts:8](../../packages/runtime/src/configuration/runtime-options.ts#L8); `dist/configuration/runtime-options.d.ts:5`    |

### PjsRuntimeStateError

| ID                                        | Current type / modifiers                  | Source; declaration                                                                                   |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsRuntimeStateError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsRuntimeStateError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsRuntimeStateError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsRuntimeStateError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsRuntimeStateError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsRuntimeStateError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsRuntimeStats

| ID                                     | Current type / modifiers                                                                | Source; declaration                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsRuntimeStats.activeOperations` | required; `import("./diagnostics.js").PjsOperationSnapshot[]`                           | [src/diagnostics.ts:157](../../packages/runtime/src/diagnostics.ts#L157); `dist/diagnostics.d.ts:143` |
| `MEM.PjsRuntimeStats.activeTasks`      | required; `import("./types/index.js").TaskSnapshot[]`                                   | [src/diagnostics.ts:156](../../packages/runtime/src/diagnostics.ts#L156); `dist/diagnostics.d.ts:142` |
| `MEM.PjsRuntimeStats.containment`      | required; `import("./diagnostics.js").PjsContainmentStats`                              | [src/diagnostics.ts:144](../../packages/runtime/src/diagnostics.ts#L144); `dist/diagnostics.d.ts:130` |
| `MEM.PjsRuntimeStats.dispatch`         | required; `import("./diagnostics.js").PjsDispatchStats`                                 | [src/diagnostics.ts:155](../../packages/runtime/src/diagnostics.ts#L155); `dist/diagnostics.d.ts:141` |
| `MEM.PjsRuntimeStats.mapResults`       | required; `import("./diagnostics.js").PjsMapResultStats`                                | [src/diagnostics.ts:153](../../packages/runtime/src/diagnostics.ts#L153); `dist/diagnostics.d.ts:139` |
| `MEM.PjsRuntimeStats.maps`             | required; `import("./diagnostics.js").PjsOutcomeStats`                                  | [src/diagnostics.ts:152](../../packages/runtime/src/diagnostics.ts#L152); `dist/diagnostics.d.ts:138` |
| `MEM.PjsRuntimeStats.operations`       | required; `import("./diagnostics.js").PjsOperationStats`                                | [src/diagnostics.ts:149](../../packages/runtime/src/diagnostics.ts#L149); `dist/diagnostics.d.ts:135` |
| `MEM.PjsRuntimeStats.partitions`       | required; `import("./diagnostics.js").PjsPartitionStats`                                | [src/diagnostics.ts:154](../../packages/runtime/src/diagnostics.ts#L154); `dist/diagnostics.d.ts:140` |
| `MEM.PjsRuntimeStats.queue`            | required; `import("./diagnostics.js").PjsQueueStats`                                    | [src/diagnostics.ts:146](../../packages/runtime/src/diagnostics.ts#L146); `dist/diagnostics.d.ts:132` |
| `MEM.PjsRuntimeStats.state`            | required; `"created" \| "starting" \| "running" \| "stopping" \| "stopped" \| "failed"` | [src/diagnostics.ts:143](../../packages/runtime/src/diagnostics.ts#L143); `dist/diagnostics.d.ts:129` |
| `MEM.PjsRuntimeStats.streamResults`    | required; `import("./diagnostics.js").PjsStreamResultStats`                             | [src/diagnostics.ts:151](../../packages/runtime/src/diagnostics.ts#L151); `dist/diagnostics.d.ts:137` |
| `MEM.PjsRuntimeStats.streams`          | required; `import("./diagnostics.js").PjsOutcomeStats`                                  | [src/diagnostics.ts:150](../../packages/runtime/src/diagnostics.ts#L150); `dist/diagnostics.d.ts:136` |
| `MEM.PjsRuntimeStats.tasks`            | required; `import("./diagnostics.js").PjsOutcomeStats`                                  | [src/diagnostics.ts:147](../../packages/runtime/src/diagnostics.ts#L147); `dist/diagnostics.d.ts:133` |
| `MEM.PjsRuntimeStats.timing`           | required; `import("./diagnostics.js").PjsTimingStats`                                   | [src/diagnostics.ts:148](../../packages/runtime/src/diagnostics.ts#L148); `dist/diagnostics.d.ts:134` |
| `MEM.PjsRuntimeStats.workers`          | required; `import("./diagnostics.js").PjsWorkerStats`                                   | [src/diagnostics.ts:145](../../packages/runtime/src/diagnostics.ts#L145); `dist/diagnostics.d.ts:131` |

### PjsSerializationError

| ID                                         | Current type / modifiers                  | Source; declaration                                                                                   |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsSerializationError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsSerializationError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsSerializationError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsSerializationError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsSerializationError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsSerializationError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsStreamResultStats

| ID                                                       | Current type / modifiers | Source; declaration                                                                                |
| -------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsStreamResultStats.binaryResultContractFailures`  | required; `number`       | [src/diagnostics.ts:70](../../packages/runtime/src/diagnostics.ts#L70); `dist/diagnostics.d.ts:63` |
| `MEM.PjsStreamResultStats.buffered`                      | required; `number`       | [src/diagnostics.ts:75](../../packages/runtime/src/diagnostics.ts#L75); `dist/diagnostics.d.ts:68` |
| `MEM.PjsStreamResultStats.currentReservedResultBytes`    | required; `number`       | [src/diagnostics.ts:66](../../packages/runtime/src/diagnostics.ts#L66); `dist/diagnostics.d.ts:59` |
| `MEM.PjsStreamResultStats.knownBufferedPayloadBytes`     | required; `number`       | [src/diagnostics.ts:76](../../packages/runtime/src/diagnostics.ts#L76); `dist/diagnostics.d.ts:69` |
| `MEM.PjsStreamResultStats.peakBuffered`                  | required; `number`       | [src/diagnostics.ts:63](../../packages/runtime/src/diagnostics.ts#L63); `dist/diagnostics.d.ts:56` |
| `MEM.PjsStreamResultStats.peakKnownBufferedPayloadBytes` | required; `number`       | [src/diagnostics.ts:64](../../packages/runtime/src/diagnostics.ts#L64); `dist/diagnostics.d.ts:57` |
| `MEM.PjsStreamResultStats.peakReservedResultBytes`       | required; `number`       | [src/diagnostics.ts:67](../../packages/runtime/src/diagnostics.ts#L67); `dist/diagnostics.d.ts:60` |
| `MEM.PjsStreamResultStats.peakUnknownBufferedResults`    | required; `number`       | [src/diagnostics.ts:65](../../packages/runtime/src/diagnostics.ts#L65); `dist/diagnostics.d.ts:58` |
| `MEM.PjsStreamResultStats.produced`                      | required; `number`       | [src/diagnostics.ts:61](../../packages/runtime/src/diagnostics.ts#L61); `dist/diagnostics.d.ts:54` |
| `MEM.PjsStreamResultStats.refundedResultBytes`           | required; `number`       | [src/diagnostics.ts:74](../../packages/runtime/src/diagnostics.ts#L74); `dist/diagnostics.d.ts:67` |
| `MEM.PjsStreamResultStats.resultByteRefunds`             | required; `number`       | [src/diagnostics.ts:73](../../packages/runtime/src/diagnostics.ts#L73); `dist/diagnostics.d.ts:66` |
| `MEM.PjsStreamResultStats.resultByteReservationRejected` | required; `number`       | [src/diagnostics.ts:69](../../packages/runtime/src/diagnostics.ts#L69); `dist/diagnostics.d.ts:62` |
| `MEM.PjsStreamResultStats.resultByteReservationWaits`    | required; `number`       | [src/diagnostics.ts:68](../../packages/runtime/src/diagnostics.ts#L68); `dist/diagnostics.d.ts:61` |
| `MEM.PjsStreamResultStats.unknownBufferedResults`        | required; `number`       | [src/diagnostics.ts:77](../../packages/runtime/src/diagnostics.ts#L77); `dist/diagnostics.d.ts:70` |
| `MEM.PjsStreamResultStats.upperBoundContractFailures`    | required; `number`       | [src/diagnostics.ts:71](../../packages/runtime/src/diagnostics.ts#L71); `dist/diagnostics.d.ts:64` |
| `MEM.PjsStreamResultStats.upperBoundResultsReconciled`   | required; `number`       | [src/diagnostics.ts:72](../../packages/runtime/src/diagnostics.ts#L72); `dist/diagnostics.d.ts:65` |
| `MEM.PjsStreamResultStats.yielded`                       | required; `number`       | [src/diagnostics.ts:62](../../packages/runtime/src/diagnostics.ts#L62); `dist/diagnostics.d.ts:55` |

### PjsTask

| ID                         | Current type / modifiers                       | Source; declaration                                                                                      |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `MEM.PjsTask.__@taskTypes` | optional; readonly; `(input: Input) => Output` | [src/tasks/registry.ts:8](../../packages/runtime/src/tasks/registry.ts#L8); `dist/tasks/registry.d.ts:5` |
| `MEM.PjsTask.id`           | required; readonly; `string`                   | [src/tasks/registry.ts:7](../../packages/runtime/src/tasks/registry.ts#L7); `dist/tasks/registry.d.ts:4` |

### PjsTaskError

| ID                                | Current type / modifiers                  | Source; declaration                                                                                   |
| --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsTaskError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsTaskError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsTaskError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsTaskError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsTaskError.remoteName`     | required; readonly; `string`              | [src/errors/index.ts:44](../../packages/runtime/src/errors/index.ts#L44); `dist/errors/index.d.ts:31` |
| `MEM.PjsTaskError.remoteStack`    | required; readonly; `string \| undefined` | [src/errors/index.ts:45](../../packages/runtime/src/errors/index.ts#L45); `dist/errors/index.d.ts:32` |
| `MEM.PjsTaskError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsTaskError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsTaskErrorDetails

| ID                                | Current type / modifiers | Source; declaration                                                                                   |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsTaskErrorDetails.message` | required; `string`       | [src/errors/index.ts:20](../../packages/runtime/src/errors/index.ts#L20); `dist/errors/index.d.ts:18` |
| `MEM.PjsTaskErrorDetails.name`    | required; `string`       | [src/errors/index.ts:19](../../packages/runtime/src/errors/index.ts#L19); `dist/errors/index.d.ts:17` |
| `MEM.PjsTaskErrorDetails.stack`   | optional; `string`       | [src/errors/index.ts:21](../../packages/runtime/src/errors/index.ts#L21); `dist/errors/index.d.ts:19` |

### PjsTaskRegistrationError

| ID                                            | Current type / modifiers                  | Source; declaration                                                                                   |
| --------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsTaskRegistrationError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsTaskRegistrationError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsTaskRegistrationError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsTaskRegistrationError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsTaskRegistrationError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsTaskRegistrationError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsTaskRegistry

| ID                             | Current type / modifiers                                                                                                          | Source; declaration                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `MEM.PjsTaskRegistry.register` | required; `<Input, Output>(id: string, module: URL, exportName?: string) => import("./tasks/registry.js").PjsTask<Input, Output>` | [src/tasks/registry.ts:32](../../packages/runtime/src/tasks/registry.ts#L32); `dist/tasks/registry.d.ts:14` |

### PjsTimeoutError

| ID                                   | Current type / modifiers                  | Source; declaration                                                                                   |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsTimeoutError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsTimeoutError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsTimeoutError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsTimeoutError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsTimeoutError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsTimeoutError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsTimingStats

| ID                                      | Current type / modifiers | Source; declaration                                                                                |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsTimingStats.averageExecutionMs` | required; `number`       | [src/diagnostics.ts:44](../../packages/runtime/src/diagnostics.ts#L44); `dist/diagnostics.d.ts:39` |
| `MEM.PjsTimingStats.averageQueueMs`     | required; `number`       | [src/diagnostics.ts:43](../../packages/runtime/src/diagnostics.ts#L43); `dist/diagnostics.d.ts:38` |
| `MEM.PjsTimingStats.averageTotalMs`     | required; `number`       | [src/diagnostics.ts:45](../../packages/runtime/src/diagnostics.ts#L45); `dist/diagnostics.d.ts:40` |
| `MEM.PjsTimingStats.executionSamples`   | required; `number`       | [src/diagnostics.ts:47](../../packages/runtime/src/diagnostics.ts#L47); `dist/diagnostics.d.ts:42` |
| `MEM.PjsTimingStats.queueSamples`       | required; `number`       | [src/diagnostics.ts:46](../../packages/runtime/src/diagnostics.ts#L46); `dist/diagnostics.d.ts:41` |
| `MEM.PjsTimingStats.settledSamples`     | required; `number`       | [src/diagnostics.ts:48](../../packages/runtime/src/diagnostics.ts#L48); `dist/diagnostics.d.ts:43` |

### PjsTransfer

| ID                                 | Current type / modifiers     | Source; declaration                                                                                        |
| ---------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MEM.PjsTransfer.__@transferBrand` | required; readonly; `true`   | [src/tasks/transfer.ts:12](../../packages/runtime/src/tasks/transfer.ts#L12); `dist/tasks/transfer.d.ts:4` |
| `MEM.PjsTransfer.value`            | required; readonly; `Output` | [src/tasks/transfer.ts:11](../../packages/runtime/src/tasks/transfer.ts#L11); `dist/tasks/transfer.d.ts:3` |

### PjsWorkerError

| ID                                  | Current type / modifiers                  | Source; declaration                                                                                   |
| ----------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MEM.PjsWorkerError.operationId`    | required; readonly; `string \| undefined` | [src/errors/index.ts:27](../../packages/runtime/src/errors/index.ts#L27); `dist/errors/index.d.ts:24` |
| `MEM.PjsWorkerError.partitionIndex` | required; readonly; `number \| undefined` | [src/errors/index.ts:28](../../packages/runtime/src/errors/index.ts#L28); `dist/errors/index.d.ts:25` |
| `MEM.PjsWorkerError.rangeEnd`       | required; readonly; `number \| undefined` | [src/errors/index.ts:30](../../packages/runtime/src/errors/index.ts#L30); `dist/errors/index.d.ts:27` |
| `MEM.PjsWorkerError.rangeStart`     | required; readonly; `number \| undefined` | [src/errors/index.ts:29](../../packages/runtime/src/errors/index.ts#L29); `dist/errors/index.d.ts:26` |
| `MEM.PjsWorkerError.taskId`         | required; readonly; `string \| undefined` | [src/errors/index.ts:25](../../packages/runtime/src/errors/index.ts#L25); `dist/errors/index.d.ts:22` |
| `MEM.PjsWorkerError.workerId`       | required; readonly; `number \| undefined` | [src/errors/index.ts:26](../../packages/runtime/src/errors/index.ts#L26); `dist/errors/index.d.ts:23` |

### PjsWorkerStats

| ID                            | Current type / modifiers                             | Source; declaration                                                                                |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MEM.PjsWorkerStats.busy`     | required; `number`                                   | [src/diagnostics.ts:27](../../packages/runtime/src/diagnostics.ts#L27); `dist/diagnostics.d.ts:24` |
| `MEM.PjsWorkerStats.details`  | required; `import("./types/index.js").WorkerState[]` | [src/diagnostics.ts:33](../../packages/runtime/src/diagnostics.ts#L33); `dist/diagnostics.d.ts:30` |
| `MEM.PjsWorkerStats.failures` | required; `number`                                   | [src/diagnostics.ts:30](../../packages/runtime/src/diagnostics.ts#L30); `dist/diagnostics.d.ts:27` |
| `MEM.PjsWorkerStats.idle`     | required; `number`                                   | [src/diagnostics.ts:28](../../packages/runtime/src/diagnostics.ts#L28); `dist/diagnostics.d.ts:25` |
| `MEM.PjsWorkerStats.restarts` | required; `number`                                   | [src/diagnostics.ts:31](../../packages/runtime/src/diagnostics.ts#L31); `dist/diagnostics.d.ts:28` |
| `MEM.PjsWorkerStats.starting` | required; `number`                                   | [src/diagnostics.ts:29](../../packages/runtime/src/diagnostics.ts#L29); `dist/diagnostics.d.ts:26` |
| `MEM.PjsWorkerStats.total`    | required; `number`                                   | [src/diagnostics.ts:26](../../packages/runtime/src/diagnostics.ts#L26); `dist/diagnostics.d.ts:23` |

### RangePartition

| ID                         | Current type / modifiers     | Source; declaration                                                                                            |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MEM.RangePartition.end`   | required; readonly; `number` | [src/partition/range.ts:12](../../packages/runtime/src/partition/range.ts#L12); `dist/partition/range.d.ts:11` |
| `MEM.RangePartition.index` | required; readonly; `number` | [src/partition/range.ts:10](../../packages/runtime/src/partition/range.ts#L10); `dist/partition/range.d.ts:9`  |
| `MEM.RangePartition.start` | required; readonly; `number` | [src/partition/range.ts:11](../../packages/runtime/src/partition/range.ts#L11); `dist/partition/range.d.ts:10` |

### RestartPolicy

| ID                              | Current type / modifiers | Source; declaration                                                                                |
| ------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.RestartPolicy.maxRestarts` | required; `number`       | [src/types/index.ts:71](../../packages/runtime/src/types/index.ts#L71); `dist/types/index.d.ts:57` |
| `MEM.RestartPolicy.windowMs`    | required; `number`       | [src/types/index.ts:73](../../packages/runtime/src/types/index.ts#L73); `dist/types/index.d.ts:59` |

### RunOptions

| ID                              | Current type / modifiers           | Source; declaration                                                                                |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MEM.RunOptions.executionLease` | optional; `number`                 | [src/types/index.ts:53](../../packages/runtime/src/types/index.ts#L53); `dist/types/index.d.ts:41` |
| `MEM.RunOptions.signal`         | optional; `AbortSignal`            | [src/types/index.ts:42](../../packages/runtime/src/types/index.ts#L42); `dist/types/index.d.ts:30` |
| `MEM.RunOptions.timeout`        | optional; `number`                 | [src/types/index.ts:46](../../packages/runtime/src/types/index.ts#L46); `dist/types/index.d.ts:34` |
| `MEM.RunOptions.transferList`   | optional; `readonly ArrayBuffer[]` | [src/types/index.ts:44](../../packages/runtime/src/types/index.ts#L44); `dist/types/index.d.ts:32` |

### ShutdownOptions

| ID                               | Current type / modifiers | Source; declaration                                                                                |
| -------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `MEM.ShutdownOptions.drain`      | optional; `boolean`      | [src/types/index.ts:58](../../packages/runtime/src/types/index.ts#L58); `dist/types/index.d.ts:45` |
| `MEM.ShutdownOptions.forceAfter` | optional; `number`       | [src/types/index.ts:65](../../packages/runtime/src/types/index.ts#L65); `dist/types/index.d.ts:52` |

### StreamRangeOptions

| ID                                                      | Current type / modifiers | Source; declaration                                                                                            |
| ------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `MEM.StreamRangeOptions.dispatchBatchSize`              | optional; `number`       | [src/partition/range.ts:30](../../packages/runtime/src/partition/range.ts#L30); `dist/partition/range.d.ts:26` |
| `MEM.StreamRangeOptions.maxBufferedResults`             | optional; `number`       | [src/partition/range.ts:46](../../packages/runtime/src/partition/range.ts#L46); `dist/partition/range.d.ts:37` |
| `MEM.StreamRangeOptions.executionLease`                 | optional; `never`        | [src/partition/range.ts:24](../../packages/runtime/src/partition/range.ts#L24); `dist/partition/range.d.ts:21` |
| `MEM.StreamRangeOptions.experimentalDispatchBatchSize`  | optional; `number`       | [src/partition/range.ts:32](../../packages/runtime/src/partition/range.ts#L32); `dist/partition/range.d.ts:28` |
| `MEM.StreamRangeOptions.experimentalMaxBufferedResults` | optional; `number`       | [src/partition/range.ts:48](../../packages/runtime/src/partition/range.ts#L48); `dist/partition/range.d.ts:39` |
| `MEM.StreamRangeOptions.signal`                         | optional; `AbortSignal`  | [src/partition/range.ts:25](../../packages/runtime/src/partition/range.ts#L25); `dist/partition/range.d.ts:22` |
| `MEM.StreamRangeOptions.timeout`                        | optional; `number`       | [src/partition/range.ts:26](../../packages/runtime/src/partition/range.ts#L26); `dist/partition/range.d.ts:23` |

### StreamRangeResult

| ID                                | Current type / modifiers                                            | Source; declaration                                                                                            |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MEM.StreamRangeResult.output`    | required; readonly; `Output`                                        | [src/partition/stream.ts:5](../../packages/runtime/src/partition/stream.ts#L5); `dist/partition/stream.d.ts:4` |
| `MEM.StreamRangeResult.partition` | required; readonly; `import("./partition/range.js").RangePartition` | [src/partition/stream.ts:4](../../packages/runtime/src/partition/stream.ts#L4); `dist/partition/stream.d.ts:3` |

### TaskSnapshot

| ID                                | Current type / modifiers                                                                                               | Source; declaration                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MEM.TaskSnapshot.completedAt`    | optional; `number`                                                                                                     | [src/types/index.ts:33](../../packages/runtime/src/types/index.ts#L33); `dist/types/index.d.ts:22` |
| `MEM.TaskSnapshot.createdAt`      | required; `number`                                                                                                     | [src/types/index.ts:29](../../packages/runtime/src/types/index.ts#L29); `dist/types/index.d.ts:18` |
| `MEM.TaskSnapshot.id`             | required; `string`                                                                                                     | [src/types/index.ts:25](../../packages/runtime/src/types/index.ts#L25); `dist/types/index.d.ts:14` |
| `MEM.TaskSnapshot.operationId`    | optional; `string`                                                                                                     | [src/types/index.ts:35](../../packages/runtime/src/types/index.ts#L35); `dist/types/index.d.ts:24` |
| `MEM.TaskSnapshot.partitionIndex` | optional; `number`                                                                                                     | [src/types/index.ts:36](../../packages/runtime/src/types/index.ts#L36); `dist/types/index.d.ts:25` |
| `MEM.TaskSnapshot.queuedAt`       | optional; `number`                                                                                                     | [src/types/index.ts:30](../../packages/runtime/src/types/index.ts#L30); `dist/types/index.d.ts:19` |
| `MEM.TaskSnapshot.rangeEnd`       | optional; `number`                                                                                                     | [src/types/index.ts:38](../../packages/runtime/src/types/index.ts#L38); `dist/types/index.d.ts:27` |
| `MEM.TaskSnapshot.rangeStart`     | optional; `number`                                                                                                     | [src/types/index.ts:37](../../packages/runtime/src/types/index.ts#L37); `dist/types/index.d.ts:26` |
| `MEM.TaskSnapshot.scheduledAt`    | optional; `number`                                                                                                     | [src/types/index.ts:31](../../packages/runtime/src/types/index.ts#L31); `dist/types/index.d.ts:20` |
| `MEM.TaskSnapshot.startedAt`      | optional; `number`                                                                                                     | [src/types/index.ts:32](../../packages/runtime/src/types/index.ts#L32); `dist/types/index.d.ts:21` |
| `MEM.TaskSnapshot.status`         | required; `"created" \| "running" \| "failed" \| "queued" \| "scheduled" \| "completed" \| "cancelled" \| "timed_out"` | [src/types/index.ts:27](../../packages/runtime/src/types/index.ts#L27); `dist/types/index.d.ts:16` |
| `MEM.TaskSnapshot.taskName`       | required; `string`                                                                                                     | [src/types/index.ts:26](../../packages/runtime/src/types/index.ts#L26); `dist/types/index.d.ts:15` |
| `MEM.TaskSnapshot.workerId`       | optional; `number`                                                                                                     | [src/types/index.ts:28](../../packages/runtime/src/types/index.ts#L28); `dist/types/index.d.ts:17` |

### TypedMapRangeOptions

| ID                                                       | Current type / modifiers | Source; declaration                                                                                              |
| -------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `MEM.TypedMapRangeOptions.dispatchBatchSize`             | optional; `number`       | [src/partition/range.ts:30](../../packages/runtime/src/partition/range.ts#L30); `dist/partition/range.d.ts:26`   |
| `MEM.TypedMapRangeOptions.outputConstructor`             | optional; `Constructor`  | [src/partition/range.ts:138](../../packages/runtime/src/partition/range.ts#L138); `dist/partition/range.d.ts:79` |
| `MEM.TypedMapRangeOptions.executionLease`                | optional; `never`        | [src/partition/range.ts:24](../../packages/runtime/src/partition/range.ts#L24); `dist/partition/range.d.ts:21`   |
| `MEM.TypedMapRangeOptions.experimentalDispatchBatchSize` | optional; `number`       | [src/partition/range.ts:32](../../packages/runtime/src/partition/range.ts#L32); `dist/partition/range.d.ts:28`   |
| `MEM.TypedMapRangeOptions.experimentalOutputConstructor` | optional; `Constructor`  | [src/partition/range.ts:140](../../packages/runtime/src/partition/range.ts#L140); `dist/partition/range.d.ts:81` |
| `MEM.TypedMapRangeOptions.signal`                        | optional; `AbortSignal`  | [src/partition/range.ts:25](../../packages/runtime/src/partition/range.ts#L25); `dist/partition/range.d.ts:22`   |
| `MEM.TypedMapRangeOptions.timeout`                       | optional; `number`       | [src/partition/range.ts:26](../../packages/runtime/src/partition/range.ts#L26); `dist/partition/range.d.ts:23`   |

### UpperBoundBinaryStreamRangeOptions

| ID                                                                          | Current type / modifiers                                                                     | Source; declaration                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MEM.UpperBoundBinaryStreamRangeOptions.dispatchBatchSize`                  | optional; `number`                                                                           | [src/partition/range.ts:30](../../packages/runtime/src/partition/range.ts#L30); `dist/partition/range.d.ts:26`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.maxBufferedResults`                 | optional; `number`                                                                           | [src/partition/range.ts:46](../../packages/runtime/src/partition/range.ts#L46); `dist/partition/range.d.ts:37`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.executionLease`                     | optional; `never`                                                                            | [src/partition/range.ts:24](../../packages/runtime/src/partition/range.ts#L24); `dist/partition/range.d.ts:21`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.experimentalDispatchBatchSize`      | optional; `number`                                                                           | [src/partition/range.ts:32](../../packages/runtime/src/partition/range.ts#L32); `dist/partition/range.d.ts:28`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.experimentalMaxBufferedResults`     | optional; `number`                                                                           | [src/partition/range.ts:48](../../packages/runtime/src/partition/range.ts#L48); `dist/partition/range.d.ts:39`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.experimentalMaxReservedResultBytes` | required; `number`                                                                           | [src/partition/range.ts:100](../../packages/runtime/src/partition/range.ts#L100); `dist/partition/range.d.ts:70` |
| `MEM.UpperBoundBinaryStreamRangeOptions.experimentalMaxResultBytes`         | required; `number \| ((partition: import("./partition/range.js").RangePartition) => number)` | [src/partition/range.ts:98](../../packages/runtime/src/partition/range.ts#L98); `dist/partition/range.d.ts:68`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.experimentalResultBytes`            | optional; `never`                                                                            | [src/partition/range.ts:99](../../packages/runtime/src/partition/range.ts#L99); `dist/partition/range.d.ts:69`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.signal`                             | optional; `AbortSignal`                                                                      | [src/partition/range.ts:25](../../packages/runtime/src/partition/range.ts#L25); `dist/partition/range.d.ts:22`   |
| `MEM.UpperBoundBinaryStreamRangeOptions.timeout`                            | optional; `number`                                                                           | [src/partition/range.ts:26](../../packages/runtime/src/partition/range.ts#L26); `dist/partition/range.d.ts:23`   |

### WorkerState

| ID                                     | Current type / modifiers                                            | Source; declaration                                                                                |
| -------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MEM.WorkerState.completedTasks`       | required; `number`                                                  | [src/types/index.ts:19](../../packages/runtime/src/types/index.ts#L19); `dist/types/index.d.ts:9`  |
| `MEM.WorkerState.currentTaskId`        | optional; `string`                                                  | [src/types/index.ts:18](../../packages/runtime/src/types/index.ts#L18); `dist/types/index.d.ts:8`  |
| `MEM.WorkerState.failedTasks`          | required; `number`                                                  | [src/types/index.ts:20](../../packages/runtime/src/types/index.ts#L20); `dist/types/index.d.ts:10` |
| `MEM.WorkerState.id`                   | required; `number`                                                  | [src/types/index.ts:15](../../packages/runtime/src/types/index.ts#L15); `dist/types/index.d.ts:5`  |
| `MEM.WorkerState.status`               | required; `"starting" \| "stopped" \| "failed" \| "idle" \| "busy"` | [src/types/index.ts:17](../../packages/runtime/src/types/index.ts#L17); `dist/types/index.d.ts:7`  |
| `MEM.WorkerState.threadId`             | required; `number`                                                  | [src/types/index.ts:16](../../packages/runtime/src/types/index.ts#L16); `dist/types/index.d.ts:6`  |
| `MEM.WorkerState.totalExecutionTimeMs` | required; `number`                                                  | [src/types/index.ts:21](../../packages/runtime/src/types/index.ts#L21); `dist/types/index.d.ts:11` |

## Signature-reachable types beyond root names

There are no additional repository-owned named types beyond the root exports.
The four former reachable types now have explicit supported Pjs-prefixed root
names; their retired REACH IDs above are migration history. TaskDescriptor and
worker protocol records remain internal.

Native signature boundaries are standard `Error`/`ErrorOptions`, `URL`,
`AbortSignal`, `Promise`, `AsyncIterable`/iterators/`IteratorResult`, Array/ReadonlyArray,
ArrayBuffer/SharedArrayBuffer/ArrayBufferLike, DataView, all eleven typed arrays
and their constructor interfaces,
`InstanceType<C>`, primitive/unknown/void types and module-private unique symbols.
These use the declared Node/TypeScript environment; PJS does not own their members.
The task-error constructor accepts PjsTaskErrorDetails, the explicit record
`{ name: string; message: string; stack?: string }`; the worker protocol's serialized record is not root-exported.

## Error contract and metadata

Every PJS class extends `PjsError`, except `PjsExecutionLeaseError` extends
`PjsWorkerError` and transitively `PjsError`. Native RangeError/TypeError from
validation and application getter errors are not PjsError. Public errors retain
`instanceof`, their concrete `.name` and a string `.message`, which may be empty.
Public constructors preserve supplied empty strings, including `new PjsError('')`
and `new PjsTaskError({ name: 'Error', message: '' }, {})`. Exact message/stack
bytes, worker frame locations and unsafe thrown-value formatting
are not compatibility protocols. `cause: unknown` can be an application reason,
serialized remote error or infrastructure error; consumers must inspect safely.

| Class / ID                         | Creation and delivery                                                                                                                                                                       | Target / evidence                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `ERR.PjsError`                     | Base contextual error; factory failures wrap original cause and partition context                                                                                                           | S base; partition/public-options                   |
| `ERR.PjsTaskError`                 | Worker invocation throws/rejects; run rejects, range parent rejects/iterator fails with child context                                                                                       | S; runtime/map/package                             |
| `ERR.PjsWorkerError`               | Bootstrap, unexpected exit including code 0, error/protocol failure, replacement/bootstrap or exhausted recovery. Startup rejects shared ready; accepted work fails with applicable context | S; containment/model-real-worker/physical-boundary |
| `ERR.PjsExecutionLeaseError`       | Expired successfully posted ordinary run: pending caller gets subtype; already-settled caller retains earlier error, infrastructure still contains                                          | P1; containment/R2                                 |
| `ERR.PjsQueueFullError`            | Logical task or parent-operation capacity exhausted; pre-admission rejection                                                                                                                | S/P2; runtime/partition                            |
| `ERR.PjsTimeoutError`              | Run caller or parent deadline; no assertion that occupied worker ended                                                                                                                      | S/P2; runtime/stream/containment                   |
| `ERR.PjsCancelledError`            | Pre-abort, abort, consumer close, sibling cancellation or forced/escalated shutdown                                                                                                         | S/P2; transfer/stream/memory                       |
| `ERR.PjsSerializationError`        | Invalid transfer list/claim (rejected submission), failed accepted input post, failed output serialization; contextual wrapping                                                             | S specialized; transfer/physical-boundary          |
| `ERR.PjsRuntimeStateError`         | Submission in unavailable state, startup stopped, nested worker range operation                                                                                                             | S/P2; runtime/partition                            |
| `ERR.PjsTaskRegistrationError`     | Invalid registry registration (sync) or handle not in runtime snapshot (request rejection)                                                                                                  | S; runtime/runtime-boundaries                      |
| `ERR.PjsMapContractError`          | Wrong block kind/cardinality or assembly failure; original map getter reentrancy and accounting retained                                                                                    | P2; map/runtime-boundaries                         |
| `ERR.PjsBinaryResultContractError` | Invalid exact/maximum declaration, bad worker direct result size/backing/type, invalid host reconciliation; iterator/parent failure                                                         | B2/P3; binary-result/upper-bound                   |
| `ERR.PjsResultCapacityError`       | Per-child declared bytes exceed its stream's fixed capacity, before that input factory                                                                                                      | P3; binary-result/upper-bound                      |

| Metadata field                                            | Current presence and meaning                                                                                         | Proposed support                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `taskId`, `workerId`                                      | Own readonly fields with undefined when unavailable; logical child ID vs numeric worker ID                           | Preserve optional availability, never fabricate context                                                 |
| `operationId`, `partitionIndex`, `rangeStart`, `rangeEnd` | Own readonly fields; range context added to runtime-created child errors/parent wrappers                             | Preserve; `partitionIndex` zero-based, bounds half-open                                                 |
| `cause`                                                   | Native Error own field (currently passed even when undefined); arbitrary unknown value                               | Preserve meaning and unknown type, not native enumeration/order                                         |
| `remoteName`                                              | PjsTaskError required worker-thrown name                                                                             | Preserve string; worker's class identity does not cross isolate                                         |
| `remoteStack` / `stack`                                   | Optional remote stack / local possibly appended stack                                                                | Diagnostic optional strings; no exact formatting guarantee                                              |
| `declaredBytes`, `actualBytes`, `actualType`              | Binary-contract error own fields, values or undefined; actual bytes may be unavailable for shared/unsupported output | Preserve; nonnegative visible bytes when known; actualType descriptive, no exhaustive closed vocabulary |
| `declaredBytes`, `resultByteCapacity`                     | Capacity-error own fields, values or undefined                                                                       | Preserve distinction from binary-result actual size                                                     |

PjsErrorContext's PjsBinaryResultErrorContext extension includes all four byte fields, but a specific
error instance only assigns the fields in its class above. The supported contract does not claim that
every context key is copied onto every error. Constructors remain callable;
TypeScript readonly does not freeze runtime errors, and coordinator context
augmentation uses actual instances. No new error code, hierarchy, message freeze
or blanket catch-and-wrap policy is recommended.

## Statistics: field-by-field decision

B4 explicitly names the supported diagnostic contracts and preserves all 158
listed paths. Broader v1 stabilization and feature-group promotion remain separate
decisions; no stats-field removal or rename is introduced here. `streams` and `maps` aliases and both buffered byte spellings are
intentional retained compatibility costs. Current mutability of defensive copies
is retained; do not add blanket readonly or an inferred ReturnType alias as the
entire review. No new quantile, atomically frozen distributed sample or fast-path API.

Rows below give current declared type/presence, owner, precise meaning, unit and
lifetime. Every row's proposed disposition is **D: explicit supported diagnostic
in B4**, except containment additions also require P1 and advanced range fields
require P2/P3. Core/per-owner counters are cumulative from runtime construction
(`C`); current gauges are instantaneous (`G`); high-water marks are monotonic
runtime-lifetime peaks (`P`); active/per-worker counters die with that record (`A`).
There is no reset method. Worker replacement loses that wrapper's per-worker
detail totals, not runtime lifetime totals. Counts use JavaScript numbers; no
exact arithmetic beyond Number safe-integer precision is promised for unbounded
cumulative diagnostics. Values do not sum to one physical completion count.

| ID / path                                           | Current type / presence                                                                                                | Owner                   | Lifetime; unit    | Reviewed meaning                                                                                                                              | Source; declaration                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `STAT.activeOperations[].admitted`                  | `number`; required                                                                                                     | Range parent            | C/A; children     | children accepted into task admission, including those later settled                                                                          | `src/diagnostics.ts:119`; `dist/diagnostics.d.ts:106` |
| `STAT.activeOperations[].assembledBlocks`           | `number`; optional/mode-dependent                                                                                      | Range parent            | C/A; blocks       | map completed-child count before result validation; may transiently exceed successfully copied blocks                                         | `src/diagnostics.ts:136`; `dist/diagnostics.d.ts:123` |
| `STAT.activeOperations[].assemblyMs`                | `number`; optional/mode-dependent                                                                                      | Range parent            | C/A; ms           | host monotonic elapsed time spent attempting map validation/copy                                                                              | `src/diagnostics.ts:137`; `dist/diagnostics.d.ts:124` |
| `STAT.activeOperations[].bufferedKnownPayloadBytes` | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; bytes        | strict-binary alias of knownBufferedPayloadBytes, only in byte mode                                                                           | `src/diagnostics.ts:133`; `dist/diagnostics.d.ts:120` |
| `STAT.activeOperations[].bufferedResults`           | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; results      | currently buffered stream results, not yielded consumer values                                                                                | `src/diagnostics.ts:125`; `dist/diagnostics.d.ts:112` |
| `STAT.activeOperations[].cancelled`                 | `number`; required                                                                                                     | Range parent            | C/A; children     | cancelled child callers, including children timed out by parent cancellation                                                                  | `src/diagnostics.ts:124`; `dist/diagnostics.d.ts:111` |
| `STAT.activeOperations[].chunkCount`                | `number`; required                                                                                                     | Range parent            | G/A; partitions   | fixed planned partition count                                                                                                                 | `src/diagnostics.ts:117`; `dist/diagnostics.d.ts:104` |
| `STAT.activeOperations[].completed`                 | `number`; required                                                                                                     | Range parent            | C/A; children     | successfully settled child callers; map validation may subsequently fail                                                                      | `src/diagnostics.ts:122`; `dist/diagnostics.d.ts:109` |
| `STAT.activeOperations[].end`                       | `number`; required                                                                                                     | Range parent            | G/A; index        | fixed exclusive range endpoint                                                                                                                | `src/diagnostics.ts:115`; `dist/diagnostics.d.ts:102` |
| `STAT.activeOperations[].failed`                    | `number`; required                                                                                                     | Range parent            | C/A; children     | failed child callers                                                                                                                          | `src/diagnostics.ts:123`; `dist/diagnostics.d.ts:110` |
| `STAT.activeOperations[].generated`                 | `number`; required                                                                                                     | Range parent            | C/A; partitions   | descriptors generated, including a later failed input factory                                                                                 | `src/diagnostics.ts:118`; `dist/diagnostics.d.ts:105` |
| `STAT.activeOperations[].grainSize`                 | `number`; required                                                                                                     | Range parent            | G/A; elements     | fixed positive maximum partition span                                                                                                         | `src/diagnostics.ts:116`; `dist/diagnostics.d.ts:103` |
| `STAT.activeOperations[].id`                        | `string`; required                                                                                                     | Range parent            | G/A; ID           | opaque unique parent operation identifier within runtime                                                                                      | `src/diagnostics.ts:110`; `dist/diagnostics.d.ts:97`  |
| `STAT.activeOperations[].knownBufferedPayloadBytes` | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; bytes        | sum of visible byte lengths for recognized binary stream values buffered now; not backing-store bytes                                         | `src/diagnostics.ts:129`; `dist/diagnostics.d.ts:116` |
| `STAT.activeOperations[].mappedElements`            | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; elements     | map full planned target length, not copied progress                                                                                           | `src/diagnostics.ts:135`; `dist/diagnostics.d.ts:122` |
| `STAT.activeOperations[].producedResults`           | `number`; optional/mode-dependent                                                                                      | Range parent            | C/A; results      | stream results accepted into delivery, including directly resolved reads                                                                      | `src/diagnostics.ts:127`; `dist/diagnostics.d.ts:114` |
| `STAT.activeOperations[].queued`                    | `number`; required                                                                                                     | Range parent            | G/A; children     | accepted children waiting in scheduler                                                                                                        | `src/diagnostics.ts:120`; `dist/diagnostics.d.ts:107` |
| `STAT.activeOperations[].reservedResultBytes`       | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; bytes        | strict stream active byte reservations, with upper-bound reconciliation; physical retention can outlive this snapshot                         | `src/diagnostics.ts:131`; `dist/diagnostics.d.ts:118` |
| `STAT.activeOperations[].resultBufferCapacity`      | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; results      | fixed stream buffered-plus-in-flight count capacity                                                                                           | `src/diagnostics.ts:126`; `dist/diagnostics.d.ts:113` |
| `STAT.activeOperations[].resultByteCapacity`        | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; bytes        | fixed strict-binary per-stream reservation capacity                                                                                           | `src/diagnostics.ts:134`; `dist/diagnostics.d.ts:121` |
| `STAT.activeOperations[].resultMode`                | `"collect" \| "discard" \| "stream" \| "map"`; required                                                                | Range parent            | G/A; enum         | collect/discard/stream/map mode; values retain declared union                                                                                 | `src/diagnostics.ts:113`; `dist/diagnostics.d.ts:100` |
| `STAT.activeOperations[].running`                   | `number`; required                                                                                                     | Range parent            | G/A; children     | scheduled/running child callers (logical, not physical occupancy)                                                                             | `src/diagnostics.ts:121`; `dist/diagnostics.d.ts:108` |
| `STAT.activeOperations[].start`                     | `number`; required                                                                                                     | Range parent            | G/A; index        | fixed inclusive range endpoint                                                                                                                | `src/diagnostics.ts:114`; `dist/diagnostics.d.ts:101` |
| `STAT.activeOperations[].status`                    | `"created" \| "running" \| "failed" \| "completed" \| "cancelled" \| "timed_out"`; required                            | Range parent            | G/A; enum         | logical parent status; normally running in active list, complete union retained without terminal history                                      | `src/diagnostics.ts:112`; `dist/diagnostics.d.ts:99`  |
| `STAT.activeOperations[].taskName`                  | `string`; required                                                                                                     | Range parent            | G/A; ID           | registered task ID, not exportName                                                                                                            | `src/diagnostics.ts:111`; `dist/diagnostics.d.ts:98`  |
| `STAT.activeOperations[].typedOutput`               | `string \| undefined`; optional/mode-dependent                                                                         | Range parent            | G/A; name         | map built-in output constructor name or undefined for ordinary array; diagnostic string, not constructor object                               | `src/diagnostics.ts:138`; `dist/diagnostics.d.ts:125` |
| `STAT.activeOperations[].unknownBufferedResults`    | `number`; optional/mode-dependent                                                                                      | Range parent            | G/A; results      | buffered stream values without recognizable visible binary byte length; nested payload not walked                                             | `src/diagnostics.ts:130`; `dist/diagnostics.d.ts:117` |
| `STAT.activeOperations[].yieldedResults`            | `number`; optional/mode-dependent                                                                                      | Range parent            | C/A; results      | stream results delivered to iterator consumer, not consumer disposal acknowledgements                                                         | `src/diagnostics.ts:128`; `dist/diagnostics.d.ts:115` |
| `STAT.activeTasks[].completedAt`                    | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; epoch ms     | host Date.now on caller settlement; normally removed from active list before observable                                                       | `src/types/index.ts:33`; `dist/types/index.d.ts:22`   |
| `STAT.activeTasks[].createdAt`                      | `number`; required                                                                                                     | Task coordinator        | G/A; epoch ms     | host Date.now at task creation                                                                                                                | `src/types/index.ts:29`; `dist/types/index.d.ts:18`   |
| `STAT.activeTasks[].id`                             | `string`; required                                                                                                     | Task coordinator        | G/A; ID           | opaque unique logical task ID                                                                                                                 | `src/types/index.ts:25`; `dist/types/index.d.ts:14`   |
| `STAT.activeTasks[].operationId`                    | `string`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; ID           | parent ID for child only                                                                                                                      | `src/types/index.ts:35`; `dist/types/index.d.ts:24`   |
| `STAT.activeTasks[].partitionIndex`                 | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; index        | zero-based parent partition index for child only                                                                                              | `src/types/index.ts:36`; `dist/types/index.d.ts:25`   |
| `STAT.activeTasks[].queuedAt`                       | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; epoch ms     | host Date.now when queued, absent for direct dispatch                                                                                         | `src/types/index.ts:30`; `dist/types/index.d.ts:19`   |
| `STAT.activeTasks[].rangeEnd`                       | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; index        | exclusive child partition endpoint                                                                                                            | `src/types/index.ts:38`; `dist/types/index.d.ts:27`   |
| `STAT.activeTasks[].rangeStart`                     | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; index        | inclusive child partition endpoint                                                                                                            | `src/types/index.ts:37`; `dist/types/index.d.ts:26`   |
| `STAT.activeTasks[].scheduledAt`                    | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; epoch ms     | host Date.now on scheduling/post attempt                                                                                                      | `src/types/index.ts:31`; `dist/types/index.d.ts:20`   |
| `STAT.activeTasks[].startedAt`                      | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; epoch ms     | host Date.now when worker-start acknowledgement is processed                                                                                  | `src/types/index.ts:32`; `dist/types/index.d.ts:21`   |
| `STAT.activeTasks[].status`                         | `"created" \| "running" \| "failed" \| "queued" \| "scheduled" \| "completed" \| "cancelled" \| "timed_out"`; required | Task coordinator        | G/A; enum         | logical caller state; independent of physical worker execution                                                                                | `src/types/index.ts:27`; `dist/types/index.d.ts:16`   |
| `STAT.activeTasks[].taskName`                       | `string`; required                                                                                                     | Task coordinator        | G/A; ID           | registered task ID                                                                                                                            | `src/types/index.ts:26`; `dist/types/index.d.ts:15`   |
| `STAT.activeTasks[].workerId`                       | `number`; optional/mode-dependent                                                                                      | Task coordinator        | G/A; ID           | assigned worker ID, absent before assignment                                                                                                  | `src/types/index.ts:28`; `dist/types/index.d.ts:17`   |
| `STAT.containment.confirmedLeaseExits`              | `number`; required                                                                                                     | Dispatcher              | C; exits          | confirmed exits of lease-expired workers                                                                                                      | `src/diagnostics.ts:17`; `dist/diagnostics.d.ts:15`   |
| `STAT.containment.leaseExpirations`                 | `number`; required                                                                                                     | Dispatcher/worker       | C; leases         | physical dispatch leases expired, including already-settled callers                                                                           | `src/diagnostics.ts:15`; `dist/diagnostics.d.ts:13`   |
| `STAT.containment.leaseTerminationRequests`         | `number`; required                                                                                                     | Worker                  | C; requests       | lease-driven termination requests, not confirmed exits                                                                                        | `src/diagnostics.ts:16`; `dist/diagnostics.d.ts:14`   |
| `STAT.containment.restartBudgetExhaustions`         | `number`; required                                                                                                     | Pool                    | C; decisions      | failed recovery decisions denied by configured restart budget                                                                                 | `src/diagnostics.ts:21`; `dist/diagnostics.d.ts:19`   |
| `STAT.containment.restartWindowUtilization`         | `number \| undefined`; required                                                                                        | Pool                    | G; decisions      | nonexpired pool-wide replacement decisions in rolling window, NOT a fraction; undefined for lifetime mode                                     | `src/diagnostics.ts:20`; `dist/diagnostics.d.ts:18`   |
| `STAT.containment.shutdownEscalations`              | `number`; required                                                                                                     | Controller              | C; escalations    | first graceful shutdown actually escalated to forced mode (0 or 1)                                                                            | `src/diagnostics.ts:22`; `dist/diagnostics.d.ts:20`   |
| `STAT.containment.workerReplacements`               | `number`; required                                                                                                     | Pool                    | C; workers        | replacement wrappers actually spawned after confirmed exits                                                                                   | `src/diagnostics.ts:18`; `dist/diagnostics.d.ts:16`   |
| `STAT.dispatch.averageLogicalTasksPerExecute`       | `number`; required                                                                                                     | Dispatcher              | G; tasks/message  | logicalTasks / executeMessages, zero if no messages; descriptive ratio, no throughput promise                                                 | `src/diagnostics.ts:101`; `dist/diagnostics.d.ts:91`  |
| `STAT.dispatch.batchedExecuteMessages`              | `number`; required                                                                                                     | Dispatcher              | C; messages       | successfully posted batches with more than one logical item; singleton submissions use ordinary execution                                     | `src/diagnostics.ts:98`; `dist/diagnostics.d.ts:88`   |
| `STAT.dispatch.executeMessages`                     | `number`; required                                                                                                     | Dispatcher              | C; messages       | successfully posted execute messages, one per single/batch                                                                                    | `src/diagnostics.ts:96`; `dist/diagnostics.d.ts:86`   |
| `STAT.dispatch.logicalPartitions`                   | `number`; required                                                                                                     | Dispatcher              | C; partitions     | range children in successfully posted execute messages                                                                                        | `src/diagnostics.ts:100`; `dist/diagnostics.d.ts:90`  |
| `STAT.dispatch.logicalTasks`                        | `number`; required                                                                                                     | Dispatcher              | C; tasks          | logical items in successfully posted execute messages                                                                                         | `src/diagnostics.ts:99`; `dist/diagnostics.d.ts:89`   |
| `STAT.dispatch.resultMessages`                      | `number`; required                                                                                                     | Dispatcher              | C; messages       | validated final result envelopes, one per single/batch                                                                                        | `src/diagnostics.ts:97`; `dist/diagnostics.d.ts:87`   |
| `STAT.mapResults.assemblyMs`                        | `number`; required                                                                                                     | Range/map               | C; ms             | host monotonic map validation/copy attempt time, including failed/reentrant-aborted attempts                                                  | `src/diagnostics.ts:84`; `dist/diagnostics.d.ts:76`   |
| `STAT.mapResults.blocks`                            | `number`; required                                                                                                     | Range/map               | C; blocks         | successfully validated and copied map blocks                                                                                                  | `src/diagnostics.ts:82`; `dist/diagnostics.d.ts:74`   |
| `STAT.mapResults.elements`                          | `number`; required                                                                                                     | Range/map               | C; elements       | elements successfully copied into map targets                                                                                                 | `src/diagnostics.ts:83`; `dist/diagnostics.d.ts:75`   |
| `STAT.maps.accepted`                                | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: accepted; logical settlement does not prove physical completion                                 | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.maps.cancelled`                               | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled by cancellation; logical settlement does not prove physical completion                  | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.maps.completed`                               | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled successfully; logical settlement does not prove physical completion                     | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.maps.failed`                                  | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled with failure; logical settlement does not prove physical completion                     | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.maps.pending`                                 | `number`; required                                                                                                     | Range metrics           | G; parents        | map parents; maps aliases operations.mapping: currently accepted and unsettled; logical settlement does not prove physical completion         | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.maps.rejected`                                | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: rejected before admission; logical settlement does not prove physical completion                | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.maps.timedOut`                                | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled by deadline; logical settlement does not prove physical completion                      | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.operations.accepted`                          | `number`; required                                                                                                     | Range metrics           | C; parents        | all range parents: accepted; logical settlement does not prove physical completion                                                            | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.operations.cancelled`                         | `number`; required                                                                                                     | Range metrics           | C; parents        | all range parents: settled by cancellation; logical settlement does not prove physical completion                                             | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.operations.capacity`                          | `number`; required                                                                                                     | Range admission         | G; parents        | fixed parent capacity min(MAX_SAFE_INTEGER, workers + maxQueue)                                                                               | `src/diagnostics.ts:52`; `dist/diagnostics.d.ts:46`   |
| `STAT.operations.collecting.accepted`               | `number`; required                                                                                                     | Range metrics           | C; parents        | collecting parents: accepted; logical settlement does not prove physical completion                                                           | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.operations.collecting.cancelled`              | `number`; required                                                                                                     | Range metrics           | C; parents        | collecting parents: settled by cancellation; logical settlement does not prove physical completion                                            | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.operations.collecting.completed`              | `number`; required                                                                                                     | Range metrics           | C; parents        | collecting parents: settled successfully; logical settlement does not prove physical completion                                               | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.operations.collecting.failed`                 | `number`; required                                                                                                     | Range metrics           | C; parents        | collecting parents: settled with failure; logical settlement does not prove physical completion                                               | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.operations.collecting.pending`                | `number`; required                                                                                                     | Range metrics           | G; parents        | collecting parents: currently accepted and unsettled; logical settlement does not prove physical completion                                   | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.operations.collecting.rejected`               | `number`; required                                                                                                     | Range metrics           | C; parents        | collecting parents: rejected before admission; logical settlement does not prove physical completion                                          | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.operations.collecting.timedOut`               | `number`; required                                                                                                     | Range metrics           | C; parents        | collecting parents: settled by deadline; logical settlement does not prove physical completion                                                | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.operations.completed`                         | `number`; required                                                                                                     | Range metrics           | C; parents        | all range parents: settled successfully; logical settlement does not prove physical completion                                                | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.operations.completion.accepted`               | `number`; required                                                                                                     | Range metrics           | C; parents        | completion-only parents: accepted; logical settlement does not prove physical completion                                                      | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.operations.completion.cancelled`              | `number`; required                                                                                                     | Range metrics           | C; parents        | completion-only parents: settled by cancellation; logical settlement does not prove physical completion                                       | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.operations.completion.completed`              | `number`; required                                                                                                     | Range metrics           | C; parents        | completion-only parents: settled successfully; logical settlement does not prove physical completion                                          | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.operations.completion.failed`                 | `number`; required                                                                                                     | Range metrics           | C; parents        | completion-only parents: settled with failure; logical settlement does not prove physical completion                                          | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.operations.completion.pending`                | `number`; required                                                                                                     | Range metrics           | G; parents        | completion-only parents: currently accepted and unsettled; logical settlement does not prove physical completion                              | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.operations.completion.rejected`               | `number`; required                                                                                                     | Range metrics           | C; parents        | completion-only parents: rejected before admission; logical settlement does not prove physical completion                                     | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.operations.completion.timedOut`               | `number`; required                                                                                                     | Range metrics           | C; parents        | completion-only parents: settled by deadline; logical settlement does not prove physical completion                                           | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.operations.failed`                            | `number`; required                                                                                                     | Range metrics           | C; parents        | all range parents: settled with failure; logical settlement does not prove physical completion                                                | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.operations.mapping.accepted`                  | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: accepted; logical settlement does not prove physical completion                                 | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.operations.mapping.cancelled`                 | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled by cancellation; logical settlement does not prove physical completion                  | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.operations.mapping.completed`                 | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled successfully; logical settlement does not prove physical completion                     | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.operations.mapping.failed`                    | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled with failure; logical settlement does not prove physical completion                     | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.operations.mapping.pending`                   | `number`; required                                                                                                     | Range metrics           | G; parents        | map parents; maps aliases operations.mapping: currently accepted and unsettled; logical settlement does not prove physical completion         | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.operations.mapping.rejected`                  | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: rejected before admission; logical settlement does not prove physical completion                | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.operations.mapping.timedOut`                  | `number`; required                                                                                                     | Range metrics           | C; parents        | map parents; maps aliases operations.mapping: settled by deadline; logical settlement does not prove physical completion                      | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.operations.pending`                           | `number`; required                                                                                                     | Range metrics           | G; parents        | all range parents: currently accepted and unsettled; logical settlement does not prove physical completion                                    | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.operations.rejected`                          | `number`; required                                                                                                     | Range metrics           | C; parents        | all range parents: rejected before admission; logical settlement does not prove physical completion                                           | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.operations.streaming.accepted`                | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: accepted; logical settlement does not prove physical completion                         | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.operations.streaming.cancelled`               | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled by cancellation; logical settlement does not prove physical completion          | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.operations.streaming.completed`               | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled successfully; logical settlement does not prove physical completion             | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.operations.streaming.failed`                  | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled with failure; logical settlement does not prove physical completion             | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.operations.streaming.pending`                 | `number`; required                                                                                                     | Range metrics           | G; parents        | stream parents; streams aliases operations.streaming: currently accepted and unsettled; logical settlement does not prove physical completion | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.operations.streaming.rejected`                | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: rejected before admission; logical settlement does not prove physical completion        | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.operations.streaming.timedOut`                | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled by deadline; logical settlement does not prove physical completion              | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.operations.timedOut`                          | `number`; required                                                                                                     | Range metrics           | C; parents        | all range parents: settled by deadline; logical settlement does not prove physical completion                                                 | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.partitions.admitted`                          | `number`; required                                                                                                     | Range coordinator       | C; partitions     | children accepted by task admission                                                                                                           | `src/diagnostics.ts:89`; `dist/diagnostics.d.ts:80`   |
| `STAT.partitions.cancelled`                         | `number`; required                                                                                                     | Range coordinator       | C; partitions     | child callers cancelled, including timeout propagation represented as cancellation                                                            | `src/diagnostics.ts:92`; `dist/diagnostics.d.ts:83`   |
| `STAT.partitions.completed`                         | `number`; required                                                                                                     | Range coordinator       | C; partitions     | child callers completed successfully                                                                                                          | `src/diagnostics.ts:90`; `dist/diagnostics.d.ts:81`   |
| `STAT.partitions.failed`                            | `number`; required                                                                                                     | Range coordinator       | C; partitions     | child callers failed                                                                                                                          | `src/diagnostics.ts:91`; `dist/diagnostics.d.ts:82`   |
| `STAT.partitions.generated`                         | `number`; required                                                                                                     | Range coordinator       | C; partitions     | partition descriptors generated before input factory                                                                                          | `src/diagnostics.ts:88`; `dist/diagnostics.d.ts:79`   |
| `STAT.queue.capacity`                               | `number`; required                                                                                                     | Scheduler               | G; tasks          | configured maxQueue waiting-task capacity                                                                                                     | `src/diagnostics.ts:38`; `dist/diagnostics.d.ts:34`   |
| `STAT.queue.size`                                   | `number`; required                                                                                                     | Scheduler               | G; tasks          | waiting logical admission weight, not physical batch entries                                                                                  | `src/diagnostics.ts:37`; `dist/diagnostics.d.ts:33`   |
| `STAT.state`                                        | `"created" \| "starting" \| "running" \| "stopping" \| "stopped" \| "failed"`; required                                | Controller              | G; enum           | current runtime lifecycle state; no promise that failed means all threads exited                                                              | `src/diagnostics.ts:143`; `dist/diagnostics.d.ts:129` |
| `STAT.streamResults.binaryResultContractFailures`   | `number`; required                                                                                                     | Stream / result credits | C; failures       | exact/upper-bound binary contract failures recorded by validation/reconciliation                                                              | `src/diagnostics.ts:70`; `dist/diagnostics.d.ts:63`   |
| `STAT.streamResults.buffered`                       | `number`; required                                                                                                     | Stream / result credits | G; results        | aggregate currently buffered results across active streams                                                                                    | `src/diagnostics.ts:75`; `dist/diagnostics.d.ts:68`   |
| `STAT.streamResults.currentReservedResultBytes`     | `number`; required                                                                                                     | Stream / result credits | G; bytes          | aggregate strict reservations held through buffered or physically outstanding work, including cancelled parents                               | `src/diagnostics.ts:66`; `dist/diagnostics.d.ts:59`   |
| `STAT.streamResults.knownBufferedPayloadBytes`      | `number`; required                                                                                                     | Stream / result credits | G; bytes          | aggregate recognized visible bytes in stream buffers; not complete nested graph or backing stores                                             | `src/diagnostics.ts:76`; `dist/diagnostics.d.ts:69`   |
| `STAT.streamResults.peakBuffered`                   | `number`; required                                                                                                     | Stream / result credits | P; results        | largest aggregate buffered result count                                                                                                       | `src/diagnostics.ts:63`; `dist/diagnostics.d.ts:56`   |
| `STAT.streamResults.peakKnownBufferedPayloadBytes`  | `number`; required                                                                                                     | Stream / result credits | P; bytes          | largest aggregate recognized buffered visible bytes                                                                                           | `src/diagnostics.ts:64`; `dist/diagnostics.d.ts:57`   |
| `STAT.streamResults.peakReservedResultBytes`        | `number`; required                                                                                                     | Stream / result credits | P; bytes          | largest aggregate currentReservedResultBytes observed                                                                                         | `src/diagnostics.ts:67`; `dist/diagnostics.d.ts:60`   |
| `STAT.streamResults.peakUnknownBufferedResults`     | `number`; required                                                                                                     | Stream / result credits | P; results        | largest aggregate unknown-size buffered count                                                                                                 | `src/diagnostics.ts:65`; `dist/diagnostics.d.ts:58`   |
| `STAT.streamResults.produced`                       | `number`; required                                                                                                     | Stream / result credits | C; results        | results accepted into stream delivery, buffered or directly yielded                                                                           | `src/diagnostics.ts:61`; `dist/diagnostics.d.ts:54`   |
| `STAT.streamResults.refundedResultBytes`            | `number`; required                                                                                                     | Stream / result credits | C; bytes          | positive declaration-minus-actual slack returned on successful upper-bound reconciliation                                                     | `src/diagnostics.ts:74`; `dist/diagnostics.d.ts:67`   |
| `STAT.streamResults.resultByteRefunds`              | `number`; required                                                                                                     | Stream / result credits | C; refunds        | successful upper-bound reconciliations with positive slack; not abnormal-exit release events                                                  | `src/diagnostics.ts:73`; `dist/diagnostics.d.ts:66`   |
| `STAT.streamResults.resultByteReservationRejected`  | `number`; required                                                                                                     | Stream / result credits | C; rejections     | oversize per-partition declarations rejected against fixed capacity                                                                           | `src/diagnostics.ts:69`; `dist/diagnostics.d.ts:62`   |
| `STAT.streamResults.resultByteReservationWaits`     | `number`; required                                                                                                     | Stream / result credits | C; waits          | declarations that had to wait for available per-stream credit; one event per waiting declaration, not wakeups                                 | `src/diagnostics.ts:68`; `dist/diagnostics.d.ts:61`   |
| `STAT.streamResults.unknownBufferedResults`         | `number`; required                                                                                                     | Stream / result credits | G; results        | aggregate buffered results with no recognized visible binary size                                                                             | `src/diagnostics.ts:77`; `dist/diagnostics.d.ts:70`   |
| `STAT.streamResults.upperBoundContractFailures`     | `number`; required                                                                                                     | Stream / result credits | C; failures       | upper-bound subset of binary contract failures                                                                                                | `src/diagnostics.ts:71`; `dist/diagnostics.d.ts:64`   |
| `STAT.streamResults.upperBoundResultsReconciled`    | `number`; required                                                                                                     | Stream / result credits | C; results        | valid upper-bound results reconciled to actual visible bytes, including zero/equal slack                                                      | `src/diagnostics.ts:72`; `dist/diagnostics.d.ts:65`   |
| `STAT.streamResults.yielded`                        | `number`; required                                                                                                     | Stream / result credits | C; results        | results handed to consumers; values may be retained indefinitely by consumer                                                                  | `src/diagnostics.ts:62`; `dist/diagnostics.d.ts:55`   |
| `STAT.streams.accepted`                             | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: accepted; logical settlement does not prove physical completion                         | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.streams.cancelled`                            | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled by cancellation; logical settlement does not prove physical completion          | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.streams.completed`                            | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled successfully; logical settlement does not prove physical completion             | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.streams.failed`                               | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled with failure; logical settlement does not prove physical completion             | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.streams.pending`                              | `number`; required                                                                                                     | Range metrics           | G; parents        | stream parents; streams aliases operations.streaming: currently accepted and unsettled; logical settlement does not prove physical completion | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.streams.rejected`                             | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: rejected before admission; logical settlement does not prove physical completion        | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.streams.timedOut`                             | `number`; required                                                                                                     | Range metrics           | C; parents        | stream parents; streams aliases operations.streaming: settled by deadline; logical settlement does not prove physical completion              | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.tasks.accepted`                               | `number`; required                                                                                                     | Task metrics            | C; tasks          | logical task callers (ordinary and range children): accepted; logical settlement does not prove physical completion                           | `src/diagnostics.ts:5`; `dist/diagnostics.d.ts:4`     |
| `STAT.tasks.cancelled`                              | `number`; required                                                                                                     | Task metrics            | C; tasks          | logical task callers (ordinary and range children): settled by cancellation; logical settlement does not prove physical completion            | `src/diagnostics.ts:10`; `dist/diagnostics.d.ts:9`    |
| `STAT.tasks.completed`                              | `number`; required                                                                                                     | Task metrics            | C; tasks          | logical task callers (ordinary and range children): settled successfully; logical settlement does not prove physical completion               | `src/diagnostics.ts:8`; `dist/diagnostics.d.ts:7`     |
| `STAT.tasks.failed`                                 | `number`; required                                                                                                     | Task metrics            | C; tasks          | logical task callers (ordinary and range children): settled with failure; logical settlement does not prove physical completion               | `src/diagnostics.ts:9`; `dist/diagnostics.d.ts:8`     |
| `STAT.tasks.pending`                                | `number`; required                                                                                                     | Task metrics            | G; tasks          | logical task callers (ordinary and range children): currently accepted and unsettled; logical settlement does not prove physical completion   | `src/diagnostics.ts:7`; `dist/diagnostics.d.ts:6`     |
| `STAT.tasks.rejected`                               | `number`; required                                                                                                     | Task metrics            | C; tasks          | logical task callers (ordinary and range children): rejected before admission; logical settlement does not prove physical completion          | `src/diagnostics.ts:6`; `dist/diagnostics.d.ts:5`     |
| `STAT.tasks.timedOut`                               | `number`; required                                                                                                     | Task metrics            | C; tasks          | logical task callers (ordinary and range children): settled by deadline; logical settlement does not prove physical completion                | `src/diagnostics.ts:11`; `dist/diagnostics.d.ts:10`   |
| `STAT.timing.averageExecutionMs`                    | `number`; required                                                                                                     | Task metrics            | G (C samples); ms | mean worker-reported execution time for returned logical items, including late final responses                                                | `src/diagnostics.ts:44`; `dist/diagnostics.d.ts:39`   |
| `STAT.timing.averageQueueMs`                        | `number`; required                                                                                                     | Task metrics            | G (C samples); ms | mean host monotonic acceptance-to-scheduling delay for scheduled logical tasks                                                                | `src/diagnostics.ts:43`; `dist/diagnostics.d.ts:38`   |
| `STAT.timing.averageTotalMs`                        | `number`; required                                                                                                     | Task metrics            | G (C samples); ms | mean host monotonic acceptance-to-caller-settlement latency                                                                                   | `src/diagnostics.ts:45`; `dist/diagnostics.d.ts:40`   |
| `STAT.timing.executionSamples`                      | `number`; required                                                                                                     | Task metrics            | C; samples        | validated item responses sampled for averageExecutionMs                                                                                       | `src/diagnostics.ts:47`; `dist/diagnostics.d.ts:42`   |
| `STAT.timing.queueSamples`                          | `number`; required                                                                                                     | Task metrics            | C; samples        | scheduled logical tasks sampled for averageQueueMs                                                                                            | `src/diagnostics.ts:46`; `dist/diagnostics.d.ts:41`   |
| `STAT.timing.settledSamples`                        | `number`; required                                                                                                     | Task metrics            | C; samples        | accepted caller settlements sampled for averageTotalMs                                                                                        | `src/diagnostics.ts:48`; `dist/diagnostics.d.ts:43`   |
| `STAT.workers.busy`                                 | `number`; required                                                                                                     | Dispatcher              | G; workers        | physically occupied correlations, independent of worker lifecycle/caller state                                                                | `src/diagnostics.ts:27`; `dist/diagnostics.d.ts:24`   |
| `STAT.workers.details[].completedTasks`             | `number`; required                                                                                                     | Worker                  | C/A; tasks        | validated successful logical item responses recorded by this wrapper                                                                          | `src/types/index.ts:19`; `dist/types/index.d.ts:9`    |
| `STAT.workers.details[].currentTaskId`              | `string`; optional/mode-dependent                                                                                      | Worker                  | G/A; ID           | physical correlation/leader task ID; can remain after caller settlement; no batch child list                                                  | `src/types/index.ts:18`; `dist/types/index.d.ts:8`    |
| `STAT.workers.details[].failedTasks`                | `number`; required                                                                                                     | Worker                  | C/A; tasks        | worker-record failures, including a crash leader; not synthetic counts/durations for skipped items                                            | `src/types/index.ts:20`; `dist/types/index.d.ts:10`   |
| `STAT.workers.details[].id`                         | `number`; required                                                                                                     | Worker                  | G/A; ID           | runtime worker-wrapper ID; replacement is a new record                                                                                        | `src/types/index.ts:15`; `dist/types/index.d.ts:5`    |
| `STAT.workers.details[].status`                     | `"starting" \| "stopped" \| "failed" \| "idle" \| "busy"`; required                                                    | Worker                  | G/A; enum         | worker lifecycle state; failed/stopped may still retain physical occupancy until exit                                                         | `src/types/index.ts:17`; `dist/types/index.d.ts:7`    |
| `STAT.workers.details[].threadId`                   | `number`; required                                                                                                     | Worker                  | G/A; ID           | Node thread ID recorded at wrapper creation; not a live lookup after exit                                                                     | `src/types/index.ts:16`; `dist/types/index.d.ts:6`    |
| `STAT.workers.details[].totalExecutionTimeMs`       | `number`; required                                                                                                     | Worker                  | C/A; ms           | sum of worker-reported item execution time from final responses, including late results; no invented crash duration                           | `src/types/index.ts:21`; `dist/types/index.d.ts:11`   |
| `STAT.workers.failures`                             | `number`; required                                                                                                     | Pool                    | C; failures       | worker failure callbacks, including initial bootstrap failure                                                                                 | `src/diagnostics.ts:30`; `dist/diagnostics.d.ts:27`   |
| `STAT.workers.idle`                                 | `number`; required                                                                                                     | Pool                    | G; workers        | records whose status is idle                                                                                                                  | `src/diagnostics.ts:28`; `dist/diagnostics.d.ts:25`   |
| `STAT.workers.restarts`                             | `number`; required                                                                                                     | Pool                    | C; decisions      | budget-approved recovery decisions; shutdown can prevent actual replacement                                                                   | `src/diagnostics.ts:31`; `dist/diagnostics.d.ts:28`   |
| `STAT.workers.starting`                             | `number`; required                                                                                                     | Pool                    | G; workers        | records whose status is starting                                                                                                              | `src/diagnostics.ts:29`; `dist/diagnostics.d.ts:26`   |
| `STAT.workers.total`                                | `number`; required                                                                                                     | Pool                    | G; workers        | current retained worker wrappers, including terminal records retained after shutdown                                                          | `src/diagnostics.ts:26`; `dist/diagnostics.d.ts:23`   |

Each field location is listed above (relative to packages/runtime); the inspection JSON retains complete paths. `workers.details[]` uses the located `WorkerState` members; `activeTasks[]` uses `TaskSnapshot`. Other projection fields originate in [RuntimeTelemetry](../../packages/runtime/src/telemetry/runtime.ts), [range snapshots](../../packages/runtime/src/partition/coordinator.ts), [task metrics](../../packages/runtime/src/tasks/coordinator.ts), [dispatch/pool](../../packages/runtime/src/dispatch/dispatcher.ts), and [result credits](../../packages/runtime/src/results/credit.ts). Evidence groups: runtime/task/worker fields — runtime, public-options, physical-boundary; containment — containment and R2; range/maps — partition, completion, map, batch; streams/credits — stream, binary-result, upper-bound-result, result-credit; retention — memory-observability and R3. B4 must add explicit installed type uses and meaningful per-field assertions for uncovered semantics, rather than treating the existence of those suites as coverage for every row.

Timing means are zero when their own sample count is zero. Worker success/failure
details include late final responses; a crash can count a failed leader without
inventing skipped batch durations. Physical occupancy must be read independently
of `failed`/`stopped` status. Cancellation can make task/parent pending zero while
workers.busy or reserved byte credit remains positive. Terminal tasks/parents are
not retained in active arrays; completedAt is permitted by TaskSnapshot but
normally absent from activeTasks. Snapshot record order is observational, not a
sorting/FIFO/public fairness contract. activeOperations status is currently running
when observed normally; retain the existing declared status vocabulary, with no
promise of terminal history. `assembledBlocks` is completed child callers, and
can transiently advance before a reentrant result getter finishes validation;
only mapResults.blocks/elements count successful copies.

## Historical Stage A verification

On Windows x64, Node 24.21.0, locked build/type compiler 7.0.2 and
compatibility/inventory compiler 6.0.3. `npm.cmd` resolves npm 11.18.0 for install
and direct shell checks; captured verification invokes the already-installed
adjacent npm 11.19.0 CLI explicitly. No package/toolchain version was changed.

- `npm run build`, `npm run test:types`, `npm run typecheck:compat`: passed.
- `node scripts/api-contract-inventory.mjs --check --output=<fresh-file>`:
  passed twice with identical JSON and source/declaration structural parity;
  all root/member/reachable/statistic IDs accounted for. Alias/union ordering
  normalization is structural inspection, not an exact release declaration freeze.
- Focused ignored gap probes: both compilers reproduce only TS2339 for direct
  stream cleanup while accepting current shared-backed output/snapshot access;
  proposed owned output negatives and closeable interface consumers pass;
  real-worker strict-binary shared backing is rejected with exported error identity.
- `npm run lint`, `npm run format:check`, `npm run test:docs`, `git diff --check`:
  passed. Documentation checking also preserves the executable README example.
- Production source/tests, manifests/lockfile, compiler configuration, examples,
  benchmarks, workflows and historical release tooling/baselines have no delta
  from S1. Rebuilt declaration SHA-256 values match those before Stage A checks.

An initial offline dependency installation failed because a locked ESLint helper
was not cached; normal `npm ci --no-audit --no-fund` then succeeded without a
lockfile change. No fresh full contracts/R2/R3, installed publication rehearsal,
Linux or Node-floor campaign is claimed by Stage A. Focused probes are checkout
inspection, not acceptance of future installed B/C APIs. Local delivery and raw
inspection/check reports are ignored evidence, separate from committed policy.

## Completion gates and next task

B1 now exposes next/return/throw/self iteration and root-names the count-only
option contract. Its [B specification](v1-api-corrections.md) records the preserved
protocol, deterministic lifecycle tests and installed consumers under both locked
compilers. The eleven added closeable-stream cases complement existing stream,
context and physical-boundary coverage. Exact candidate qualification and retained
tarball identities are recorded in the separate B1 delivery evidence.

S1/Stage A/B1/B2 are integrated through PR #22. B3 encapsulates snapshots and
removes the unsupported method/descriptor from the public graph; registry and
installed consumers verify the migration. Broader
[ADR 0023](../adr/0023-v1-api-stability-decisions.md) recommendations and
B4 has explicit diagnostic/error contracts in development. Stage C remains a
separate reviewable decision. Any feature missing its
named gate delays its v1 inclusion/release; withdrawal is an explicit fallback
with migration, not silent deletion of useful APIs. Stage F chooses a new
prerelease/version/baseline and qualifies the exact final artifact. Stage G
requires separate publication authorization. This document declares neither
v1 readiness nor fresh cross-platform runtime qualification.
