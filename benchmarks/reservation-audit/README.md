# Reservation audit benchmarks

This v0.10 suite isolates count-only, fixed-declaration, and callback-declaration
binary streams across clone and transfer size sweeps. `run.mjs` uses fresh child
processes, mirrored ordering, retained raw samples, and internal stage timing.

`pipeline.mjs` exercises a longer mixed-size pipeline, an RLE application trace,
four concurrent strict streams, 4 MiB-versus-4 KiB fairness, head-of-line byte
credit, declaration callback costs, and event-loop responsiveness.

Set `PJS_BENCH_QUICK=1` for a smoke measurement. Full runs accept
`PJS_BENCH_ROUNDS`, `PJS_BENCH_TRIALS`, and `PJS_BENCH_WARMUPS`.
