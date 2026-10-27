import {
  PjsRuntime,
  PjsTaskRegistry,
  browserCapabilities,
} from '@pjavascript/runtime/browser';
const registry = new PjsTaskRegistry();
const moduleURL = new URL('./tasks.js', import.meta.url);
const square = registry.register('square', moduleURL, 'square');
const block = registry.register('block', moduleURL, 'block');
const runtime = new PjsRuntime({ registry, workers: 2 });
try {
  console.log(browserCapabilities());
  console.log(await runtime.run(square, 12));
  console.log(
    await runtime.parallelMapRange(
      block,
      { start: 0, end: 100, grainSize: 20 },
      ({ start, end }) => ({ input: { start, end } }),
    ),
  );
} finally {
  await runtime.shutdown(); // Local endpoint retirement, not a native join.
}
