import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freemem, totalmem, tmpdir, loadavg } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { sharedReadonly } from '@pjavascript/runtime';
import { executor } from './executors.mjs';
import { bcrypt, compute, scryptOptions, argonOptions } from './task.mjs';
import {
  distribution,
  environment,
  sourceHashes,
  command,
} from './support.mjs';
import { matrix } from './matrix.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')),
);
const profile = args.profile ?? 'full';
const output = args.output ?? `benchmarks/results/crypto-v0.13-${profile}.json`;
const trials = profile === 'smoke' ? 1 : 6;
const targetMs = profile === 'smoke' ? 40 : 350;
const before = sourceHashes();
const temporary = await mkdtemp(join(tmpdir(), 'pjs-crypto-'));
const probeFile = join(temporary, 'probe.bin');
await writeFile(probeFile, Buffer.alloc(4096, 42));
const report = {
  schema: 1,
  milestone: 'v0.13',
  profile,
  environment: environment(),
  implementationCommit: '18f0c87e7b7920179403bbc396afabced6bb06c4',
  runtimeMatchesImplementation:
    command('git', [
      'diff',
      '18f0c87e7b7920179403bbc396afabced6bb06c4',
      '--',
      'packages/runtime/src',
    ]) === '',
  runtimeBefore: before,
  harnessHashes: sourceHashes('benchmarks/real-world/crypto'),
  parameters: {
    scrypt: scryptOptions,
    argon2id: argonOptions,
    bcryptCost: 10,
    password: 'synthetic benchmark-only password',
    saltBytes: 16,
    derivedBytes: 32,
    aes: { algorithm: 'aes-256-gcm', keyBytes: 32, ivBytes: 12, tagBytes: 16 },
  },
  protocol: {
    warmups: 2,
    retainedTrials: trials,
    targetMs,
    maxQueue: 256,
    probeIntervalMs: 10,
    order:
      'deterministic shuffled cells (seed 130); sequential trials per warm pool',
    memory:
      'reject estimates above min(50% currently free RAM, 25% total RAM); 128 MiB AES retained-output cap',
    latency: 'closed-loop job latency; batching counts operations separately',
    queueQuantiles: 'unavailable: public PJS statistics provide means only',
    memoryScope:
      'RSS process-wide; heap/external/arrayBuffers main isolate only; 10 ms sampled peak is a lower bound',
    contextSwitchScope: 'process.resourceUsage deltas, platform-dependent',
    transfer:
      'input ownership moves to worker and back on every job; input allocation outside timing',
    aes: 'encryption and ciphertext+tag return timed; decrypt and tamper checks outside timing',
  },
  cells: [],
  skips: [],
  complete: false,
};
// Exclude installed dependencies from the provenance manifest.
report.harnessHashes = Object.fromEntries(
  Object.entries(report.harnessHashes).filter(
    ([p]) => !p.includes('/node_modules/'),
  ),
);
async function save() {
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}

function threadCount() {
  try {
    return readdirSync('/proc/self/task').length;
  } catch {
    return null;
  }
}

function resourceEstimate(c) {
  const active = Math.min(
    c.concurrency,
    c.model === 'native'
      ? Number(process.env.UV_THREADPOOL_SIZE ?? 4)
      : c.workers || 1,
  );
  const native =
    c.kind === 'scrypt'
      ? scryptOptions.maxmem
      : c.kind === 'argon2'
        ? argonOptions.memory * 1024 * 1.25
        : 0;
  return (
    96 * 1024 ** 2 +
    c.workers * 32 * 1024 ** 2 +
    active * native +
    c.concurrency * c.size * 3 +
    (c.kind === 'aes' ? 128 * 1024 ** 2 : 0)
  );
}

function fixture(c, count) {
  const password = 'synthetic benchmark-only password';
  const salt = new Uint8Array(16).fill(0x13);
  const plain = new Uint8Array(c.size).fill(0x5a);
  // Benchmark inputs are deliberately repeated, independent jobs, not a unique-data corpus.
  const inputs = Array.from({ length: c.concurrency }, () => ({
    ...c,
    password,
    salt,
    bcryptSalt: '$2b$10$abcdefghijklmnopqrstuu',
    data: c.ownership === 'shared' ? sharedReadonly(plain) : plain.slice(),
  }));
  const key = crypto.randomBytes(32);
  const aad = Buffer.from('PJS benchmark only');
  // Fresh key per trial; unique IV per encryption under that key, including warmups.
  const ivs = Array.from({ length: count }, (_, i) => {
    const iv = Buffer.alloc(12);
    iv.writeBigUInt64BE(BigInt(i), 4);
    return iv;
  });
  let expected;
  if (c.kind === 'sha')
    expected = crypto.createHash(c.algorithm).update(plain).digest('hex');
  else if (!['aes', 'idle'].includes(c.kind))
    expected = compute(inputs[0]).value;
  return { inputs, plain, key, aad, ivs, expected };
}

