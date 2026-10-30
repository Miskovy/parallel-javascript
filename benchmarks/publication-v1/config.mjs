export const config = Object.freeze({
  campaign: 'pjs-1.0-publication-v1',
  node: '24.22.1',
  seed: 0x504a5301,
  orderSeed: 0x20261030,
  warmups: 2,
  trials: 10,
  timeoutMs: 120000,
  inFlightMultiplier: 2,
  monte: {
    factors: 16,
    positions: 1024,
    sizes: [5000, 50000, 200000],
    chunks: 32,
  },
  image: { edges: [512, 2048], tileRows: 64 },
  numerical: { count: 262144, chunks: [64, 1024, 16384], batch: 8 },
  contenders: ['serial', 'raw', 'pjs', 'piscina', 'tinypool', 'workerpool'],
  versions: {
    '@pjavascript/runtime': '1.0.0',
    piscina: '5.3.2',
    tinypool: '2.2.0',
    workerpool: '10.0.3',
  },
});

export function cases(capacity, profile) {
  const primary = Math.min(4, capacity);
  const scaling = [...new Set([1, 2, primary].filter((p) => p <= primary))];
  const smoke = profile === 'smoke';
  const result = [];
  function add(id, family, parameters, workers = primary, study = 'primary') {
    result.push({ id, family, ...parameters, workers, study });
  }
  (smoke ? [37, 73, 101] : config.monte.sizes).forEach((count, i) =>
    add(`monte-${['small', 'medium', 'large'][i]}`, 'monte', {
      count,
      chunkSize: Math.ceil(count / config.monte.chunks),
      mode: 'clone',
    }),
  );
  for (const workers of scaling.filter((p) => p !== primary))
    add(
      `monte-medium-p${workers}`,
      'monte',
      {
        count: smoke ? 73 : config.monte.sizes[1],
        chunkSize: Math.ceil(
          (smoke ? 73 : config.monte.sizes[1]) / config.monte.chunks,
        ),
        mode: 'clone',
      },
      workers,
      'scaling',
    );
  for (const edge of smoke ? [32, 64] : config.image.edges)
    for (const mode of ['clone', 'transfer'])
      add(`image-${edge}-${mode}`, 'image', {
        edge,
        count: edge * edge,
        chunkSize: smoke ? 8 : config.image.tileRows,
        mode,
      });
  for (const chunkSize of smoke ? [4, 16, 64] : config.numerical.chunks)
    add(`numerical-${chunkSize}`, 'numerical', {
      count: smoke ? 257 : config.numerical.count,
      chunkSize,
      batch: 1,
      mode: 'clone',
    });
  add(
    `numerical-${smoke ? 4 : 64}-batch8`,
    'numerical',
    {
      count: smoke ? 257 : config.numerical.count,
      chunkSize: smoke ? 4 : 64,
      batch: config.numerical.batch,
      mode: 'clone',
    },
    primary,
    'batching',
  );
  return { primary, scaling, cases: result };
}

// A seeded permutation of each complete six-contender block, followed by all six
// cyclic rotations. Across ten trials each contender occupies each position
// once or twice. The same rule rotates case order, independently of timings.
export function balancedOrder(items, round, seed) {
  const values = [...items];
  let state = (seed ^ Math.floor(round / items.length)) >>> 0;
  for (let i = values.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  const shift = round % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}
