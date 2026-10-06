export const config = Object.freeze({
  campaign: 'flagship-monte-carlo-v1',
  factors: 16,
  positions: 1024,
  seed: 0x504a5301,
  scheduleSeed: 0x16543210,
  neutralGrain: 8,
  inFlightMultiplier: 2,
  warmups: 2,
  trials: 10,
  timeoutMs: 120000,
  // Serial-only calibration replaces these before the retained parallel run.
  sizes: { small: 5000, medium: 50000, large: 200000 },
  candidates: [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000],
});
