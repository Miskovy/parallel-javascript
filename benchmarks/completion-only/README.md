# v0.6 completion-only benchmark

Run `npm run benchmark:completion`. Set `PJS_BENCH_QUICK=1` for a one-sample
smoke run. The retained default uses one warmup and three samples, with every
runtime/Piscina configuration in a fresh process.

The suite measures collecting versus completion-only ranges at 128/512 logical
partitions and batch sizes 1/4/8, a 32 MiB successful-output retention case,
disjoint shared vector output, private-return versus shared-output matrix
multiplication, a bounded manual Piscina completion harness, and a same-kernel
CPU control. Every sample records wall time, process CPU, sampled RSS, execute
and result messages, event-loop delay/utilization, and timer drift.

Piscina has no identical `parallelFor` API. Its benchmark task explicitly
returns `undefined` and its harness bounds production; results demonstrate a
generic minimal-result transport technique, not an algorithm-surface ranking.
The AsyncResource table is a same-process micro-control comparing no resource,
one operation resource, and one resource per 512 logical children. It is not a
substitute for whole-runtime timings.

The runner writes only `benchmarks/results/completion-only-v0.6.json` and never
overwrites historical artifacts.

For the same-machine regression control, build the committed v0.5 source in a
separate checkout and run
`node benchmarks/completion-only/regression.mjs /path/to/built-v0.5`. It uses
baseline/candidate/candidate/baseline process order and writes
`runtime-regression-v0.6.json`. Cases cover ordinary no-op/CPU/clone/transfer/
shared submissions plus `partitionRange()` batch 1/8 and CPU controls.
