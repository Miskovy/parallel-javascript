import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { workload, serialEngine } from './workloads.mjs';
import { estimatedPayloadBytes, policy } from './config.mjs';

const [configPath, output] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
writeFileSync(output, '', { flag: 'wx' });
const report = {
  config,
  node: process.version,
  executable: process.execPath,
  resolution: import.meta.resolve('@pjavascript/runtime'),
  phases: [],
  status: 'failed',
  cleanup: false,
};
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
let engine;
try {
  if (freemem() < policy.minFreeMemoryBytes) {
    report.status = 'skipped';
    report.reason = 'Less than 1 GiB free memory before allocation';
  } else {
    assert.ok(config.workers <= policy.maxWorkers);
    assert.ok(estimatedPayloadBytes(config) < policy.maxPayloadBytes);
    const cold = performance.now();
    if (config.backend === 'pjs') {
      const registry = new PjsTaskRegistry();
      const task = registry.register(
        'campaign',
        new URL('./task.mjs', import.meta.url),
        'execute',
      );
      const resolution = registry.register(
        'resolution',
        new URL('./task.mjs', import.meta.url),
        'packageResolution',
      );
      const runtime = new PjsRuntime({
        registry,
        workers: config.workers,
        maxQueue: 64,
      });
      engine = {
        runtime,
        task,
        run: (input, options) => runtime.run(task, input, options),
        close: () => runtime.shutdown(),
      };
      await runtime.ready();
      report.coldStartupMs = performance.now() - cold;
      report.workerResolution = await runtime.run(resolution, null);
      assert.equal(report.workerResolution, report.resolution);
    } else if (config.backend === 'piscina') {
      const { Piscina } = await import('piscina');
      const pool = new Piscina({
        filename: fileURLToPath(new URL('./task.mjs', import.meta.url)),
        name: 'execute',
        minThreads: config.workers,
        maxThreads: config.workers,
      });
      engine = {
        run: (input, options) => pool.run(input, options),
        close: () => pool.destroy(),
      };
      // Readiness is represented by a real first dispatch for Piscina; disclose it.
      await pool.run(null, { name: 'packageResolution' });
      report.coldStartupMs = performance.now() - cold;
      report.startupIncludesReadinessDispatch = true;
    } else {
      engine = { ...serialEngine(), close: async () => {} };
      report.coldStartupMs = performance.now() - cold;
    }
    const work = workload(config, engine);
    if (work.skip) {
      report.status = 'skipped';
      report.reason = work.skip;
    } else {
      for (const phase of [
        'first',
        ...Array(policy.warmups).fill('warmup'),
        ...Array(policy.repetitions).fill('measurement'),
      ]) {
        const histogram = monitorEventLoopDelay({ resolution: 10 });
        histogram.enable();
        await delay(12); // Arm observation before the sample; excluded from wall time.
        const memoryBefore = process.memoryUsage(),
          cpu = process.cpuUsage();
        let peak = { ...memoryBefore },
          creditPeak = 0,
          bufferPeak = 0,
          timerDriftMs = 0;
        let scheduled = performance.now() + 10;
        const timer = setInterval(() => {
          const now = performance.now();
          timerDriftMs = Math.max(timerDriftMs, now - scheduled);
          scheduled = now + 10;
          const memory = process.memoryUsage();
          for (const key of Object.keys(peak))
            peak[key] = Math.max(peak[key], memory[key]);
          if (engine.runtime) {
            const stats = engine.runtime.stats();
            creditPeak = Math.max(
              creditPeak,
              stats.streamResults.currentReservedResultBytes,
            );
            bufferPeak = Math.max(bufferPeak, stats.streamResults.buffered);
          }
        }, 10);
        const utilization = performance.eventLoopUtilization(),
          start = performance.now();
        let result, failure;
        try {
          result = await work.invoke();
        } catch (error) {
          failure = error;
        }
        const wallMs = performance.now() - start;
        const cpuUsage = process.cpuUsage(cpu),
          memoryAfter = process.memoryUsage();
        // Let a timer scheduled during synchronous serial work observe its delay.
        // This observation turn is excluded from wall/CPU time and useful work.
        await delay(0);
        const eventLoop = performance.eventLoopUtilization(utilization);
        clearInterval(timer);
        histogram.disable();
        for (const key of Object.keys(peak))
          peak[key] = Math.max(peak[key], memoryAfter[key]);
        const sample = {
          phase,
          wallMs,
          workUnits: work.workUnits,
          unit: work.unit,
          unitsPerSecond: work.workUnits / (wallMs / 1000),
          cpuUsage,
          memoryBefore,
          memoryAfter,
          sampledPeak: peak,
          sampledCreditPeak: creditPeak,
          sampledBufferPeak: bufferPeak,
          eventLoop,
          eventLoopDelayMs: {
            mean: Number.isFinite(histogram.mean) ? histogram.mean / 1e6 : null,
            max: histogram.max / 1e6,
            p99: histogram.percentile(99) / 1e6,
          },
          timerDriftMs,
          validated: false,
        };
        report.phases.push(sample);
        if (failure) throw failure;
        work.validate(result);
        sample.validated = true;
        if (result?.arrival)
          sample.delivery = {
            arrival: result.arrival,
            firstResultMs: result.firstResultMs,
            stats: result.stats,
          };
        if (result?.ordinary) sample.fairness = result;
        save();
      }
      report.status = 'accepted';
    }
  }
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  try {
    await engine?.close();
    if (engine?.runtime) {
      report.finalStats = engine.runtime.stats();
      assert.equal(report.finalStats.state, 'stopped');
      assert.equal(report.finalStats.tasks.pending, 0);
      assert.equal(report.finalStats.workers.busy, 0);
      assert.equal(report.finalStats.activeOperations.length, 0);
      assert.equal(
        report.finalStats.streamResults.currentReservedResultBytes,
        0,
      );
    }
    report.cleanup = true;
  } catch (error) {
    report.status = 'failed';
    report.cleanupFailure = error.message;
    process.exitCode = 1;
  }
  save();
}
