# 0001: Explicit module registry

## Context

V8 isolates do not share arbitrary closures. A convenient function argument must not imply captured state can be transferred safely. Startup errors must be distinguishable from task failures.

## Decision

Bind immutable typed handles to local file URLs and named exports. Snapshot descriptors when constructing a runtime; workers eagerly import and validate all exports before ready. No code generation or eval. The facade validates handle identity against its snapshot.

## Alternatives

- Module URL on every submission: simple but repeats configuration and moves errors into dispatch.
- Bootstrap-only user registry: useful for initialization but requires a second API and manual worker glue.
- Generated manifest: useful later for compiler/tooling integration; unnecessary build dependency now.
- Function serialization: cannot preserve closures and encourages unsafe code reconstruction.

## Consequences

Task modules are independently importable and trusted. Globals are per-isolate and persist across tasks. All modules load in every worker, increasing startup/memory for large registries. Dynamic registration and schema/type manifest verification are deferred. Type parameters are assertions about module exports.
