# Memory ownership

Choose ownership explicitly; transport and allocation can move a workload's
parallel crossover. Clone is the simplest default with useful separation, not an
inferior mode. These rules apply to run inputs and each range child.

| Mode                               | Before submission and dispatch                                                                        | After successful dispatch                                                                         | Cancellation and reuse                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Structured clone (default)         | Caller owns input; queued reference is retained until dispatch, when clone occurs                     | Receiver gets cloned ordinary data; caller retains original                                       | Do not mutate/resize/externally transfer queued input before settlement; caller keeps original, active work may continue |
| transferList                       | Caller owns dedicated ArrayBuffers; PJS snapshots/validates list and reserves pending transfer intent | Successful posting detaches every sender-side view of entire backing; receiver owns moved buffers | Queued rejection/abort leaves input attached; after dispatch cancellation/crash cannot restore it                        |
| SharedArrayBuffer / sharedReadonly | Caller initializes shared storage; helper copies visible source bytes once                            | Native backing is shared across isolates, not cloned on each message                              | Keep all aliases immutable while any worker can read, including after caller cancellation; GC governs lifetime           |

Structured clone does not turn SharedArrayBuffer into a private copy. Functions
and arbitrary closures cannot be cloned; prototypes/Buffer identity should not
be treated as schemas preserved by transport. Cloning large buffers costs time
and memory; subviews can involve backing bytes outside their visible interval.

## Transfer and recycling

```js
const bytes = new Uint8Array(4096);
const returned = await runtime.run(transformTask, bytes, {
  transferList: [bytes.buffer],
});
// Use returned for recycling only if the task explicitly returns its buffer.
```

A worker moves output by returning `transfer(value, [buffer])`; the caller gets
value, not the envelope. Lists must contain unique, live ArrayBuffers, not views,
SharedArrayBuffers, ports or Node-marked untransferable backing. Prefer dedicated
allocations over pooled Buffer slabs. Include listed buffers in the payload;
listing them alone does not make them reachable by the receiver. Transferring
a subview still moves its entire backing. The same pending buffer cannot be
transferred twice through one loaded library instance.

Cancellation after dispatch can lose your opportunity to recycle a buffer even
if a task would ordinarily return it. Budget replacements in the application.
Metadata and enclosing objects still serialize; do not describe the entire task
path as universally zero-copy.

## Shared readonly input

`sharedReadonly` accepts Uint8Array (including Buffer as an input view), Int32Array,
Uint32Array, Float32Array and Float64Array. It copies the visible slice into compact
SharedArrayBuffer backing and returns the corresponding native view; Buffer input
returns Uint8Array. Other kinds/DataView/object graphs are rejected. Keep the
source unchanged during construction. It copies even if the source is already
shared; reuse the returned view instead of repeatedly invoking the helper.

Readonly is an application contract, **not enforced freezing**. Aliases remain
writable. Use disjoint regions or Atomics for intentional shared output, with an
explicit application protocol. PJS supplies no race prevention or resource registry.
See [shared-input.mjs](../../examples/shared-input.mjs) and the detailed historical
[memory reference](../memory.md).

## Result ownership and credits

```text
worker-owned output → posting → PJS buffered result → yield → consumer-owned value
          reserved credit ──────────────────────────┘ release
```

For strict binary streams, PJS reserves declared visible result bytes before
execution. It validates the direct output before posting. Shared/detached/nested
outputs do not qualify. A view's visible byteLength is measured, not its whole
backing allocation. The current broad TypeScript view types do not prove these
runtime constraints; do not assume a typecheck guarantees exclusive backing.

On yield, result credits release immediately. Values retained or processed by
your consumer thereafter are outside PJS's bound. An awaited sink delays the
next iteration but the yielded value itself is already consumer-owned. Collecting
operations/maps have their own retained/preallocated results and no binary stream
budget. Inputs, worker heaps, scratch/native allocations, transport copies, shared
backing and process RSS are never bounded by result credits or maxQueue.
