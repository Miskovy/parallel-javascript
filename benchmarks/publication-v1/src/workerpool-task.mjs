import workerpool from 'workerpool';
import { execute } from './kernels.mjs';
import { identities } from './identity.mjs';
import { isMainThread, threadId } from 'node:worker_threads';
function task(input) {
  if (input.op === 'identity')
    return { identities: identities(), isMainThread, threadId };
  const result = execute(input);
  return input.family === 'image' && input.mode === 'transfer'
    ? new workerpool.Transfer(result, [result.output.buffer])
    : result;
}
workerpool.worker({ task });
