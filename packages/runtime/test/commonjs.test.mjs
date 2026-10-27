import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as imported from '../dist/index.js';

const require = createRequire(import.meta.url);
const required = require('@pjavascript/runtime');
const { PjsRuntime, PjsTaskRegistry, PjsWorkerError } = imported;
const fixture = (name) =>
  new URL(`./fixtures/commonjs-${name}`, import.meta.url);
const bounded = { timeout: 10000 };

test('root require and import expose the same bindings without a second module graph', () => {
  for (const key of Object.keys(imported))
    assert.equal(required[key], imported[key], key);
  assert.throws(() => require('@pjavascript/runtime/dist/index.js'), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  });
});

test(
  'CommonJS functions, own object exports and awaited ESM tasks share the bootstrap',
  bounded,
  async () => {
    const registry = new required.PjsTaskRegistry();
    const cases = [
      ['function', 'function.cjs', 'default', 6],
      ['function-own', 'function.cjs', 'own', 12],
      ['object-default', 'object.cjs', 'default', 4],
      ['object-computed', 'object.cjs', 'computed', 9],
      ['named', 'named.cjs', 'named', 8],
      ['arity', 'object.cjs', 'arity', 1],
      ['namespace-first', 'namespace.mjs', 'named', 'ready:3'],
    ];
    const tasks = cases.map(([id, file, name]) =>
      registry.register(id, fixture(file), name),
    );
    const block = registry.register('block', fixture('object.cjs'), 'block');
    const runtime = new PjsRuntime({ registry, workers: 1 });
    try {
      await runtime.ready();
      for (let i = 0; i < cases.length; i++)
        assert.equal(await runtime.run(tasks[i], 3), cases[i][3]);
      assert.deepEqual(
        await runtime.parallelMapRange(
          block,
          { start: 0, end: 6, grainSize: 2 },
          (partition) => ({ input: partition }),
          { dispatchBatchSize: 2 },
        ),
        [0, 2, 4, 6, 8, 10],
      );
    } finally {
      await runtime.shutdown({ drain: false });
    }
  },
);

for (const [file, name] of [
  ['object.cjs', 'missing'],
  ['object.cjs', 'noncallable'],
  ['object.cjs', 'promise'],
  ['object.cjs', 'inherited'],
  ['object.cjs', 'brokenExport'],
  ['function.cjs', 'call'],
]) {
  test(
    `CommonJS ${file} export ${name} rejects through startup failure`,
    bounded,
    async () => {
      const registry = new PjsTaskRegistry();
      registry.register('invalid', fixture(file), name);
      const runtime = new PjsRuntime({ registry, workers: 1 });
      try {
        await assert.rejects(runtime.ready(), PjsWorkerError);
      } finally {
        await runtime.shutdown({ drain: false });
      }
    },
  );
}
