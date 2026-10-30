import { mix32 } from './prng.mjs';

export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = fraction * (sorted.length - 1),
    lo = Math.floor(index),
    hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export function summarize(values) {
  if (!values.length || values.some((x) => !Number.isFinite(x)))
    throw new Error('Invalid sample values');
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd =
    values.length > 1
      ? Math.sqrt(
          values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1),
        )
      : 0;
  let seed = 0x1234abcd;
  const boot = Array.from({ length: 2000 }, () =>
    percentile(
      Array.from({ length: values.length }, () => {
        seed = mix32(seed + 0x9e3779b9);
        return values[seed % values.length];
      }),
      0.5,
    ),
  );
  return {
    n: values.length,
    median: percentile(values, 0.5),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    mean,
    sd,
    cv: mean ? sd / mean : 0,
    iqr: percentile(values, 0.75) - percentile(values, 0.25),
    ci95: [percentile(boot, 0.025), percentile(boot, 0.975)],
  };
}

export const speedup = (serialMs, parallelMs) => serialMs / parallelMs;
export const efficiency = (serialMs, parallelMs, workers) =>
  speedup(serialMs, parallelMs) / workers;

export function practicalWin(a, b) {
  return a.median < b.median * 0.95 && a.ci95[1] < b.ci95[0];
}
