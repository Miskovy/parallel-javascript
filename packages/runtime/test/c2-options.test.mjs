import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsCancelledError,
  PjsRuntimeStateError,
  PjsSerializationError,
  PjsMapContractError,
} from '../dist/index.js';
import { assertOwners, until } from './helpers/containment.mjs';

const range = { start: 0, end: 2, grainSize: 1 };
const methods = [
  'partitionRange',
  'parallelFor',
  'parallelMapRange',
  'streamRange',
];
const pairs = [
  ['dispatchBatchSize', 'experimentalDispatchBatchSize', 1, methods],
  ['maxBufferedResults', 'experimentalMaxBufferedResults', 1, ['streamRange']],
  [
    'outputConstructor',
    'experimentalOutputConstructor',
    Float64Array,
    ['parallelMapRange'],
  ],
];
function setup(t) {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'map',
    new URL('./fixtures/partition-tasks.mjs', import.meta.url),
    'mapBlock',
  );
  const runtime = new PjsRuntime({ registry, workers: 1, maxQueue: 16 });
  t.after(async () => {
    await runtime.shutdown({ drain: false });
    assertOwners(runtime, { quiescent: true });
  });
  return { runtime, task };
}
function submit(
  runtime,
  task,
  method,
  options,
  factory = (partition) => ({ input: { partition } }),
) {
  const result = runtime[method](task, range, factory, options);
  return method === 'streamRange' ? result.next() : result;
}

for (const [current, legacy, value, applicable] of pairs) {
  test(`${current}: both-presence rejects before getters, factories, transfer or posting`, async (t) => {
    const { runtime, task } = setup(t);
    await runtime.ready();
    for (const method of applicable) {
      for (const values of [
        [value, value],
        [value, 2],
        [undefined, value],
        [value, undefined],
        [undefined, undefined],
      ]) {
        for (const inherited of ['neither', 'current', 'legacy', 'both']) {
          const own = {};
          const prototype = {};
          const reads = [];
          for (const [name, selected] of [
            [current, values[0]],
            [legacy, values[1]],
          ]) {
            const target =
              inherited === 'both' ||
              inherited === (name === current ? 'current' : 'legacy')
                ? prototype
                : own;
            Object.defineProperty(target, name, {
              get() {
                reads.push(name);
                return selected;
              },
            });
          }
          Object.setPrototypeOf(own, prototype);
          const input = new Uint8Array([7]);
          const before = runtime.stats();
          const call = () =>
            submit(runtime, task, method, own, () => {
              assert.fail('invalid aliases invoked factory');
              return { input, transferList: [input.buffer] };
            });
          if (current === 'outputConstructor')
            assert.throws(call, /mutually exclusive/);
          else await assert.rejects(call(), /mutually exclusive/);
          const after = runtime.stats();
          assert.deepEqual(reads, []);
          assert.equal(input.byteLength, 1);
          assert.equal(
            after.dispatch.executeMessages,
            before.dispatch.executeMessages,
          );
          assert.equal(after.tasks.accepted, before.tasks.accepted);
          assert.equal(after.operations.accepted, before.operations.accepted);
          assert.equal(
            after.operations.rejected - before.operations.rejected,
            current === 'outputConstructor' ? 0 : 1,
          );
          assert.equal(
            after.streamResults.resultByteReservationRejected,
            before.streamResults.resultByteReservationRejected,
          );
        }
      }
    }
  });

  test(`${current}: either own/inherited getter is read once; throwing getters retain failure channels`, async (t) => {
    const { runtime, task } = setup(t);
    for (const name of [current, legacy]) {
      for (const inherited of [false, true]) {
        for (const method of applicable) {
          let reads = 0;
          const selected = {
            get [name]() {
              reads++;
              return value;
            },
          };
          const options = inherited ? Object.create(selected) : selected;
          Object.defineProperty(options, 'unrelated', {
            get() {
              return assert.fail('unrelated getter');
            },
          });
          // Consume every result: an eager stream can remain accepted while full.
          const output =
            method === 'streamRange'
              ? await Array.fromAsync(
                  runtime.streamRange(
                    task,
                    range,
                    (partition) => ({ input: { partition } }),
                    options,
                  ),
                )
              : await submit(runtime, task, method, options, (partition) => ({
                  input: {
                    partition,
                    kind: current === 'outputConstructor' ? 'float64' : 'array',
                  },
                }));
          assert.equal(reads, 1);
          if (current === 'outputConstructor')
            assert.deepEqual(output, new Float64Array([0, 2]));
          await until(() => runtime.stats().workers.busy === 0);
        }
      }
      const error = new Error('selected getter');
      const options = {
        get [name]() {
          throw error;
        },
      };
      const call = () =>
        submit(runtime, task, applicable[0], options, () =>
          assert.fail('throwing getter factory'),
        );
      const before = runtime.stats().operations.rejected;
      if (current === 'outputConstructor')
        assert.throws(call, (failure) => failure === error);
      else await assert.rejects(call(), (failure) => failure === error);
      assert.equal(
        runtime.stats().operations.rejected - before,
        current === 'outputConstructor' ? 0 : 1,
      );
    }
  });

  for (const trap of ['has-current', 'has-legacy', 'get']) {
    test(`${current}: ${trap} reentrant abort prevents submission`, async (t) => {
      const { runtime, task } = setup(t);
      for (const name of [current, legacy]) {
        const controller = new AbortController();
        const events = [];
        const options = new Proxy(
          { [name]: value, signal: controller.signal },
          {
            has(target, key) {
              events.push('has:' + key);
              if (
                key ===
                (trap === 'has-current'
                  ? current
                  : trap === 'has-legacy'
                    ? legacy
                    : 'unused')
              )
                controller.abort();
              return Reflect.has(target, key);
            },
            get(target, key) {
              events.push('get:' + key);
              if (trap === 'get' && key === name) controller.abort();
              return Reflect.get(target, key);
            },
          },
        );
        await assert.rejects(
          submit(runtime, task, applicable[0], options, () =>
            assert.fail('aborted factory'),
          ),
          PjsCancelledError,
        );
        assert.equal(
          events.filter((event) => event === 'get:' + name).length,
          1,
        );
        assert.equal(
          events.includes('get:' + (name === current ? legacy : current)),
          false,
        );
        assert.equal(
          runtime.stats().operations.rejected,
          name === current ? 1 : 2,
        );
        assert.equal(runtime.stats().dispatch.executeMessages, 0);
      }
    });
  }
  test(`${current}: throwing has and reentrant shutdown preserve boundary ownership`, async (t) => {
    const { runtime, task } = setup(t);
    const error = new Error('presence trap');
    for (const name of [current, legacy]) {
      const options = new Proxy(
        {},
        {
          has(target, key) {
            if (key === name) throw error;
            return Reflect.has(target, key);
          },
        },
      );
      const call = () =>
        submit(runtime, task, applicable[0], options, () =>
          assert.fail('has trap factory'),
        );
      if (current === 'outputConstructor')
        assert.throws(call, (failure) => failure === error);
      else await assert.rejects(call(), (failure) => failure === error);
    }
    let shutdown;
    const options = new Proxy(
      { [legacy]: value },
      {
        has(target, key) {
          if (key === current) shutdown = runtime.shutdown();
          return Reflect.has(target, key);
        },
      },
    );
    await assert.rejects(
      submit(runtime, task, applicable[0], options, () =>
        assert.fail('shutdown factory'),
      ),
      PjsRuntimeStateError,
    );
    await shutdown;
    assert.equal(runtime.stats().dispatch.executeMessages, 0);
  });
}

