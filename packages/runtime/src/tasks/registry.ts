import type { ProgressValue } from '../types/index.js';
import { PjsTaskRegistrationError } from '../errors/index.js';

declare const taskTypes: unique symbol;
declare const progressTypes: unique symbol;

/** A reference to executable code, never a transferable closure. */
export interface PjsTask<Input, Output, Progress = ProgressValue> {
  readonly id: string;
  readonly [progressTypes]?: Progress;
  readonly [taskTypes]?: (input: Input) => Output;
}

export interface TaskDescriptor {
  id: string;
  module: string;
  exportName: string;
}

const entries = new WeakMap<PjsTaskRegistry, Map<object, TaskDescriptor>>();

function registryEntries(
  registry: PjsTaskRegistry,
): Map<object, TaskDescriptor> {
  const registered = entries.get(registry);
  if (!registered) throw new TypeError('Invalid task registry receiver');
  return registered;
}

export class PjsTaskRegistry {
  constructor() {
    entries.set(this, new Map());
  }

  register<Input, Output, Progress = ProgressValue>(
    id: string,
    module: URL,
    exportName = 'default',
  ): PjsTask<Input, Output, Progress> {
    return registerTask(
      this,
      id,
      module,
      exportName,
      ['file:'],
      'Tasks require a file: URL and a nonempty export name',
    );
  }
}

/** @internal Each runtime captures a configuration snapshot, outside the root API. */
export function snapshotRegistry(
  registry: PjsTaskRegistry,
): ReadonlyMap<object, TaskDescriptor> {
  return new Map(
    [...registryEntries(registry)].map(([handle, descriptor]) => [
      handle,
      { ...descriptor },
    ]),
  );
}

/** @internal Host-bound registration policy; storage/identity has one owner. */
export function registerTask<Input, Output, Progress = ProgressValue>(
  registry: PjsTaskRegistry,
  id: string,
  module: URL,
  exportName: string,
  protocols: readonly string[],
  message: string,
): PjsTask<Input, Output, Progress> {
  const registered = registryEntries(registry);
  if (!id || [...registered.values()].some((entry) => entry.id === id)) {
    throw new PjsTaskRegistrationError(
      `Task ID must be nonempty and unique: ${id}`,
    );
  }
  if (
    !(module instanceof URL) ||
    !protocols.includes(module.protocol) ||
    !exportName
  ) {
    throw new PjsTaskRegistrationError(message);
  }
  const handle = Object.freeze({ id });
  registered.set(handle, { id, module: module.href, exportName });
  return handle;
}
