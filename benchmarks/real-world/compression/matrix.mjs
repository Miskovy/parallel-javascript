import { availableParallelism } from 'node:os';
import { MiB } from './core.mjs';
export function matrix(profile = 'full') {
  if (!['full', 'smoke', 'reproduce', 'memory'].includes(profile))
    throw new RangeError('unknown profile');
  const result = [];
  function add(group, overrides) {
    const config = {
      group,
      bytes: 32 * MiB,
      grain: MiB,
      corpus: 'moderate',
      level: 6,
      direction: 'deflate',
      model: 'pjs',
      ownership: 'shared',
      workers: 4,
      count: 16,
      byteMaxima: 4,
      credit: 'upper',
      consumerMs: 0,
      concurrency: 4,
      contention: false,
      deep: false,
      ...overrides,
    };
    config.id = [
      group,
      config.direction,
      config.corpus,
      config.grain,
      `l${config.level}`,
      config.model,
      config.ownership,
      `w${config.workers}`,
      config.credit,
      `b${config.byteMaxima}`,
      `n${config.count}`,
      `s${config.consumerMs}`,
      `q${config.concurrency}`,
    ].join('-');
    if (!result.some((r) => r.id === config.id)) result.push(config);
  }
  if (profile === 'smoke') {
    for (const model of ['serial', 'native', 'pjs', 'raw'])
      for (const direction of ['deflate', 'inflate'])
        add('smoke', {
          model,
          direction,
          credit: direction === 'inflate' ? 'exact' : 'upper',
          bytes: 2 * MiB,
        });
    add('smoke-transfer', { ownership: 'transfer', bytes: 2 * MiB });
    return result;
  }
  if (profile === 'memory') {
    for (const corpus of ['high', 'poor'])
      for (const credit of ['upper', 'held', 'count'])
        add('memory', {
          corpus,
          credit,
          consumerMs: 1,
          count: 64,
          byteMaxima: 2,
        });
    return result;
  }
  for (const corpus of ['high', 'moderate', 'poor'])
    for (const grain of profile === 'full'
      ? [64 * 1024, 256 * 1024, MiB, 4 * MiB]
      : [64 * 1024, MiB])
      for (const level of profile === 'full' ? [1, 6] : [6])
        for (const model of ['serial', 'native', 'pjs', 'raw'])
          add('primary', { corpus, grain, level, model });
  for (const model of ['serial', 'native', 'pjs', 'raw'])
    add('tiny', { grain: 1024, bytes: MiB, corpus: 'high', model });
  for (const ownership of ['clone', 'transfer', 'shared'])
    for (const model of ['pjs', 'raw'])
      for (const corpus of profile === 'full' ? ['high', 'poor'] : ['high'])
        add('ownership', { ownership, model, corpus, grain: 4 * MiB });
  for (const corpus of ['high', 'moderate', 'poor'])
    for (const model of ['serial', 'native', 'pjs', 'raw'])
      add('decompression', {
        corpus,
        model,
        direction: 'inflate',
        credit: 'exact',
      });
  for (const corpus of ['high', 'poor'])
    for (const consumerMs of [0, 1])
      for (const byteMaxima of profile === 'full' ? [1, 4, 16] : [1, 4])
        add('capacity', { corpus, consumerMs, byteMaxima, count: 64 });
  for (const count of [4, 16, 64])
    add('count', { corpus: 'high', count, consumerMs: 1, byteMaxima: 16 });
  for (const credit of ['count', 'upper', 'held'])
    for (const consumerMs of [0, 1])
      add('refund', {
        corpus: 'high',
        credit,
        consumerMs,
        byteMaxima: 2,
        count: 64,
      });
  for (const workers of [...new Set([1, 2, 4, availableParallelism()])])
    add('contention', { corpus: 'poor', workers, contention: true });
  for (const concurrency of [4, 16, 64])
    add('contention', {
      corpus: 'poor',
      model: 'native',
      concurrency,
      contention: true,
    });
  add('contention', { corpus: 'poor', model: 'serial', contention: true });
  if (profile === 'full') {
    for (const concurrency of [4, 8, 16, 32, 64])
      add('queue', { corpus: 'poor', concurrency, deep: true });
    for (const model of ['serial', 'native', 'pjs', 'raw'])
      add('level9', { level: 9, model });
  }
  return result;
}
