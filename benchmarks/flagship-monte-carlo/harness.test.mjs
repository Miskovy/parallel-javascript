import assert from 'node:assert/strict';
import test from 'node:test';
import { uniform, normal, mix32 } from './src/prng.mjs';
import { createModel, shareModel, modelBytes } from './src/model.mjs';
import { simulate, reduceResults, compensated } from './src/kernel.mjs';
import { partition, execute, shuffled } from './src/scheduling.mjs';
import {
  percentile,
  summarize,
  practicalWin,
  speedup,
  efficiency,
} from './src/stats.mjs';
import { assertPackage } from './src/provenance.mjs';
import { validateTrial } from './src/schema.mjs';
import { summary } from './analyze.mjs';
import { config } from './config.mjs';
import { command } from './prepare-consumer.mjs';

test('PRNG frozen integer vector, open uniforms, dimension/index determinism', () => {
  assert.deepEqual([0, 1, 0xffffffff].map(mix32), [0, 1753845952, 1734902346]);
  const values = Array.from({ length: 100 }, (_, i) =>
    uniform(config.seed, i, 3),
  );
  assert.deepEqual(
    values,
    Array.from({ length: 100 }, (_, i) => uniform(config.seed, i, 3)),
  );
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every((v) => v > 0 && v < 1));
  assert.equal(normal(123, 4, 5), normal(123, 4, 5));
  assert.notEqual(normal(123, 4, 5), normal(123, 4, 6));
});

test('model deterministic, shared copy equivalent, correlation reconstruction', () => {
  const model = createModel(config);
  assert.deepEqual(model, createModel(config));
  assert.equal(modelBytes(model), 149504);
  const shared = shareModel(model);
  assert.deepEqual(shared, model);
  assert.ok(shared.loadings.buffer instanceof SharedArrayBuffer);
  const f = model.factors;
  for (let i = 0; i < f; i++)
    for (let j = 0; j < f; j++) {
      let value = 0;
      for (let k = 0; k < f; k++)
        value += model.cholesky[i * f + k] * model.cholesky[j * f + k];
      assert.ok(Math.abs(value - (i === j ? 1 : 0.2)) < 1e-14);
    }
});

test('partition exhaustively covers indices with no duplicates/empty chunks', () => {
  for (let n = 1; n <= 47; n++)
    for (const chunks of [1, 3, 8, 64]) {
      const indices = partition(n, chunks).flatMap(({ start, end }) =>
        Array.from({ length: end - start }, (_, i) => start + i),
      );
      assert.deepEqual(
        indices,
        Array.from({ length: n }, (_, i) => i),
      );
    }
  assert.throws(() => partition(0, 2));
});

test('delta-gamma analytical one-position fixture and deterministic paths', () => {
  const model = {
    factors: 1,
    positions: 1,
    cholesky: new Float64Array([1]),
    loadings: new Float64Array([2]),
    delta: new Float64Array([3]),
    gamma: new Float64Array([4]),
  };
  const r = simulate({
    model,
    seed: 7,
    start: 0,
    end: 1,
    id: 0,
    mode: 'distribution',
  });
  const shock = 2 * normal(7, 0, 0);
  assert.equal(r.output[0], 3 * shock + 0.5 * 4 * shock * shock);
  const fullModel = createModel(config);
  const results = partition(37, 8).map((c) =>
    simulate({
      ...c,
      model: fullModel,
      seed: config.seed,
      mode: 'distribution',
    }),
  );
  const whole = simulate({
    id: 0,
    start: 0,
    end: 37,
    model: fullModel,
    seed: config.seed,
    mode: 'distribution',
  });
  const reduced = reduceResults(results.reverse(), 'distribution');
  assert.deepEqual(reduced.output, whole.output);
  assert.equal(reduced.summary.checksum, whole.checksum);
  assert.throws(() => reduceResults([results[0]], 'aggregate'));
  assert.equal(compensated([1e16, 1, -1e16]), 1);
  assert.ok(reduced.summary.expectedShortfall99 >= reduced.summary.var99);
});

test('bounded driver survives out-of-order completions and retains logical order', async () => {
  let active = 0,
    peak = 0;
  const pool = {
    async run(input) {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, input.id % 2 ? 1 : 3));
      active--;
      return { id: input.id, workerStart: 0, workerEnd: 1 };
    },
  };
  const r = await execute(
    pool,
    { simulations: 37, chunks: 16, workers: 2, seed: 7, mode: 'aggregate' },
    {},
  );
  assert.equal(peak, 4);
  assert.deepEqual(
    r.results.map((x) => x.id),
    Array.from({ length: 16 }, (_, i) => i),
  );
  assert.deepEqual(shuffled([1, 2, 3, 4], 7), shuffled([1, 2, 3, 4], 7));
});