test('both batch spellings exclude defined ordinary leases, including inherited undefined', async (t) => {
  const { runtime, task } = setup(t);
  for (const name of ['dispatchBatchSize', 'experimentalDispatchBatchSize']) {
    for (const value of [undefined, 1, 16]) {
      for (const inherited of [false, true]) {
        const input = new Uint8Array([9]);
        const options = Object.assign(
          inherited ? Object.create({ [name]: value }) : { [name]: value },
          { executionLease: 1000, transferList: [input.buffer] },
        );
        const before = runtime.stats();
        await assert.rejects(
          runtime.run(task, input, options),
          /exclusive ordinary run/,
        );
        assert.equal(input.byteLength, 1);
        assert.equal(runtime.stats().tasks.rejected, before.tasks.rejected + 1);
        assert.equal(
          runtime.stats().dispatch.executeMessages,
          before.dispatch.executeMessages,
        );
      }
    }
    const result = await runtime.run(
      task,
      { partition: { index: 0, start: 0, end: 1 } },
      { [name]: 16 },
    );
    assert.deepEqual(result, [0]);
    assert.equal(runtime.stats().dispatch.batchedExecuteMessages, 0);
    for (const method of methods)
      await assert.rejects(
        submit(
          runtime,
          task,
          method,
          { [name]: 1, executionLease: undefined },
          () => assert.fail('range lease factory'),
        ),
        /executionLease is unsupported/,
      );
    const bytes = new Uint8Array([8]);
    await assert.rejects(
      runtime.partitionRange(
        task,
        { start: 0, end: 1, grainSize: 1 },
        () => ({ input: bytes, transferList: [bytes.buffer] }),
        { [name]: 16 },
      ),
      PjsSerializationError,
    );
    assert.equal(bytes.byteLength, 1);
  }
});

test('invalid null/primitive options retain API failure channels and accounting', async (t) => {
  const { runtime, task } = setup(t);
  for (const options of [null, 0, true, 'bad']) {
    assert.throws(
      () => submit(runtime, task, 'parallelMapRange', options),
      TypeError,
    );
    assert.throws(
      () => submit(runtime, task, 'streamRange', options),
      TypeError,
    );
    await assert.rejects(
      submit(runtime, task, 'partitionRange', options),
      TypeError,
    );
    await assert.rejects(
      submit(runtime, task, 'parallelFor', options),
      TypeError,
    );
  }
  assert.equal(runtime.stats().operations.rejected, 12);
  assert.equal(runtime.stats().dispatch.executeMessages, 0);
});

