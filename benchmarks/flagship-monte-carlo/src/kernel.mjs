import { normal } from './prng.mjs';

export function compensated(values) {
  let sum = 0,
    correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction +=
      Math.abs(sum) >= Math.abs(value)
        ? sum - next + value
        : value - next + sum;
    sum = next;
  }
  return sum + correction;
}

export function simulate({ model, seed, start, end, id, mode }) {
  const { factors, positions, cholesky, loadings, delta, gamma } = model;
  const z = new Float64Array(factors),
    shocks = new Float64Array(factors);
  const output = mode === 'distribution' ? new Float64Array(end - start) : null;
  let sum = 0,
    sumCorrection = 0,
    sumSquares = 0,
    squareCorrection = 0;
  let minimum = Infinity,
    maximum = -Infinity,
    checksum = 0;
  const bits = new DataView(new ArrayBuffer(8));
  for (let path = start; path < end; path++) {
    for (let f = 0; f < factors; f++) z[f] = normal(seed, path, f);
    for (let f = 0; f < factors; f++) {
      let shock = 0;
      for (let j = 0; j <= f; j++) shock += cholesky[f * factors + j] * z[j];
      shocks[f] = shock;
    }
    let pnl = 0;
    for (let p = 0; p < positions; p++) {
      let shock = 0;
      for (let f = 0; f < factors; f++)
        shock += loadings[p * factors + f] * shocks[f];
      pnl += delta[p] * shock + 0.5 * gamma[p] * shock * shock;
    }
    const next = sum + pnl;
    sumCorrection +=
      Math.abs(sum) >= Math.abs(pnl) ? sum - next + pnl : pnl - next + sum;
    sum = next;
    const square = pnl * pnl,
      nextSquare = sumSquares + square;
    squareCorrection +=
      Math.abs(sumSquares) >= Math.abs(square)
        ? sumSquares - nextSquare + square
        : square - nextSquare + sumSquares;
    sumSquares = nextSquare;
    minimum = Math.min(minimum, pnl);
    maximum = Math.max(maximum, pnl);
    bits.setFloat64(0, pnl, true);
    checksum =
      (checksum + (bits.getUint32(0, true) ^ bits.getUint32(4, true))) >>> 0;
    if (output) output[path - start] = pnl;
  }
  return {
    id,
    start,
    end,
    count: end - start,
    sum: sum + sumCorrection,
    sumSquares: sumSquares + squareCorrection,
    minimum,
    maximum,
    checksum,
    output,
  };
}

export function reduceResults(results, mode) {
  results = [...results].sort((a, b) => a.id - b.id);
  let offset = 0,
    checksum = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.id !== i || r.start !== offset || r.count !== r.end - r.start)
      throw new Error('Invalid chunk coverage');
    offset = r.end;
    checksum = (checksum + r.checksum) >>> 0;
  }
  const sum = compensated(results.map((r) => r.sum));
  const sumSquares = compensated(results.map((r) => r.sumSquares));
  const summary = {
    count: offset,
    sum,
    sumSquares,
    minimum: Math.min(...results.map((r) => r.minimum)),
    maximum: Math.max(...results.map((r) => r.maximum)),
    checksum,
    mean: sum / offset,
    standardDeviation: Math.sqrt(
      Math.max(0, sumSquares / offset - (sum / offset) ** 2),
    ),
  };
  if (mode === 'distribution') {
    const output = new Float64Array(offset);
    for (const r of results) {
      if (r.output?.length !== r.count)
        throw new Error('Invalid distribution cardinality');
      output.set(r.output, r.start);
    }
    const losses = Float64Array.from(output, (x) => -x).sort();
    const tail = Math.floor(0.99 * offset);
    summary.var99 = losses[tail];
    summary.expectedShortfall99 =
      compensated(losses.subarray(tail)) / (offset - tail);
    return { summary, output };
  }
  return { summary };
}
