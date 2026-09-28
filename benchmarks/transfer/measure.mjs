import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { availableParallelism, cpus, platform } from 'node:os';
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const module = new URL('./tasks.mjs', import.meta.url);
const clone = registry.register('clone', module, 'cloneEcho');
const transfer = registry.register('transfer', module, 'transferEcho');
const start = performance.now();
const runtime = new PjsRuntime({ registry, workers: 1, maxQueue: 1 });
const trials = 20,
  warmups = 5;
try {
  await runtime.ready();
  const startupMs = performance.now() - start;
  const results = [];
  for (const bytes of [0, 1024, 1024 ** 2, 8 * 1024 ** 2]) {
    // Reuse the returned buffer in both modes. No hidden allocation is excluded for only one mode.
    let cloned = bytes ? new Uint8Array(bytes).fill(37) : 7;
    let moved = bytes ? new Uint8Array(bytes).fill(37) : 7;
    const samples = { clone: [], transfer: [] };
    for (let i = -warmups; i < trials; i++) {
      for (const mode of i % 2 === 0
        ? ['clone', 'transfer']
        : ['transfer', 'clone']) {
        const value = mode === 'clone' ? cloned : moved;
        const doTransfer = mode === 'transfer' && bytes > 0;
        const before = process.memoryUsage().rss;
        const cpu = process.cpuUsage();
        const started = performance.now();
        const output = await runtime.run(
          doTransfer ? transfer : clone,
          value,
          doTransfer ? { transferList: [value.buffer] } : {},
        );
        const wallMs = performance.now() - started;
        const usage = process.cpuUsage(cpu);
        const after = process.memoryUsage().rss;
        if (bytes) {
          assert.equal(output.length, bytes);
          assert.ok(output.every((byte) => byte === 37));
          assert.equal(value.byteLength, doTransfer ? 0 : bytes);
        } else assert.equal(output, 7);
        if (mode === 'clone') cloned = output;
        else moved = output;
        if (i >= 0)
          samples[mode].push({
            wallMs,
            cpuMs: (usage.user + usage.system) / 1000,
            rssBeforeBytes: before,
            rssAfterBytes: after,
          });
      }
    }
    for (const mode of ['clone', 'transfer'])
      results.push({ bytes, mode, samples: samples[mode] });
  }
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      runtimeVersion: '0.5.0',
      environment: {
        node: process.version,
        platform: platform(),
        cpuModel: cpus()[0]?.model,
        availableParallelism: availableParallelism(),
      },
      startupMs,
      methodology: {
        workers: 1,
        trials,
        warmups,
        order: 'alternating clone/transfer within each payload size',
        timing:
          'round trip using returned buffer; allocation and full-byte validation outside timing in both modes',
        memory: 'process-wide RSS at sample endpoints; not a peak measurement',
        scalar:
          'zero bytes means numeric scalar and no transfer in either mode',
      },
      results,
    }),
  );
} finally {
  await runtime.shutdown();
}
