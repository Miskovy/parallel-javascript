# v0.13 crypto execution research

Run from the repository root using the current Node version. Node 24.7+ enables
the optional native Argon2 experiment. This does not change runtime source or
install a public crypto package.

```sh
npm run build
npm ci --prefix benchmarks/real-world/crypto --ignore-scripts
node benchmarks/real-world/crypto/run.mjs --profile=smoke --output=benchmarks/results/local/crypto-smoke.json
node benchmarks/real-world/crypto/run.mjs --profile=full --output=benchmarks/results/crypto-v0.13-fedora-node24.json
node benchmarks/real-world/crypto/report.mjs benchmarks/results/crypto-v0.13-fedora-node24.json
```

Create the output parent directory first. Output files must not already exist;
campaigns never replace earlier evidence. `full` has two warmups and six retained
trials per cell. `smoke` has one retained trial and is only a correctness/tooling
check. `reproduce` is a smaller suite of SHA ownership, scrypt isolation, Argon2
lanes, and AES contrasts, suitable for a second platform. `--filter=substring`
selects a subset by cell ID; use a new output filename. The commands also work in
PowerShell with Windows-specific filenames. Keep the existing Node version and
power plan. In this session only Fedora was available.

The isolated package pins native bcrypt 6.0.0. Install scripts are disabled;
published prebuilt binaries are used where available. Without a working optional
bcrypt installation, its cells have explicit skip records. Argon2 is similarly
feature-detected. No algorithms are reimplemented.

## Measurement contract

- Serial SHA/AES, native async password APIs, PJS public `run()`, and a small raw
  persistent worker control all invoke the same native algorithms and parameters.
- Ready time is recorded separately. Each cell uses one persistent pool across
  two warmups and six retained trials. First warmup includes lazy module loading.
  Cells are deterministically shuffled; trials within a cell remain sequential.
  This is exploratory evidence on one host, not a randomized paired trial.
- Fixed task counts are calibrated by two warmups toward 350 ms per trial. The
  count is capped at 32,000 jobs and AES retained ciphertext at 128 MiB. Some fast
  and large-AES cells have shorter windows: raw wall times expose that limitation.
- Fixtures, allocation, serial references, output comparison, AES decryption and
  tampered-tag rejection occur outside timing. Each returned output is checked.
  SHA batches perform 64 independent hashes of the same immutable bytes; report
  operations and dispatched jobs separately. No automatic batching is added.
- Jobs reuse equal-content lane-local buffers. Shared inputs are immutable by
  contract. Clone copies on dispatch; transfer moves the input to the worker and
  back each job. Transfer is a recycling workload, not a free one-way handoff.
  AES clones inputs and returns full ciphertext and tag through structured clone.
  Serial calls access their inputs directly. Transport cost is part of the model.
- Latency is closed-loop submit-to-completion, including dispatch/queue/return.
  `admissionToBodyMs` includes queue **and** dispatch/input transport; it is not
  the exact scheduler queue time. `queueMs.mean` and `runtimeExecutionMeanMs`
  are differences of public cumulative PJS timing totals. Exact queue quantiles
  and native libuv queue/execution splits are unavailable and remain null.
- A 10 ms timer measures scheduling delay, not HTTP latency. Event-loop delay is
  primed before work and drained afterward. The histogram can still miss an
  initial synchronous burst; use the independent timer and ELU to assess it.
  The delayed final probe is included. CPU and ELU cover only the timed workload.
- Contention cells read a benchmark-owned cached 4 KiB temporary file, at most
  one read in flight, followed by 10 ms rest. The final in-flight read is drained
  and recorded. This measures interference, not disk bandwidth; it under-samples
  heavily blocked periods rather than generating an unbounded request backlog.
- CPU 100% means one CPU; worker-body occupancy excludes transport. Public queue
  snapshots, memory, and Linux process thread counts are sampled every 10 ms.
  Sampling includes small observer cost and can miss transients. RSS covers the
  process; heap/external/arrayBuffers describe the main isolate only. Lifetime
  maxRSS is cumulative across cells, not a per-cell peak. Context-switch counters
  are OS-dependent. Unavailable metrics are null.
- Before each cell, estimate workers, native working memory, input clones and
  retained ciphertext. Skip estimates above half of free RAM or one quarter of
  total RAM. This is conservative estimation, not a hard RSS limiter. Configure
  external container limits appropriately before running there. PJS result-byte
  credits do **not** bound crypto native allocations, and `run()` uses no result
  byte declarations here. The normal client has bounded in-flight work and queue
  capacity 256; a separate 16-offer/one-worker/two-queue probe validates rejection.
- All valid trials, warmups, variance, skips, source hashes and failures are
  persisted. A failed partial campaign is not accepted as complete evidence.
  Percentiles are nearest-rank; CV uses sample standard deviation / mean.

## Security parameters and scope

Scrypt: N=16384, r=8, p=1, maxmem=64 MiB, 32-byte output. Argon2id: 64 MiB,
three passes, 32-byte output, lanes 1/2/4. Bcrypt: cost 10, fixed synthetic salt.
These are controlled benchmark parameters, not a password-storage recommendation.
Changing Argon2 lanes changes the derivation; compare models only at equal lanes.
Passwords and 16-byte salts are synthetic test fixtures and contain no secrets.
AES uses a fresh random 256-bit key per trial, a unique 96-bit counter IV per
encryption under that key, fixed associated data, and a 128-bit tag. Every output
is decrypted and every tag is tested after tampering. Keys never enter artifacts.

Official background: [Node 24.13.1 crypto APIs](https://nodejs.org/download/release/v24.13.1/docs/api/crypto.html),
[Node libuv threadpool](https://nodejs.org/api/cli.html#uv_threadpool_sizesize),
[Node Argon2 native thread setup](https://github.com/nodejs/node/blob/v24.13.1/deps/ncrypto/ncrypto.cc#L1796),
[OpenSSL Argon2 lanes and threads](https://docs.openssl.org/3.5/man7/EVP_KDF-ARGON2/).

## Native Argon2 qualification

The retained Node 24.13.1 build exhibits synchronous work during async Argon2
submission, reproduced without PJS and consistent with
[Node issue #62861](https://github.com/nodejs/node/issues/62861). Do not generalize
its PJS/native ratios to releases containing the upstream fix. Diagnose another
build without changing defaults using:

```sh
node benchmarks/real-world/crypto/argon2-probe.mjs benchmarks/results/local/native-submission.json
node --test benchmarks/real-world/crypto/harness.test.mjs
```

The probe's first two trials per API are warmups; six subsequent trials retain
submission, callback, timer and wall times. The full runner compares every output
to a trusted serial reference. This diagnostic only checks same-parameter outputs
agree, since its purpose is to isolate the API's call-return behavior.
