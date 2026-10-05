import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { sharedReadonly } from '@pjavascript/runtime';
import { distribution, environment, sourceHashes } from '../crypto/support.mjs';
import {
  bound,
  blocks,
  checkZlib,
  codecQualification,
  corpus,
  MiB,
  options,
  preflight,
  reconstruct,
  seed,
  view,
} from './core.mjs';
import { executor } from './executors.mjs';
import { matrix } from './matrix.mjs';

export function terminal(runtime) {
  const stats = runtime.stats();
  const result = {
    tasks: stats.tasks.pending,
    pendingOperations: stats.operations.pending,
    busy: stats.workers.busy,
    ...runtime.resultCredits.diagnostics(),
    ...runtime.resultCredits.creditDiagnostics(),
    reservedBytes: stats.streamResults.currentReservedResultBytes,
    buffered: stats.streamResults.buffered,
  };
  for (const value of Object.values(result))
    assert.equal(value, 0, 'terminal ownership');
  assert.equal(stats.activeTasks.length, 0);
  assert.equal(stats.activeOperations.length, 0);
  assert.equal(runtime.taskCoordinator.tasks.size, 0);
  return result;
}
function delta(after, before) {
  return Object.fromEntries(
    Object.entries(after)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => [k, v - (before[k] ?? 0)]),
  );
}
export async function measure(config, engine, fixture, repetitions, probeFile) {
  const { original, shared, compressed, compressedShared, compressedOffsets } =
    fixture;
  const blockCount = Math.ceil(config.bytes / config.grain),
    totalBlocks = blockCount * repetitions;
  const timings = new Float64Array(new SharedArrayBuffer(totalBlocks * 16));
  const submitted = new Float64Array(totalBlocks),
    completed = new Float64Array(totalBlocks);
  const outputs = new Array(totalBlocks),
    consumerWait = [],
    snapshots = [];
  let next = 0,
    done = 0,
    actualBytes = 0;
  const before = engine.runtime?.stats();
  const memoryBefore = process.memoryUsage(),
    memoryPeak = { ...memoryBefore };
  function observe() {
    const memory = process.memoryUsage();
    for (const key of Object.keys(memoryPeak))
      memoryPeak[key] = Math.max(memoryPeak[key], memory[key]);
    if (engine.runtime) {
      const stats = engine.runtime.stats(),
        credits = engine.runtime.resultCredits.creditDiagnostics();
      const operation = stats.activeOperations[0];
      if (operation && config.credit !== 'count' && !config.deep)
        assert.ok(
          operation.reservedResultBytes <=
            bound(config.grain) * config.byteMaxima,
          'byte overshoot',
        );
      if (operation && !config.deep)
        assert.ok(
          operation.bufferedResults + operation.queued + operation.running <=
            config.count,
          'count overshoot',
        );
      assert.ok(stats.streamResults.currentReservedResultBytes >= 0);
      if (snapshots.length < 200)
        snapshots.push({
          atMs: performance.now() - started,
          busy: stats.workers.busy,
          pending: stats.tasks.pending,
          buffered: stats.streamResults.buffered,
          bufferedBytes: stats.streamResults.knownBufferedPayloadBytes,
          reservedBytes: stats.streamResults.currentReservedResultBytes,
          ...credits,
        });
    }
  }
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  await delay(20);
  histogram.reset();
  const timers = [],
    fsLatencies = [];
  let active = true,
    expectedTimer = performance.now() + 10;
  const timer = setInterval(() => {
    const now = performance.now();
    timers.push(Math.max(0, now - expectedTimer));
    expectedTimer = now + 10;
  }, 10);
  const fsProbe = config.contention
    ? (async () => {
        while (active) {
          const start = performance.now();
          const bytes = await readFile(probeFile);
          assert.equal(bytes.length, 4096);
          fsLatencies.push(performance.now() - start);
          if (active) await delay(10);
        }
      })()
    : Promise.resolve();
  const cpu = process.cpuUsage(),
    elu = performance.eventLoopUtilization();
  const started = performance.now();
  const sampler = setInterval(observe, 10);
  function inputFor(localIndex, pass, partition) {
    const index = pass * blockCount + localIndex;
    const start = partition?.start ?? localIndex * config.grain,
      end = Math.min(config.bytes, start + config.grain);
    let data, from, to;
    if (config.direction === 'inflate') {
      data =
        config.ownership === 'shared'
          ? compressedShared
          : compressed[localIndex].payload;
      from = config.ownership === 'shared' ? compressedOffsets[localIndex] : 0;
      to = from + compressed[localIndex].compressedBytes;
    } else {
      data =
        config.ownership === 'shared' ? shared : original.slice(start, end);
      from = config.ownership === 'shared' ? start : 0;
      to = from + end - start;
      // Serial/native do not need transport copies: use the same source blocks directly.
      if (config.model === 'serial' || config.model === 'native') {
        data = original;
        from = start;
        to = end;
      }
    }
    const timestamp = performance.now();
    submitted[index] = timestamp - started;
    return {
      data,
      start: from,
      end: to,
      index,
      level: config.level,
      direction: config.direction,
      timings,
      submitted: timestamp,
    };
  }
  async function receive(index, output) {
    completed[index] = performance.now() - started;
    outputs[index] = output;
    done++;
    actualBytes += output.byteLength;
    if (config.consumerMs) {
      const t = performance.now();
      await delay(config.consumerMs);
      consumerWait.push(performance.now() - t);
    }
  }
  let wallMs, cpuDelta, eluDelta;
  try {
    if (config.model === 'pjs' && !config.deep) {
      for (let pass = 0; pass < repetitions; pass++) {
        const streamOptions = { experimentalMaxBufferedResults: config.count };
        if (config.credit !== 'count') {
          streamOptions.experimentalMaxReservedResultBytes =
            (config.direction === 'inflate'
              ? config.grain
              : bound(config.grain)) * config.byteMaxima;
          if (config.direction === 'inflate')
            streamOptions.experimentalResultBytes = (p) => p.end - p.start;
          else
            streamOptions.experimentalMaxResultBytes = (p) =>
              bound(p.end - p.start);
        }
        const stream = engine.runtime.streamRange(
          engine.task,
          { start: 0, end: config.bytes, grainSize: config.grain },
          (p) => {
            const input = inputFor(p.index, pass, p);
            return {
              input,
              ...(config.ownership === 'transfer'
                ? { transferList: [input.data.buffer] }
                : {}),
            };
          },
          streamOptions,
        );
        for await (const { partition, output } of stream)
          await receive(pass * blockCount + partition.index, output);
      }
    } else {
      const concurrency =
        config.model === 'serial'
          ? 1
          : config.model === 'raw'
            ? config.workers
            : config.concurrency;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (next < totalBlocks) {
            const index = next++;
            await receive(
              index,
              await engine.run(
                inputFor(index % blockCount, Math.floor(index / blockCount)),
              ),
            );
          }
        }),
      );
    }
    wallMs = performance.now() - started;
    cpuDelta = process.cpuUsage(cpu);
    eluDelta = performance.eventLoopUtilization(elu);
    observe();
    active = false;
    await fsProbe;
    await delay(12);
  } finally {
    active = false;
    clearInterval(timer);
    clearInterval(sampler);
    histogram.disable();
    await fsProbe;
  }
  assert.equal(done, totalBlocks);
  const after = engine.runtime?.stats();
  const timedTerminal = engine.runtime ? terminal(engine.runtime) : null;
  const validateStart = performance.now();
  for (let pass = 0; pass < repetitions; pass++) {
    const records = [];
    for (let i = 0; i < blockCount; i++) {
      const start = i * config.grain,
        end = Math.min(config.bytes, start + config.grain),
        output = outputs[pass * blockCount + i];
      if (config.direction === 'deflate') {
        assert.ok(output.length <= bound(end - start));
        const inflated = inflateRawSync(output);
        assert.ok(view(original, start, end).equals(inflated));
        records.push({
          index: i,
          start,
          originalBytes: end - start,
          compressedBytes: output.length,
          payload: output,
        });
      } else
        assert.ok(
          view(original, start, end).equals(
            Buffer.from(output.buffer, output.byteOffset, output.byteLength),
          ),
        );
    }
    if (config.direction === 'deflate')
      assert.deepEqual(reconstruct(records, config.bytes), original);
    else {
      const assembled = new Uint8Array(config.bytes);
      for (let i = 0; i < blockCount; i++)
        assembled.set(outputs[pass * blockCount + i], i * config.grain);
      assert.deepEqual(assembled, original);
    }
  }
  const validationMs = performance.now() - validateStart;
  const latencies = Array.from(completed, (end, i) => end - submitted[i]);
  const delivery = Array.from(completed).sort((a, b) => a - b);
  const bodyMs = Array.from(
    { length: totalBlocks },
    (_, i) => timings[2 * i + 1],
  );
  const admissionToBody = Array.from(
    { length: totalBlocks },
    (_, i) => timings[2 * i],
  );
  const inputBytes =
    config.direction === 'deflate'
      ? config.bytes * repetitions
      : compressed.reduce((n, b) => n + b.compressedBytes, 0) * repetitions;
  const originalBytes = config.bytes * repetitions;
  const compressedBytes =
    config.direction === 'deflate' ? actualBytes : inputBytes;
  const sr = after ? delta(after.streamResults, before.streamResults) : null;
  const timingMean = (name) => {
    if (!after) return null;
    const samples = `${name}Samples`,
      average = name === 'queue' ? 'averageQueueMs' : 'averageExecutionMs';
    const a = after.timing,
      b = before.timing;
    return a[samples] > b[samples]
      ? (a[average] * a[samples] - b[average] * b[samples]) /
          (a[samples] - b[samples])
      : null;
  };
  return {
    repetitions,
    totalBlocks,
    inputBytes,
    outputBytes: actualBytes,
    originalBytes,
    compressedBytes,
    wallMs,
    inputMiBs: inputBytes / MiB / (wallMs / 1000),
    outputMiBs: actualBytes / MiB / (wallMs / 1000),
    blocksPerSecond: totalBlocks / (wallMs / 1000),
    ratio: compressedBytes / originalBytes,
    firstMs: delivery[0],
    tenPercentMs: delivery[Math.ceil(totalBlocks / 10) - 1],
    fiftyPercentMs: delivery[Math.ceil(totalBlocks / 2) - 1],
    latencyMs: distribution(latencies),
    admissionToBodyMs:
      config.model === 'native' ? null : distribution(admissionToBody),
    bodyMs: config.model === 'native' ? null : distribution(bodyMs),
    queueMeanMs: timingMean('queue'),
    runtimeExecutionMeanMs: timingMean('execution'),
    queueQuantiles: null,
    workerBodyOccupancy:
      config.model === 'native'
        ? null
        : bodyMs.reduce((a, b) => a + b, 0) /
          (wallMs * (config.model === 'serial' ? 1 : config.workers)),
    cpuPercent: (cpuDelta.user + cpuDelta.system) / (wallMs * 10),
    elu: eluDelta.utilization,
    eventLoopDelayMs: {
      mean: Number.isFinite(histogram.mean) ? histogram.mean / 1e6 : null,
      p95: histogram.percentile(95) / 1e6,
      max: histogram.max / 1e6,
    },
    timerDelayMs: distribution(timers),
    fsLatencyMs: distribution(fsLatencies),
    consumerWaitMs: distribution(consumerWait),
    memory: {
      before: memoryBefore,
      peak: memoryPeak,
      after: process.memoryUsage(),
      scope:
        'RSS process-wide; other fields main isolate; validation/output retention is consumer-owned',
    },
    streamCounters: sr,
    declaredMaximumBytes:
      config.direction === 'deflate' &&
      config.credit !== 'count' &&
      !config.deep &&
      config.model === 'pjs'
        ? Array.from({ length: blockCount }, (_, i) =>
            bound(Math.min(config.grain, config.bytes - i * config.grain)),
          ).reduce((a, b) => a + b, 0) * repetitions
        : null,
    peakReservedBytes: snapshots.length
      ? Math.max(...snapshots.map((s) => s.reservedBytes))
      : 0,
    snapshots,
    terminal: timedTerminal,
    validationMs,
    correctness: true,
  };
}
export async function runCampaign(profile, output, filter = '') {
  checkZlib();
  const configs = matrix(profile).filter((c) => c.id.includes(filter));
  assert.ok(configs.length, 'empty matrix');
  await writeFile(output, '', { flag: 'wx' });
  const report = {
    milestone: '0.14',
    clientDate: '2026-10-02',
    profile,
    filter,
    environment: { ...environment(), zlib: process.versions.zlib },
    codecQualification: codecQualification(),
    corpus: { version: 1, seed },
    runtimeBefore: sourceHashes(),
    harnessBefore: sourceHashes('benchmarks/real-world/compression'),
    proposalHash: sourceHashes('docs')['docs/proposal-v0.14.md'],
    complete: false,
    cells: [],
    skips: [],
    failure: null,
  };
  const save = async () => {
    await writeFile(output + '.tmp', JSON.stringify(report, null, 2) + '\n');
    await rename(output + '.tmp', output);
  };
  const directory = await mkdtemp(join(tmpdir(), 'pjs-v014-'));
  const probeFile = join(directory, 'probe.bin');
  await writeFile(probeFile, new Uint8Array(4096));
  try {
    // Fixed deterministic permutation breaks grouped model ordering without dropping cells.
    configs.sort((a, b) => hash(a.id) - hash(b.id));
    for (const config of configs) {
      const memoryGuard = preflight(config);
      if (!memoryGuard.safe) {
        report.skips.push({ config, memoryGuard });
        continue;
      }
      const setupStart = performance.now();
      const original = corpus(config.corpus, config.bytes),
        shared = sharedReadonly(original);
      const compressed =
        config.direction === 'inflate'
          ? blocks(original, config.grain, config.level)
          : [];
      const compressedOffsets = [];
      let offset = 0;
      for (const b of compressed) {
        compressedOffsets.push(offset);
        offset += b.compressedBytes;
      }
      const packed = new Uint8Array(offset);
      for (const b of compressed)
        packed.set(b.payload, compressedOffsets[b.index]);
      const compressedShared = sharedReadonly(packed);
      const fixture = {
        original,
        shared,
        compressed,
        compressedShared,
        compressedOffsets,
      };
      const wholeStreamBytes = deflateRawSync(
        original,
        options(config.level),
      ).length;
      const setupMs = performance.now() - setupStart;
      const readyStart = performance.now(),
        engine = await executor(config),
        readyMs = performance.now() - readyStart;
      const cell = {
        config,
        memoryGuard,
        setupMs,
        readyMs,
        wholeStreamBytes,
        warmups: [],
        trials: [],
      };
      try {
        let repetitions = 1;
        const warmupCount = profile === 'smoke' ? 1 : 2,
          trialCount = profile === 'smoke' ? 1 : 6;
        for (let i = 0; i < warmupCount; i++) {
          const trial = await measure(
            config,
            engine,
            fixture,
            repetitions,
            probeFile,
          );
          cell.warmups.push(trial);
          if (i === 0 && !config.consumerMs)
            repetitions = Math.min(
              4,
              Math.max(1, Math.ceil(350 / trial.wallMs)),
            );
        }
        for (let i = 0; i < trialCount; i++)
          cell.trials.push(
            await measure(config, engine, fixture, repetitions, probeFile),
          );
      } finally {
        await engine.close();
      }
      report.cells.push(cell);
      await save();
      console.log(
        `${report.cells.length}/${configs.length} ${config.id}: ${distribution(cell.trials.map((t) => t.inputMiBs)).p50.toFixed(1)} MiB/s`,
      );
    }
    report.runtimeAfter = sourceHashes();
    assert.deepEqual(report.runtimeAfter, report.runtimeBefore);
    report.harnessAfter = sourceHashes('benchmarks/real-world/compression');
    assert.deepEqual(report.harnessAfter, report.harnessBefore);
    report.complete = true;
  } catch (error) {
    report.failure = String(error.stack ?? error);
    throw error;
  } finally {
    await save();
    await rm(directory, { recursive: true });
  }
  return report;
}
function hash(value) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
if (
  process.argv[1]?.endsWith('compression/run.mjs') ||
  process.argv[1]?.endsWith('compression\\run.mjs')
) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((s) => {
      const i = s.indexOf('=');
      return [s.slice(2, i), s.slice(i + 1)];
    }),
  );
  assert.ok(args.output, '--output required');
  await runCampaign(args.profile ?? 'full', args.output, args.filter ?? '');
}
