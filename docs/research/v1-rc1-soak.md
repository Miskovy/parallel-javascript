# v1 RC1 bounded soak

The [harness](../../scripts/rc/soak.mjs) provides fixed-operation smoke, standard
and extended profiles with seed `20261003`. [Commands and bounds](../../scripts/rc/README.md)
describe exact cycle/queue/worker/watchdog/sample limits. Existing historical soaks
and JSON are never regenerated. Smoke development passed on Windows Node 24.21.0
and as an installed tarball under Node 22.13.0; exact-candidate retained evidence
will follow the candidate source commit.

Every profile includes lifecycle mixed success/throw/reject, queued/active abort,
queued/running/consumer deadlines, listener cleanup, caller/physical split without
early worker reuse, controlled exits/replacement/crash storm/exhaustion, queue
overflow/FIFO drain, completion-order streams, slow consumer, break/return/throw,
count caps, exact equality/maximum validation, refunds including zero/equal actual,
clone/transfer/shared reuse, range tails/empty/oversized grain, typed assembly,
uncloneable parallelFor output suppression, eight-state shutdown matrix, first-mode
promise identity, during/after shutdown rejection, separate pools and repeated
construct/run/shutdown. Installed smoke repeats all twelve public errors.

Actual runtime bookkeeping must reach zero tasks, parent operations, queue,
busy/live workers, reservations, physical correlations, credit operations,
unreconciled/reconciled bytes, retained buffers and production claims. Periodic
checks enforce per-stream count/byte caps and credit composition. Cancellation
while active retains a 1024-byte maximum for a 1-byte result until physical end;
a queued sentinel cannot run early. Exact error identity and subsequent recovery
are asserted, not silently accepted as any failure.

Memory snapshots report RSS, heapUsed, external and arrayBuffers separately.
arrayBuffers overlaps external; native/worker allocator high-water retention and
application-owned outputs are distinct from PJS-owned leaks. No requirement that
RSS returns to baseline. Final Timeout/MessagePort absence, zero owned state,
zero abort listeners, no warnings and natural process exit are the cleanup gates.
Fresh subprocesses provide controls without globally suppressing warnings or
forcing a successful exit. Retained evidence records actual counts and seeds;
accepted sibling counts may vary with scheduling even for fixed scenario offers.

This is bounded hardening, not an unbounded endurance or universal memory proof.
Windows candidate profiles are pending; Linux must repeat on the exact candidate.
