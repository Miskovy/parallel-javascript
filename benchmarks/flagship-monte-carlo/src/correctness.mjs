import assert from 'node:assert/strict';
import { config } from '../config.mjs';
import { createModel, shareModel } from './model.mjs';
import { simulate, reduceResults } from './kernel.mjs';
import { createPool, sharedReadonly } from './contenders/index.mjs';
import { execute } from './scheduling.mjs';

export async function correctness() {
  const model = createModel(config),
    options = {
      ...config,
      simulations: 37,
      chunks: 8,
      workers: 2,
      mode: 'distribution',
    };
  const oracle = simulate({
    model,
    seed: config.seed,
    start: 0,
    end: 37,
    id: 0,
    mode: 'distribution',
  });
  const expected = reduceResults([oracle], 'distribution');
  const checks = [];
  for (const contender of ['serial', 'raw', 'piscina', 'pjs']) {
    for (const transport of ['clone', 'shared']) {
      const input =
        transport === 'shared'
          ? shareModel(model, contender === 'pjs' ? sharedReadonly : undefined)
          : model;
      const pool = createPool(contender, 2);
      try {
        await pool.ready();
        const { results } = await execute(pool, options, input);
        const actual = reduceResults(results, 'distribution');
        assert.deepEqual(actual.output, expected.output);
        assert.equal(actual.summary.checksum, expected.summary.checksum);
        const reference = results.map((r) =>
          simulate({ model, ...options, start: r.start, end: r.end, id: r.id }),
        );
        assert.deepEqual(
          actual.summary,
          reduceResults(reference, 'distribution').summary,
        );
        const aggregate = await execute(
          pool,
          { ...options, mode: 'aggregate' },
          input,
        );
        const aggregateReference = reference.map((r) => ({
          ...r,
          output: null,
        }));
        assert.deepEqual(
          reduceResults(aggregate.results, 'aggregate'),
          reduceResults(aggregateReference, 'aggregate'),
        );
        checks.push({
          contender,
          transport,
          paths: 37,
          bitwisePaths: true,
          exactOrderedAggregate: true,
          cleanup: true,
        });
      } finally {
        await pool.close();
      }
    }
  }
  return checks;
}

if (process.argv[2] === '--correctness')
  console.log(JSON.stringify(await correctness()));
