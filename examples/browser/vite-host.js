// Vite base: '/app/'. Run copy-assets.mjs before vite dev/build.
import { PjsRuntime, PjsTaskRegistry } from '@pjavascript/runtime/browser';
import taskURL from './tasks.js?url&no-inline';
const registry = new PjsTaskRegistry();
const square = registry.register(
  'square',
  new URL(taskURL, globalThis.location.href),
  'square',
);
const runtime = new PjsRuntime({
  registry,
  workers: 2,
  workerURL: new URL(
    `${import.meta.env.BASE_URL}vendor/pjs/browser/bootstrap.js`,
    globalThis.location.href,
  ),
});
try {
  console.log(await runtime.run(square, 12));
} finally {
  await runtime.shutdown();
}
