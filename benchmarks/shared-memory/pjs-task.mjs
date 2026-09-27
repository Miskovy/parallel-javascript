import { transfer } from '@pjs/runtime';
import { execute } from './kernel.mjs';

export default function task(input) {
  const result = execute(input);
  return input.kind === 'matrix' && input.memory !== 'clone'
    ? transfer(result, [result.output.buffer])
    : result;
}
