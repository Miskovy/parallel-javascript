import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsExecutionLeaseError,
  PjsWorkerError,
} from '@pjavascript/runtime';

const watchdog = setTimeout(() => {
  console.error('Installed containment watchdog');
  process.exit(1);
}, 10_000);
const registry = new PjsTaskRegistry();
const module = new URL('./containment-tasks.mjs', import.meta.url);
const hang = registry.register('hang', module, 'hang');
const echo = registry.register('echo', module, 'echo');
const runtime = new PjsRuntime({
  registry,
  workers: 1,
  restartPolicy: { maxRestarts: 2, windowMs: 60_000 },
});
try {
  await runtime.ready();
  await assert.rejects(
    runtime.run(hang, null, { executionLease: 100 }),
    (error) => {
      assert.ok(error instanceof PjsExecutionLeaseError);
      assert.ok(error instanceof PjsWorkerError);
      assert.equal(error.name, 'PjsExecutionLeaseError');
      assert.equal(typeof error.taskId, 'string');
      assert.equal(typeof error.workerId, 'number');
      return true;
    },
  );
  const deadline = performance.now() + 5_000;
  while (runtime.stats().workers.idle !== 1) {
    assert.ok(performance.now() < deadline);
    await delay(1);
  }
  assert.equal(runtime.stats().containment.confirmedLeaseExits, 1);
  assert.equal(await runtime.run(echo, 123), 123);
  await runtime.shutdown({ forceAfter: 1000 });
  assert.equal(runtime.stats().workers.busy, 0);
  console.log(
    'Installed lease error, confirmed exit, replacement and shutdown passed',
  );
} finally {
  await runtime.shutdown({ drain: false });
  clearTimeout(watchdog);
}
