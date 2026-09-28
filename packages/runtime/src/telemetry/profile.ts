/** @internal Benchmark-only stage timing. Disabled unless a benchmark installs a sink. */
export type InternalProfileSink = (stage: string, durationMs: number) => void;

let sink: InternalProfileSink | undefined;

export function setInternalProfileSink(value?: InternalProfileSink): void {
  sink = value;
}

export function internalProfilingEnabled(): boolean {
  return sink !== undefined;
}

export function recordInternalProfile(stage: string, durationMs: number): void {
  sink?.(stage, durationMs);
}
