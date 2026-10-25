import type { PjsTask } from '../tasks/registry.js';
import type { RunOptions } from '../types/index.js';

/** Ordinary submission grants no access to children, dispatch, or lifecycle. */
export interface RunSubmission {
  submit<Input, Output>(
    task: PjsTask<Input, Output>,
    input: NoInfer<Input>,
    options: RunOptions<NoInfer<Input>, NoInfer<Output>> | RunOptions,
  ): Promise<Output>;
}

export function run<Input, Output>(
  submission: RunSubmission,
  task: PjsTask<Input, Output>,
  input: NoInfer<Input>,
  options: RunOptions<NoInfer<Input>, NoInfer<Output>> | RunOptions = {},
): Promise<Output> {
  return submission.submit(task, input, options);
}
