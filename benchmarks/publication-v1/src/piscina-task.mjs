import { move, transferableSymbol, valueSymbol } from 'piscina';
import { execute } from './kernels.mjs';
import { identities } from './identity.mjs';
import { isMainThread, threadId } from 'node:worker_threads';
export default function task(input) {
  if (input.op === 'identity')
    return { identities: identities(), isMainThread, threadId };
  const result = execute(input);
  return input.family === 'image' && input.mode === 'transfer'
    ? move({
        [transferableSymbol]: [result.output.buffer],
        [valueSymbol]: result,
      })
    : result;
}
