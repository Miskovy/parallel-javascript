import { uniform } from './prng.mjs';

export function createModel({ factors, positions, seed }) {
  const cholesky = new Float64Array(factors * factors);
  for (let i = 0; i < factors; i++) {
    for (let j = 0; j <= i; j++) {
      let value = i === j ? 1 : 0.2;
      for (let k = 0; k < j; k++)
        value -= cholesky[i * factors + k] * cholesky[j * factors + k];
      cholesky[i * factors + j] =
        i === j ? Math.sqrt(value) : value / cholesky[j * factors + j];
    }
  }
  const loadings = new Float64Array(positions * factors);
  const delta = new Float64Array(positions);
  const gamma = new Float64Array(positions);
  for (let p = 0; p < positions; p++) {
    delta[p] = (uniform(seed ^ 0x1111, p, 0) - 0.5) * 200;
    gamma[p] = (uniform(seed ^ 0x2222, p, 0) - 0.5) * 20;
    for (let f = 0; f < factors; f++)
      loadings[p * factors + f] =
        (uniform(seed ^ 0x3333, p, f) - 0.5) / Math.sqrt(factors);
  }
  return { factors, positions, cholesky, loadings, delta, gamma };
}

export const modelBytes = (model) =>
  ['cholesky', 'loadings', 'delta', 'gamma'].reduce(
    (n, key) => n + model[key].byteLength,
    0,
  );

export function shareModel(model, copy) {
  const result = { ...model };
  for (const key of ['cholesky', 'loadings', 'delta', 'gamma']) {
    if (copy) result[key] = copy(model[key]);
    else {
      result[key] = new Float64Array(
        new SharedArrayBuffer(model[key].byteLength),
      );
      result[key].set(model[key]);
    }
  }
  return result;
}
