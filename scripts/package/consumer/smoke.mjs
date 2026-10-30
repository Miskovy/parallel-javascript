import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  PjsError,
  PjsRuntime,
  PjsRuntimeStateError,
  PjsTaskError,
  PjsTaskRegistrationError,
  PjsTaskRegistry,
} from '@pjavascript/runtime';

const require = createRequire(import.meta.url);
const registry = new PjsTaskRegistry();
assert.equal(typeof registry.snapshot, 'undefined');
assert.equal(Object.hasOwn(PjsTaskRegistry.prototype, 'snapshot'), false);
assert.deepEqual(Reflect.ownKeys(registry), []);
const module = new URL('./tasks.mjs', import.meta.url);
const square = registry.register('square', module, 'square');
const fail = registry.register('fail', module, 'fail');
assert.throws(
  () => registry.register('square', module),
  (error) => {
    assert.ok(error instanceof PjsTaskRegistrationError);
    assert.ok(error instanceof PjsError);
    assert.equal(error.name, 'PjsTaskRegistrationError');
    assert.match(error.message, /unique/);
    return true;
  },
);
const runtime = new PjsRuntime({ registry, workers: 1 });
const late = registry.register('late', module, 'square');
const foreign = new PjsTaskRegistry().register('square', module, 'square');
try {
  await runtime.ready();
  assert.equal(await runtime.run(square, 12), 144);
  await assert.rejects(runtime.run(late, 1), PjsTaskRegistrationError);
  await assert.rejects(runtime.run(foreign, 1), PjsTaskRegistrationError);
  await assert.rejects(runtime.run(fail, null), (error) => {
    assert.ok(error instanceof PjsTaskError);
    assert.ok(error instanceof PjsError);
    assert.equal(error.name, 'PjsTaskError');
    assert.equal(error.remoteName, 'RangeError');
    assert.equal(error.message, 'controlled installed task failure');
    assert.match(error.remoteStack, /tasks\.mjs/);
    assert.match(error.stack, /src[/\\]tasks[/\\]coordinator\.ts/);
    return true;
  });
  assert.equal(await runtime.run(square, 5), 25);
  // Keep this ESM fixture usable for published artifacts; CommonJS root loading
  // and mixed identity are checked by the separate installed consumers.
  for (const subpath of [
    'dist/index.js',
    'dist/telemetry/profile.js',
    'src/runtime.ts',
    'dist/tasks/registry.js',
    'dist/diagnostics.js',
    'src/diagnostics.ts',
    'dist/errors/index.js',
    'src/tasks/registry.ts',
    'package.json',
  ]) {
    await assert.rejects(import(`@pjavascript/runtime/${subpath}`), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
    assert.throws(() => require(`@pjavascript/runtime/${subpath}`), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
  }
} finally {
  const shutdown = runtime.shutdown();
  assert.equal(runtime.shutdown({ drain: false }), shutdown);
  await shutdown;
}
assert.equal(runtime.stats().state, 'stopped');
assert.equal(runtime.stats().tasks.pending, 0);
await assert.rejects(runtime.run(square, 3), PjsRuntimeStateError);
console.log(
  JSON.stringify({
    import: true,
    ready: true,
    run: true,
    workerRecoveryAfterTaskError: true,
    errorIdentity: true,
    sourceMappedStack: true,
    blockedSubpaths: true,
    rootOnly: true,
    shutdown: true,
  }),
);
