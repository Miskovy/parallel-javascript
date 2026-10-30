export function hang(input) {
  if (input?.shared) {
    const control = new Int32Array(input.shared);
    Atomics.add(control, 2, 1);
    Atomics.store(control, 0, 1);
  }
  if (input?.transferred) new Uint8Array(input.transferred)[0] = 7;
  while (true) {
    /* Deliberate installed-package CPU loop. */
  }
}
export function echo(input) {
  return input;
}
export function crash() {
  process.exit(31);
}
