# v0.13 — real-world crypto execution research

Status: research campaign; runtime and public API frozen at v0.12. No crypto
package, runtime tuning, new primitive, or algorithm implementation is authorized
by this milestone. Baseline checkout: `4fc6cd31648ef7527c08ffda9af008499dc2bd32`;
runtime implementation: `18f0c87e7b7920179403bbc396afabced6bb06c4`.

## Hypotheses registered before retained measurements

- H1: individual tiny SHA jobs lose to serial native hashing through dispatch cost.
- H2: sufficiently coarse independent SHA jobs can benefit from dedicated workers.
- H3: dedicated password workers reduce interference with asynchronous filesystem
  work; native asynchronous crypto already protects the main event loop.
- H4: maximum worker count need not maximize memory-hard throughput or efficiency.
- H5: Argon2 lanes and external concurrency may oversubscribe resources. Lanes are
  algorithm parameters, not proof that the native implementation creates threads.
- H6: small AES-GCM payloads cannot amortize dispatch and result transport.

## Protocol

Use trusted Node crypto, optional pinned native bcrypt, persistent warm pools,
identical parameters within execution-model comparisons, two warmups and six
retained samples. Retain negative findings and every valid sample. Record cold
startup separately. Compare serial, native async, public `PjsRuntime.run()`, and a
minimal persistent worker control where useful. Use a bounded closed-loop client;
a separate overload probe tests rejection. Do not interpret closed-loop latency
as an open-loop service SLA.

Study SHA-256/SHA-512 sizes, SHA clone/round-trip transfer/immutable sharing and
manual batches; scrypt concurrency and worker sweeps; Argon2id lanes × workers;
bcrypt where practical; AES-256-GCM encryption with authenticated correctness
controls. Record filesystem interference with a temporary cached file and a 10 ms
timer probe, including idle control. Preflight memory costs before each cell.
Public runtime statistics provide queue/execution means, not queue quantiles;
report missing fields honestly and separately instrument task-body execution.

The available host is Fedora, Node 24.13.1. Windows is unavailable in this session;
provide portable commands and do not claim Windows validation or change the
default Node version, governor, power mode, or libuv configuration. Do not start
v0.14. A package recommendation requires repeated systems evidence and remains
distinct from implementation authorization.
