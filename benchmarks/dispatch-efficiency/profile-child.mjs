import { performance } from 'node:perf_hooks';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import { setInternalProfileSink } from '../../packages/runtime/dist/telemetry/profile.js';

const enabled = process.argv[2] === 'on';
const registry = new PjsTaskRegistry();
const task = registry.register(
  'dispatch-profile',
  new URL('./pjs-task.mjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers: 4, maxQueue: 4 });
await runtime.ready();
const samples = [];
const profiles = [];
for (let iteration = 0; iteration < 8; iteration++) {
  const stages = new Map();
  if (enabled)
    setInternalProfileSink((stage, durationMs) => {
      const current = stages.get(stage) ?? { count: 0, totalMs: 0 };
      current.count++;
      current.totalMs += durationMs;
      stages.set(stage, current);
    });
  const started = performance.now();
  const outputs = await runtime.partitionRange(
    task,
    { start: 0, end: 512, grainSize: 1 },
    (partition) => ({
      input: { kind: 'noop', partition, outputType: 'scalar' },
    }),
  );
  samples.push(performance.now() - started);
  profiles.push(Object.fromEntries(stages));
  if (outputs.length !== 512) throw new Error('Missing profile output');
  setInternalProfileSink();
}
await runtime.shutdown();
process.stdout.write(JSON.stringify({ enabled, samples, profiles }));
