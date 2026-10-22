import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsTaskRegistrationError,
  PjsWorkerError,
} from '../dist/index.js';
import { snapshotRegistry } from '../dist/tasks/registry.js';
import { until } from './helpers/containment.mjs';

const module = new URL('./fixtures/containment-tasks.mjs', import.meta.url);

test('registry storage and snapshot access are absent from public instances and prototype', () => {
  const registry = new PjsTaskRegistry();
  registry.register('echo', module, 'echo');
  assert.deepEqual(Reflect.ownKeys(registry), []);
  assert.deepEqual(Reflect.ownKeys(PjsTaskRegistry.prototype), [
    'constructor',
    'register',
  ]);
  assert.equal(typeof registry.snapshot, 'undefined');
  assert.equal(registry.entries, undefined);
});

test('internal snapshots copy maps and descriptors while preserving frozen handle identity', () => {
  const registry = new PjsTaskRegistry();
  const handle = registry.register('echo', module);
  const first = snapshotRegistry(registry);
  const second = snapshotRegistry(registry);
  assert.ok(Object.isFrozen(handle));
  assert.notEqual(first, second);
  assert.notEqual(first.get(handle), second.get(handle));
  assert.deepEqual(first.get(handle), {
    id: 'echo',
    module: module.href,
    exportName: 'default',
  });
  assert.equal([...first.keys()][0], handle);
  first.get(handle).id = 'changed';
  first.get(handle).module = 'file:///changed.mjs';
  first.get(handle).exportName = 'changed';
  first.clear();
  assert.deepEqual(snapshotRegistry(registry).get(handle), second.get(handle));
  const late = registry.register('late', module, 'echo');
  assert.equal(second.has(late), false);
  assert.equal(snapshotRegistry(registry).has(late), true);
  const other = new PjsTaskRegistry();
  const sameId = other.register('echo', module);
  assert.notEqual(sameId, handle);
  assert.equal(snapshotRegistry(other).has(handle), false);
});

test('registration retains validation errors, default export and URL getter timing', () => {
  const registry = new PjsTaskRegistry();
  const reads = [];
  class ObservedURL extends URL {
    get protocol() {
      reads.push('protocol');
      return super.protocol;
    }
    get href() {
      reads.push('href');
      return super.href;
    }
  }
  const observed = new ObservedURL(module);
  const handle = registry.register('echo', observed);
  assert.deepEqual(reads, ['protocol', 'href']);
  assert.equal(snapshotRegistry(registry).get(handle).exportName, 'default');
  reads.length = 0;
  for (const args of [
    ['echo', observed, 'echo'],
    ['', observed, 'echo'],
    ['remote', new URL('https://example.com/task.mjs'), 'echo'],
    ['path', module.href, 'echo'],
    ['null', null, 'echo'],
    ['export', module, ''],
  ])
    assert.throws(() => registry.register(...args), PjsTaskRegistrationError);
  assert.deepEqual(reads, []);
  assert.equal(snapshotRegistry(registry).size, 1);
});

test('invalid snapshot and borrowed registration receivers reject without reading forged storage', () => {
  const registry = new PjsTaskRegistry();
  const handle = registry.register('echo', module, 'echo');
  let reads = 0;
  const forged = Object.create(PjsTaskRegistry.prototype, {
    entries: {
      get() {
        reads++;
        throw new Error('must not read forged storage');
      },
    },
  });
  const receivers = [
    null,
    undefined,
    {},
    forged,
    Object.create(registry),
    new Proxy(registry, {}),
  ];
  for (const receiver of receivers) {
    assert.throws(() => snapshotRegistry(receiver), TypeError);
    assert.throws(
      () =>
        Reflect.apply(PjsTaskRegistry.prototype.register, receiver, [
          'other',
          module,
          'echo',
        ]),
      TypeError,
    );
  }
  assert.equal(reads, 0);
  assert.deepEqual([...snapshotRegistry(registry).keys()], [handle]);
});

test('runtime snapshots isolate later registration, descriptor copies and foreign same-ID handles', async () => {
  const registry = new PjsTaskRegistry();
  const echo = registry.register('echo', module, 'echo');
  const copy = snapshotRegistry(registry);
  const first = new PjsRuntime({ registry, workers: 1 });
  let second;
  try {
    const late = registry.register('late', module, 'echo');
    const foreign = new PjsTaskRegistry().register('echo', module, 'echo');
    copy.get(echo).exportName = 'missing';
    copy.clear();
    await first.ready();
    assert.equal(await first.run(echo, 7), 7);
    for (const handle of [late, foreign, { id: 'echo' }])
      await assert.rejects(first.run(handle, 1), PjsTaskRegistrationError);
    second = new PjsRuntime({ registry, workers: 1 });
    await second.ready();
    assert.equal(await second.run(late, 8), 8);
    assert.equal(await second.run(echo, 9), 9);
  } finally {
    await Promise.all([
      first.shutdown({ drain: false }),
      second?.shutdown({ drain: false }),
    ]);
  }
});

test('worker replacement uses the captured descriptors rather than later registrations', async () => {
  const registry = new PjsTaskRegistry();
  const echo = registry.register('echo', module, 'echo');
  const crash = registry.register('crash', module, 'crash');
  const runtime = new PjsRuntime({ registry, workers: 1, maxRestarts: 1 });
  try {
    await runtime.ready();
    const originalId = runtime.stats().workers.details[0].id;
    assert.equal(await runtime.run(echo, 9), 9);
    const original = runtime.stats().workers.details[0];
    assert.equal(original.completedTasks, 1);
    const late = registry.register(
      'late',
      new URL('./fixtures/absent-b3-task.mjs', import.meta.url),
    );
    await assert.rejects(runtime.run(crash, null), PjsWorkerError);
    await until(
      () =>
        runtime.stats().workers.idle === 1 &&
        runtime.stats().workers.restarts === 1,
    );
    assert.notEqual(runtime.stats().workers.details[0].id, originalId);
    assert.equal(runtime.stats().workers.details[0].completedTasks, 0);
    assert.equal(runtime.stats().workers.details[0].failedTasks, 0);
    assert.equal(runtime.stats().tasks.completed, 1);
    assert.equal(original.completedTasks, 1);
    assert.equal(await runtime.run(echo, 10), 10);
    await assert.rejects(runtime.run(late, 1), PjsTaskRegistrationError);
  } finally {
    await runtime.shutdown({ drain: false });
  }
});

test('composition ignores a forged snapshot property and rejects an invalid registry before the queue getter', async () => {
  const registry = new PjsTaskRegistry();
  const echo = registry.register('echo', module, 'echo');
  Object.defineProperty(registry, 'snapshot', {
    get() {
      throw new Error('unsupported snapshot hook');
    },
  });
  const runtime = new PjsRuntime({ registry, workers: 1 });
  try {
    assert.equal(await runtime.run(echo, 11), 11);
  } finally {
    await runtime.shutdown({ drain: false });
  }
  let queueReads = 0;
  assert.throws(
    () =>
      new PjsRuntime({
        registry: Object.create(PjsTaskRegistry.prototype),
        workers: 1,
        get maxQueue() {
          queueReads++;
          throw new Error('queue read too early');
        },
      }),
    TypeError,
  );
  assert.equal(queueReads, 0);
});
