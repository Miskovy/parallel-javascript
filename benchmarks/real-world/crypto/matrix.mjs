import { availableParallelism } from 'node:os';

export function matrix(profile = 'full') {
  const cases = [];
  const workers = Math.min(4, availableParallelism());
  const add = (config) =>
    cases.push({
      workers: 0,
      concurrency: 1,
      size: 0,
      ownership: 'clone',
      batch: 1,
      lanes: 1,
      contention: false,
      ...config,
    });
  for (const algorithm of ['sha256', 'sha512'])
    for (const size of [1024, 65536, 1048576, 8388608]) {
      add({ kind: 'sha', algorithm, size, model: 'serial' });
      for (const ownership of algorithm === 'sha256'
        ? ['clone', 'transfer', 'shared']
        : ['shared'])
        add({
          kind: 'sha',
          algorithm,
          size,
          model: 'pjs',
          workers,
          concurrency: 16,
          ownership,
        });
      if (algorithm === 'sha256')
        add({
          kind: 'sha',
          algorithm,
          size,
          model: 'raw',
          workers,
          concurrency: 16,
          ownership: 'shared',
        });
    }
  for (const concurrency of [1, 4, 8, 32, 64, 128])
    add({
      kind: 'sha',
      algorithm: 'sha256',
      size: 1048576,
      model: 'pjs',
      workers,
      concurrency,
      ownership: 'shared',
    });
  for (const model of ['serial', 'pjs', 'raw'])
    add({
      kind: 'sha',
      algorithm: 'sha256',
      size: 1024,
      batch: 64,
      model,
      workers: model === 'serial' ? 0 : workers,
      concurrency: model === 'serial' ? 1 : 16,
      ownership: 'shared',
    });
  for (const concurrency of [1, 2, 4, 8, 16, 32, 64]) {
    add({ kind: 'scrypt', model: 'native', concurrency });
    add({ kind: 'scrypt', model: 'pjs', workers, concurrency });
  }
  for (const workerCount of [...new Set([1, 2, availableParallelism()])])
    if (workerCount !== workers)
      add({
        kind: 'scrypt',
        model: 'pjs',
        workers: workerCount,
        concurrency: 16,
      });
  add({ kind: 'scrypt', model: 'raw', workers, concurrency: 16 });
  for (const lanes of [1, 2, 4]) {
    add({ kind: 'argon2', model: 'native', concurrency: 4, lanes });
    for (const workerCount of [1, 2, 4])
      add({
        kind: 'argon2',
        model: 'pjs',
        workers: workerCount,
        concurrency: 4,
        lanes,
      });
  }
  for (const concurrency of [1, 4, 16, 32])
    for (const model of ['native', 'pjs'])
      add({
        kind: 'bcrypt',
        model,
        workers: model === 'pjs' ? workers : 0,
        concurrency,
      });
  for (const size of [1024, 65536, 1048576, 8388608])
    for (const model of ['serial', 'pjs'])
      add({
        kind: 'aes',
        model,
        size,
        workers: model === 'pjs' ? workers : 0,
        concurrency: model === 'pjs' ? 16 : 1,
      });
  add({ kind: 'idle', model: 'serial', contention: true });
  for (const concurrency of [4, 16, 64])
    for (const model of ['native', 'pjs'])
      add({
        kind: 'scrypt',
        model,
        concurrency,
        workers: model === 'pjs' ? workers : 0,
        contention: true,
      });
  for (const workerCount of [1, 2])
    add({
      kind: 'scrypt',
      model: 'pjs',
      workers: workerCount,
      concurrency: 16,
      contention: true,
    });
  const named = cases.map((c) => ({
    ...c,
    id: [
      c.kind,
      c.algorithm ?? '',
      c.model,
      `s${c.size}`,
      `c${c.concurrency}`,
      `w${c.workers}`,
      c.ownership,
      `b${c.batch}`,
      `l${c.lanes}`,
      c.contention ? 'contention' : 'pure',
    ]
      .filter(Boolean)
      .join('-'),
  }));
  if (profile === 'full') return named;
  if (profile === 'smoke')
    return named.filter(
      (c) =>
        (c.kind === 'sha' &&
          c.size === 1024 &&
          c.algorithm === 'sha256' &&
          c.batch === 1) ||
        (c.kind === 'aes' && c.size === 1024) ||
        c.kind === 'idle' ||
        (c.kind === 'scrypt' && c.concurrency === 4) ||
        (c.kind === 'argon2' && c.lanes === 1 && c.workers <= 1) ||
        (c.kind === 'bcrypt' && c.concurrency === 1),
    );
  if (profile === 'reproduce')
    return named.filter(
      (c) =>
        (c.kind === 'sha' &&
          c.algorithm === 'sha256' &&
          [1024, 1048576, 8388608].includes(c.size) &&
          c.batch === 1 &&
          c.concurrency <= 16) ||
        (c.kind === 'scrypt' && [4, 16].includes(c.concurrency)) ||
        (c.kind === 'argon2' && [1, 4].includes(c.lanes) && c.workers !== 2) ||
        (c.kind === 'aes' && [1024, 1048576].includes(c.size)) ||
        c.kind === 'idle',
    );
  throw new Error(`Unknown profile ${profile}`);
}
