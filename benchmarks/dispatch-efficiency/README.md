# Dispatch-efficiency benchmark

Run `npm run benchmark:dispatch` on an otherwise idle machine. The runner uses
fresh child processes and fixed worker pools. It records all samples in
`benchmarks/results/dispatch-efficiency-v0.5.json`.

The suite compares the current runtime's bounded manual `run()` producer,
runtime-owned `partitionRange()`, Piscina 5.3.2 one item per call, and explicit
Piscina harness batching. Logical grain and physical batch size vary
independently. The matrix control clones exclusive A rows and shares B so that
experimental batching can be measured without weakening transfer ownership.
Production matrix transfers remain restricted to batch size one.

Set `PJS_BENCH_QUICK=1` only for harness smoke tests. Published results use the
default warmup and three retained samples. Each sample records logical items,
physical execute/result messages, CPU, process RSS, event-loop utilization,
event-loop delay, and an independent one-millisecond timer drift probe. No
outliers are removed and no forced GC is used.
