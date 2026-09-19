import { PjsTaskRegistrationError } from '../errors/index.js';

declare const taskTypes: unique symbol;

/** A reference to executable code, never a transferable closure. */
export interface PjsTask<Input, Output> {
  readonly id: string;
  readonly [taskTypes]?: (input: Input) => Output;
}

export interface TaskDescriptor {
  id: string;
  module: string;
  exportName: string;
}

export class PjsTaskRegistry {
  private readonly entries = new Map<object, TaskDescriptor>();

  register<Input, Output>(
    id: string,
    module: URL,
    exportName = 'default',
  ): PjsTask<Input, Output> {
    if (!id || [...this.entries.values()].some((entry) => entry.id === id)) {
      throw new PjsTaskRegistrationError(
        `Task ID must be nonempty and unique: ${id}`,
      );
    }
    if (
      !(module instanceof URL) ||
      module.protocol !== 'file:' ||
      !exportName
    ) {
      throw new PjsTaskRegistrationError(
        'Tasks require a file: URL and a nonempty export name',
      );
    }
    const handle = Object.freeze({ id });
    this.entries.set(handle, { id, module: module.href, exportName });
    return handle;
  }

  /** @internal Each runtime captures a configuration snapshot. */
  snapshot(): ReadonlyMap<object, TaskDescriptor> {
    return new Map(
      [...this.entries].map(([handle, descriptor]) => [
        handle,
        { ...descriptor },
      ]),
    );
  }
}
