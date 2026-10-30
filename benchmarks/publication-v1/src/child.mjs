import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { config } from '../config.mjs';
import { createPool, dispatch } from './adapters.mjs';
import { identities, digest } from './identity.mjs';
import { prepare, collect, validate } from './kernels.mjs';
import { startMetrics } from './metrics.mjs';

const [inputPath, outputPath] = process.argv.slice(2);
const job = JSON.parse(readFileSync(inputPath));
const record = {
  job,
  status: 'running',
  phases: [],
  hostIdentities: identities(),
  node: { version: process.version, execPath: process.execPath },
};
let pool;
const begin = performance.now();
function runPrepared(tasks, onFirst) {
  return dispatch(
    pool,
    tasks,
    job.contender === 'serial' ? 1 : 2 * job.spec.workers,
    onFirst,
  ).then((r) => collect(job.spec, r));
}
try {
  assert.equal(process.versions.node, config.node);
  // References were computed by the campaign host, outside these fresh trial
  // processes. Reading them does not JIT-warm the serial kernel before cold.
  const referenceBytes = readFileSync(job.referencePath);
  record.referenceSha256 = digest(referenceBytes);
  assert.equal(record.referenceSha256, job.referenceSha256);
  const reference =
    job.spec.family === 'image'
      ? new Uint8Array(referenceBytes)
      : JSON.parse(referenceBytes);
  let started = performance.now();
  const coldTasks = prepare(job.spec);
  record.coldInputPreparationMs = performance.now() - started;
  const coldStart = performance.now();
  pool = createPool(job.contender, job.spec.workers);
  await pool.ready();
  record.readinessMs = performance.now() - coldStart;
  let firstResultMs;
  const cold = await runPrepared(coldTasks, () => {
    firstResultMs = performance.now() - coldStart;
  });
  record.cold = {
    firstUsefulResultMs: firstResultMs,
    completedWorkloadMs: performance.now() - coldStart,
  };
  validate(job.spec, cold, reference);
  // Worker probes are outside timed phases; each reply verifies actual ESM
  // resolution from the installed consumer. Keep all observed worker identities.
  record.workerProbes = await Promise.all(
    Array.from({ length: job.spec.workers }, () =>
      pool.run({ op: 'identity' }),
    ),
  );
  for (const probe of record.workerProbes) {
    assert.deepEqual(probe.identities, record.hostIdentities);
    assert.equal(probe.isMainThread, job.contender === 'serial');
  }
  for (let i = 0; i <= config.warmups; i++) {
    started = performance.now();
    const tasks = prepare(job.spec);
    const preparationMs = performance.now() - started;
    const finishMetrics = i === config.warmups ? await startMetrics() : null;
    started = performance.now();
    const output = await runPrepared(tasks);
    const wallMs = performance.now() - started;
    const metrics = finishMetrics ? await finishMetrics() : null;
    const phase = {
      phase: i === config.warmups ? 'measured' : 'warmup',
      index: i,
      preparationMs,
      wallMs,
      metrics,
    };
    record.phases.push(phase);
    validate(job.spec, output, reference);
    if (job.spec.mode === 'transfer')
      for (const task of tasks)
        assert.equal(
          task.input.byteLength,
          0,
          'Transfer must detach host input',
        );
    else if (job.spec.family === 'image')
      for (const task of tasks)
        assert.ok(task.input.byteLength > 0, 'Clone must retain host input');
  }
  // Smoke additionally exercises rejection recovery using the same task API.
  if (job.profile === 'smoke') {
    await assert.rejects(
      async () => pool.run({ op: 'throw' }),
      /intentional benchmark worker error/,
    );
    const recovered = await pool.run({ op: 'identity' });
    assert.deepEqual(recovered.identities, record.hostIdentities);
    record.errorRecovery = 'passed';
  }
  record.status = 'passed';
} catch (error) {
  record.status = 'failed';
  record.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  const cleanupStart = performance.now();
  try {
    await pool?.close();
    record.cleanup = 'awaited';
  } catch (error) {
    record.cleanup = 'failed';
    record.cleanupError = error.stack;
    record.status = 'failed';
    process.exitCode = 1;
  }
  record.cleanupMs = performance.now() - cleanupStart;
  record.childTotalMs = performance.now() - begin;
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n', {
    flag: 'wx',
  });
}
