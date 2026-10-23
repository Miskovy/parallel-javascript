import assert from 'node:assert/strict';
import {
  PjsRuntime,
  PjsTaskRegistry,
  PjsCancelledError,
  PjsRuntimeStateError,
} from '@pjavascript/runtime';

export async function c3Contracts() {
  const registry = new PjsTaskRegistry();
  const task = registry.register(
    'binary',
    new URL('./tasks.mjs', import.meta.url),
    'binaryContract',
  );
  const runtime = new PjsRuntime({ registry, workers: 1 });
  const range = { start: 0, end: 1, grainSize: 1 };
  const input =
    (bytes = 8) =>
    () => ({ input: { kind: 'Uint8Array', bytes } });
  const declarations = [
    'resultBytes',
    'experimentalResultBytes',
    'maxResultBytes',
    'experimentalMaxResultBytes',
  ];
  const capacities = [
    'maxReservedResultBytes',
    'experimentalMaxReservedResultBytes',
  ];
  async function invalid(options, pattern = /./) {
    const before = runtime.stats();
    const buffer = new Uint8Array([1]);
    const stream = runtime.streamRange(
      task,
      range,
      () => {
        assert.fail('rejected options invoked factory');
        return { input: buffer, transferList: [buffer.buffer] };
      },
      options,
    );
    await assert.rejects(stream.next(), pattern);
    await stream.return();
    await assert.rejects(stream.next(), pattern);
    const after = runtime.stats();
    assert.equal(after.streams.rejected, before.streams.rejected + 1);
    assert.equal(
      after.streamResults.resultByteReservationRejected,
      before.streamResults.resultByteReservationRejected + 1,
    );
    assert.equal(
      after.dispatch.executeMessages,
      before.dispatch.executeMessages,
    );
    assert.equal(buffer.byteLength, 1);
  }
  try {
    for (const declaration of declarations)
      for (const capacity of capacities)
        for (const inherited of [false, true]) {
          let callbacks = 0;
          const reads = [];
          const fields = {
            get [declaration]() {
              reads.push('declaration');
              return () => {
                assert.deepEqual(reads, ['declaration', 'capacity']);
                callbacks++;
                return 8;
              };
            },
            get [capacity]() {
              reads.push('capacity');
              return 8;
            },
          };
          const options = inherited ? Object.create(fields) : fields;
          Object.assign(
            options,
            declaration.startsWith('experimental')
              ? {
                  experimentalDispatchBatchSize: 2,
                  experimentalMaxBufferedResults: 1,
                }
              : { dispatchBatchSize: 2, maxBufferedResults: 1 },
          );
          const stream = runtime.streamRange(task, range, input(), options);
          assert.deepEqual(reads, ['declaration', 'capacity']);
          for await (const { output } of stream)
            assert.equal(output.byteLength, 8);
          await stream.return();
          assert.equal(callbacks, 1);
          assert.deepEqual(reads, ['declaration', 'capacity']);
          const zero = runtime.streamRange(task, range, input(0), {
            [declaration]: 0,
            [capacity]: 0,
          });
          for await (const { output } of zero)
            assert.equal(output.byteLength, 0);
          await invalid({ [declaration]: 8 });
          await invalid({ [capacity]: 8 });
          for (const bad of [
            -1,
            1.5,
            Infinity,
            NaN,
            Number.MAX_SAFE_INTEGER + 1,
            undefined,
          ]) {
            await invalid({ [declaration]: bad, [capacity]: 8 });
            await invalid({ [declaration]: 8, [capacity]: bad });
          }
        }
    for (const [current, legacy] of [
      ['resultBytes', 'experimentalResultBytes'],
      ['maxResultBytes', 'experimentalMaxResultBytes'],
      capacities,
    ]) {
      for (const value of [8, 9, undefined])
        for (const inherited of [false, true]) {
          await invalid(
            Object.assign(
              inherited
                ? Object.create({ [legacy]: value })
                : { [legacy]: value },
              { [current]: 8 },
            ),
            /mutually exclusive/,
          );
          const fields = {
            get [current]() {
              return assert.fail('duplicate value read');
            },
            get [legacy]() {
              return assert.fail('duplicate alias read');
            },
          };
          // Values are deliberately irrelevant: presence must reject before reads.
          const options = inherited ? Object.create(fields) : fields;
          void value;
          await invalid(options, /mutually exclusive/);
        }
      for (const selected of [current, legacy]) {
        const valid = selected.includes('Reserved')
          ? { resultBytes: 8, [selected]: 8 }
          : { [selected]: 8, maxReservedResultBytes: 8 };
        for (const trap of ['get', 'has']) {
          const error = new Error('selected ' + trap);
          let thrown = false;
          await invalid(
            new Proxy(valid, {
              has(target, key) {
                if (trap === 'has' && key === selected && !thrown) {
                  thrown = true;
                  throw error;
                }
                return Reflect.has(target, key);
              },
              get(target, key) {
                if (trap === 'get' && key === selected) throw error;
                return Reflect.get(target, key);
              },
            }),
            (e) => e === error,
          );
          const controller = new AbortController();
          const options = new Proxy(
            { ...valid, signal: controller.signal },
            {
              has(target, key) {
                if (trap === 'has' && key === selected) controller.abort();
                return Reflect.has(target, key);
              },
              get(target, key) {
                if (trap === 'get' && key === selected) controller.abort();
                return Reflect.get(target, key);
              },
            },
          );
          await assert.rejects(
            runtime
              .streamRange(
                task,
                range,
                () => assert.fail('aborted factory'),
                options,
              )
              .next(),
            PjsCancelledError,
          );
        }
      }
    }
    for (const exact of declarations.slice(0, 2))
      for (const maximum of declarations.slice(2))
        await invalid(
          { [exact]: undefined, [maximum]: 8, maxReservedResultBytes: 8 },
          /mutually exclusive/,
        );
    const catchError = new Error('catch has');
    const beforeCatch = runtime.stats();
    assert.throws(
      () =>
        runtime.streamRange(
          task,
          range,
          () => assert.fail('catch factory'),
          new Proxy(
            {},
            {
              has(target, key) {
                if (key === 'resultBytes') throw catchError;
                return Reflect.has(target, key);
              },
            },
          ),
        ),
      (e) => e === catchError,
    );
    assert.equal(
      runtime.stats().streams.rejected,
      beforeCatch.streams.rejected + 1,
    );
    assert.equal(
      runtime.stats().streamResults.resultByteReservationRejected,
      beforeCatch.streamResults.resultByteReservationRejected,
    );
    for (const declaration of declarations) {
      let factories = 0;
      const stream = runtime.streamRange(
        task,
        range,
        () => {
          factories++;
          return input()();
        },
        { [declaration]: 9, maxReservedResultBytes: 8 },
      );
      await assert.rejects(stream.next());
      assert.equal(factories, 0);
      const error = new Error('lazy declaration');
      const failed = runtime.streamRange(
        task,
        range,
        () => assert.fail('callback factory'),
        {
          [declaration]: () => {
            throw error;
          },
          maxReservedResultBytes: 8,
        },
      );
      await assert.rejects(failed.next());
      await failed.return();
      const asyncDeclaration = runtime.streamRange(
        task,
        range,
        () => assert.fail('async callback factory'),
        { [declaration]: async () => 8, maxReservedResultBytes: 8 },
      );
      await assert.rejects(asyncDeclaration.next());
      await asyncDeclaration.return();
    }
    const shutting = new Proxy(
      { resultBytes: 8, maxReservedResultBytes: 8 },
      {
        has(target, key) {
          if (key === 'resultBytes') void runtime.shutdown();
          return Reflect.has(target, key);
        },
      },
    );
    await assert.rejects(
      runtime
        .streamRange(
          task,
          range,
          () => assert.fail('shutdown factory'),
          shutting,
        )
        .next(),
      PjsRuntimeStateError,
    );
  } finally {
    await runtime.shutdown({ drain: false });
  }
  console.log(
    JSON.stringify({
      c3Consumer: true,
      modes: ['exact', 'upper-bound'],
      mixed: true,
      aliasesRetained: true,
    }),
  );
}
