# v0.9 strict binary-result benchmarks

Run `npm run benchmark:binary` on an otherwise idle machine. It builds the
runtime, runs the main matrix in fresh child processes, then runs mixed-work
fairness trials. Reports are written to `benchmarks/results/binary-results-v0.9.json`
and `benchmarks/results/binary-fairness-v0.9.json`; existing artifacts are not
overwritten. Set `PJS_BENCH_QUICK=1` for a one-sample harness check only.

The fixed matrix streams 64 direct 256 KiB results through capacities 1/4/8/16
and exact byte capacities 1/4/16/64 MiB. Variable-size cases cycle through
4/16/64/256 KiB declarations under 512 KiB and 4 MiB byte capacities with fast
and 1 ms CPU consumers. The consumer hashes every result, performs controlled
host work, and crosses an asynchronous `setImmediate()` sink boundary. Clone,
transfer, count-only, object-stream, typed-map, and Piscina manual-semaphore
controls use the same worker kernel where their semantics overlap.

Each normal configuration has one warmup and three retained trials. Every
configuration gets a fresh process; no outlier is removed and GC is not forced.
Samples retain wall and CPU time, first-result latency, throughput, sampled
process RSS, worker occupancy, reserved and buffered byte peaks, reservation
waits, physical messages, event-loop delay/utilization, and timer drift. RSS is
process-wide sampled memory, not a byte-reservation measurement. Very short CPU
and occupancy samples are coarse, especially on Windows.

Piscina 5.3.2 uses four fixed workers, one task per worker, bounded queueing,
and an application-managed count-plus-declared-byte semaphore. Results pass
through one serialized downstream consumer, and credit is held through that
processing to match the PJS reservation lifetime. This is a targeted mechanism
comparison, not a claim about every Piscina feature.

`fairness.mjs` concurrently runs a large-result strict stream, a small-result
strict stream, ordinary `run()`, shared-output `parallelFor()`, and typed
`parallelMapRange()`. It records completion latency, exact counts, terminal
credit, and starvation flags at two large-stream byte capacities.

For the established-API causal control, build the committed v0.8 tree in an
isolated directory and run:

```console
node benchmarks/binary-results/regression.mjs path/to/built-v0.8
```

The regression uses v0.8/v0.9/v0.9/v0.8 fresh-process order, one warmup per
process and ten retained samples per version/case. It covers ordinary run,
clone/transfer/shared transport, collected and completion ranges, count-only
streams, and generic/typed maps. It writes
`benchmarks/results/runtime-regression-v0.9.json`.
