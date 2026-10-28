// Deploy with the application under /app/. Workers do not inherit import maps.
import { transfer } from '/app/vendor/pjs/browser/index.js';
export const square = (value) => value * value;
export function block({ start, end }) {
  return Array.from(
    { length: end - start },
    (_, offset) => (start + offset) ** 2,
  );
}
export function bytes(length) {
  const output = new Uint8Array(length);
  output.fill(7);
  return transfer(output, [output.buffer]);
}