function validate(c, f, results) {
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (c.kind === 'sha') {
      assert.equal(result.value.length, c.batch);
      for (const digest of result.value) assert.equal(digest, f.expected);
    } else if (c.kind === 'aes') {
      const decrypt = (tag) => {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          f.key,
          f.ivs[i],
        );
        decipher.setAAD(f.aad);
        decipher.setAuthTag(tag);
        return Buffer.concat([
          decipher.update(result.value.ciphertext),
          decipher.final(),
        ]);
      };
      assert.deepEqual(decrypt(result.value.tag), Buffer.from(f.plain));
      const tampered = Buffer.from(result.value.tag);
      tampered[0] ^= 1;
      assert.throws(() => decrypt(tampered));
    } else assert.equal(result.value, f.expected);
  }
}

async function measure(c, pool, count) {
  const f = fixture(c, count);
  const results = new Array(count);
  const latency = [];
  const admission = [];
  const execution = [];
  const timer = [];
  const fsLatency = [];
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  await delay(20);
  histogram.reset();
  let stopped = false;
  let nextTimer = performance.now() + 10;
  let maxQueue = 0;
  let samples = 0;
  let busyTotal = 0;
  const threadsBefore = threadCount();
  let peakThreads = threadsBefore;
  const peak = { ...process.memoryUsage() };
  function sample() {
    const threads = threadCount();
    if (threads !== null) peakThreads = Math.max(peakThreads, threads);
    const memory = process.memoryUsage();
    for (const key of Object.keys(peak))
      peak[key] = Math.max(peak[key], memory[key]);
    const stats = pool.stats?.();
    if (stats) {
      maxQueue = Math.max(maxQueue, stats.queue.size);
      busyTotal += stats.workers.busy;
      samples++;
    }
  }
  const interval = setInterval(() => {
    const now = performance.now();
    timer.push(Math.max(0, now - nextTimer));
    nextTimer = now + 10;
    sample();
  }, 10);
  const fsProbe = c.contention
    ? (async () => {
        while (!stopped) {
          const start = performance.now();
          await readFile(probeFile);
          fsLatency.push(performance.now() - start);
          await delay(10);
        }
      })()
    : Promise.resolve();
  const startStats = pool.stats?.();
  const memoryBefore = process.memoryUsage();
  const resourceBefore = process.resourceUsage();
  const cpuStart = process.cpuUsage();
  const eluStart = performance.eventLoopUtilization();
  const start = performance.now();
  let next = 0;
  async function lane(laneIndex) {
    const input = f.inputs[laneIndex];
    while (next < count) {
      const index = next++;
      if (c.kind === 'aes')
        Object.assign(input, { key: f.key, aad: f.aad, iv: f.ivs[index] });
      const submitted = performance.timeOrigin + performance.now();
      const result = await pool.run(input);
      const ended = performance.timeOrigin + performance.now();
      latency.push(ended - submitted);
      if (result.started !== null)
        admission.push(Math.max(0, result.started - submitted));
      if (result.executionMs !== null) execution.push(result.executionMs);
      if (c.ownership === 'transfer') {
        input.data = result.data;
        delete result.data;
      }
      results[index] = result;
    }
  }
  try {
    if (c.kind === 'idle') await delay(targetMs);
    else
      await Promise.all(
        Array.from(
          { length: c.model === 'serial' ? 1 : c.concurrency },
          (_, i) => lane(i),
        ),
      );
  } catch (error) {
    stopped = true;
    clearInterval(interval);
    histogram.disable();
    await fsProbe;
    throw error;
  } finally {
    stopped = true;
  }
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuStart);
  const elu = performance.eventLoopUtilization(eluStart);
  const resourceAfter = process.resourceUsage();
  const memoryAfter = process.memoryUsage();
  sample();
  // Allow a timer delayed by a serial burst to fire, avoiding false zero-delay results.
  await delay(12);
  clearInterval(interval);
  histogram.disable();
  await fsProbe;
  const endStats = pool.stats?.();
  const differenceMean = (field, n) =>
    endStats
      ? (endStats.timing[field] * endStats.timing[n] -
          startStats.timing[field] * startStats.timing[n]) /
        (endStats.timing[n] - startStats.timing[n])
      : null;
  const validationStart = performance.now();
  if (c.kind !== 'idle') validate(c, f, results);
  const executionSummary = distribution(execution);
  return {
    count: c.kind === 'idle' ? 0 : count,
    operations: c.kind === 'idle' ? 0 : count * c.batch,
    wallMs,
    opsPerSecond: c.kind === 'idle' ? null : (count * c.batch * 1000) / wallMs,
    latencyMs: distribution(latency),
    admissionToBodyMs: distribution(admission),
    executionMs: executionSummary,
    queueMs: {
      p50: null,
      p95: null,
      p99: null,
      mean: differenceMean('averageQueueMs', 'queueSamples'),
    },
    runtimeExecutionMeanMs: differenceMean(
      'averageExecutionMs',
      'executionSamples',
    ),
    cpuPercent: (cpu.user + cpu.system) / (wallMs * 10),
    cpuMicroseconds: cpu,
    eventLoopUtilization: elu,
    eventLoopDelayMs: histogram.count
      ? {
          mean: histogram.mean / 1e6,
          max: histogram.max / 1e6,
          p95: histogram.percentile(95) / 1e6,
          p99: histogram.percentile(99) / 1e6,
        }
      : null,
    timerDelayMs: distribution(timer),
    filesystemLatencyMs: distribution(fsLatency),
    memoryBefore,
    memoryAfter,
    sampledPeakMemory: peak,
    processLifetimeMaxRssKiB: resourceAfter.maxRSS,
    processThreads: { before: threadsBefore, sampledPeak: peakThreads },
    contextSwitches: {
      voluntary:
        resourceAfter.voluntaryContextSwitches -
        resourceBefore.voluntaryContextSwitches,
      involuntary:
        resourceAfter.involuntaryContextSwitches -
        resourceBefore.involuntaryContextSwitches,
    },
    sampledWorkerBusyFraction: samples
      ? busyTotal / (samples * c.workers)
      : null,
    taskBodyOccupancy:
      c.workers && executionSummary
        ? (executionSummary.mean * count) / (wallMs * c.workers)
        : null,
    observedQueueMax: endStats ? maxQueue : null,
    loadAverage: loadavg(),
    errors: 0,
    validated: true,
    validationMs: performance.now() - validationStart,
  };
}

