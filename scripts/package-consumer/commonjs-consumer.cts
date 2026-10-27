import assert = require('node:assert/strict');
import { pathToFileURL } from 'node:url';
import PJS = require('@pjavascript/runtime');

const registry = new PJS.PjsTaskRegistry();
const square: PJS.PjsTask<number, number> = registry.register<number, number>(
  'square',
  pathToFileURL(require.resolve('../commonjs-default.cjs')),
);
const runtime = new PJS.PjsRuntime({ registry, workers: 1 });
function typeContracts() {
  // @ts-expect-error Input must retain its declared type through require.
  runtime.run(square, 'invalid');
  // @ts-expect-error Results remain typed rather than any.
  const invalid: Promise<string> = runtime.run(square, 1);
  return invalid;
}
void typeContracts;
async function main() {
  try {
    await runtime.ready();
    const result: number = await runtime.run(square, 12);
    assert.equal(result, 144);
  } finally {
    await runtime.shutdown();
  }
  assert.equal(runtime.stats().state, 'stopped');
  console.log(JSON.stringify({ commonjsTypes: true }));
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
