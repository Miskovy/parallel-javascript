const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { PjsRuntime, PjsTaskRegistry } = require('@pjavascript/runtime');

const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  pathToFileURL(require.resolve('./commonjs-default.cjs')),
);
const runtime = new PjsRuntime({ registry, workers: 1 });
async function main() {
  try {
    await runtime.ready();
    assert.equal(await runtime.run(square, 12), 144);
  } finally {
    await runtime.shutdown();
  }
  assert.equal(runtime.stats().state, 'stopped');
  console.log(JSON.stringify({ commonjs: true, node: process.version }));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
