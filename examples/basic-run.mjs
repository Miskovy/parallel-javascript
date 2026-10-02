import { PjsRuntime, PjsTaskRegistry } from '@pjs/runtime';

const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  new URL('./tasks.mjs', import.meta.url),
  'square',
);
const runtime = new PjsRuntime({ registry, workers: 1 });

try {
  await runtime.ready();
  console.log(await runtime.run(square, 12)); // 144
} finally {
  await runtime.shutdown();
}
