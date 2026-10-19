/** Descriptive observations, deliberately independent of the ownership verdict. */
export function analyze(samples) {
  const phases = {};
  for (const phase of new Set(samples.map((s) => s.phase))) {
    const rows = samples.filter((s) => s.phase === phase);
    phases[phase] = {
      samples: rows.length,
      elapsedMs: { first: rows[0].elapsedMs, last: rows.at(-1).elapsedMs },
      processRss: describe(rows.map((r) => r.main.memory.rss)),
      mainIsolate: Object.fromEntries(
        ['heapUsed', 'heapTotal', 'external', 'arrayBuffers'].map((key) => [
          key,
          describe(rows.map((r) => r.main.memory[key])),
        ]),
      ),
    };
  }
  return {
    phases,
    interpretation:
      'Ranges and endpoint changes are observations, not leak tests or RSS ceilings. arrayBuffers overlaps external. RSS is process-wide; other process.memoryUsage fields are isolate-local. Sampling, GC and native allocators affect measurements.',
  };
}
function describe(values) {
  return {
    first: values[0],
    last: values.at(-1),
    min: Math.min(...values),
    max: Math.max(...values),
    endpointChange: values.at(-1) - values[0],
  };
}
