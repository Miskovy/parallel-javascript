import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { sharedReadonly } from '@pjs/runtime';
import { matrix } from '../benchmarks/real-world/compression/matrix.mjs';
import {
  bound,
  codecQualification,
  corpus,
  MiB,
  options,
  preflight,
} from '../benchmarks/real-world/compression/core.mjs';
import {
  measure,
  terminal,
} from '../benchmarks/real-world/compression/run.mjs';
import { executor } from '../benchmarks/real-world/compression/executors.mjs';
import {
  distribution,
  environment,
  sourceHashes,
} from '../benchmarks/real-world/crypto/support.mjs';
const output = process.argv[2];
assert.ok(output);
const qualification = codecQualification();
await writeFile(output, '', { flag: 'wx' });
const base = matrix('full').find((c) => c.group === 'queue');
const configs = [
  ...[4, availableParallelism()]
    .filter((n, i, a) => a.indexOf(n) === i)
    .map((workers) => ({
      ...base,
      id: `worker-budget-${workers}`,
      group: 'worker-budget',
      workers,
      byteMaxima: workers,
      count: 2 * workers,
      deep: false,
      contention: true,
    })),
  ...[4, 8, 16, 32, 64].map((concurrency) => ({
    ...base,
    id: `queue64-input-q${concurrency}`,
    group: 'queue64',
    bytes: 64 * MiB,
    concurrency,
    deep: true,
  })),
];
const report = {
  milestone: '0.14',
  clientDate: '2026-10-02',
  profile: 'supplement',
  environment: { ...environment(), zlib: process.versions.zlib },
  codecQualification: qualification,
  methodology:
    'Correctly funded worker-count control (one safe maximum per worker); 64-MiB queue control supplies at least 64 jobs even without calibration repetitions. Main matrix is preserved with its finite-work/capacity limitations.',
  runtimeBefore: sourceHashes(),
  harnessBefore: sourceHashes('benchmarks/real-world/compression'),
  complete: false,
  failure: null,
  cells: [],
  skips: [],
};
const directory = await mkdtemp(join(tmpdir(), 'pjs-v014-supplement-')),
  probeFile = join(directory, 'probe.bin');