test('statistics, percentiles, speedup, efficiency, deterministic intervals', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 1), 4);
  const s = summarize([1, 2, 3, 4]);
  assert.equal(s.mean, 2.5);
  assert.ok(Math.abs(s.sd - Math.sqrt(5 / 3)) < 1e-14);
  assert.deepEqual(s, summarize([1, 2, 3, 4]));
  assert.equal(speedup(100, 25), 4);
  assert.equal(efficiency(100, 25, 2), 2);
  assert.ok(practicalWin(summarize([1, 1, 1]), summarize([2, 2, 2])));
  assert.ok(!practicalWin(summarize([1, 1, 1]), summarize([1.01, 1.01, 1.01])));
});

test('public package resolution rejects links, versions, nonregistry artifacts', () => {
  const info = {
    name: '@pjavascript/runtime',
    version: '1.0.0-rc.2',
    packagePath: '/tmp/consumer/node_modules/@pjavascript/runtime/package.json',
    resolved: 'https://registry.npmjs.org/a.tgz',
    integrity: 'sha512-test',
  };
  assertPackage(info, '/tmp/consumer', info.name, info.version);
  for (const mutation of [
    { version: '1.0.0-rc.3' },
    { version: '1.0.0-rc.2-extra' },
    { packagePath: '/repo/packages/runtime/package.json' },
    { resolved: 'file:local.tgz' },
    { integrity: '' },
  ])
    assert.throws(() =>
      assertPackage(
        { ...info, ...mutation },
        '/tmp/consumer',
        info.name,
        info.version,
      ),
    );
});

test('failure schema and analysis retain failures and reject malformed evidence', () => {
  const row = {
    type: 'trial',
    status: 'failure',
    error: 'timeout',
    campaign: config.campaign,
    stage: 'primary',
    contender: 'pjs',
    transport: 'shared',
    mode: 'aggregate',
    problemSize: 'small',
    simulations: 37,
    positions: 1024,
    factors: 16,
    workers: 2,
    chunks: 8,
    trial: 1,
    environment: {},
    packages: {},
  };
  validateTrial(row);
  assert.equal(summary([row]).failures, 1);
  assert.throws(() => validateTrial({ ...row, chunks: 0 }));
  assert.throws(() => summary([row, row]));
});

test('successful schema, grouped medians and serial-relative analysis', () => {
  const row = {
    type: 'trial',
    status: 'ok',
    campaign: config.campaign,
    stage: 'primary',
    contender: 'serial',
    transport: 'shared',
    mode: 'aggregate',
    problemSize: 'small',
    simulations: 2,
    positions: 1024,
    factors: 16,
    workers: 1,
    chunks: 1,
    trial: 1,
    environment: {},
    packages: {},
    wallMs: 100,
    simulationMs: 100,
    reductionMs: 1,
    cpuUserMs: 90,
    cpuSystemMs: 1,
    peakRssBytes: 10,
    processHighWaterRssBytes: 12,
    initialMemory: { rss: 8 },
    finalMemory: { rss: 9, heapUsed: 3, external: 1, arrayBuffers: 1 },
    deltaRssBytes: 1,
    eventLoop: { timerP95Ms: 1, timerP99Ms: 1, timerMaxMs: 1, elu: 0.5 },
    taskLatency: { p50: 1, p95: 1, p99: 1 },
    sharedPreparationMs: 0,
    modelGenerationMs: 1,
    startupMs: 0,
    firstResultMs: 1,
    computeEndToEndMs: 101,
    resultValidation: { count: 2, checksum: 123 },
    cleanup: true,
    tasks: [
      {
        id: 0,
        start: 0,
        end: 2,
        submitted: 0,
        completed: 100,
        workerStart: 1,
        workerEnd: 99,
      },
    ],
  };
  validateTrial(row);
  assert.throws(() =>
    validateTrial({ ...row, tasks: [{ ...row.tasks[0], start: 1 }] }),
  );
  assert.throws(() => validateTrial({ ...row, cleanup: false }));
  assert.throws(() => validateTrial({ ...row, wallMs: NaN }));
  const report = summary([
    row,
    { ...row, trial: 2, wallMs: 120 },
    { ...row, contender: 'pjs', workers: 2, wallMs: 25 },
  ]);
  const pjs = report.cells.find((c) => c.contender === 'pjs');
  assert.equal(pjs.throughput, 80);
  assert.equal(pjs.speedup, 110 / 25);
  assert.equal(pjs.efficiency, 110 / 25 / 2);
  assert.equal(report.failures, 0);
});

test('child timeout and crash become explicit errors without forced success exits', async () => {
  await assert.rejects(
    command(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      process.cwd(),
      100,
    ),
    /timeout=true/,
  );
  await assert.rejects(
    command(
      process.execPath,
      ['-e', 'throw new Error("fixture crash")'],
      process.cwd(),
      5000,
    ),
    /fixture crash/,
  );
});
