# v1 RC1 public-error contract matrix

All twelve frozen classes remain exported from `@pjs/runtime`. No message wording
becomes a matching protocol. The [soak](../../scripts/rc/soak.mjs) triggers actual
errors, checks concrete instanceof plus PjsError ancestry/name/nonempty message,
then tests recovery or intentional fatal behavior. It runs unchanged inside an
external actual-tarball JS project. The TS project separately compiles error types
and executes PjsTaskError/PjsError identity. The full installed declaration fixture
protects type reachability. Existing tests verify contextual propagation.

| Class                        | Actual trigger in RC harness                                      | Delivery                                   | Recovery                                                | Monorepo / installed / platform                                                                          |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PjsError                     | Input factory throws                                              | Parent promise rejection                   | Correct factory, healthy pool                           | Windows exact candidate: 22.13.0, 22.23.3, 24.21.0 PASS in monorepo and installed package; Linux BLOCKER |
| PjsTaskError                 | Task throws RangeError or rejects TypeError                       | run rejection                              | Same worker remains usable                              | Same coverage                                                                                            |
| PjsWorkerError               | Deliberate worker exit; missing module/export; restart exhaustion | run/ready rejection                        | Replacement for normal exit; fatal requires new runtime | Same coverage                                                                                            |
| PjsQueueFullError            | One occupied worker plus full waiting queue                       | run rejection                              | Drain then submit successfully                          | Same coverage                                                                                            |
| PjsTimeoutError              | Queued job; gated active stream; consumer waiting                 | Promise/next rejection                     | Physical work may continue; drain without blind replay  | Same coverage                                                                                            |
| PjsCancelledError            | Pre-abort, queued/active abort, forced shutdown                   | Promise/next rejection                     | Settlement, no preemption or rollback                   | Same coverage                                                                                            |
| PjsSerializationError        | Shared buffer in transfer list; uncloneable input                 | transfer synchronous throw / run rejection | Correct ownership; subsequent work usable               | Same coverage                                                                                            |
| PjsRuntimeStateError         | Submissions during/after shutdown or fatal failure                | run rejection                              | Use another running runtime                             | Same coverage                                                                                            |
| PjsTaskRegistrationError     | Duplicate/empty ID, non-file URL, foreign handle                  | register synchronous throw / run rejection | Fix registration before runtime construction            | Same coverage                                                                                            |
| PjsMapContractError          | Wrong typed map block length                                      | Parent rejection                           | Correct workload, same runtime usable                   | Same coverage                                                                                            |
| PjsBinaryResultContractError | Exact output smaller/larger; maximum overflow                     | next rejection                             | Correct declaration/output, credits released            | Same coverage                                                                                            |
| PjsResultCapacityError       | Declaration larger than per-stream byte cap                       | next rejection                             | Correct capacity/grain/bound; no impossible wait        | Same coverage                                                                                            |

The installed legacy smoke additionally checks source-mapped task stack and
remoteName/remoteStack, and blocked require/internal subpaths. Error messages and
stacks may contain application paths as already documented. Ordinary TypeError,
RangeError and iterator programming Error cases remain outside the PjsError
taxonomy; [existing error guide](../guide/errors.md) retains their semantics.
Fresh exact-candidate coverage is recorded in [readiness](v1-rc1-readiness.md).
