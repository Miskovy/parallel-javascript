import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsMapContractError,
  PjsCancelledError,
} from '../dist/index.js';
import { ExecutionDispatcher } from '../dist/dispatch/dispatcher.js';
import { run } from '../dist/api/run.js';
import { partitionRange } from '../dist/api/range/partition-range.js';
import { parallelFor } from '../dist/api/range/parallel-for.js';
import { parallelMapRange } from '../dist/api/range/parallel-map-range.js';
import { streamRange } from '../dist/api/range/stream-range.js';
import {
  assembleMapBlock,
  validateMapBlock,
} from '../dist/partition/results/map-assembly.js';
import { runtimeComponents } from './helpers/runtime-inspection.mjs';

const fixture = new URL('./fixtures/containment-tasks.mjs', import.meta.url);
const range = { start: 10, end: 14, grainSize: 2 };
const factory = (partition) => ({ input: partition });

test('construction preserves getter/snapshot/start order and starts the complete graph synchronously', async () => {
  const events = [];
  const registry = new PjsTaskRegistry();
  const task = registry.register('echo', fixture, 'echo');
  let beforeSnapshot, late;
  const policy = new Proxy(
    { maxRestarts: 2, windowMs: 100 },
    {
      get(target, key) {
        events.push('policy.' + key);
        return target[key];
      },
    },
  );
  const options = new Proxy(
    {
      registry,
      minWorkers: 1,
      maxWorkers: 2,
      workers: 1,
      startupTimeout: 1000,
      restartPolicy: policy,
    },
    {
      get(target, key) {
        events.push(key);
        if (key === 'registry')
          beforeSnapshot = registry.register('getter', fixture, 'echo');
        if (key === 'maxQueue')
          late = registry.register('late', fixture, 'echo');
        return target[key];
      },
    },
  );
  const start = ExecutionDispatcher.prototype.start;
  let runtime;
  try {
    ExecutionDispatcher.prototype.start = function () {
      events.push('start');
      // This callback reaches the lifecycle owner and both coordinators immediately.
      this.callbacks.ready();
      const ready = start.call(this);
      assert.equal(this.pool.workers.size, 1);
      return ready;
    };
    runtime = new PjsRuntime(options);
  } finally {
    ExecutionDispatcher.prototype.start = start;
  }
  try {
    assert.deepEqual(events, [
      'minWorkers',
      'maxWorkers',
      'workers',
      'idleTimeout',
      'startupTimeout',
      'maxRestarts',
      'restartPolicy',
      'maxRestarts',
      'restartPolicy',
      'policy.maxRestarts',
      'restartPolicy',
      'policy.windowMs',
      'resourceLimits',
      'registry',
      'maxQueue',
      'start',
    ]);
    assert.equal(runtime.stats().state, 'starting');
    assert.ok(runtimeComponents(runtime).telemetry);
    await runtime.ready();
    assert.equal(await runtime.run(task, 7), 7);
    // The registry getter precedes capture, and the queue getter follows it.
    assert.equal(await runtime.run(beforeSnapshot, 8), 8);
    await assert.rejects(runtime.run(late, 1), /registry snapshot/);
  } finally {
    await runtime.shutdown({ drain: false });
  }
});

test('facade retains prototype methods, readiness identity and first shutdown promise/options', async () => {
  const runtime = new PjsRuntime({
    registry: new PjsTaskRegistry(),
    workers: 1,
  });
  const ready = runtime.ready();
  assert.equal(runtime.ready(), ready);
  for (const method of [
    'ready',
    'run',
    'partitionRange',
    'parallelFor',
    'parallelMapRange',
    'streamRange',
    'stats',
    'shutdown',
  ])
    assert.equal(Object.hasOwn(runtime, method), false);
  assert.throws(() => runtime.shutdown({ forceAfter: 0 }), RangeError);
  await ready;
  assert.equal(runtime.ready(), ready);
  const reads = [];
  const shutdown = runtime.shutdown({
    get forceAfter() {
      reads.push('forceAfter');
      return 1000;
    },
    get drain() {
      reads.push('drain');
      return true;
    },
  });
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error('later options read');
      },
    },
  );
  assert.equal(runtime.shutdown(poison), shutdown);
  assert.deepEqual(reads, ['forceAfter', 'drain', 'drain']);
  await shutdown;
  assert.equal(runtime.shutdown(poison), shutdown);
  assert.equal(runtime.ready(), ready);
});

