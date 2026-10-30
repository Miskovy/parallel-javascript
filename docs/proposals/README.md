# Design proposals

[Documentation index](../README.md)

Proposals record the design and scope reviewed at a particular milestone.
Their status belongs to that baseline. Use the [guides](../guide/README.md),
[reference](../reference/README.md) and [release notes](../releases/README.md)
for the prepared candidate's behavior.

## Execution and host checkpoints

- [Execution resilience](execution-resilience.md).
- [Checkpoint 2: execution recovery](checkpoint-2-execution-recovery.md).
- [Checkpoint 3: scheduling, asynchronous concurrency and progress](checkpoint-3-scheduling-concurrency-progress.md).
- [Checkpoint 4: CommonJS consumption and browser workers](checkpoint-4-commonjs-browser.md).

## Versioned proposals

| Milestone  | Proposal                                                                |
| ---------- | ----------------------------------------------------------------------- |
| 1.0.0-rc.1 | [Contract hardening](proposal-v1.0.0-rc.1.md)                           |
| 0.15       | [Runtime stabilization and 1.0 readiness](proposal-v0.15.md)            |
| 0.14       | [Bounded native compression research](proposal-v0.14.md)                |
| 0.13       | [Real-world crypto execution research](proposal-v0.13.md)               |
| 0.12       | [Upper-bound binary result reservations and refunds](proposal-v0.12.md) |
| 0.11       | [Runtime core decomposition](proposal-v0.11.md)                         |
| 0.10       | [Reservation durability and performance evidence](proposal-v0.10.md)    |
| 0.9        | [Strict binary streams and result-byte reservations](proposal-v0.9.md)  |
| 0.8        | [Element-block mapping and observable payload bytes](proposal-v0.8.md)  |
| 0.7        | [Bounded result delivery](proposal-v0.7.md)                             |
| 0.6        | [Completion-only parallel ranges and async context](proposal-v0.6.md)   |
| 0.5        | [Dispatch efficiency and bounded batching](proposal-v0.5.md)            |
| 0.4        | [Runtime-owned numeric ranges](proposal-v0.4.md)                        |
| 0.3        | [Reusable shared inputs](proposal-v0.3.md)                              |
| 0.1        | [Initial architecture](proposal.md)                                     |

See the [architecture decision records](../adr/README.md) for decisions and
consequences, and [research](../research/README.md) for implementation reviews.
