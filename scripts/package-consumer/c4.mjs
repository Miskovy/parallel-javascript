import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';

// This same matrix executes in the source fixture and the external installed
// consumer. No internal runtime fields or test-only owners are required.
export async function c4Contracts() {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'c4',
    new URL('./tasks.mjs', import.meta.url),
    'rangeBlock',
  );
  const runtime = new PjsRuntime({ registry, workers: 1 });
  const range = { start: 0, end: 1, grainSize: 1 };
  const all = [
    'partitionRange',
    'parallelFor',
    'parallelMapRange',
    'streamRange',
  ];
  const pairs = [
    ['dispatchBatchSize', 'experimentalDispatchBatchSize', 1, [...all, 'run']],
    [
      'maxBufferedResults',
      'experimentalMaxBufferedResults',
      1,
      ['streamRange'],
    ],
    [
      'outputConstructor',
      'experimentalOutputConstructor',
      Float64Array,
      ['parallelMapRange'],
    ],
    ['resultBytes', 'experimentalResultBytes', 8, ['streamRange']],
    ['maxResultBytes', 'experimentalMaxResultBytes', 8, ['streamRange']],
    [
      'maxReservedResultBytes',
      'experimentalMaxReservedResultBytes',
      8,
      ['streamRange'],
    ],
  ];
  let checks = 0;
  try {
    await runtime.ready();
    for (const [current, legacy, value, methods] of pairs)
      for (const method of methods)
        for (const inherited of [false, true])
          for (const legacyValue of [value, undefined])
            for (const withCurrent of [false, true]) {
              let reads = 0;
              const fields = {};
              Object.defineProperty(fields, legacy, {
                get() {
                  reads++;
                  return legacyValue;
                },
              });
              const options = inherited ? Object.create(fields) : fields;
              if (withCurrent)
                Object.defineProperty(options, current, {
                  get() {
                    reads++;
                    return value;
                  },
                });
              const buffer = new Uint8Array([7]);
              if (method === 'run')
                Object.defineProperty(options, 'transferList', {
                  value: [buffer.buffer],
                });
              const before = runtime.stats();
              const call = () =>
                method === 'run'
                  ? runtime.run(task, buffer, options)
                  : runtime[method](
                      task,
                      range,
                      () => {
                        assert.fail('removed option reached factory');
                        return { input: buffer, transferList: [buffer.buffer] };
                      },
                      options,
                    );
              if (legacy === 'experimentalOutputConstructor')
                assert.throws(call, /was removed/);
              else if (method === 'streamRange') {
                const stream = call();
                await assert.rejects(stream.next(), /was removed/);
                assert.deepEqual(await stream.return(), {
                  done: true,
                  value: undefined,
                });
                await assert.rejects(stream.next(), /was removed/);
              } else await assert.rejects(call(), /was removed/);
              assert.equal(reads, 0);
              assert.equal(buffer.byteLength, 1);
              const after = runtime.stats();
              assert.equal(
                after.dispatch.executeMessages,
                before.dispatch.executeMessages,
              );
              assert.equal(after.tasks.accepted, before.tasks.accepted);
              assert.equal(
                after.operations.accepted,
                before.operations.accepted,
              );
              assert.equal(
                after.streamResults.currentReservedResultBytes,
                before.streamResults.currentReservedResultBytes,
              );
              checks++;
            }
  } finally {
    await runtime.shutdown({ drain: false });
  }
  assert.equal(runtime.stats().tasks.pending, 0);
  console.log(
    JSON.stringify({ c4Consumer: true, checks, aliasesRetained: false }),
  );
}