test('API adapters preserve request references, modes, constructor getter timing and returned promises', () => {
  const task = { id: 'port-task' };
  const options = {};
  const promise = Promise.resolve();
  let args;
  const port = {
    start(...request) {
      args = request;
      return promise;
    },
  };
  assert.equal(
    run(
      {
        submit(...request) {
          args = request;
          return promise;
        },
      },
      task,
      range,
      options,
    ),
    promise,
  );
  assert.deepEqual(args, [task, range, options]);
  assert.equal(partitionRange(port, task, range, factory, options), promise);
  assert.deepEqual(args, [task, range, factory, options, 'collect']);
  assert.equal(parallelFor(port, task, range, factory, options), promise);
  assert.deepEqual(args, [task, range, factory, options, 'discard']);
  const events = [];
  const mapOptions = new Proxy(
    { experimentalOutputConstructor: Float64Array },
    {
      has(target, key) {
        events.push('has:' + key);
        return key in target;
      },
      get(target, key) {
        events.push('get:' + key);
        return target[key];
      },
    },
  );
  assert.equal(
    parallelMapRange(port, task, range, factory, mapOptions),
    promise,
  );
  assert.deepEqual(events, [
    'has:outputConstructor',
    'has:experimentalOutputConstructor',
    'get:experimentalOutputConstructor',
  ]);
  assert.deepEqual(args, [
    task,
    range,
    factory,
    mapOptions,
    'map',
    undefined,
    Float64Array,
  ]);
  const failure = new Error('constructor getter');
  assert.throws(
    () =>
      parallelMapRange(port, task, range, factory, {
        get experimentalOutputConstructor() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
});

test('stream API normalizes count/exact/upper-bound options before starting the parent', async () => {
  for (const mode of ['count', 'exact', 'upper-bound']) {
    let args;
    const options =
      mode === 'count'
        ? {}
        : {
            [mode === 'exact'
              ? 'experimentalResultBytes'
              : 'experimentalMaxResultBytes']: 16,
            experimentalMaxReservedResultBytes: 32,
          };
    const stream = streamRange(
      {
        workerCount: 3,
        start(...request) {
          args = request;
          return Promise.resolve();
        },
        rejectedOptions() {
          assert.fail('unexpected rejection');
        },
        rejectedResultBytes() {
          assert.fail('unexpected byte rejection');
        },
      },
      { id: 'stream' },
      range,
      factory,
      options,
    );
    assert.equal(args[3], options);
    assert.equal(args[4], 'stream');
    assert.equal(args[5], stream);
    assert.equal(stream.capacity, 3);
    assert.equal(args[7], mode === 'count' ? undefined : 16);
    assert.equal(args[8], mode === 'count' ? undefined : 32);
    assert.equal(args[9], mode === 'upper-bound' ? mode : 'exact');
    await stream.next();
  }
});

test('failed stream normalization counts rejection before reentrant property checks and rejects iteration', async () => {
  const events = [];
  const failure = new Error('count getter');
  const options = new Proxy(
    {},
    {
      get() {
        throw failure;
      },
      has(target, key) {
        events.push('has:' + key);
        return (
          key === 'experimentalMaxBufferedResults' ||
          key === 'experimentalResultBytes'
        );
      },
    },
  );
  const stream = streamRange(
    {
      workerCount: 1,
      start() {
        assert.fail('invalid stream admitted');
      },
      rejectedOptions() {
        events.push('rejected');
      },
      rejectedResultBytes() {
        events.push('bytes');
      },
    },
    { id: 'invalid' },
    range,
    factory,
    options,
  );
  assert.deepEqual(events, [
    'has:maxBufferedResults',
    'has:experimentalMaxBufferedResults',
    'rejected',
    'has:experimentalResultBytes',
    'bytes',
  ]);
  await assert.rejects(stream.next(), (error) => error === failure);
});

test('map assembly preserves logical offsets and validates whole blocks before copying', () => {
  const partition = { index: 1, start: 12, end: 14 };
  for (const constructor of [undefined, Float64Array, BigInt64Array]) {
    const values = constructor === BigInt64Array ? [3n, 4n] : [3, 4];
    const target = constructor ? new constructor(4) : new Array(4);
    const block = constructor ? new constructor(values) : values;
    assert.equal(
      assembleMapBlock(
        target,
        10,
        partition,
        validateMapBlock('map-owner', partition, block, constructor),
        constructor,
      ),
      2,
    );
    assert.deepEqual(Array.from(target).slice(2), values);
    const before = Array.from(target);
    assert.throws(
      () => validateMapBlock('map-owner', partition, [], constructor),
      (error) => {
        assert.ok(error instanceof PjsMapContractError);
        assert.equal(error.operationId, 'map-owner');
        assert.equal(error.partitionIndex, 1);
        assert.equal(error.rangeStart, 12);
        assert.equal(error.rangeEnd, 14);
        return true;
      },
    );
    assert.deepEqual(Array.from(target), before);
  }
});

test('map result validation getters can abort before the coordinator reads its assembly target', async () => {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'map',
    new URL('./fixtures/partition-tasks.mjs', import.meta.url),
    'mapBlock',
  );
  const runtime = new PjsRuntime({ registry, workers: 1 });
  const descriptor = Object.getOwnPropertyDescriptor(
    Float64Array.prototype,
    'constructor',
  );
  const abort = new AbortController();
  let getters = 0;
  try {
    await runtime.ready();
    Object.defineProperty(Float64Array.prototype, 'constructor', {
      configurable: true,
      get() {
        getters++;
        abort.abort();
        return Float64Array;
      },
    });
    await assert.rejects(
      runtime.parallelMapRange(
        task,
        { start: 0, end: 2, grainSize: 2 },
        (partition) => ({ input: { partition, kind: 'float64' } }),
        { outputConstructor: Float64Array, signal: abort.signal },
      ),
      PjsCancelledError,
    );
    assert.equal(getters, 1);
    assert.equal(runtime.stats().operations.cancelled, 1);
    assert.equal(runtime.stats().mapResults.blocks, 0);
    assert.equal(runtime.stats().mapResults.elements, 0);
  } finally {
    Object.defineProperty(Float64Array.prototype, 'constructor', descriptor);
    await runtime.shutdown({ drain: false });
  }
});

test('new internal modules remain blocked as package subpaths', async () => {
  for (const path of [
    'api/run',
    'api/range/parallel-for',
    'configuration/runtime-options',
    'composition/create-runtime-components',
    'lifecycle/runtime-controller',
    'partition/results/map-assembly',
  ])
    await assert.rejects(import('@pjavascript/runtime/' + path), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
});

test('range validation retains getter order before state rejection and never invokes a factory', async () => {
  const runtime = new PjsRuntime({
    registry: new PjsTaskRegistry(),
    workers: 1,
  });
  await runtime.ready();
  await runtime.shutdown();
  for (const method of [
    'partitionRange',
    'parallelFor',
    'parallelMapRange',
    'streamRange',
  ]) {
    const events = [];
    const observedRange = new Proxy(range, {
      get(target, key) {
        events.push('range.' + key);
        return target[key];
      },
    });
    const options = new Proxy(
      { experimentalOutputConstructor: Float64Array },
      {
        has(target, key) {
          events.push('has:' + key);
          return key in target;
        },
        get(target, key) {
          events.push('get:' + key);
          return target[key];
        },
      },
    );
    const result = runtime[method](
      { id: 'unregistered' },
      observedRange,
      () => assert.fail('factory after shutdown'),
      options,
    );
    await assert.rejects(
      method === 'streamRange' ? result[Symbol.asyncIterator]().next() : result,
      /Runtime is stopped/,
    );
    const prefix =
      method === 'parallelMapRange'
        ? [
            'has:outputConstructor',
            'has:experimentalOutputConstructor',
            'get:experimentalOutputConstructor',
          ]
        : method === 'streamRange'
          ? [
              'has:maxBufferedResults',
              'has:experimentalMaxBufferedResults',
              'has:resultBytes',
              'has:experimentalResultBytes',
              'has:maxResultBytes',
              'has:experimentalMaxResultBytes',
              'has:maxReservedResultBytes',
              'has:experimentalMaxReservedResultBytes',
            ]
          : [];
    assert.deepEqual(events, [
      ...prefix,
      'has:executionLease',
      'range.start',
      'range.end',
      'range.grainSize',
      'get:timeout',
      'get:signal',
      'get:cancellation',
      'has:dispatchBatchSize',
      'has:experimentalDispatchBatchSize',
      'has:priority',
      'has:onProgress',
    ]);
  }
});
