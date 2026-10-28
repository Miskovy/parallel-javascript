import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MessageProgressReporter,
  encodeProgress,
  utf8Bytes,
} from '../dist/workers/progress.js';
import { ResultCreditManager } from '../dist/results/credit.js';
import { validateInitialization } from '../dist/hosts/browser/protocol.js';
import { createRuntimeComponents } from '../dist/composition/create-runtime-components.js';
import { RuntimeFacade } from '../dist/runtime-facade.js';
import { nodeHost } from '../dist/hosts/node.js';
import { bounded, clock } from './helpers/containment.mjs';
import {
  browserCapabilities,
  PjsRuntime,
  PjsTaskRegistry,
} from '../dist/browser/index.js';

test('message progress permits require the exact frame, coalesce and close idempotently', () => {
  const sent = [];
  const reporter = new MessageProgressReporter((message) => sent.push(message));
  const frame = (taskId, sequence) => ({
    type: 'progress',
    correlationId: 'batch',
    taskId,
    sequence,
    payload: '{}',
    bytes: 2,
  });
  reporter.report(frame('first', 1));
  for (let sequence = 2; sequence <= 10000; sequence++)
    reporter.report(frame('second', sequence));
  assert.equal(sent.length, 1);
  reporter.wake('second', 1);
  reporter.wake('first', 2);
  reporter.wake();
  assert.equal(sent.length, 1);
  reporter.wake('first', 1);
  assert.deepEqual(
    sent.map(({ taskId, sequence }) => [taskId, sequence]),
    [
      ['first', 1],
      ['second', 10000],
    ],
  );
  reporter.report(frame('third', 1));
  reporter.wake('first', 1); // Duplicate acknowledgement cannot grant another permit.
  assert.equal(sent.length, 2);
  reporter.close();
  reporter.close();
  reporter.wake('second', 10000);
  assert.equal(reporter.report(frame('third', 2)), false);
  assert.equal(sent.length, 2);
});

test('portable progress bounds reject before serialization and count UTF-8 without copying', () => {
  let invoked = false;
  const value = {
    get huge() {
      invoked = true;
      return 'x'.repeat(1000000);
    },
  };
  assert.equal(encodeProgress(value), undefined);
  assert.equal(invoked, false);
  assert.equal(encodeProgress('x'.repeat(20000)), undefined);
  for (const value of ['abc', '𝄞', 'é', '\ud800', 'a'.repeat(17000)]) {
    const bytes = new globalThis.TextEncoder().encode(value).byteLength;
    if (bytes > 16384) assert.ok(utf8Bytes(value) > 16384);
    else assert.equal(utf8Bytes(value), bytes);
  }
});

test('browser entry is inert outside Window and rejects incompatible initialization', () => {
  assert.equal(browserCapabilities().windowHost, false);
  assert.throws(
    () => new PjsRuntime({ registry: new PjsTaskRegistry() }),
    /Window/,
  );
  const valid = {
    type: 'initialize',
    browserProtocol: 1,
    data: { version: 2, tasks: [], concurrency: 1 },
    sharedMemory: false,
  };
  assert.equal(validateInitialization(valid), valid);
  for (const value of [
    null,
    { ...valid, browserProtocol: 0 },
    { ...valid, sharedMemory: undefined },
    {
      ...valid,
      data: {
        version: 2,
        tasks: [{ id: 'x', module: 'file:///task.js', exportName: 'default' }],
      },
    },
  ])
    assert.throws(() => validateInitialization(value));
});

test('browser abandonment cannot run on Node or during posting and never marks completion', () => {
  assert.throws(() => new ResultCreditManager().abandonExecution('id'), /Node/);
  const manager = new ResultCreditManager(true, true);
  const operation = { id: 'operation', resultByteCapacity: 4 };
  manager.reserve('task', operation, 0, 4, {
    operationId: operation.id,
    partitionIndex: 0,
    rangeStart: 0,
    rangeEnd: 1,
  });
  manager.markDispatching('execution', ['task']);
  manager.markCallerSettled('task');
  assert.throws(() => manager.abandonExecution('execution'), /posting/);
  assert.equal(manager.reserved(operation), 4);
  manager.markDispatched('execution', ['task']);
  manager.abandonExecution('execution');
  manager.abandonExecution('execution');
  assert.equal(manager.reserved(operation), 0);
  assert.equal(manager.executions.size, 0);
  manager.assertInvariants('test');
});

