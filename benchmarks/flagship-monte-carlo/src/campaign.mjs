import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { config } from '../config.mjs';

export function cells(
  profile,
  settings = config,
  capacity = availableParallelism(),
) {
  const workers = [...new Set([1, 2, 4, capacity])]
    .filter((p) => p <= capacity)
    .sort((a, b) => a - b);
  const representative = Math.min(4, capacity);
  const result = [];
  function add(
    stage,
    contender,
    problemSize,
    p,
    transport = 'shared',
    mode = 'aggregate',
    multiplier = settings.neutralGrain,
  ) {
    const simulations = profile === 'smoke' ? 37 : settings.sizes[problemSize];
    result.push({
      stage,
      contender,
      problemSize,
      workers: p,
      transport,
      mode,
      simulations,
      chunks: Math.min(simulations, multiplier * p),
    });
  }
  if (profile === 'smoke') {
    for (const contender of ['serial', 'raw', 'piscina', 'pjs'])
      for (const transport of ['clone', 'shared'])
        for (const mode of ['aggregate', 'distribution'])
          add(
            'smoke',
            contender,
            'smoke',
            Math.min(2, capacity),
            transport,
            mode,
          );
    return result;
  }
  assert.ok(
    settings.sizes,
    'Run serial calibration and commit frozen config first',
  );
  for (const multiplier of [1, 4, 16, 64])
    for (const contender of ['raw', 'piscina', 'pjs'])
      add(
        'grain',
        contender,
        'medium',
        representative,
        'shared',
        'aggregate',
        multiplier,
      );
  for (const size of ['small', 'medium', 'large']) {
    add('primary', 'serial', size, 1);
    for (const p of workers)
      for (const contender of ['raw', 'piscina', 'pjs'])
        add('primary', contender, size, p);
  }
  for (const contender of ['serial', 'raw', 'piscina', 'pjs'])
    add(
      'distribution',
      contender,
      'medium',
      contender === 'serial' ? 1 : representative,
      'shared',
      'distribution',
    );
  for (const size of ['medium', 'large'])
    for (const contender of ['raw', 'piscina', 'pjs'])
      for (const transport of ['clone', 'shared'])
        add('transport', contender, size, representative, transport);
  for (const contender of ['serial', 'raw', 'piscina', 'pjs'])
    add(
      'cold',
      contender,
      'medium',
      contender === 'serial' ? 1 : representative,
    );
  return result;
}
