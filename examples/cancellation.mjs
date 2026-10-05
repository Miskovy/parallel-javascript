import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PjsCancelledError,
  PjsRuntime,
  PjsTaskRegistry,
} from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const task = registry.register(
  'gated',
  new URL('./tasks.mjs', import.meta.url),
  'gatedTask',
);
const runtime = new PjsRuntime({ registry, workers: 1 });
const gate = new Int32Array(new SharedArrayBuffer(8));
const controller = new AbortController();

try {
  const result = runtime.run(task, gate, { signal: controller.signal });
  const rejected = assert.rejects(result, PjsCancelledError);
  const deadline = Date.now() + 5000;
  while (Atomics.load(gate, 0) === 0) {
    assert.ok(Date.now() < deadline, 'worker did not start');
    await delay(2);
  }
  controller.abort();
  await rejected;
  assert.equal(runtime.stats().tasks.pending, 0);
  assert.equal(runtime.stats().workers.busy, 1);
  console.log('cancellation settled; physical worker still occupied');
} finally {
  Atomics.store(gate, 1, 1);
  Atomics.notify(gate, 1);
  await runtime.shutdown();
}
assert.equal(runtime.stats().state, 'stopped');
