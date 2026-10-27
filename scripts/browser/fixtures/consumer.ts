import {
  PjsRuntime,
  PjsTaskRegistry,
  browserCapabilities,
  transfer,
  sharedReadonly,
  type TaskContext,
  type PjsRuntimeStats,
} from '@pjavascript/runtime/browser';
interface DownloadProgress {
  done: number;
  total: number;
}
const registry = new PjsTaskRegistry();
const task = registry.register<number, number, DownloadProgress>(
  'work',
  new URL('https://example.test/task.js'),
);
const runtime = new PjsRuntime({
  registry,
  workers: 1,
  workerURL: new URL('https://example.test/bootstrap.js'),
});
const result: Promise<number> = runtime.run(task, 1, {
  onProgress(event) {
    const done: number = event.value.done;
    void done;
  },
});
const stats: PjsRuntimeStats = runtime.stats();
const retirements: number = stats.containment.unconfirmedRetirements;
// @ts-expect-error Node-only observations are not browser promises.
void stats.workers.details[0]?.threadId;
// @ts-expect-error Resource limits must not silently be ignored.
new PjsRuntime({ registry, resourceLimits: { maxOldGenerationSizeMb: 64 } });
// @ts-expect-error Task schemas retain input checking.
runtime.run(task, 'wrong');
const context = null as unknown as TaskContext<DownloadProgress>;
context.reportProgress({ done: 1, total: 2 });
transfer(new Uint8Array(1), []);
sharedReadonly(new Float64Array(1));
void [result, retirements, browserCapabilities()];