test(
  'elastic browser retirement notifies committed occupancy and releases graceful drain without replacement',
  bounded,
  async (t) => {
    // Deterministic transport; all admission, retirement and lifecycle owners are real.
    const endpoints = [];
    const started = Promise.withResolvers();
    const host = {
      ...nodeHost,
      lifecycle: 'endpoint-revocation',
      moduleProtocols: ['http:', 'https:'],
      sharedMemory: false,
      worker: {
        validateTransferList: nodeHost.worker.validateTransferList,
        lifecycle: 'endpoint-revocation',
        create() {
          let callbacks;
          const endpoint = { terminations: 0, detached: false };
          endpoints.push(endpoint);
          return {
            lifecycle: 'endpoint-revocation',
            thread: {
              postMessage(message) {
                if (message.type !== 'execute') return;
                globalThis.queueMicrotask(() => {
                  callbacks.message({
                    type: 'started',
                    taskId: message.taskId,
                  });
                  started.resolve();
                });
              },
              terminate() {
                endpoint.terminations++;
              },
            },
            listen(value) {
              callbacks = value;
              globalThis.queueMicrotask(() =>
                callbacks.message({ type: 'ready', version: 2 }),
              );
            },
            detach() {
              endpoint.detached = true;
            },
          };
        },
      },
    };
    const registry = new PjsTaskRegistry();
    const task = registry.register(
      'held',
      new URL('https://example.test/tasks.js'),
    );
    const components = createRuntimeComponents(
      { registry, workers: 2, minWorkers: 1, maxWorkers: 2, idleTimeout: 1000 },
      host,
    );
    const runtime = new RuntimeFacade(components, (stats) => stats);
    const { dispatcher, controller } = components;
    clock(dispatcher.pool, 'Idle');
    const retirement = Promise.withResolvers();
    const release = Promise.withResolvers();
    // Failure cleanup only; no extra stop or pump is used to satisfy the assertions.
    t.after(async () => {
      release.resolve();
      await dispatcher.stop();
    });
    await runtime.ready();
    assert.equal(endpoints.length, 2);
    const abort = new AbortController();
    const work = assert.rejects(
      runtime.run(task, null, {
        signal: abort.signal,
        cancellation: 'terminate',
      }),
      { name: 'PjsCancelledError' },
    );
    await started.promise;
    const worker = [...dispatcher.pool.workers.values()].find(
      (worker) => worker.hasPhysicalExecution,
    );
    const postingQuiescent = worker.callbacks.postingQuiescent;
    worker.callbacks.postingQuiescent = async (owner) => {
      await postingQuiescent(owner);
      assert.equal(dispatcher.postings.size, 0);
      retirement.resolve();
      await release.promise;
    };
    let notifiedBusy;
    let notifications = 0;
    const revoked = worker.callbacks.revoked;
    worker.callbacks.revoked = (owner, ids) => {
      notifiedBusy = dispatcher.busy;
      notifications++;
      revoked(owner, ids);
    };
    abort.abort();
    await Promise.all([work, retirement.promise]);
    assert.equal(worker.activeExecutions, 1);
    assert.equal(endpoints[0].terminations, 0);
    const draining = Promise.withResolvers();
    const checkDrained = controller.checkDrained.bind(controller);
    controller.checkDrained = () => {
      checkDrained();
      if (controller.drainResolve) draining.resolve();
    };
    const shutdown = runtime.shutdown();
    await draining.promise;
    assert.equal(dispatcher.pool.desired, 1);
    release.resolve();
    await worker.stop();
    assert.equal(
      notifiedBusy,
      0,
      'revocation must notify lifecycle after occupancy commits',
    );
    await shutdown;
    assert.equal(notifications, 1);
    assert.equal(endpoints.length, 2, 'no replacement readiness notification');
    assert.ok(
      endpoints.every(
        (endpoint) => endpoint.terminations === 1 && endpoint.detached,
      ),
    );
    assert.equal(dispatcher.pool.replacements, 0);
    assert.equal(controller.escalations, 0);
    assert.equal(runtime.stats().state, 'stopped');
    assert.deepEqual(components.resultCredits.diagnostics(), {
      reservations: 0,
      executions: 0,
      operations: 0,
    });
  },
);
