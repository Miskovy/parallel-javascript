import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const order = process.argv[2];
assert.ok(order === 'require-first' || order === 'import-first');
let imported;
let required;
if (order === 'require-first') {
  required = require('@pjavascript/runtime');
  imported = await import('@pjavascript/runtime');
} else {
  imported = await import('@pjavascript/runtime');
  required = require('@pjavascript/runtime');
}
for (const name of Object.keys(imported))
  assert.equal(required[name], imported[name], name);
assert.throws(() => require('@pjavascript/runtime/dist/index.js'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});

for (const [registryApi, runtimeApi] of [
  [required, imported],
  [imported, required],
]) {
  const registry = new registryApi.PjsTaskRegistry();
  const module = new URL('./commonjs-tasks.cjs', import.meta.url);
  const echo = registry.register('echo', module, 'echo');
  const move = registry.register('move', module, 'move');
  const detached = registry.register('detached', module, 'detached');
  const fail = registry.register('fail', module, 'fail');
  const runtime = new runtimeApi.PjsRuntime({ registry, workers: 1 });
  try {
    await runtime.ready();
    assert.ok(runtime instanceof required.PjsRuntime);
    assert.ok(runtime instanceof imported.PjsRuntime);
    assert.equal(await runtime.run(echo, 42), 42);
    await assert.rejects(runtime.run(fail, null), (error) => {
      assert.ok(error instanceof required.PjsTaskError);
      assert.ok(error instanceof imported.PjsTaskError);
      return true;
    });
    await assert.rejects(runtime.run({ id: 'echo' }, 1), (error) => {
      assert.ok(error instanceof required.PjsTaskRegistrationError);
      assert.ok(error instanceof imported.PjsTaskRegistrationError);
      return true;
    });
    const input = new Uint8Array([3, 7, 11]);
    const cloned = await runtime.run(echo, input, {
      transferList: [input.buffer],
    });
    assert.equal(input.byteLength, 0);
    assert.deepEqual(cloned, new Uint8Array([3, 7, 11]));
    const output = await runtime.run(move, [2, 4, 8]);
    assert.deepEqual(output, new Uint8Array([2, 4, 8]));
    assert.equal(await runtime.run(detached, null), true);
  } finally {
    await runtime.shutdown();
  }
  assert.equal(runtime.stats().state, 'stopped');
}
console.log(JSON.stringify({ mixedLoading: order, node: process.version }));
