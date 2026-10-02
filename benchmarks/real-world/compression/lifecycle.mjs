import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { executor } from './executors.mjs';
import { bound, corpus, MiB, options } from './core.mjs';
import { terminal } from './run.mjs';
import { sourceHashes } from '../crypto/support.mjs';
async function until(predicate) {
  const deadline = performance.now() + 10000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, 'lifecycle timeout');
    await delay(1);
  }
}
const results = [];
const config = {
  model: 'pjs',
  workers: 2,
  credit: 'upper',
  ownership: 'shared',
};
const data = corpus('poor', 4 * MiB),
  maximum = bound(MiB);
const input = (index, extra = {}) => ({
  data,
  start: index * MiB,
  end: (index + 1) * MiB,
  index,
  level: 6,
  ...extra,
});
const streamOptions = {
  experimentalMaxBufferedResults: 16,
  experimentalMaxResultBytes: maximum,
  experimentalMaxReservedResultBytes: 4 * maximum,
};
for (const mode of [
  'abort',
  'consumer-break',
  'crash',
  'upper-contract',
  'exact-contract',
]) {
  const engine = await executor(config),
    runtime = engine.runtime;
  const gates = [];
  const makeGate = () => {
    const gate = new Int32Array(new SharedArrayBuffer(8));
    gates.push(gate);
    return gate;
  };
  try {
    if (mode === 'abort') {
      const gate = makeGate(),
        controller = new AbortController();
      const stream = runtime.streamRange(
        engine.task,
        { start: 0, end: 4, grainSize: 1 },
        (p) => ({ input: input(p.index, { gate }) }),
        { ...streamOptions, signal: controller.signal },
      );
      const waiting = stream[Symbol.asyncIterator]().next();
      const rejected = assert.rejects(waiting, { name: 'PjsCancelledError' });
      await until(
        () => runtime.stats().workers.busy === 2 && Atomics.load(gate, 0) === 1,
      );
      controller.abort();
      await rejected;
      assert.equal(runtime.stats().workers.busy, 2);
      assert.equal(runtime.stats().tasks.pending, 0);
      assert.equal(
        runtime.stats().streamResults.currentReservedResultBytes,
        2 * maximum,
      );
      const active = {
        stats: runtime.stats(),
        credits: runtime.resultCredits.diagnostics(),
      };
      Atomics.store(gate, 1, 1);
      Atomics.notify(gate, 1);
      await until(() => runtime.stats().workers.busy === 0);
      results.push({
        mode,
        active,
        terminal: terminal(runtime),
        refunds: runtime.stats().streamResults.refundedResultBytes,
      });
      assert.equal(runtime.stats().streamResults.refundedResultBytes, 0);
    } else if (mode === 'consumer-break') {
      const gate = makeGate();
      const stream = runtime.streamRange(
        engine.task,
        { start: 0, end: 4, grainSize: 1 },
        (p) => ({ input: input(p.index, p.index === 0 ? {} : { gate }) }),
        streamOptions,
      );
      for await (const { output } of stream) {
        assert.equal(inflateRawSync(output).length, MiB);
        break;
      }
      const active = {
        stats: runtime.stats(),
        credits: runtime.resultCredits.diagnostics(),
      };
      assert.ok(runtime.stats().workers.busy > 0);
      Atomics.store(gate, 1, 1);
      Atomics.notify(gate, 1);
      await until(() => runtime.stats().workers.busy === 0);
      results.push({ mode, active, terminal: terminal(runtime) });
    } else if (mode === 'crash') {
      const stream = runtime.streamRange(
        engine.task,
        { start: 0, end: 4, grainSize: 1 },
        (p) => ({ input: input(p.index, { crash: p.index === 0 }) }),
        streamOptions,
      );
      await assert.rejects(
        async () => {
          for await (const result of stream) assert.ok(result.output);
        },
        { name: 'PjsWorkerError' },
      );
      await until(
        () =>
          runtime.stats().workers.busy === 0 &&
          runtime.stats().workers.idle === 2,
      );
      const recovery = await engine.run(input(0));
      assert.deepEqual(
        new Uint8Array(inflateRawSync(recovery)),
        data.slice(0, MiB),
      );
      results.push({
        mode,
        workers: runtime.stats().workers,
        terminal: terminal(runtime),
      });
    } else {
      const encoded = deflateRawSync(data.subarray(0, MiB), options());
      const opt =
        mode === 'upper-contract'
          ? { experimentalMaxResultBytes: encoded.length - 1 }
          : { experimentalResultBytes: MiB - 1 };
      const stream = runtime.streamRange(
        engine.task,
        { start: 0, end: 1, grainSize: 1 },
        () => ({
          input:
            mode === 'upper-contract'
              ? input(0)
              : { data: encoded, direction: 'inflate' },
        }),
        {
          ...opt,
          experimentalMaxReservedResultBytes: 2 * maximum,
          experimentalMaxBufferedResults: 2,
        },
      );
      await assert.rejects(
        async () => {
          for await (const result of stream) assert.ok(result.output);
        },
        { name: 'PjsBinaryResultContractError' },
      );
      await until(() => runtime.stats().workers.busy === 0);
      results.push({
        mode,
        stats: runtime.stats(),
        terminal: terminal(runtime),
      });
    }
  } finally {
    for (const gate of gates) {
      Atomics.store(gate, 1, 1);
      Atomics.notify(gate, 1);
    }
    await engine.close();
  }
}
// Queued stream cancellation behind occupied ordinary tasks releases immediately.
{
  const engine = await executor(config),
    runtime = engine.runtime,
    gate = new Int32Array(new SharedArrayBuffer(8));
  const running = [
    engine.run(input(0, { gate })),
    engine.run(input(1, { gate })),
  ];
  try {
    await until(() => runtime.stats().workers.busy === 2);
    const controller = new AbortController();
    const stream = runtime.streamRange(
      engine.task,
      { start: 0, end: 2, grainSize: 1 },
      (p) => ({ input: input(p.index) }),
      { ...streamOptions, signal: controller.signal },
    );
    const rejected = assert.rejects(stream[Symbol.asyncIterator]().next(), {
      name: 'PjsCancelledError',
    });
    assert.equal(
      runtime.stats().streamResults.currentReservedResultBytes,
      2 * maximum,
    );
    controller.abort();
    await rejected;
    assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
    const active = {
      stats: runtime.stats(),
      credits: runtime.resultCredits.diagnostics(),
    };
    Atomics.store(gate, 1, 1);
    Atomics.notify(gate, 1);
    await Promise.all(running);
    results.push({ mode: 'queued-abort', active, terminal: terminal(runtime) });
  } finally {
    Atomics.store(gate, 1, 1);
    Atomics.notify(gate, 1);
    await engine.close();
  }
}
const prefill = [];
for (let trial = 0; trial < 6; trial++)
  for (const kind of ['high', 'poor'])
    for (const credit of trial % 2 ? ['held', 'upper'] : ['upper', 'held']) {
      const engine = await executor({ ...config, workers: 4, credit }),
        runtime = engine.runtime;
      const source = corpus(kind, 32 * MiB);
      const started = performance.now();
      const stream = runtime.streamRange(
        engine.task,
        { start: 0, end: source.length, grainSize: MiB },
        (p) => ({
          input: { data: source, start: p.start, end: p.end, level: 6 },
        }),
        {
          experimentalMaxResultBytes: (p) => bound(p.end - p.start),
          experimentalMaxReservedResultBytes: 2 * maximum,
          experimentalMaxBufferedResults: 64,
        },
      );
      try {
        await until(
          () =>
            runtime.stats().workers.busy === 0 &&
            runtime.stats().tasks.pending === 0,
        );
        const stats = runtime.stats(),
          credits = runtime.resultCredits.creditDiagnostics();
        const prefillMs = performance.now() - started;
        assert.equal(stats.streamResults.yielded, 0);
        assert.ok(
          stats.streamResults.currentReservedResultBytes <= 2 * maximum,
        );
        if (kind === 'high')
          assert.equal(
            stats.streamResults.produced,
            credit === 'upper' ? 32 : 2,
          );
        let count = 0;
        for await (const { partition, output } of stream) {
          assert.deepEqual(
            new Uint8Array(inflateRawSync(output)),
            source.slice(partition.start, partition.end),
          );
          count++;
        }
        assert.equal(count, 32);
        prefill.push({
          trial,
          kind,
          credit,
          prefillMs,
          producedBeforeYield: stats.streamResults.produced,
          bufferedActualBytes: stats.streamResults.knownBufferedPayloadBytes,
          reservedBytes: stats.streamResults.currentReservedResultBytes,
          refundedBytes: stats.streamResults.refundedResultBytes,
          reservationWaits: stats.streamResults.resultByteReservationWaits,
          credits,
          terminal: terminal(runtime),
        });
      } finally {
        await engine.close();
      }
    }
await writeFile(
  process.argv[2],
  JSON.stringify(
    {
      clientDate: '2026-10-02',
      node: process.version,
      runtimeHashes: sourceHashes(),
      complete: true,
      results,
      prefill,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  `${results.length} lifecycle cases and ${prefill.length} prefill controls passed`,
);
