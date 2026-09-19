# 0004: Separate caller settlement from execution completion

## Context

Messages cannot interrupt synchronous CPU JavaScript. Terminating a worker for routine cancellation destroys persistent module state. Releasing its slot early can overlap async executions and corrupt result correlation.

## Decision

Abort/deadline removes queued work or settles an active caller without stopping its execution. Keep only the active worker task ID until the late response/crash. Timers and abort listeners are removed on caller settlement. Deadlines include startup and queue delay. Graceful shutdown waits for these active executions; explicit non-draining shutdown can terminate them.

## Alternatives

- Terminate on every abort: deterministic preemption but expensive and disruptive.
- Pretend cancellation stops CPU work: incorrect.
- Cooperative shared-memory flag: promising, but needs task context and polling contract.

## Consequences

Cancellation does not undo effects or reclaim a running CPU immediately. Uncooperative tasks can delay graceful shutdown indefinitely. Accounting distinguishes caller outcomes from physical execution outcomes. The first shutdown call fixes the drain mode; later mode escalation is deferred.
