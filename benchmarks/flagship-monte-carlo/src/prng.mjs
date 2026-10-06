// Fixed avalanche mixer, all operations modulo 2^32. This is not cryptographic.
export function mix32(value) {
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function uniform(seed, index, dimension) {
  const counter = mix32(seed ^ Math.imul(index + 1, 0x9e3779b1));
  return (
    (mix32(counter ^ Math.imul(dimension + 1, 0x85ebca6b)) + 0.5) / 4294967296
  );
}

export function normal(seed, index, dimension) {
  const pair = dimension >>> 1;
  const radius = Math.sqrt(-2 * Math.log(uniform(seed, index, 2 * pair)));
  const angle = 2 * Math.PI * uniform(seed, index, 2 * pair + 1);
  return radius * (dimension % 2 ? Math.sin(angle) : Math.cos(angle));
}
