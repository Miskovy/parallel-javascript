import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../dist/index.js';
import { until } from './helpers/containment.mjs';

test('public errors retain concrete hierarchy, empty messages and selective metadata', () => {
  const cause = { original: true };
  const context = {
    taskId: 't',
    workerId: 2,
    operationId: 'o',
    partitionIndex: 3,
    rangeStart: 6,
    rangeEnd: 8,
    cause,
    declaredBytes: 8,
    actualBytes: 4,
    actualType: 'Uint8Array',
    resultByteCapacity: 16,
  };
  const names = Object.keys(api).filter((name) => name.endsWith('Error'));
  assert.equal(names.length, 13);
  for (const name of names) {
    const error =
      name === 'PjsTaskError'
        ? new api[name](
            { name: 'Remote', message: '', stack: 'trace' },
            context,
          )
        : new api[name]('', context);
    assert.ok(error instanceof Error);
    assert.ok(error instanceof api.PjsError);
    assert.equal(error.name, name);
    assert.equal(error.message, '');
    assert.equal(error.cause, cause);
    for (const key of [
      'taskId',
      'workerId',
      'operationId',
      'partitionIndex',
      'rangeStart',
      'rangeEnd',
    ])
      assert.equal(error[key], context[key]);
    if (name === 'PjsTaskError') {
      assert.equal(error.remoteName, 'Remote');
      assert.equal(error.remoteStack, 'trace');
      assert.ok(error.stack.includes('Worker stack (Remote):\ntrace'));
    }
  }
  assert.ok(new api.PjsExecutionLeaseError('') instanceof api.PjsWorkerError);
  const binary = new api.PjsBinaryResultContractError('', context);
  assert.equal(binary.actualBytes, 4);
  assert.equal(binary.actualType, 'Uint8Array');
  assert.equal('resultByteCapacity' in binary, false);
  const capacity = new api.PjsResultCapacityError('', context);
  assert.equal(capacity.declaredBytes, 8);
  assert.equal(capacity.resultByteCapacity, 16);
  assert.equal('actualBytes' in capacity, false);
  assert.equal(
    new api.PjsTaskError({ name: 'Remote', message: '' }, {}).remoteStack,
    undefined,
  );
  assert.equal(
    new api.PjsTaskError({ name: 'Remote', message: '', stack: '' }, {})
      .remoteStack,
    '',
  );
  for (const key of [
    'taskId',
    'workerId',
    'operationId',
    'partitionIndex',
    'rangeStart',
    'rangeEnd',
  ])
    assert.ok(Object.hasOwn(new api.PjsError(''), key));
});

test('writable diagnostic copies isolate active state and caller settlement precedes physical completion', async (t) => {
  const registry = new api.PjsTaskRegistry();
  const gate = registry.register(
    'gate',
    new URL('./fixtures/tasks.mjs', import.meta.url),
    'gate',
  );
  const runtime = new api.PjsRuntime({ registry, workers: 1 });
  const buffer = new SharedArrayBuffer(8);
  const control = new Int32Array(buffer);
  const release = () => {
    Atomics.store(control, 1, 1);
    Atomics.notify(control, 1);
  };
  t.after(async () => {
    release();
    await runtime.shutdown({ drain: false });
  });
  const initial = runtime.stats();
  assert.deepEqual(initial.timing, {
    averageQueueMs: 0,
    averageExecutionMs: 0,
    averageTotalMs: 0,
    queueSamples: 0,
    executionSamples: 0,
    settledSamples: 0,
  });
  assert.equal(initial.dispatch.averageLogicalTasksPerExecute, 0);
  assert.ok(Object.hasOwn(initial.containment, 'restartWindowUtilization'));
  assert.equal(initial.containment.restartWindowUtilization, undefined);
  await runtime.ready();
  const controller = new AbortController();
  const result = runtime.run(gate, { buffer }, { signal: controller.signal });
  const rejected = assert.rejects(result, api.PjsCancelledError);
  await until(
    () =>
      Atomics.load(control, 0) === 1 &&
      runtime.stats().activeTasks[0]?.status === 'running',
  );
  const copy = runtime.stats();
  const original = structuredClone(copy);
  const mutate = (value) => {
    for (const key of Object.keys(value)) {
      if (value[key] && typeof value[key] === 'object') mutate(value[key]);
      else if (typeof value[key] === 'number') value[key] = -999;
      else if (typeof value[key] === 'string') value[key] = 'modified copy';
    }
  };
  mutate(copy);
  copy.activeTasks.length = 0;
  copy.workers.details.length = 0;
  assert.deepEqual(runtime.stats(), original);
  assert.equal(original.tasks.accepted, 1);
  assert.equal(original.tasks.pending, 1);
  controller.abort();
  await rejected;
  const settled = runtime.stats();
  assert.equal(settled.tasks.pending, 0);
  assert.equal(settled.tasks.cancelled, 1);
  assert.equal(settled.activeTasks.length, 0);
  assert.equal(settled.workers.busy, 1);
  assert.equal(settled.timing.settledSamples, 1);
  assert.equal(settled.timing.executionSamples, 0);
  assert.equal(settled.timing.averageExecutionMs, 0);
  release();
  await until(() => runtime.stats().workers.idle === 1);
  assert.equal(runtime.stats().timing.executionSamples, 1);
  assert.equal(runtime.stats().tasks.completed, 0);
  assert.equal(initial.tasks.accepted, 0);
});
