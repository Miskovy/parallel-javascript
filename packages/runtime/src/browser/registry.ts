import {
  PjsTaskRegistry as Registry,
  registerTask,
} from '../tasks/registry.js';
import type { PjsTask } from '../tasks/registry.js';
import type { ProgressValue } from '../types/index.js';

export class PjsTaskRegistry extends Registry {
  override register<Input, Output, Progress = ProgressValue>(
    id: string,
    module: URL,
    exportName = 'default',
  ): PjsTask<Input, Output, Progress> {
    return registerTask(
      this,
      id,
      module,
      exportName,
      ['http:', 'https:'],
      'Browser tasks require an HTTP(S) URL and a nonempty export name',
    );
  }
}
