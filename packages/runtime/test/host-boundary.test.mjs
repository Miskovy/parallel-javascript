import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PjsRuntime, PjsTaskRegistry } from '../dist/index.js';
import { createRuntimeComponents } from '../dist/composition/create-runtime-components.js';
import { RuntimeFacade } from '../dist/runtime-facade.js';
import { nodeHost } from '../dist/hosts/node.js';
import { projectNodeStatistics } from '../dist/hosts/node-statistics.js';
import { projectBrowserStatistics } from '../dist/browser/statistics.js';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';

const fixture = new URL('./fixtures/tasks.mjs', import.meta.url);

test('typed statistics projections retain values without mutating internal observations', async (t) => {
  const registry = new PjsTaskRegistry();
  registry.register('echo', fixture, 'echo');
  const runtime = new PjsRuntime({ registry, workers: 1 });
  t.after(() => runtime.shutdown());
  await runtime.ready();
  const snapshot = runtimeComponents(runtime).telemetry.snapshot();
  snapshot.containment.confirmedLeaseExits = 2;
  snapshot.containment.unconfirmedRetirements = 3;
  const original = structuredClone(snapshot);
  const node = projectNodeStatistics(snapshot);
  const browser = projectBrowserStatistics(snapshot);
  assert.equal(node.containment.confirmedLeaseExits, 2);
  assert.equal(
    Object.hasOwn(node.containment, 'unconfirmedRetirements'),
    false,
  );
  assert.equal(browser.containment.unconfirmedRetirements, 3);
  assert.equal(
    Object.hasOwn(browser.containment, 'confirmedLeaseExits'),
    false,
  );
  assert.equal(
    node.workers.details[0].threadId,
    snapshot.workers.details[0].threadId,
  );
  assert.equal(Object.hasOwn(browser.workers.details[0], 'threadId'), false);
  for (const [key, value] of Object.entries(snapshot))
    if (key !== 'workers' && key !== 'containment') {
      assert.equal(node[key], value);
      assert.equal(browser[key], value);
    }
  for (const [key, value] of Object.entries(snapshot.containment)) {
    if (key !== 'unconfirmedRetirements')
      assert.equal(node.containment[key], value);
    if (key !== 'confirmedLeaseExits')
      assert.equal(browser.containment[key], value);
  }
  for (const [key, value] of Object.entries(snapshot.workers.details[0]))
    if (key !== 'threadId')
      assert.deepEqual(browser.workers.details[0][key], value);
  assert.deepEqual(snapshot, original);
  assert.throws(
    () => projectNodeStatistics({ ...snapshot, workers: browser.workers }),
    /threadId/,
  );
});

test('bound recovery policy preserves getter and rejection order without selecting by host name', async (t) => {
  const registry = new PjsTaskRegistry();
  const task = registry.register('echo', fixture, 'echo');
  const limited = Object.freeze({
    mode: 'limited',
    causes: Object.freeze(['task-error']),
    retryError: 'Limited recovery requires validated completion',
    fallbackError: 'Limited fallback requires validated completion',
  });
  for (const recovery of [nodeHost.recovery, limited]) {
    // Same confirmed-exit transport, different immutable recovery capability.
    const components = createRuntimeComponents(
      { registry, workers: 1 },
      { ...nodeHost, recovery },
    );
    const runtime = new RuntimeFacade(components, projectNodeStatistics);
    t.after(() => runtime.shutdown());
    await runtime.ready();
    const reads = [];
    const bytes = new ArrayBuffer(4);
    const retry = {
      get maxAttempts() {
        reads.push('maxAttempts');
        return 2;
      },
      get backoffMs() {
        reads.push('backoffMs');
        return 0;
      },
      get on() {
        reads.push('on');
        return ['worker-crash'];
      },
    };
    await assert.rejects(
      runtime.run(task, bytes, {
        repeatable: false,
        retry,
        get transferList() {
          reads.push('transferList');
          return [bytes];
        },
      }),
      recovery === limited
        ? /Limited recovery requires validated completion/
        : /repeatable must be true/,
    );
    assert.deepEqual(reads, recovery === limited ? ['on'] : []);
    assert.equal(bytes.byteLength, 4);
    assert.equal(runtime.stats().tasks.rejected, 1);
    assert.equal(runtime.stats().tasks.accepted, 0);
    assert.equal(runtime.stats().workers.activeExecutions, 0);
    assert.equal(Object.isFrozen(components.taskCoordinator.host), true);
    assert.equal(Object.isFrozen(components.rangeCoordinator.host), true);
    assert.equal(Object.isFrozen(components.dispatcher.host), true);
    reads.length = 0;
    if (recovery !== limited) {
      const result = await runtime.run(task, 7, { repeatable: true, retry });
      assert.equal(result.input, 7);
      assert.deepEqual(reads, ['maxAttempts', 'backoffMs', 'on']);
    }
  }
});
