import { availableParallelism } from 'node:os';

export const policy = Object.freeze({
  seed: 20261023,
  warmups: 1,
  repetitions: 3,
  childTimeoutMs: 120_000,
  maxWorkers: 4,
  maxPayloadBytes: 512 * 1024 ** 2,
  minFreeMemoryBytes: 1024 ** 3,
  order: ['baseline', 'candidate', 'candidate', 'baseline'],
  slowdown: 1.15,
  minimumDeltaMs: 2,
  maxCV: 0.15,
  pairedSlowdown: 1.1,
  additionalBlocks: 1,
});

export function configurations(
  profile = 'performance',
  parallelism = availableParallelism(),
) {
  if (!['pilot', 'health', 'performance'].includes(profile))
    throw new Error('Unknown profile: ' + profile);
  const cap = Math.min(policy.maxWorkers, parallelism);
  const counts = [...new Set([1, cap])];
  const cases = [];
  const add = (family, values = {}, backends = ['pjs']) => {
    for (const backend of backends)
      cases.push({
        family,
        backend,
        workers: cap,
        size: 17,
        grain: 4,
        batch: 1,
        transport: 'clone',
        capacity: 4,
        slowMs: 0,
        ...values,
      });
  };
  for (const size of [32, 50_000, 500_000, 3_000_000]) {
    add('cpu', { size }, ['serial', 'piscina']);
    for (const workers of counts) add('cpu', { size, workers });
  }
  for (const size of [8, 64, 192]) {
    add('matrix', { size }, ['serial', 'piscina']);
    for (const workers of counts) add('matrix', { size, workers });
  }
  for (const size of [0, 64, 65536, 2 * 1024 ** 2])
    for (const transport of ['clone', 'transfer', 'shared'])
      add('transport', { size, transport });
  for (const batch of [1, 4, 16])
    add('dispatch', { size: 1025, grain: 1, batch });
  for (const grain of [1, 17, 128]) add('skew', { size: 513, grain });
  add('completion', { size: 129, grain: 8 });
  for (const size of [0, 17, 1048579])
    add('shared-output', { size, grain: 65536 });
  for (const family of ['generic-map', 'typed-map'])
    for (const size of [0, 17, 65539]) add(family, { size, grain: 1024 });
  for (const mode of ['count', 'exact', 'upper'])
    for (const transport of ['clone', 'transfer'])
      for (const capacity of [1, 4])
        add('stream', {
          size: 17,
          grain: 4,
          bytes: 65536,
          mode,
          transport,
          capacity,
          slowMs: capacity === 1 ? 2 : 0,
        });
  for (const mode of ['count', 'exact', 'upper'])
    add('stream', { size: 1, grain: 1, bytes: 0, mode, capacity: 1 });
  add('pipeline', { size: 65, grain: 4, bytes: 8192, transport: 'transfer' });
  add('fairness', { size: 257, grain: 8 });
  for (const corpus of ['high', 'moderate', 'poor'])
    add('compression', { size: 1024 ** 2, grain: 65536, corpus }, [
      'serial',
      'pjs',
    ]);
  for (const kind of ['sha', 'aes', 'scrypt', 'argon2', 'bcrypt'])
    add(
      'crypto',
      {
        kind,
        size: kind === 'sha' || kind === 'aes' ? 1024 ** 2 : 4,
        grain: 1,
      },
      ['serial', 'pjs'],
    );
  for (const mode of ['aggregate', 'distribution'])
    for (const size of [1024, 32768])
      add('monte-carlo', { mode, size, grain: Math.ceil(size / 16) }, [
        'serial',
        'pjs',
      ]);
  const selected =
    profile === 'performance'
      ? cases
      : cases.filter((c, i) =>
          profile === 'pilot'
            ? [0, 8, 17, 32, 43, 55, 70, 80].includes(i)
            : c.backend === 'pjs' &&
              !cases
                .slice(0, i)
                .some((p) => p.family === c.family && p.backend === 'pjs'),
        );
  return selected.map((c, index) => ({
    id: `${index.toString().padStart(3, '0')}-${c.family}-${c.backend}`,
    ...c,
  }));
}
