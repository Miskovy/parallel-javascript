import { threadId } from 'node:worker_threads';

export function countPrimes({ from, to }) {
  let count = 0;
  for (let n = Math.max(2, from); n < to; n++) {
    if (n === 2) {
      count++;
      continue;
    }
    if (n % 2 === 0) continue;
    let prime = true;
    for (let divisor = 3; divisor * divisor <= n; divisor += 2) {
      if (n % divisor === 0) {
        prime = false;
        break;
      }
    }
    if (prime) count++;
  }
  return { count, threadId };
}

/** Sieve oracle, excluded from timings and intentionally unlike the trial-division kernel. */
export function referencePrimeCount(to) {
  const composite = new Uint8Array(to);
  for (let n = 2; n * n < to; n++) {
    if (!composite[n])
      for (let multiple = n * n; multiple < to; multiple += n)
        composite[multiple] = 1;
  }
  let count = 0;
  for (let n = 2; n < to; n++) if (!composite[n]) count++;
  return count;
}
