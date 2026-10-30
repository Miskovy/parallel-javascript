# JavaScript worker pools: campaign results

**SMOKE ONLY — no competitor ranking or performance claim**

Reduced correctness smoke only; no publication performance claims. Host conditions are recorded in freeze.json.

Node v24.22.1; Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz; win32/x64; primary workers 4; trials per cell 1.

Packages: @pjavascript/runtime 1.0.0; Piscina 5.3.2; Tinypool 2.2.0; workerpool 10.0.3; raw node:worker_threads; serial.

Source b21594e5564388c8fc85d81388aad310a3ee6491; frozen plan and source digests in freeze.json; registry artifacts and host/worker entry paths in packages.json and children/*.result.json.

Warm wall time includes dispatch, input transport, required output transport, collection and reduction/assembly. Input generation/halo preparation is separate. Serial uses identical logical chunking and batched tasks, with no worker transport. Each speedup is matching-case serial median / contender median. Intervals are seeded 2,000-resample percentile 95% bootstrap intervals of the median; descriptive, not corrected significance tests.

Cold means imported-host pool construction/readiness through first useful chunk or completed workload, before warmups. It excludes process launch, module imports, oracle loading and input preparation. Sampled RSS is whole-process observational memory (10 ms plus endpoints), may miss peaks, and includes all workers. Timer results summarize per-trial p95 drift of a 10 ms sentinel; arming and flushing expose synchronous serial blocking. Short cases have few samples; retain max and sample counts alongside p95.

| Case | Contender | n/status | Warm ms [95% interval] | CV | Prep ms | Cold first / all ms | Units/s | Serial speedup | Timer p95 / max ms | Sampled RSS MiB | Assessment |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| monte-small | serial | 1/complete | 4.435 [not estimable] | NA | 0.135 | 1.884 / 11.965 | 8343.293 | 1.000 | 0.885 / 0.931 | 55.215 | smoke: no performance inference |
| monte-small | raw | 1/complete | 10.310 [not estimable] | NA | 0.132 | 61.974 / 72.082 | 3588.644 | 0.430 | 4.258 / 4.482 | 133.313 | smoke: no performance inference |
| monte-small | pjs | 1/complete | 17.964 [not estimable] | NA | 0.164 | 115.753 / 128.514 | 2059.675 | 0.247 | 11.536 / 12.723 | 154.359 | smoke: no performance inference |
| monte-small | piscina | 1/complete | 2.531 [not estimable] | NA | 0.234 | 76.175 / 93.748 | 14621.038 | 1.752 | 5.093 / 5.361 | 150.160 | smoke: no performance inference |
| monte-small | tinypool | 1/complete | 9.419 [not estimable] | NA | 0.119 | 67.055 / 79.963 | 3928.147 | 0.471 | 4.059 / 4.273 | 151.691 | smoke: no performance inference |
| monte-small | workerpool | 1/complete | 10.315 [not estimable] | NA | 0.127 | 65.084 / 79.145 | 3587.009 | 0.430 | 3.987 / 4.197 | 134.383 | smoke: no performance inference |
| monte-medium | serial | 1/complete | 2.906 [not estimable] | NA | 0.250 | 4.192 / 23.660 | 25116.119 | 1.000 | 2.653 / 2.793 | 55.355 | smoke: no performance inference |
| monte-medium | raw | 1/complete | 2.984 [not estimable] | NA | 0.245 | 107.088 / 126.121 | 24462.987 | 0.974 | 4.224 / 4.446 | 136.500 | smoke: no performance inference |
| monte-medium | pjs | 1/complete | 8.895 [not estimable] | NA | 0.147 | 134.179 / 149.923 | 8206.396 | 0.327 | 4.270 / 4.495 | 159.875 | smoke: no performance inference |
| monte-medium | piscina | 1/complete | 2.753 [not estimable] | NA | 0.225 | 100.668 / 115.435 | 26513.638 | 1.056 | 6.003 / 6.003 | 157.422 | smoke: no performance inference |
| monte-medium | tinypool | 1/complete | 3.798 [not estimable] | NA | 0.197 | 97.461 / 114.391 | 19221.149 | 0.765 | 4.920 / 5.179 | 152.418 | smoke: no performance inference |
| monte-medium | workerpool | 1/complete | 2.828 [not estimable] | NA | 0.131 | 79.975 / 92.928 | 25811.470 | 1.028 | 4.335 / 4.563 | 140.453 | smoke: no performance inference |
| monte-large | serial | 1/complete | 3.371 [not estimable] | NA | 0.134 | 3.319 / 14.733 | 29964.991 | 1.000 | 2.249 / 2.368 | 55.328 | smoke: no performance inference |
| monte-large | raw | 1/complete | 10.316 [not estimable] | NA | 0.100 | 68.100 / 84.485 | 9790.901 | 0.327 | 4.387 / 4.618 | 137.648 | smoke: no performance inference |
| monte-large | pjs | 1/complete | 5.011 [not estimable] | NA | 0.141 | 132.083 / 145.665 | 20154.451 | 0.673 | 5.025 / 5.289 | 161.004 | smoke: no performance inference |
| monte-large | piscina | 1/complete | 3.433 [not estimable] | NA | 0.120 | 79.165 / 96.130 | 29420.332 | 0.982 | 5.276 / 5.554 | 159.273 | smoke: no performance inference |
| monte-large | tinypool | 1/complete | 7.148 [not estimable] | NA | 0.206 | 71.675 / 90.255 | 14129.827 | 0.472 | 4.462 / 4.697 | 157.262 | smoke: no performance inference |
| monte-large | workerpool | 1/complete | 2.753 [not estimable] | NA | 0.204 | 73.189 / 90.682 | 36683.253 | 1.224 | 6.021 / 6.021 | 140.934 | smoke: no performance inference |
| monte-medium-p1 | serial | 1/complete | 1.639 [not estimable] | NA | 0.137 | 3.423 / 15.010 | 44536.636 | 1.000 | 5.972 / 5.972 | 55.121 | smoke: no performance inference |
| monte-medium-p1 | raw | 1/complete | 8.761 [not estimable] | NA | 0.121 | 46.118 / 60.847 | 8332.382 | 0.187 | 5.389 / 5.673 | 87.477 | smoke: no performance inference |
| monte-medium-p1 | pjs | 1/complete | 11.465 [not estimable] | NA | 0.125 | 86.096 / 107.067 | 6367.205 | 0.143 | 10.897 / 11.456 | 91.348 | smoke: no performance inference |
| monte-medium-p1 | piscina | 1/complete | 7.910 [not estimable] | NA | 0.181 | 67.707 / 83.599 | 9229.174 | 0.207 | 5.793 / 5.793 | 94.250 | smoke: no performance inference |
| monte-medium-p1 | tinypool | 1/complete | 6.558 [not estimable] | NA | 0.102 | 62.853 / 78.156 | 11132.291 | 0.250 | 4.853 / 5.108 | 89.289 | smoke: no performance inference |
| monte-medium-p1 | workerpool | 1/complete | 6.751 [not estimable] | NA | 0.102 | 53.448 / 68.696 | 10813.854 | 0.243 | 5.646 / 5.943 | 88.797 | smoke: no performance inference |
| monte-medium-p2 | serial | 1/complete | 1.642 [not estimable] | NA | 0.136 | 2.620 / 13.575 | 44466.102 | 1.000 | 3.273 / 3.445 | 55.043 | smoke: no performance inference |
| monte-medium-p2 | raw | 1/complete | 3.697 [not estimable] | NA | 0.232 | 48.962 / 61.513 | 19743.604 | 0.444 | 5.373 / 5.656 | 102.402 | smoke: no performance inference |
| monte-medium-p2 | pjs | 1/complete | 22.933 [not estimable] | NA | 0.101 | 100.522 / 117.880 | 3183.241 | 0.072 | 2.053 / 2.281 | 116.887 | smoke: no performance inference |
| monte-medium-p2 | piscina | 1/complete | 3.570 [not estimable] | NA | 0.126 | 72.709 / 84.582 | 20448.752 | 0.460 | 5.342 / 5.623 | 116.414 | smoke: no performance inference |
| monte-medium-p2 | tinypool | 1/complete | 4.171 [not estimable] | NA | 0.101 | 59.757 / 71.138 | 17502.218 | 0.394 | 5.283 / 5.283 | 114.441 | smoke: no performance inference |
| monte-medium-p2 | workerpool | 1/complete | 3.132 [not estimable] | NA | 0.099 | 60.235 / 73.701 | 23311.512 | 0.524 | 5.251 / 5.527 | 106.430 | smoke: no performance inference |
| image-32-clone | serial | 1/complete | 0.491 [not estimable] | NA | 0.260 | 1.157 / 2.013 | 2084266.232 | 1.000 | 5.722 / 5.722 | 54.660 | smoke: no performance inference |
| image-32-clone | raw | 1/complete | 1.547 [not estimable] | NA | 0.532 | 64.023 / 64.567 | 662011.896 | 0.318 | 5.245 / 5.522 | 117.746 | smoke: no performance inference |
| image-32-clone | pjs | 1/complete | 4.882 [not estimable] | NA | 0.514 | 108.573 / 108.961 | 209762.992 | 0.101 | 5.902 / 5.902 | 127.797 | smoke: no performance inference |
| image-32-clone | piscina | 1/complete | 0.633 [not estimable] | NA | 0.259 | 76.665 / 81.921 | 1616927.207 | 0.776 | 5.022 / 5.022 | 123.117 | smoke: no performance inference |
| image-32-clone | tinypool | 1/complete | 3.898 [not estimable] | NA | 0.562 | 72.379 / 75.001 | 262692.081 | 0.126 | 23.355 / 23.355 | 121.766 | smoke: no performance inference |
| image-32-clone | workerpool | 1/complete | 14.417 [not estimable] | NA | 0.570 | 67.445 / 67.940 | 71029.723 | 0.034 | 5.349 / 5.703 | 119.828 | smoke: no performance inference |
| image-32-transfer | serial | 1/complete | 0.320 [not estimable] | NA | 0.186 | 1.859 / 3.346 | 3201000.313 | 1.000 | 5.976 / 5.976 | 55.047 | smoke: no performance inference |
| image-32-transfer | raw | 1/complete | 0.733 [not estimable] | NA | 0.195 | 62.724 / 63.160 | 1396808.075 | 0.436 | 5.835 / 6.142 | 118.008 | smoke: no performance inference |
| image-32-transfer | pjs | 1/complete | 1.246 [not estimable] | NA | 0.188 | 132.998 / 133.768 | 822093.770 | 0.257 | 5.988 / 5.988 | 127.754 | smoke: no performance inference |
| image-32-transfer | piscina | 1/complete | 0.671 [not estimable] | NA | 0.581 | 92.761 / 102.437 | 1525853.077 | 0.477 | 5.364 / 5.647 | 124.988 | smoke: no performance inference |
| image-32-transfer | tinypool | 1/complete | 0.609 [not estimable] | NA | 0.455 | 85.692 / 87.683 | 1681997.372 | 0.525 | 5.421 / 5.706 | 121.918 | smoke: no performance inference |
| image-32-transfer | workerpool | 1/complete | 0.918 [not estimable] | NA | 0.463 | 89.559 / 98.627 | 1115346.912 | 0.348 | 5.431 / 5.717 | 120.934 | smoke: no performance inference |
| image-64-clone | serial | 1/complete | 0.502 [not estimable] | NA | 0.689 | 1.539 / 4.015 | 8152866.242 | 1.000 | 5.444 / 5.444 | 55.152 | smoke: no performance inference |
| image-64-clone | raw | 1/complete | 7.409 [not estimable] | NA | 0.566 | 54.030 / 55.446 | 552856.063 | 0.068 | 5.062 / 5.328 | 117.715 | smoke: no performance inference |
| image-64-clone | pjs | 1/complete | 2.058 [not estimable] | NA | 0.303 | 113.821 / 115.749 | 1990088.427 | 0.244 | 4.909 / 5.167 | 127.496 | smoke: no performance inference |
| image-64-clone | piscina | 1/complete | 7.813 [not estimable] | NA | 0.285 | 75.132 / 81.836 | 524234.318 | 0.064 | 4.577 / 4.818 | 123.461 | smoke: no performance inference |
| image-64-clone | tinypool | 1/complete | 1.994 [not estimable] | NA | 0.299 | 65.687 / 71.447 | 2053853.482 | 0.252 | 5.726 / 6.027 | 122.781 | smoke: no performance inference |
| image-64-clone | workerpool | 1/complete | 1.473 [not estimable] | NA | 0.330 | 61.988 / 66.612 | 2780530.853 | 0.341 | 5.583 / 5.877 | 119.953 | smoke: no performance inference |
| image-64-transfer | serial | 1/complete | 0.421 [not estimable] | NA | 0.891 | 1.880 / 6.134 | 9733840.304 | 1.000 | 5.150 / 5.421 | 54.340 | smoke: no performance inference |
| image-64-transfer | raw | 1/complete | 8.175 [not estimable] | NA | 1.076 | 67.300 / 70.479 | 501021.369 | 0.051 | 5.039 / 5.304 | 118.207 | smoke: no performance inference |
| image-64-transfer | pjs | 1/complete | 6.933 [not estimable] | NA | 0.753 | 114.407 / 118.188 | 590797.635 | 0.061 | 3.022 / 3.181 | 127.289 | smoke: no performance inference |
| image-64-transfer | piscina | 1/complete | 0.798 [not estimable] | NA | 0.725 | 82.786 / 90.796 | 5131545.978 | 0.527 | 4.609 / 4.852 | 122.238 | smoke: no performance inference |
| image-64-transfer | tinypool | 1/complete | 13.161 [not estimable] | NA | 0.779 | 66.059 / 71.219 | 311220.187 | 0.032 | 10.291 / 10.779 | 121.809 | smoke: no performance inference |
| image-64-transfer | workerpool | 1/complete | 1.544 [not estimable] | NA | 0.767 | 69.959 / 77.975 | 2652849.741 | 0.273 | 6.076 / 6.076 | 119.227 | smoke: no performance inference |
| numerical-4 | serial | 1/complete | 0.117 [not estimable] | NA | 0.011 | 0.408 / 0.756 | 2196581.197 | 1.000 | 5.042 / 5.308 | 53.867 | smoke: no performance inference |
| numerical-4 | raw | 1/complete | 3.755 [not estimable] | NA | 0.013 | 54.812 / 56.668 | 68447.546 | 0.031 | 5.465 / 5.753 | 117.074 | smoke: no performance inference |
| numerical-4 | pjs | 1/complete | 9.292 [not estimable] | NA | 0.012 | 111.516 / 124.456 | 27658.201 | 0.013 | 5.089 / 5.357 | 132.539 | smoke: no performance inference |
| numerical-4 | piscina | 1/complete | 4.159 [not estimable] | NA | 0.013 | 70.852 / 78.971 | 61793.700 | 0.028 | 5.325 / 5.605 | 125.281 | smoke: no performance inference |
| numerical-4 | tinypool | 1/complete | 2.153 [not estimable] | NA | 0.012 | 130.040 / 156.071 | 119390.505 | 0.054 | 5.420 / 5.705 | 120.871 | smoke: no performance inference |
| numerical-4 | workerpool | 1/complete | 2.905 [not estimable] | NA | 0.012 | 61.874 / 69.570 | 88480.342 | 0.040 | 5.697 / 5.997 | 121.398 | smoke: no performance inference |
| numerical-16 | serial | 1/complete | 0.095 [not estimable] | NA | 0.004 | 0.424 / 0.723 | 2691099.476 | 1.000 | 5.139 / 5.409 | 54.219 | smoke: no performance inference |
| numerical-16 | raw | 1/complete | 0.520 [not estimable] | NA | 0.005 | 66.138 / 66.830 | 494230.769 | 0.184 | 5.884 / 5.884 | 117.000 | smoke: no performance inference |
| numerical-16 | pjs | 1/complete | 15.060 [not estimable] | NA | 0.006 | 129.130 / 132.376 | 17064.733 | 0.006 | 6.423 / 7.051 | 127.664 | smoke: no performance inference |
| numerical-16 | piscina | 1/complete | 0.978 [not estimable] | NA | 0.004 | 75.356 / 85.956 | 262888.707 | 0.098 | 5.702 / 6.002 | 122.469 | smoke: no performance inference |
| numerical-16 | tinypool | 1/complete | 2.828 [not estimable] | NA | 0.005 | 61.998 / 68.456 | 90864.093 | 0.034 | 4.801 / 5.054 | 120.590 | smoke: no performance inference |
| numerical-16 | workerpool | 1/complete | 1.515 [not estimable] | NA | 0.004 | 65.139 / 105.999 | 169670.562 | 0.063 | 4.421 / 4.654 | 118.418 | smoke: no performance inference |
| numerical-64 | serial | 1/complete | 0.276 [not estimable] | NA | 0.018 | 0.517 / 0.738 | 930148.389 | 1.000 | 4.219 / 4.441 | 54.395 | smoke: no performance inference |
| numerical-64 | raw | 1/complete | 0.384 [not estimable] | NA | 0.027 | 66.080 / 66.313 | 668574.402 | 0.719 | 5.365 / 5.365 | 116.422 | smoke: no performance inference |
| numerical-64 | pjs | 1/complete | 4.782 [not estimable] | NA | 0.029 | 107.627 / 108.145 | 53747.700 | 0.058 | 5.786 / 5.786 | 126.039 | smoke: no performance inference |
| numerical-64 | piscina | 1/complete | 2.113 [not estimable] | NA | 0.022 | 81.537 / 82.809 | 121639.530 | 0.131 | 4.384 / 4.614 | 121.938 | smoke: no performance inference |
| numerical-64 | tinypool | 1/complete | 2.713 [not estimable] | NA | 0.021 | 73.726 / 84.134 | 94729.082 | 0.102 | 3.982 / 4.192 | 120.203 | smoke: no performance inference |
| numerical-64 | workerpool | 1/complete | 1.701 [not estimable] | NA | 0.021 | 64.265 / 67.594 | 151060.953 | 0.162 | 6.000 / 6.000 | 116.629 | smoke: no performance inference |
| numerical-4-batch8 | serial | 1/complete | 0.095 [not estimable] | NA | 0.008 | 0.452 / 0.763 | 2696747.114 | 1.000 | 4.740 / 4.990 | 54.398 | smoke: no performance inference |
| numerical-4-batch8 | raw | 1/complete | 0.516 [not estimable] | NA | 0.008 | 56.020 / 56.493 | 498158.558 | 0.185 | 6.143 / 6.143 | 116.703 | smoke: no performance inference |
| numerical-4-batch8 | pjs | 1/complete | 8.668 [not estimable] | NA | 0.008 | 115.680 / 117.465 | 29648.943 | 0.011 | 2.060 / 2.168 | 125.508 | smoke: no performance inference |
| numerical-4-batch8 | piscina | 1/complete | 1.317 [not estimable] | NA | 0.008 | 73.390 / 77.599 | 195125.655 | 0.072 | 4.968 / 4.968 | 121.719 | smoke: no performance inference |
| numerical-4-batch8 | tinypool | 1/complete | 0.511 [not estimable] | NA | 0.008 | 77.941 / 82.609 | 503033.862 | 0.187 | 5.985 / 5.985 | 120.496 | smoke: no performance inference |
| numerical-4-batch8 | workerpool | 1/complete | 0.479 [not estimable] | NA | 0.008 | 64.380 / 68.583 | 536198.623 | 0.199 | 5.584 / 5.878 | 118.066 | smoke: no performance inference |

## Losses, overhead and break-even

This campaign cannot establish losses, winners or break-even points. The publication command runs the frozen full sizes and ten independent trials per cell. One-trial smoke uncertainty is not estimable.


No aggregate score is calculated. See summary.json for every peer comparison, timer sample count, variability, scaling cell, failure and descriptive interval. Throughput does not establish reliability or feature completeness. Image results concern this JavaScript stencil, with no claim about native codecs or GPUs.
