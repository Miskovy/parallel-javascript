import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';

export async function c2Contracts() {
  const registry = new PjsTaskRegistry();
  const module = new URL('./tasks.mjs', import.meta.url);
  const task = registry.register('range', module, 'rangeBlock');
  const binaryTask = registry.register('binary', module, 'streamBinary');
  const runtime = new PjsRuntime({ registry, workers: 1, maxQueue: 16 });
  const range = { start: -1, end: 4, grainSize: 2 };
  const factory = (partition) => ({ input: { partition } });
  try {
    for (const name of ['dispatchBatchSize']) {
      const options = { [name]: 16 };
      const ordered = await runtime.partitionRange(
        task,
        range,
        factory,
        options,
      );
      assert.deepEqual(ordered.flat(), [-2, 0, 2, 4, 6]);
      assert.equal(
        await runtime.parallelFor(
          task,
          range,
          (partition) => ({ input: { partition, discard: true } }),
          options,
        ),
        undefined,
      );
      assert.deepEqual(
        await runtime.parallelMapRange(task, range, factory, options),
        [-2, 0, 2, 4, 6],
      );
      const stream = runtime.streamRange(task, range, factory, {
        ...options,
        maxBufferedResults: 1,
      });
      try {
        assert.equal((await Array.fromAsync(stream)).length, 3);
      } finally {
        await stream.return();
      }
    }
    for (const name of ['outputConstructor']) {
      const mapped = await runtime.parallelMapRange(
        task,
        range,
        (partition) => ({ input: { partition, typed: true } }),
        Object.create({ [name]: Float64Array, dispatchBatchSize: 2 }),
      );
      assert.deepEqual(mapped, new Float64Array([-2, 0, 2, 4, 6]));
    }
    for (const name of ['maxBufferedResults']) {
      for (const mode of ['count', 'resultBytes', 'maxResultBytes']) {
        const options = {
          [name]: 1,
          dispatchBatchSize: 16,
          ...(mode === 'count' ? {} : { [mode]: 8, maxReservedResultBytes: 8 }),
        };
        const stream = runtime.streamRange(
          binaryTask,
          range,
          () => ({ input: {} }),
          options,
        );
        try {
          for await (const { output } of stream)
            assert.equal(output.byteLength, 8);
        } finally {
          await stream.return();
        }
      }
    }
    for (const [current, legacy, value, method] of [
      [
        'dispatchBatchSize',
        'experimentalDispatchBatchSize',
        1,
        'partitionRange',
      ],
      [
        'maxBufferedResults',
        'experimentalMaxBufferedResults',
        1,
        'streamRange',
      ],
      [
        'outputConstructor',
        'experimentalOutputConstructor',
        Float64Array,
        'parallelMapRange',
      ],
    ]) {
      for (const legacyValue of [value, undefined, 2]) {
        const options = Object.assign(
          Object.create({ [legacy]: legacyValue }),
          { [current]: value },
        );
        const call = () =>
          runtime[method](
            task,
            range,
            () => assert.fail('invalid packed aliases invoked a factory'),
            options,
          );
        if (method === 'parallelMapRange') assert.throws(call, /was removed/);
        else if (method === 'streamRange') {
          const stream = call();
          await assert.rejects(stream.next(), /was removed/);
          await assert.rejects(stream.next(), /was removed/);
        } else await assert.rejects(call(), /was removed/);
      }
    }
  } finally {
    await runtime.shutdown({ drain: false });
  }
  console.log(
    JSON.stringify({
      c2Consumer: true,
      methods: [
        'partitionRange',
        'parallelFor',
        'streamRange',
        'parallelMapRange',
      ],
      overloads: ['count', 'exact', 'upper-bound', 'array', 'typed'],
      aliasesRetained: false,
    }),
  );
}
