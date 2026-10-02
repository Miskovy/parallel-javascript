# ADR 0020: explicit pre-1.0 stability and distribution boundary

Status: accepted for v0.15 stabilization; not a declaration of stable 1.0.

## Context

v0.13 and v0.14 exercised useful compute and bounded binary pipelines without
requiring a new primitive. A larger API is not the next constraint. The package
and documentation must make its existing promises understandable to consumers.

## Decision

Keep a candidate core around registered tasks, bounded run, lifecycle and explicit
ownership. Retain experimental range methods and prefixed controls. Treat stats
as supported diagnostics without freezing every nested field. Explicitly exclude
registry.snapshot and internal module paths from the support promise.

Distribute ESM with a single root import and declarations. Qualify Node 22.13+
within 22.x and 24.x, rather than claiming every future major. Preserve the
existing source maps by shipping their TypeScript sources alongside compiled
output. No runtime dependency or CommonJS entrypoint is added. An installed-tarball
consumer, including worker paths and TypeScript execution, is a release gate.

## Consequences

No execution behavior or root export changes. Shipping sources adds 25 files
with an intentional editor/stack benefit; exports still block source subpaths.
Node engine ranges become narrower and need explicit release/migration notes.
Experimental promotion and the final stable-core freeze remain separate decisions.
The unsupported snapshot declaration and broad binary backing types are recorded
debt, not reasons to add a feature or refactor scheduling during stabilization.
