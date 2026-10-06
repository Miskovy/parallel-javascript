import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { createModel, shareModel, modelBytes } from './model.mjs';
import { createPool, sharedReadonly } from './contenders/index.mjs';
import { execute } from './scheduling.mjs';
import { reduceResults, simulate } from './kernel.mjs';
import { startMetrics } from './metrics.mjs';
import { percentile } from './stats.mjs';
import { provenance } from './provenance.mjs';

async function run(options) {
  const packages = provenance(process.cwd());
  const startModel = performance.now(),
    canonical = createModel(options);
  const modelGenerationMs = performance.now() - startModel;
  const cold = options.stage === 'cold';
  let pool,
    stopMetrics,
    closed = false;
  const sessionStart = performance.now();
  try {
    const prepStart = performance.now();
    const model =
      options.transport === 'shared'
        ? shareModel(
            canonical,
            options.contender === 'pjs' ? sharedReadonly : undefined,
          )
        : canonical;
    const sharedPreparationMs = performance.now() - prepStart;
    if (cold) stopMetrics = await startMetrics();
    const constructionStart = performance.now();
    pool = createPool(options.contender, options.workers);
    await pool.ready();
    const startupMs = performance.now() - constructionStart;
    if (!cold) {
      for (let i = 0; i < options.warmups; i++)
        await execute(pool, options, model);
      stopMetrics = await startMetrics();
    }
    const started = performance.now();
    const epochStarted =
      performance.timeOrigin + (cold ? constructionStart : started);
    let firstResultMs;
    const { results, tasks } = await execute(pool, options, model, (t) => {
      firstResultMs = t - epochStarted;
    });
    const simulationMs = performance.now() - started;
    const reductionStart = performance.now();
    const reduced = reduceResults(results, options.mode);
    const reductionMs = performance.now() - reductionStart;
    const computeEndToEndMs = performance.now() - started;
    if (cold) {
      await pool.close();
      closed = true;
    }
    const coldMs = performance.now() - constructionStart + sharedPreparationMs;
    const metrics = await stopMetrics();
    stopMetrics = null;
    if (!closed) {
      await pool.close();
      closed = true;
    }
    // Independent serial validation AFTER measurement avoids prewarming cold serial.
    const oracle = simulate({
      model: canonical,
      seed: options.seed,
      start: 0,
      end: options.simulations,
      id: 0,
      mode: options.mode,
    });
    const oraclePaths = oracle.output;
    assert.equal(reduced.summary.count, options.simulations);
    assert.equal(reduced.summary.checksum, oracle.checksum);
    assert.equal(reduced.summary.minimum, oracle.minimum);
    assert.equal(reduced.summary.maximum, oracle.maximum);
    for (const key of ['sum', 'sumSquares'])
      assert.ok(
        Math.abs(reduced.summary[key] - oracle[key]) <=
          1e-10 * Math.max(1, Math.abs(oracle[key])),
        `${key} mismatch`,
      );
    if (oraclePaths) assert.deepEqual(reduced.output, oraclePaths);
    const latencies = tasks.map((t) => t.latencyMs);
    return {
      ...metrics,
      packages,
      modelBytes: modelBytes(canonical),
      modelGenerationMs,
      sharedPreparationMs,
      startupMs,
      firstResultMs,
      simulationMs,
      reductionMs,
      computeEndToEndMs,
      coldMs: cold ? coldMs : null,
      wallMs: cold ? coldMs : simulationMs,
      sessionMs: performance.now() - sessionStart,
      taskLatency: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
        max: Math.max(...latencies),
      },
      tasks,
      resultValidation: {
        ...reduced.summary,
        checksumMatches: true,
        perPathMatches: !!oraclePaths,
      },
      cleanup: true,
    };
  } finally {
    if (stopMetrics) await stopMetrics();
    if (pool && !closed) await pool.close();
  }
}

const options = JSON.parse(process.argv[2]);
if (options.provenanceOnly)
  console.log(
    JSON.stringify({
      ...provenance(process.cwd()),
      metadata: JSON.parse(readFileSync('provenance.json', 'utf8')),
    }),
  );
else console.log(JSON.stringify(await run(options)));
