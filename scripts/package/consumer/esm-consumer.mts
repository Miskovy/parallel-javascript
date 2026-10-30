import assert from 'node:assert/strict';
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime';
import type { PjsTask } from '@pjavascript/runtime';

const registry = new PjsTaskRegistry();
const square: PjsTask<number, number> = registry.register<number, number>(
  'square',
  new URL('../commonjs-default.cjs', import.meta.url),
);
const runtime = new PjsRuntime({ registry, workers: 1 });
function typeContracts() {
  // @ts-expect-error Input must retain its declared type through import.
  runtime.run(square, 'invalid');
  // @ts-expect-error Results remain typed rather than any.
  const invalid: Promise<string> = runtime.run(square, 1);
  return invalid;
}
void typeContracts;
try {
  await runtime.ready();
  const result: number = await runtime.run(square, 12);
  assert.equal(result, 144);
} finally {
  await runtime.shutdown();
}
assert.equal(runtime.stats().state, 'stopped');
console.log(JSON.stringify({ esmTypes: true }));
