import type { ProgressValue } from '../types/index.js';
import type { PjsTask } from '../tasks/registry.js';
import type { RunOptions } from '../types/index.js';

/** Ordinary submission grants no access to children, dispatch, or lifecycle. */
export interface RunSubmission {
  submit<Input, Output, Progress = ProgressValue>(
    task: PjsTask<Input, Output, Progress>,
    input: NoInfer<Input>,
    options:
      | RunOptions<NoInfer<Input>, NoInfer<Output>, NoInfer<Progress>>
      | RunOptions<unknown, never, NoInfer<Progress>>,
  ): Promise<Output>;
}

export function run<Input, Output, Progress = ProgressValue>(
  submission: RunSubmission,
  task: PjsTask<Input, Output, Progress>,
  input: NoInfer<Input>,
  options:
    | RunOptions<NoInfer<Input>, NoInfer<Output>, NoInfer<Progress>>
    | RunOptions<unknown, never, NoInfer<Progress>> = {},
): Promise<Output> {
  return submission.submit(task, input, options);
}