async function overload() {
  const pool = await executor({ model: 'pjs', workers: 1 }, 2);
  const input = fixture({ kind: 'scrypt', concurrency: 1, size: 0 }, 1)
    .inputs[0];
  const start = performance.now();
  const promises = Array.from({ length: 16 }, () => pool.run(input));
  const observed = pool.stats();
  const settled = await Promise.allSettled(promises);
  for (const result of settled)
    if (result.status === 'fulfilled')
      assert.equal(result.value.value, compute(input).value);
    else assert.equal(result.reason.name, 'PjsQueueFullError');
  const final = pool.stats();
  await pool.close();
  return {
    offered: 16,
    workers: 1,
    maxQueue: 2,
    accepted: settled.filter((r) => r.status === 'fulfilled').length,
    rejected: settled.filter((r) => r.status === 'rejected').length,
    wallMs: performance.now() - start,
    observedQueue: observed.queue,
    final,
    validated: true,
  };
}

// A campaign never silently replaces evidence from an earlier invocation.
try {
  await writeFile(output, '', { flag: 'wx' });
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}

try {
  let seed = 130;
  const cases = matrix(profile).filter(
    (c) => !args.filter || c.id.includes(args.filter),
  );
  for (let i = cases.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [cases[i], cases[j]] = [cases[j], cases[i]];
  }
  await save();
  for (const c of cases) {
    const estimate = resourceEstimate(c);
    const budget = Math.min(freemem() * 0.5, totalmem() * 0.25);
    const reason =
      c.kind === 'bcrypt' && !bcrypt
        ? 'Pinned bcrypt unavailable; install isolated benchmark dependencies'
        : c.kind === 'argon2' && (!crypto.argon2Sync || !crypto.argon2)
          ? 'Native Argon2 API unavailable'
          : estimate > budget
            ? `Estimated ${estimate} bytes exceeds ${budget} byte safety budget`
            : null;
    if (reason) {
      report.skips.push({ config: c, reason, estimate, budget });
      await save();
      continue;
    }
    console.log(`RUN ${c.id}`);
    const start = performance.now();
    const pool = await executor(c);
    const cell = {
      config: c,
      estimatedBytes: estimate,
      memoryBudgetBytes: budget,
      startupMs: performance.now() - start,
      warmups: [],
      trials: [],
    };
    report.cells.push(cell);
    try {
      const pilotCount =
        c.kind === 'idle'
          ? 0
          : Math.max(c.concurrency, c.kind === 'sha' ? 64 : 2);
      cell.warmups.push(await measure(c, pool, pilotCount));
      let count = Math.max(
        c.concurrency,
        Math.ceil((pilotCount * targetMs) / cell.warmups[0].wallMs),
      );
      count = Math.min(32000, count);
      if (c.kind === 'aes')
        count = Math.min(count, Math.floor((128 * 1024 ** 2) / c.size));
      if (c.kind === 'idle') count = 0;
      cell.warmups.push(await measure(c, pool, count));
      count = Math.min(
        32000,
        Math.max(
          c.concurrency,
          Math.ceil((count * targetMs) / cell.warmups[1].wallMs),
        ),
      );
      if (c.kind === 'aes')
        count = Math.min(count, Math.floor((128 * 1024 ** 2) / c.size));
      if (c.kind === 'idle') count = 0;
      for (let trial = 0; trial < trials; trial++) {
        cell.trials.push(await measure(c, pool, count));
        await save();
      }
      cell.throughput = distribution(cell.trials.map((t) => t.opsPerSecond));
      console.log(
        `OK ${report.cells.length}/${cases.length} ${c.id} ${cell.throughput?.p50?.toFixed(1) ?? 'idle'} ops/s`,
      );
    } finally {
      await pool.close();
    }
    await save();
  }
  report.backpressure = await overload();
  report.runtimeAfter = sourceHashes();
  assert.deepEqual(report.runtimeAfter, before);
  report.runtimeUnchanged = true;
  report.complete = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await save();
  await rm(temporary, { recursive: true, force: true });
}
