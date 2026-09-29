# 0015: Element-block range map semantics

## Context

`partitionRange()` returns one arbitrary value per partition. That is not an
element map when grain exceeds one. A truthful map needs a defined relationship
between every numeric input index and every final output position without
requiring one worker message per element.

## Decision

Add experimental `parallelMapRange()`. Each range partition is a map block. Its
worker result must contain exactly `partition.end - partition.start` elements.
Generic mode accepts only ordinary arrays and resolves one flat ordered array.
Typed mode requires an explicit built-in typed-array constructor, accepts only
that block kind, and resolves one flat typed array, including for empty ranges.

The host preallocates the final output and copies validated blocks directly to
offset `partition.start - range.start`. Grain defines elements per block;
dispatch batching independently defines blocks per physical message. A mismatch
fails the parent once and no partial result resolves.

No streaming-map API is added. `streamRange()` already streams identified
blocks in completion order. For numeric workloads, disjoint shared output with
`parallelFor()` remains the lower-transport specialized alternative.

## Consequences

Map assembly and its final allocation are included in operation time and memory.
Transferred typed blocks still require a host copy into the final typed result.
Generic element schemas remain application-owned. The API does not imply arrays,
iterables, generators, flattening beyond one validated block level, or an
ordered stream.

## Revisit conditions

Revisit naming and stabilization after use in real range workloads. Generic
collection map, output-target abstractions, and streaming element flattening
need separate evidence.
