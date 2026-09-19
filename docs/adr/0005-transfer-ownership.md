# 0005: Explicit ArrayBuffer ownership transfer

## Context

v0.1 measurements identified bulk cloning as a concrete transport cost. Native transfer can move ArrayBuffer backing memory between isolates, but detaches every sender-side view. Ownership must be explicit, including while work waits, fails, or is cancelled.

## Decision

`run(task, input, { transferList: [buffer] })` transfers selected input buffers when the worker message is posted. A task export may return `transfer(value, [buffer])` to transfer selected output buffers; callers receive only `value`. Ordinary results and omitted lists retain structured-clone behavior. The helper is an isolate-local envelope, not a wire marker or a code transform.

Support ArrayBuffer only in v0.2. Reject SharedArrayBuffer, typed-array objects, message ports, detached buffers, duplicate entries, and buffers Node marks untransferable. Validate at admission and again at dispatch because queued buffers can change. Snapshot lists so caller mutation cannot change the ownership decision. Reserve queued input buffers within this library instance so another pending transfer cannot claim them. No runtime dependencies, graph traversal, implicit transfer discovery, or shared-memory abstraction are introduced.

## Ownership and cancellation

- Rejected admission and queued cancellation/deadline/shutdown do not detach buffers. Reservations are released, allowing a later submission.
- Successful dispatch detaches the sender's entire backing ArrayBuffer, including all views. Ownership is not restored by a task exception, crash, deadline, or shutdown.
- Cancellation during synchronous serialization is already in the scheduled phase. The post may finish and detach buffers; the slot and reservation must survive until posting completes.
- A duplicate queued transfer is rejected. External use of native transfer while reserved is outside the contract; dispatch detects a detached buffer and fails cleanly.
- Results arriving after caller cancellation are discarded and eventually collected, including transferred results. The worker is reused only after execution completion.
- Caller code must include listed buffers in the message value. Following Node semantics, an unreachable buffer may detach without giving the receiver access; PJS does not inspect arbitrary object graphs/getters.

No retry or rollback is promised for transfers. A post failure does not guarantee all buffers remain attached: user getters can themselves transfer memory. Main-thread state owns queue/reservation transitions; a reservation is held throughout posting even if a getter re-enters cancellation.

## Alternatives

Transfer at admission would make ownership earlier but require an intermediate clone/transfer and detach inputs even if they never execute. Automatic typed-array traversal adds cost, getter side effects, and ambiguity for aliases and pooled buffers. Accepting every Node transferable adds unrelated resource ownership and cleanup contracts. Copying buffers defensively would defeat the feature's purpose.

## Consequences

The existing postMessage boundaries carry transfer lists without changing scheduling or the wire protocol. Transfer preserves bytes and view metadata but cannot make JavaScript payload objects zero-copy. Prefer dedicated ArrayBuffers; transferring a view's backing store affects all aliases. Right-hand matrix inputs reused across workers still need cloning or explicit per-worker copies; transfer does not create shared ownership. Benchmarks must include those preparation costs and preserve v0.1 results.
