import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import * as api from '@pjavascript/runtime';

const output = process.argv[2];
writeFileSync(output, '', { flag: 'wx' });
const report = {
  status: 'failed',
  node: process.version,
  exports: Object.keys(api).sort(),
  cases: [],
  cleanup: false,
};
const check = async (id, action) => {
  await action();
  report.cases.push({ id, status: 'accepted' });
};
const { PjsRuntime, PjsTaskRegistry, sharedReadonly } = api;
const registry = new PjsTaskRegistry(),
  module = new URL('./task.mjs', import.meta.url);
const task = registry.register('execute', module, 'execute');
const echo = registry.register('echo', module, 'echo');
const move = registry.register('move', module, 'moveReceipt');
const resolution = registry.register('resolution', module, 'packageResolution');
const runtime = new PjsRuntime({ registry, workers: 1, maxQueue: 16 });
const range = { start: 3, end: 20, grainSize: 4 };
const factory = (partition) => ({ input: { partition } });
async function quiescent() {
  const deadline = performance.now() + 5000;
  while (true) {
    const s = runtime.stats();
    if (
      s.tasks.pending === 0 &&
      s.workers.busy === 0 &&
      s.queue.size === 0 &&
      s.activeOperations.length === 0 &&
      s.streamResults.currentReservedResultBytes === 0
    )
      return;
    assert.ok(performance.now() < deadline, 'cleanup watchdog');
    await delay(1);
  }
}
try {
  await check('registration-construction-ready-worker-resolution', async () => {
    await runtime.ready();
    assert.equal(
      await runtime.run(resolution, null),
      import.meta.resolve('@pjavascript/runtime'),
    );
    assert.equal(Object.isFrozen(task), true);
    assert.throws(
      () => registry.register('execute', module),
      api.PjsTaskRegistrationError,
    );
  });
  await check('run-scalar-object-arraybuffer-view-dataview', async () => {
    for (const value of [
      7,
      { value: [1, 'pjs'] },
      new ArrayBuffer(17),
      new Uint8Array([3, 4]),
      new DataView(new ArrayBuffer(9)),
    ])
      assert.deepEqual(await runtime.run(echo, value), value);
  });
  await check(
    'input-transfer-and-worker-output-transfer-detachment',
    async () => {
      const input = new Uint8Array([1, 2, 3]),
        alias = new Uint8Array(input.buffer);
      assert.deepEqual(
        await runtime.run(echo, input, { transferList: [input.buffer] }),
        new Uint8Array([1, 2, 3]),
      );
      assert.throws(() => new Uint8Array(alias.buffer), TypeError);
      assert.deepEqual(
        await runtime.run(move, 17),
        new Uint8Array(17).fill(23),
      );
      assert.equal(await runtime.run(move, null), true);
    },
  );
  await check('sharedReadonly-five-overloads-visible-copy', async () => {
    for (const Constructor of [
      Uint8Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
    ]) {
      const original = new Constructor([9, 1, 2, 9]),
        shared = sharedReadonly(original.subarray(1, 3));
      assert.ok(shared.buffer instanceof SharedArrayBuffer);
      assert.deepEqual([...shared], [1, 2]);
      original[1] = 4;
      assert.equal(shared[0], 1);
      assert.deepEqual([...(await runtime.run(echo, shared))], [1, 2]);
    }
  });
  await check('uneven-boundaries-and-batch-1-16', async () => {
    assert.deepEqual(
      await runtime.partitionRange(echo, range, (partition) => ({
        input: partition,
      })),
      [
        { index: 0, start: 3, end: 7 },
        { index: 1, start: 7, end: 11 },
        { index: 2, start: 11, end: 15 },
        { index: 3, start: 15, end: 19 },
        { index: 4, start: 19, end: 20 },
      ],
    );
    for (const dispatchBatchSize of [1, 16])
      assert.deepEqual(
        await runtime.partitionRange(task, range, factory, {
          dispatchBatchSize,
        }),
        [0, 1, 2, 3, 4],
      );
    for (const size of [0, 1])
      assert.equal(
        (
          await runtime.partitionRange(
            task,
            { start: 0, end: size, grainSize: 4 },
            factory,
          )
        ).length,
        size,
      );
  });
  await check('completion-discard-unserializable-output', () =>
    runtime.parallelFor(task, range, (partition) => ({
      input: { kind: 'completion', partition },
    })),
  );
  await check('generic-and-typed-map-order-and-assembly', async () => {
    const generic = await runtime.parallelMapRange(
      task,
      range,
      (partition) => ({ input: { kind: 'generic-map', partition } }),
    );
    assert.deepEqual(
      generic,
      Array.from({ length: 17 }, (_, i) => ({ value: i + 3 })),
    );
    const typed = await runtime.parallelMapRange(
      task,
      range,
      (partition) => ({ input: { kind: 'typed-map', partition } }),
      { outputConstructor: Float64Array },
    );
    assert.deepEqual(
      typed,
      Float64Array.from({ length: 17 }, (_, i) => 2 * (i + 3) + 1),
    );
  });
  for (const mode of ['count', 'exact', 'upper'])
    await check(
      `stream-${mode}-direct-next-return-throw-for-await`,
      async () => {
        const options = {
          maxBufferedResults: 1,
          ...(mode === 'exact'
            ? { resultBytes: 8, maxReservedResultBytes: 16 }
            : mode === 'upper'
              ? { maxResultBytes: 16, maxReservedResultBytes: 16 }
              : {}),
        };
        const create = () =>
          runtime.streamRange(
            task,
            range,
            (partition) => ({
              input: { kind: 'binary', partition, bytes: 8, move: true },
            }),
            options,
          );
        const direct = create();
        assert.equal(direct[Symbol.asyncIterator](), direct);
        assert.equal((await direct.next()).value.output.length, 8);
        assert.equal((await direct.return()).done, true);
        assert.equal((await direct.next()).done, true);
        await quiescent();
        const throwing = create();
        await throwing.next();
        const reason = new Error('health throw');
        await assert.rejects(
          throwing.throw(reason),
          (error) => error === reason,
        );
        await quiescent();
        for await (const value of create()) {
          assert.equal(value.output.length, 8);
          break;
        }
        await quiescent();
      },
    );
  await check('six-legacy-aliases-still-execute', async () => {
    assert.deepEqual(
      await runtime.partitionRange(task, range, factory, {
        dispatchBatchSize: 4,
      }),
      [0, 1, 2, 3, 4],
    );
    const typed = await runtime.parallelMapRange(
      task,
      range,
      (partition) => ({ input: { kind: 'typed-map', partition } }),
      { outputConstructor: Float64Array },
    );
    assert.equal(typed.length, 17);
    for (const declaration of ['resultBytes', 'maxResultBytes']) {
      const stream = runtime.streamRange(
        task,
        range,
        (partition) => ({ input: { kind: 'binary', partition, bytes: 8 } }),
        {
          maxBufferedResults: 1,
          [declaration]: 8,
          maxReservedResultBytes: 8,
        },
      );
      let count = 0;
      for await (const item of stream) {
        assert.equal(item.output.length, 8);
        count++;
      }
      assert.equal(count, 5);
    }
  });
  await check('diagnostics-defensive-copy-and-exported-errors', async () => {
    const snapshot = runtime.stats();
    snapshot.workers.details.length = 0;
    snapshot.queue.size = -1;
    assert.equal(runtime.stats().workers.total, 1);
    assert.ok(runtime.stats().queue.size >= 0);
    for (const [name, Constructor] of Object.entries(api).filter(([name]) =>
      name.endsWith('Error'),
    )) {
      const error =
        name === 'PjsTaskError'
          ? new Constructor({ name: 'Error', message: 'contract' }, {})
          : new Constructor('contract');
      assert.ok(error instanceof api.PjsError);
      assert.equal(error.name, name);
    }
  });
  await quiescent();
  report.status = 'accepted';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  try {
    const first = runtime.shutdown();
    assert.equal(runtime.shutdown({ drain: false }), first);
    await first;
    report.finalStats = runtime.stats();
    assert.equal(report.finalStats.state, 'stopped');
    assert.equal(report.finalStats.workers.busy, 0);
    await assert.rejects(runtime.run(echo, null), api.PjsRuntimeStateError);
    report.cleanup = true;
  } catch (error) {
    report.status = 'failed';
    report.cleanupFailure = error.message;
    process.exitCode = 1;
  }
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
// Parsing the retained receipt here catches serialization errors before a green exit.
assert.equal(JSON.parse(readFileSync(output, 'utf8')).cleanup, true);
