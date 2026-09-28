import { move, transferableSymbol, valueSymbol } from 'piscina';
import { execute } from './kernel.mjs';
export default function task(input) {
  const result = execute(input);
  return input.kind === 'matrix'
    ? move({
        [transferableSymbol]: [result.output.buffer],
        [valueSymbol]: result,
      })
    : result;
}