await writeFile(probeFile, new Uint8Array(4096));
try {
  // Actual native compression with no gate: abort after the worker started notification.
  const cancelEngine = await executor({ ...base, workers: 1, deep: false });
  try {
    const source = sharedReadonly(corpus('poor', 32 * MiB)),
      controller = new AbortController(),
      runtime = cancelEngine.runtime;
    const stream = runtime.streamRange(
      cancelEngine.task,
      { start: 0, end: source.length, grainSize: source.length },
      (p) => ({
        input: { data: source, start: p.start, end: p.end, level: 9 },
      }),
      {
        signal: controller.signal,
        experimentalMaxResultBytes: bound(source.length),
        experimentalMaxReservedResultBytes: bound(source.length),
        experimentalMaxBufferedResults: 1,
      },
    );
    const rejected = assert.rejects(stream[Symbol.asyncIterator]().next(), {
      name: 'PjsCancelledError',
    });
    const deadline = performance.now() + 10000;
    while (!runtime.stats().activeTasks.some((t) => t.status === 'running')) {
      assert.ok(performance.now() < deadline);
      await delay(1);
    }
    controller.abort();
    await rejected;
    const active = {
      stats: runtime.stats(),
      credits: runtime.resultCredits.diagnostics(),
    };
    assert.equal(active.stats.workers.busy, 1);
    assert.equal(
      active.stats.streamResults.currentReservedResultBytes,
      bound(source.length),
    );
    while (runtime.stats().workers.busy) {
      assert.ok(performance.now() < deadline);
      await delay(1);
    }
    assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
    report.nativeCompressionAbort = {
      active,
      terminal: terminal(runtime),
      refunds: 0,
    };
  } finally {
    await cancelEngine.close();
  }
  report.parallelRoundTrips = [];
  for (const kind of ['high', 'moderate', 'poor']) {
    const original = corpus(kind, 4 * MiB + 37),
      source = sharedReadonly(original),
      engine = await executor({ ...base, deep: false }),
      runtime = engine.runtime,
      records = [];
    const range = { start: 0, end: source.length, grainSize: MiB };
    try {
      const compressed = runtime.streamRange(
        engine.task,
        range,
        (p) => ({
          input: { data: source, start: p.start, end: p.end, level: 6 },
        }),
        {
          experimentalMaxBufferedResults: 8,
          experimentalMaxResultBytes: (p) => bound(p.end - p.start),
          experimentalMaxReservedResultBytes: 4 * bound(MiB),
        },
      );
      for await (const { partition, output } of compressed)
        records.push({
          index: partition.index,
          start: partition.start,
          originalBytes: partition.end - partition.start,
          compressedBytes: output.length,
          payload: output,
        });
      records.sort((a, b) => a.index - b.index);
      const offsets = [];
      let total = 0;
      for (const record of records) {
        offsets.push(total);
        total += record.compressedBytes;
      }
      const packed = new Uint8Array(total);
      for (const record of records)
        packed.set(record.payload, offsets[record.index]);
      const compressedSource = sharedReadonly(packed),
        reassembled = new Uint8Array(source.length),
        refundsBeforeInflate =
          runtime.stats().streamResults.refundedResultBytes;
      const inflated = runtime.streamRange(
        engine.task,
        range,
        (p) => ({
          input: {
            data: compressedSource,
            start: offsets[p.index],
            end: offsets[p.index] + records[p.index].compressedBytes,
            direction: 'inflate',
          },
        }),
        {
          experimentalMaxBufferedResults: 8,
          experimentalResultBytes: (p) => p.end - p.start,
          experimentalMaxReservedResultBytes: 4 * MiB,
        },
      );
      for await (const { partition, output } of inflated)
        reassembled.set(output, partition.start);
      assert.deepEqual(reassembled, original);
      assert.equal(
        runtime.stats().streamResults.refundedResultBytes,
        refundsBeforeInflate,
      );
      report.parallelRoundTrips.push({
        kind,
        originalBytes: source.length,
        compressedBytes: total,
        blocks: records.map(({ payload, ...metadata }) => {
          assert.ok(payload.length);
          return metadata;
        }),
        correctness: true,
        compressionRefunds: refundsBeforeInflate,
        exactInflateRefunds: 0,
        terminal: terminal(runtime),
      });
    } finally {
      await engine.close();
    }
  }
  report.idleFilesystem = { warmups: [], trials: [] };
  for (let trial = 0; trial < 8; trial++) {
    const latencies = [],
      start = performance.now();
    do {
      const t = performance.now();
      assert.equal((await readFile(probeFile)).length, 4096);
      latencies.push(performance.now() - t);
      await delay(10);
    } while (performance.now() - start < 350);
    const result = {
      wallMs: performance.now() - start,
      latencyMs: distribution(latencies),
    };
    (trial < 2
      ? report.idleFilesystem.warmups
      : report.idleFilesystem.trials
    ).push(result);
  }
  for (const config of configs) {
    const guard = preflight(config, 1);
    assert.ok(guard.safe);
    const started = performance.now(),
      original = corpus('poor', config.bytes),
      shared = sharedReadonly(original),
      wholeStreamBytes = deflateRawSync(original, options()).length;
    const fixture = {
      original,
      shared,
      compressed: [],
      compressedShared: sharedReadonly(new Uint8Array()),
      compressedOffsets: [],
    };
    const setupMs = performance.now() - started,
      readyStart = performance.now(),
      engine = await executor(config);
    const cell = {
      config,
      memoryGuard: guard,
      setupMs,
      readyMs: performance.now() - readyStart,
      wholeStreamBytes,
      warmups: [],
      trials: [],
    };
    try {
      for (let i = 0; i < 2; i++)
        cell.warmups.push(await measure(config, engine, fixture, 1, probeFile));
      for (let i = 0; i < 6; i++)
        cell.trials.push(await measure(config, engine, fixture, 1, probeFile));
    } finally {
      await engine.close();
    }
    report.cells.push(cell);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(config.id);
  }
  report.runtimeAfter = sourceHashes();
  report.harnessAfter = sourceHashes('benchmarks/real-world/compression');
  assert.deepEqual(report.runtimeBefore, report.runtimeAfter);
  assert.deepEqual(report.harnessBefore, report.harnessAfter);
  report.complete = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  throw error;
} finally {
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await rm(directory, { recursive: true });
}
