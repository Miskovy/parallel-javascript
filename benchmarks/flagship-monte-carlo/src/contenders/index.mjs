import { fileURLToPath } from 'node:url';
import Piscina from 'piscina';
import {
  PjsRuntime,
  PjsTaskRegistry,
  sharedReadonly,
} from '@pjavascript/runtime';
import task from '../workers/task.mjs';
import { createRaw } from './raw.mjs';

export { sharedReadonly };

export function createPool(contender, workers) {
  if (contender === 'serial')
    return {
      serial: true,
      ready: async () => {},
      run: task,
      close: async () => {},
    };
  if (contender === 'raw') return createRaw(workers);
  if (contender === 'piscina') {
    const pool = new Piscina({
      filename: fileURLToPath(new URL('../workers/task.mjs', import.meta.url)),
      minThreads: workers,
      maxThreads: workers,
      maxQueue: 2 * workers,
      concurrentTasksPerWorker: 1,
    });
    // No undocumented ready internals: full-workload warmups establish readiness.
    return {
      ready: async () => {},
      run: (input) => pool.run(input),
      close: () => pool.destroy(),
    };
  }
  if (contender === 'pjs') {
    const registry = new PjsTaskRegistry();
    const handle = registry.register(
      'monte-carlo',
      new URL('../workers/task.mjs', import.meta.url),
    );
    const runtime = new PjsRuntime({
      registry,
      workers,
      maxQueue: 2 * workers,
    });
    return {
      ready: () => runtime.ready(),
      run: (input) => runtime.run(handle, input),
      close: () => runtime.shutdown({ drain: false }),
    };
  }
  throw new Error(`Unknown contender ${contender}`);
}
