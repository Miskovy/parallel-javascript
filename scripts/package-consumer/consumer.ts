import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register<number, number>(
  'double',
  new URL('./task.js', import.meta.url),
  'double',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
try {
  const result: number = await runtime.run(task, 21, {
    signal: new AbortController().signal,
    timeout: 5000,
  });
  assert.equal(result, 42);
} finally {
  await runtime.shutdown();
}
