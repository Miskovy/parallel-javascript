// Run from the consuming application's directory after installing PJS.
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const entry = new URL(import.meta.resolve('@pjavascript/runtime/browser'));
await cp(fileURLToPath(new URL('../', entry)), 'public/vendor/pjs', {
  recursive: true,
});
