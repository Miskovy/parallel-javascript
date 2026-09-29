# v0.8 element-block mapping and pipeline benchmarks

Run `npm run benchmark:map`. The retained suite uses fresh processes to compare
serial numeric/object transforms, generic and typed `parallelMapRange()`, cloned
and transferred blocks, `partitionRange()` plus assembly, transferred
`streamRange()` blocks, stream-plus-assembly, disjoint shared-output
`parallelFor()`, and bounded Piscina manual collection.

`pipeline.mjs` adds SHA-256 block processing, controlled host CPU cost, and an
asynchronous `setImmediate` sink handoff at capacities 1/4/8. `fairness.mjs`
mixes a collected map, bounded stream, shared-output completion, and ordinary
run. Default runs use one warmup and three retained samples without outlier
deletion. `PJS_BENCH_QUICK=1` runs smoke samples.

The pipeline samples runtime busy-worker occupancy with the RSS timer every
2 ms. The resulting average/fraction is an observation of worker state, not
precise worker CPU time; sampling overhead is included equally in wall time.

The primary numeric case uses 262,144 Float64 values, grain 4,096, dispatch
batch size 4, 16 deterministic transform iterations, and up to four workers.
The object case uses 32,768 values and grain 512. A separate 4,096-result,
grain-1 transferred stream control runs capacities 8/64/256 to detect whether
the current array-backed result queue degrades at larger counts/capacities;
capacity also changes dispatch grouping, so this is a bottleneck screen rather
than an isolated `shift()` microbenchmark.

Known payload bytes are direct buffer/view `byteLength` values currently queued
by PJS. Aliased views are counted per payload. They are not RSS, heap size,
unique backing allocation, or a hard memory bound.

`regression.mjs` accepts a separately built control tree. The retained artifact
uses the same v0.8 source with only stream payload retain/release accounting
disabled, because v0.7 was not committed separately. It runs both trees twice
in baseline/candidate/candidate/baseline order, one warmup and five retained
samples per process/case. Scalar stream controls use 4,096 results so the
diagnostic cost is not obscured by very short-run noise. This isolates the new
bookkeeping; source-identical non-stream cases quantify session noise.
