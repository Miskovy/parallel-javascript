import { transfer } from '@pjs/runtime';

export function double(values) {
  for (let i = 0; i < values.length; i++) values[i] *= 2;
  return transfer(values, [values.buffer]);
}
