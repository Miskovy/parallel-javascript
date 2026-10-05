import { execute } from './kernel.mjs';
// The archived v0.3 bootstrap must see an envelope from its own module instance.
const { transfer } = await import(
  process.env.PJS_BENCH_RUNTIME ?? '@pjavascript/runtime'
);
export default function task(input) {
  const result = execute(input);
  return input.kind === 'matrix'
    ? transfer(result, [result.output.buffer])
    : result;
}
