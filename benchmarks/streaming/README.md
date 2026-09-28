# v0.7 bounded result streaming

Run `npm run benchmark:stream`. The suite compares collection, completion, and
fast/slow completion-order streaming for 32 x 1 MiB values; result capacities
1/4/8; severe slow-first userland ordered reassembly; stream-plus-collect;
disjoint shared output; and bounded Piscina manual collection, incremental
callbacks, and completion. It records total and first-result latency, CPU, sampled RSS,
messages, result-buffer occupancy, event-loop delay/utilization, and timer drift.

`PJS_BENCH_QUICK=1` runs one smoke sample. Default retained evidence uses one
warmup and three samples in fresh processes and writes only
`benchmarks/results/result-streaming-v0.7.json`.

Run `node benchmarks/streaming/fairness.mjs` for mixed-operation progress. Build
committed v0.6 separately, then run
`node benchmarks/streaming/regression.mjs /path/to/built-v0.6` for the
same-machine causal control. The Piscina incremental harness is a bounded manual
producer/callback loop, not an equivalent range `AsyncIterable` API.
