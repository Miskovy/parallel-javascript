import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PjsBinaryResultContractError,
  PjsError,
  PjsResultCapacityError,
  PjsRuntime,
  PjsTaskRegistry,
} from '../dist/index.js';

function next(stream) {
  return stream[Symbol.asyncIterator]().next();
}

function setup(t) {
  const registry = new PjsTaskRegistry();
  const echo = registry.register(
    'echo',
    new URL('./fixtures/transfer-tasks.mjs', import.meta.url),
    'clone',
  );
  const runtime = new PjsRuntime({ registry, workers: 1 });
  t.after(() => runtime.shutdown({ drain: false }));
  return { runtime, echo };
}

test('public constructor integer policies reject invalid numbers before startup', () => {
  const registry = new PjsTaskRegistry();
  for (const key of [
    'workers',
    'minWorkers',
    'maxWorkers',
    'maxQueue',
    'startupTimeout',
    'maxRestarts',
  ]) {
    for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () => new PjsRuntime({ registry, workers: 1, [key]: value }),
        RangeError,
        `${key}=${value}`,
      );
    }
  }
  for (const key of ['workers', 'minWorkers', 'maxWorkers', 'startupTimeout']) {
    assert.throws(
      () => new PjsRuntime({ registry, workers: 1, [key]: 0 }),
      RangeError,
    );
  }
  assert.throws(
    () => new PjsRuntime({ registry, workers: 2, maxWorkers: 1 }),
    RangeError,
  );
  assert.throws(
    () => new PjsRuntime({ registry, workers: 1, startupTimeout: 2 ** 31 }),
    RangeError,
  );
});

test('zero queue and restart budgets are valid; omitted controls preserve defaults', async () => {
  const registry = new PjsTaskRegistry();
  const runtime = new PjsRuntime({
    registry,
    workers: 1,
    maxQueue: 0,
    maxRestarts: 0,
    startupTimeout: undefined,
  });
  try {
    await runtime.ready();
    assert.equal(runtime.stats().queue.capacity, 0);
    assert.equal(runtime.stats().workers.total, 1);
  } finally {
    await runtime.shutdown();
  }
});

test('run and range deadlines share numeric limits but remain asynchronous errors', async (t) => {
  const { runtime, echo } = setup(t);
  for (const timeout of [0, -1, NaN, Infinity, 0.5, 2 ** 31]) {
    let submitted;
    assert.doesNotThrow(() => {
      submitted = runtime.run(echo, 1, { timeout });
    });
    await assert.rejects(submitted, RangeError);
    await assert.rejects(
      runtime.partitionRange(
        echo,
        { start: 0, end: 1, grainSize: 1 },
        () => ({ input: 1 }),
        { timeout },
      ),
      RangeError,
    );
  }
  assert.equal(await runtime.run(echo, 7, { timeout: undefined }), 7);
});

test('stream count, byte and property-presence rules are observable through iteration', async (t) => {
  const { runtime, echo } = setup(t);
  const range = { start: 0, end: 1, grainSize: 1 };
  const factory = () => ({ input: new Uint8Array(0) });
  for (const capacity of [
    0,
    -1,
    NaN,
    Infinity,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(
      next(
        runtime.streamRange(echo, range, factory, {
          experimentalMaxBufferedResults: capacity,
        }),
      ),
      RangeError,
    );
  }
  for (const options of [
    { experimentalResultBytes: undefined },
    { experimentalMaxReservedResultBytes: 0 },
    {
      experimentalResultBytes: 0,
      experimentalMaxResultBytes: 0,
      experimentalMaxReservedResultBytes: 0,
    },
  ]) {
    await assert.rejects(
      next(runtime.streamRange(echo, range, factory, options)),
      TypeError,
    );
  }
  for await (const { output } of runtime.streamRange(echo, range, factory, {
    experimentalResultBytes: 0,
    experimentalMaxReservedResultBytes: 0,
  })) {
    assert.equal(output.byteLength, 0);
  }
});

test('declaration callbacks and impossible capacities have distinct contextual errors', async (t) => {
  const { runtime, echo } = setup(t);
  const range = { start: 0, end: 1, grainSize: 1 };
  const factory = () => ({ input: new Uint8Array(0) });
  for (const declaration of [
    () => NaN,
    () => Infinity,
    () => -1,
    () => 0.5,
    () => Number.MAX_SAFE_INTEGER + 1,
    async () => 0,
    () => {
      throw new Error('bad declaration');
    },
  ]) {
    await assert.rejects(
      next(
        runtime.streamRange(echo, range, factory, {
          experimentalMaxResultBytes: declaration,
          experimentalMaxReservedResultBytes: 1,
        }),
      ),
      (error) => {
        assert.ok(error instanceof PjsBinaryResultContractError);
        assert.equal(error.partitionIndex, 0);
        return true;
      },
    );
  }
  await assert.rejects(
    next(
      runtime.streamRange(echo, range, factory, {
        experimentalResultBytes: 2,
        experimentalMaxReservedResultBytes: 1,
      }),
    ),
    (error) => {
      assert.ok(error instanceof PjsResultCapacityError);
      assert.equal(error.declaredBytes, 2);
      assert.equal(error.resultByteCapacity, 1);
      return true;
    },
  );
  assert.equal(runtime.stats().streamResults.currentReservedResultBytes, 0);
});

test('factory failures expose base PjsError and preserve their original cause', async (t) => {
  const { runtime, echo } = setup(t);
  const cause = new Error('factory failed');
  await assert.rejects(
    runtime.partitionRange(echo, { start: 0, end: 1, grainSize: 1 }, () => {
      throw cause;
    }),
    (error) => {
      assert.equal(error.constructor, PjsError);
      assert.equal(error.cause, cause);
      assert.equal(error.partitionIndex, 0);
      return true;
    },
  );
});
