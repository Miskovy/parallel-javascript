# JavaScript worker pools: campaign results

**Publication campaign**

Single-host synthetic JavaScript kernels; descriptive uncertainty; see SPEC.md

Node v24.22.1; Intel(R) Core(TM) i3-10100F CPU @ 3.60GHz; win32/x64; primary workers 4; trials per cell 10.

Packages: @pjavascript/runtime 1.0.0; Piscina 5.3.2; Tinypool 2.2.0; workerpool 10.0.3; raw node:worker_threads; serial.

Source 1263cabe72da379d9eb9a2f36fc637f0e61dd59d; frozen plan and source digests in freeze.json; registry artifacts and host/worker entry paths in packages.json and children/*.result.json.

Warm wall time includes dispatch, input transport, required output transport, collection and reduction/assembly. Input generation/halo preparation is separate. Serial uses identical logical chunking and batched tasks, with no worker transport. Each speedup is matching-case serial median / contender median. Intervals are seeded 2,000-resample percentile 95% bootstrap intervals of the median; descriptive, not corrected significance tests.

Cold means imported-host pool construction/readiness through first useful chunk or completed workload, before warmups. It excludes process launch, module imports, oracle loading and input preparation. Sampled RSS is whole-process observational memory (10 ms plus endpoints), may miss peaks, and includes all workers. Timer results summarize per-trial p95 drift of a 10 ms sentinel; arming and flushing expose synchronous serial blocking. Short cases have few samples; retain max and sample counts alongside p95.

| Case | Contender | n/status | Warm ms [95% interval] | CV | Prep ms | Cold first / all ms | Units/s | Serial speedup | Timer p95 / max ms | Sampled RSS MiB | Assessment |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| monte-small | serial | 10/complete | 104.571 [103.163, 129.110] | 0.124 | 0.138 | 18.884 / 136.294 | 47814.221 | 1.000 | 90.729 / 94.836 | 55.225 | matching chunked baseline |
| monte-small | raw | 10/complete | 86.671 [53.558, 89.252] | 0.307 | 0.117 | 79.615 / 117.942 | 57689.623 | 1.207 | 5.690 / 6.017 | 137.074 | clear practical improvement |
| monte-small | pjs | 10/complete | 53.918 [47.408, 89.351] | 0.344 | 0.113 | 142.848 / 187.169 | 92732.808 | 1.939 | 7.438 / 9.197 | 162.986 | clear practical improvement |
| monte-small | piscina | 10/complete | 71.361 [49.348, 93.190] | 0.341 | 0.114 | 98.260 / 138.126 | 70066.675 | 1.465 | 6.986 / 8.305 | 161.352 | clear practical improvement |
| monte-small | tinypool | 10/complete | 62.972 [41.285, 88.361] | 0.402 | 0.111 | 92.564 / 128.456 | 79400.873 | 1.661 | 6.877 / 8.549 | 158.830 | clear practical improvement |
| monte-small | workerpool | 10/complete | 67.781 [56.148, 87.647] | 0.238 | 0.106 | 86.576 / 128.217 | 73766.876 | 1.543 | 7.896 / 9.738 | 140.484 | clear practical improvement |
| monte-medium | serial | 10/complete | 1049.784 [1017.555, 1115.987] | 0.049 | 0.143 | 52.554 / 1222.658 | 47628.868 | 1.000 | 988.415 / 1040.074 | 55.059 | matching chunked baseline |
| monte-medium | raw | 10/complete | 431.108 [411.113, 449.253] | 0.114 | 0.112 | 118.219 / 457.105 | 115980.165 | 2.435 | 10.949 / 13.350 | 140.018 | clear practical improvement |
| monte-medium | pjs | 10/complete | 415.627 [388.268, 445.808] | 0.086 | 0.132 | 170.968 / 518.696 | 120300.289 | 2.526 | 11.230 / 12.875 | 159.018 | clear practical improvement |
| monte-medium | piscina | 10/complete | 434.156 [418.850, 465.999] | 0.070 | 0.108 | 136.599 / 483.219 | 115166.083 | 2.418 | 11.467 / 13.810 | 160.236 | clear practical improvement |
| monte-medium | tinypool | 10/complete | 389.731 [376.411, 435.648] | 0.180 | 0.115 | 131.361 / 484.167 | 128293.536 | 2.694 | 11.662 / 13.390 | 159.365 | clear practical improvement |
| monte-medium | workerpool | 10/complete | 408.559 [402.177, 439.377] | 0.059 | 0.113 | 126.441 / 467.901 | 122381.195 | 2.569 | 10.635 / 12.465 | 140.490 | clear practical improvement |
| monte-large | serial | 10/complete | 4286.940 [4149.299, 4377.116] | 0.042 | 0.145 | 165.541 / 4935.042 | 46653.325 | 1.000 | 4063.574 / 4277.222 | 55.168 | matching chunked baseline |
| monte-large | raw | 10/complete | 1632.210 [1547.589, 1692.858] | 0.059 | 0.122 | 262.918 / 1707.791 | 122533.279 | 2.626 | 8.529 / 12.933 | 139.836 | clear practical improvement |
| monte-large | pjs | 10/complete | 1626.684 [1503.401, 1664.510] | 0.059 | 0.122 | 307.447 / 1747.148 | 122949.494 | 2.635 | 8.429 / 13.286 | 162.717 | clear practical improvement |
| monte-large | piscina | 10/complete | 1634.764 [1558.823, 1704.405] | 0.057 | 0.108 | 271.553 / 1719.196 | 122341.781 | 2.622 | 9.747 / 12.352 | 161.719 | clear practical improvement |
| monte-large | tinypool | 10/complete | 1715.366 [1541.204, 1932.121] | 0.158 | 0.118 | 272.410 / 1722.458 | 116593.211 | 2.499 | 9.602 / 14.163 | 158.064 | clear practical improvement |
| monte-large | workerpool | 10/complete | 1634.109 [1503.524, 1900.630] | 0.155 | 0.129 | 268.053 / 1720.582 | 122390.838 | 2.623 | 9.418 / 14.232 | 139.369 | clear practical improvement |
| monte-medium-p1 | serial | 10/complete | 1062.376 [1041.889, 1106.247] | 0.101 | 0.140 | 53.030 / 1243.227 | 47064.303 | 1.000 | 1000.385 / 1052.609 | 55.016 | matching chunked baseline |
| monte-medium-p1 | raw | 10/complete | 1085.863 [1056.879, 1129.640] | 0.328 | 0.113 | 97.367 / 1293.638 | 46046.307 | 0.978 | 10.091 / 12.311 | 85.740 | small/noisy difference |
| monte-medium-p1 | pjs | 10/complete | 1064.382 [1043.467, 1110.179] | 0.049 | 0.109 | 138.931 / 1357.566 | 46975.629 | 0.998 | 9.624 / 11.461 | 91.789 | small/noisy difference |
| monte-medium-p1 | piscina | 10/complete | 1066.508 [1045.086, 1114.754] | 0.049 | 0.113 | 112.483 / 1350.275 | 46881.980 | 0.996 | 9.891 / 11.779 | 93.684 | small/noisy difference |
| monte-medium-p1 | tinypool | 10/complete | 1084.412 [1051.341, 1165.068] | 0.058 | 0.113 | 106.372 / 1295.774 | 46107.916 | 0.980 | 10.021 / 12.239 | 92.033 | small/noisy difference |
| monte-medium-p1 | workerpool | 10/complete | 1066.358 [1058.040, 1103.110] | 0.055 | 0.108 | 105.054 / 1290.462 | 46888.555 | 0.996 | 10.095 / 12.249 | 87.070 | small/noisy difference |
| monte-medium-p2 | serial | 10/complete | 1077.164 [1038.139, 1120.088] | 0.156 | 0.143 | 53.280 / 1222.342 | 46418.198 | 1.000 | 1014.529 / 1067.434 | 55.021 | matching chunked baseline |
| monte-medium-p2 | raw | 10/complete | 569.237 [535.088, 585.133] | 0.045 | 0.158 | 98.680 / 712.390 | 87836.869 | 1.892 | 10.549 / 11.853 | 97.305 | clear practical improvement |
| monte-medium-p2 | pjs | 10/complete | 644.576 [622.200, 663.197] | 0.048 | 0.137 | 145.330 / 753.620 | 77570.336 | 1.671 | 10.981 / 12.469 | 115.012 | clear practical improvement |
| monte-medium-p2 | piscina | 10/complete | 578.994 [553.200, 623.757] | 0.062 | 0.119 | 121.165 / 733.016 | 86356.658 | 1.860 | 9.915 / 11.617 | 111.744 | clear practical improvement |
| monte-medium-p2 | tinypool | 10/complete | 556.390 [541.711, 591.986] | 0.064 | 0.136 | 115.927 / 736.456 | 89864.966 | 1.936 | 8.292 / 11.792 | 112.514 | clear practical improvement |
| monte-medium-p2 | workerpool | 10/complete | 609.521 [557.502, 648.444] | 0.100 | 0.140 | 112.871 / 730.414 | 82031.668 | 1.767 | 11.039 / 11.825 | 98.561 | clear practical improvement |
| image-512-clone | serial | 10/complete | 58.898 [48.036, 86.700] | 0.355 | 5.815 | 8.920 / 23.711 | 4450805.714 | 1.000 | 46.796 / 49.148 | 67.820 | matching chunked baseline |
| image-512-clone | raw | 10/complete | 18.860 [14.568, 34.794] | 0.483 | 5.901 | 68.298 / 72.929 | 13899801.427 | 3.123 | 8.173 / 8.690 | 138.705 | clear practical improvement |
| image-512-clone | pjs | 10/complete | 33.855 [10.335, 37.747] | 0.561 | 10.882 | 124.522 / 129.798 | 7743128.425 | 1.740 | 5.134 / 5.246 | 146.113 | clear practical improvement |
| image-512-clone | piscina | 10/complete | 19.663 [8.259, 35.251] | 0.642 | 5.914 | 89.552 / 96.424 | 13332112.742 | 2.995 | 6.998 / 7.469 | 144.244 | clear practical improvement |
| image-512-clone | tinypool | 10/complete | 20.942 [9.734, 33.907] | 0.555 | 5.902 | 77.951 / 84.070 | 12517351.122 | 2.812 | 7.357 / 7.755 | 143.084 | clear practical improvement |
| image-512-clone | workerpool | 10/complete | 11.581 [7.974, 34.926] | 0.694 | 5.933 | 76.634 / 82.658 | 22634816.884 | 5.086 | 6.212 / 6.473 | 140.619 | clear practical improvement |
| image-512-transfer | serial | 10/complete | 56.769 [49.845, 65.498] | 0.161 | 6.054 | 9.300 / 25.175 | 4617759.978 | 1.000 | 45.246 / 47.023 | 66.959 | matching chunked baseline |
| image-512-transfer | raw | 10/complete | 18.650 [8.588, 34.481] | 0.599 | 6.132 | 69.730 / 82.214 | 14056053.920 | 3.044 | 8.727 / 8.974 | 130.807 | clear practical improvement |
| image-512-transfer | pjs | 10/complete | 9.161 [7.692, 38.264] | 0.777 | 11.505 | 125.511 / 137.192 | 28616309.978 | 6.197 | 4.956 / 5.143 | 138.771 | clear practical improvement |
| image-512-transfer | piscina | 10/complete | 15.743 [8.987, 29.619] | 0.605 | 6.254 | 88.455 / 102.782 | 16651517.028 | 3.606 | 9.380 / 10.297 | 135.861 | clear practical improvement |
| image-512-transfer | tinypool | 10/complete | 9.069 [7.787, 34.833] | 0.726 | 6.069 | 77.209 / 90.460 | 28904546.106 | 6.259 | 5.658 / 5.807 | 134.699 | clear practical improvement |
| image-512-transfer | workerpool | 10/complete | 23.924 [7.841, 33.378] | 0.586 | 6.093 | 78.624 / 92.987 | 10957410.790 | 2.373 | 8.393 / 8.948 | 132.553 | clear practical improvement |
| image-2048-clone | serial | 10/complete | 256.213 [245.093, 269.236] | 0.050 | 94.303 | 16.343 / 405.419 | 16370347.386 | 1.000 | 234.408 / 246.487 | 231.891 | matching chunked baseline |
| image-2048-clone | raw | 10/complete | 191.571 [169.191, 224.647] | 0.270 | 98.871 | 78.834 / 164.769 | 21894219.019 | 1.337 | 8.578 / 11.353 | 374.549 | clear practical improvement |
| image-2048-clone | pjs | 10/complete | 175.075 [156.739, 189.287] | 0.189 | 100.044 | 137.297 / 217.374 | 23957218.274 | 1.463 | 8.484 / 10.753 | 376.850 | clear practical improvement |
| image-2048-clone | piscina | 10/complete | 281.715 [256.708, 322.273] | 0.151 | 93.951 | 97.729 / 179.924 | 14888452.081 | 0.909 | 9.509 / 13.013 | 386.471 | small/noisy difference |
| image-2048-clone | tinypool | 10/complete | 281.985 [266.938, 311.586] | 0.124 | 99.948 | 89.231 / 172.941 | 14874212.258 | 0.909 | 9.094 / 11.240 | 430.273 | small/noisy difference |
| image-2048-clone | workerpool | 10/complete | 186.927 [172.066, 199.849] | 0.098 | 95.302 | 86.117 / 166.006 | 22438240.464 | 1.371 | 9.819 / 12.744 | 382.033 | clear practical improvement |
| image-2048-transfer | serial | 10/complete | 266.608 [263.891, 276.640] | 0.109 | 100.329 | 15.441 / 411.547 | 15732104.013 | 1.000 | 244.550 / 256.950 | 191.195 | matching chunked baseline |
| image-2048-transfer | raw | 10/complete | 254.879 [172.224, 272.601] | 0.296 | 100.348 | 79.046 / 179.566 | 16456043.401 | 1.046 | 8.699 / 11.322 | 238.963 | small/noisy difference |
| image-2048-transfer | pjs | 10/complete | 107.048 [97.574, 119.939] | 0.264 | 102.376 | 138.139 / 237.299 | 39181617.549 | 2.491 | 6.700 / 8.745 | 266.455 | clear practical improvement |
| image-2048-transfer | piscina | 10/complete | 238.941 [165.179, 262.090] | 0.327 | 101.164 | 100.169 / 197.003 | 17553707.774 | 1.116 | 8.988 / 9.985 | 317.432 | clear practical improvement |
| image-2048-transfer | tinypool | 10/complete | 262.290 [226.473, 298.354] | 0.251 | 102.395 | 90.112 / 186.766 | 15991115.166 | 1.016 | 9.207 / 13.343 | 284.875 | small/noisy difference |
| image-2048-transfer | workerpool | 10/complete | 263.769 [243.492, 274.485] | 0.159 | 100.533 | 86.190 / 181.822 | 15901416.845 | 1.011 | 8.533 / 12.820 | 242.127 | small/noisy difference |
| numerical-64 | serial | 10/complete | 12.608 [10.160, 24.256] | 0.585 | 0.319 | 0.575 / 15.706 | 20792455.374 | 1.000 | 10.403 / 10.932 | 61.770 | matching chunked baseline |
| numerical-64 | raw | 10/complete | 67.420 [59.841, 83.288] | 0.475 | 0.239 | 59.303 / 125.788 | 3888202.894 | 0.187 | 7.062 / 10.912 | 134.881 | clear practical loss |
| numerical-64 | pjs | 10/complete | 413.682 [393.367, 427.351] | 0.121 | 0.280 | 112.287 / 607.967 | 633684.505 | 0.030 | 21.282 / 47.768 | 242.033 | clear practical loss |
| numerical-64 | piscina | 10/complete | 103.935 [95.234, 127.585] | 0.218 | 0.313 | 76.025 / 215.516 | 2522186.901 | 0.121 | 35.423 / 37.191 | 236.594 | clear practical loss |
| numerical-64 | tinypool | 10/complete | 68.131 [59.525, 72.008] | 0.178 | 0.837 | 68.549 / 146.814 | 3847618.209 | 0.185 | 8.956 / 10.409 | 173.844 | clear practical loss |
| numerical-64 | workerpool | 10/complete | 107.788 [89.271, 122.414] | 0.176 | 0.238 | 63.980 / 196.036 | 2432033.250 | 0.117 | 4.393 / 6.862 | 264.971 | clear practical loss |
| numerical-1024 | serial | 10/complete | 10.223 [9.106, 23.451] | 0.599 | 0.042 | 0.831 / 12.064 | 25642069.019 | 1.000 | 11.228 / 11.810 | 54.500 | matching chunked baseline |
| numerical-1024 | raw | 10/complete | 38.082 [7.252, 40.164] | 0.629 | 0.042 | 56.714 / 66.464 | 6883599.773 | 0.268 | 6.323 / 7.887 | 123.582 | small/noisy difference |
| numerical-1024 | pjs | 10/complete | 51.651 [32.166, 74.140] | 0.415 | 0.043 | 114.432 / 158.654 | 5075338.017 | 0.198 | 5.569 / 6.568 | 136.057 | clear practical loss |
| numerical-1024 | piscina | 10/complete | 49.989 [13.052, 58.145] | 0.598 | 0.042 | 75.744 / 93.992 | 5244002.216 | 0.205 | 13.689 / 14.637 | 133.736 | small/noisy difference |
| numerical-1024 | tinypool | 10/complete | 41.233 [11.266, 43.892] | 0.497 | 0.049 | 65.054 / 79.401 | 6357556.789 | 0.248 | 9.955 / 12.010 | 127.578 | small/noisy difference |
| numerical-1024 | workerpool | 10/complete | 52.709 [32.398, 53.376] | 0.362 | 0.053 | 65.819 / 80.985 | 4973377.639 | 0.194 | 5.423 / 6.815 | 135.584 | clear practical loss |
| numerical-16384 | serial | 10/complete | 9.535 [9.209, 11.952] | 0.201 | 0.005 | 2.797 / 12.056 | 27492239.282 | 1.000 | 10.554 / 11.102 | 54.445 | matching chunked baseline |
| numerical-16384 | raw | 10/complete | 3.994 [3.265, 17.374] | 0.826 | 0.005 | 63.978 / 67.866 | 65627057.542 | 2.387 | 5.770 / 5.963 | 122.035 | small/noisy difference |
| numerical-16384 | pjs | 10/complete | 13.849 [4.983, 25.377] | 0.734 | 0.005 | 112.835 / 117.590 | 18928457.961 | 0.689 | 5.641 / 5.971 | 130.422 | small/noisy difference |
| numerical-16384 | piscina | 10/complete | 20.715 [11.392, 22.790] | 0.436 | 0.005 | 79.168 / 85.010 | 12654730.124 | 0.460 | 5.815 / 5.815 | 126.137 | small/noisy difference |
| numerical-16384 | tinypool | 10/complete | 8.987 [4.036, 19.190] | 0.671 | 0.005 | 70.409 / 75.582 | 29170867.412 | 1.061 | 6.005 / 6.005 | 124.936 | small/noisy difference |
| numerical-16384 | workerpool | 10/complete | 13.325 [4.379, 21.029] | 0.655 | 0.005 | 70.039 / 75.626 | 19673538.616 | 0.716 | 5.494 / 5.783 | 123.766 | small/noisy difference |
| numerical-64-batch8 | serial | 10/complete | 11.411 [9.247, 28.602] | 0.627 | 0.193 | 0.704 / 13.663 | 22972618.886 | 1.000 | 11.486 / 12.090 | 58.641 | matching chunked baseline |
| numerical-64-batch8 | raw | 10/complete | 31.923 [14.678, 56.777] | 0.630 | 0.121 | 59.326 / 78.636 | 8211785.270 | 0.357 | 10.069 / 11.265 | 125.475 | small/noisy difference |
| numerical-64-batch8 | pjs | 10/complete | 72.064 [60.805, 84.163] | 0.160 | 0.139 | 110.479 / 193.303 | 3637675.609 | 0.158 | 9.415 / 11.004 | 158.279 | clear practical loss |
| numerical-64-batch8 | piscina | 10/complete | 57.147 [27.906, 66.994] | 0.457 | 0.306 | 75.093 / 108.305 | 4587167.362 | 0.200 | 33.907 / 36.327 | 145.584 | small/noisy difference |
| numerical-64-batch8 | tinypool | 10/complete | 45.736 [15.187, 60.936] | 0.600 | 0.414 | 64.249 / 90.028 | 5731621.059 | 0.249 | 9.389 / 11.324 | 133.852 | small/noisy difference |
| numerical-64-batch8 | workerpool | 10/complete | 65.009 [29.678, 69.950] | 0.439 | 0.172 | 63.467 / 94.793 | 4032401.468 | 0.176 | 7.492 / 9.531 | 155.602 | clear practical loss |

## Losses, overhead and break-even

The following records include every primary size and every numerical grain, including losses and uncertain cells. A crossover is bounded by sampled sizes; no interpolation or universal break-even is inferred.

- raw: 5000 Monte Carlo paths: clear practical improvement; 50000 Monte Carlo paths: clear practical improvement; 200000 Monte Carlo paths: clear practical improvement; grain 64, batch 1: clear practical loss; grain 1024, batch 1: small/noisy difference; grain 16384, batch 1: small/noisy difference; grain 64, batch 8: small/noisy difference.
- pjs: 5000 Monte Carlo paths: clear practical improvement; 50000 Monte Carlo paths: clear practical improvement; 200000 Monte Carlo paths: clear practical improvement; grain 64, batch 1: clear practical loss; grain 1024, batch 1: clear practical loss; grain 16384, batch 1: small/noisy difference; grain 64, batch 8: clear practical loss.
- piscina: 5000 Monte Carlo paths: clear practical improvement; 50000 Monte Carlo paths: clear practical improvement; 200000 Monte Carlo paths: clear practical improvement; grain 64, batch 1: clear practical loss; grain 1024, batch 1: small/noisy difference; grain 16384, batch 1: small/noisy difference; grain 64, batch 8: small/noisy difference.
- tinypool: 5000 Monte Carlo paths: clear practical improvement; 50000 Monte Carlo paths: clear practical improvement; 200000 Monte Carlo paths: clear practical improvement; grain 64, batch 1: clear practical loss; grain 1024, batch 1: small/noisy difference; grain 16384, batch 1: small/noisy difference; grain 64, batch 8: small/noisy difference.
- workerpool: 5000 Monte Carlo paths: clear practical improvement; 50000 Monte Carlo paths: clear practical improvement; 200000 Monte Carlo paths: clear practical improvement; grain 64, batch 1: clear practical loss; grain 1024, batch 1: clear practical loss; grain 16384, batch 1: small/noisy difference; grain 64, batch 8: clear practical loss.

No aggregate score is calculated. See summary.json for every peer comparison, timer sample count, variability, scaling cell, failure and descriptive interval. Throughput does not establish reliability or feature completeness. Image results concern this JavaScript stencil, with no claim about native codecs or GPUs.
