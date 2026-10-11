export function hang({ shared, transferred } = {}) {
  if (transferred) new Uint8Array(transferred)[0] = 7;
  if (shared) Atomics.store(new Int32Array(shared), 0, 1);
  while (true) {
    /* Intentionally non-returning CPU work. */
  }
}
export function echo(input) {
  return input;
}
export function crash() {
  process.exit(31);
}
export function controlled({ shared }) {
  const state = new Int32Array(shared);
  Atomics.store(state, 0, 1);
  while (Atomics.load(state, 1) === 0) {
    /* Host-controlled completion. */
  }
  return new Uint8Array(8);
}