test('batch and count defaults, empty ranges and integer boundaries apply under both spellings', async (t) => {
  const { runtime, task } = setup(t);
  const empty = { start: -1, end: -1, grainSize: 1 };
  for (const [current, legacy] of pairs.slice(0, 2)) {
    for (const name of [current, legacy]) {
      for (const value of [
        0,
        -1,
        1.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
        ...(current === 'dispatchBatchSize' ? [17] : []),
      ]) {
        await assert.rejects(
          submit(
            runtime,
            task,
            current === 'dispatchBatchSize' ? 'partitionRange' : 'streamRange',
            { [name]: value },
            () => assert.fail('invalid integer factory'),
          ),
          RangeError,
        );
      }
      for (const value of [
        undefined,
        null,
        1,
        current === 'dispatchBatchSize' ? 16 : Number.MAX_SAFE_INTEGER,
      ]) {
        const options = { [name]: value };
        assert.deepEqual(
          await runtime.partitionRange(
            task,
            empty,
            () => assert.fail('empty factory'),
            options,
          ),
          [],
        );
        assert.equal(
          await runtime.parallelFor(
            task,
            empty,
            () => assert.fail('empty factory'),
            options,
          ),
          undefined,
        );
        const stream = runtime.streamRange(
          task,
          empty,
          () => assert.fail('empty factory'),
          options,
        );
        assert.deepEqual(await stream.next(), { done: true, value: undefined });
        await stream.return();
      }
    }
  }
  for (const name of ['dispatchBatchSize', 'experimentalDispatchBatchSize']) {
    const before = runtime.stats().dispatch;
    const output = await runtime.partitionRange(
      task,
      { start: 0, end: 16, grainSize: 1 },
      (partition) => ({ input: { partition } }),
      { [name]: 16 },
    );
    assert.deepEqual(
      output.flat(),
      Array.from({ length: 16 }, (_, index) => index * 2),
    );
    assert.equal(
      runtime.stats().dispatch.executeMessages,
      before.executeMessages + 1,
    );
    assert.equal(
      runtime.stats().dispatch.batchedExecuteMessages,
      before.batchedExecuteMessages + 1,
    );
  }
});

test('either constructor spelling retains all eleven built-ins, empty typed results and subclass rejection', async (t) => {
  const { runtime, task } = setup(t);
  for (const name of ['outputConstructor', 'experimentalOutputConstructor']) {
    for (const constructor of [
      Int8Array,
      Uint8Array,
      Uint8ClampedArray,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
      BigInt64Array,
      BigUint64Array,
    ]) {
      const output = await runtime.parallelMapRange(
        task,
        { start: 0, end: 0, grainSize: 1 },
        () => assert.fail('empty typed factory'),
        { [name]: constructor },
      );
      assert.equal(output.constructor, constructor);
      assert.equal(output.length, 0);
    }
    for (const constructor of [Array, class extends Float64Array {}, 1, null])
      await assert.rejects(
        submit(runtime, task, 'parallelMapRange', { [name]: constructor }, () =>
          assert.fail('invalid constructor factory'),
        ),
        /built-in typed-array/,
      );
    assert.deepEqual(
      await submit(runtime, task, 'parallelMapRange', { [name]: undefined }),
      [0, 2],
    );
    for (const lengthDelta of [-1, 1])
      await assert.rejects(
        submit(
          runtime,
          task,
          'parallelMapRange',
          { [name]: Float64Array },
          (partition) => ({
            input: { partition, kind: 'float64', lengthDelta },
          }),
        ),
        PjsMapContractError,
      );
  }
});

test('count alias normalization preserves exact/maximum rejection accounting and sticky failure', async (t) => {
  const { runtime, task } = setup(t);
  for (const declaration of [
    'experimentalResultBytes',
    'experimentalMaxResultBytes',
  ]) {
    const before = runtime.stats();
    const stream = runtime.streamRange(
      task,
      range,
      () => assert.fail('invalid strict aliases factory'),
      {
        maxBufferedResults: 1,
        experimentalMaxBufferedResults: undefined,
        [declaration]: 8,
        experimentalMaxReservedResultBytes: 16,
      },
    );
    await assert.rejects(stream.next(), /mutually exclusive/);
    assert.deepEqual(await stream.return(), { done: true, value: undefined });
    await assert.rejects(stream.next(), /mutually exclusive/);
    assert.equal(
      runtime.stats().operations.rejected,
      before.operations.rejected + 1,
    );
    assert.equal(runtime.stats().streams.rejected, before.streams.rejected + 1);
    assert.equal(
      runtime.stats().streamResults.resultByteReservationRejected,
      before.streamResults.resultByteReservationRejected + 1,
    );
    assert.equal(
      runtime.stats().dispatch.executeMessages,
      before.dispatch.executeMessages,
    );
  }
});
