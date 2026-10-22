export function square(value) {
  return value * value;
}

export function fail() {
  throw new RangeError('controlled installed task failure');
}

export function streamBinary({ gate }) {
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    while (!Atomics.load(control, 1)) Atomics.wait(control, 1, 0, 100);
  }
  return new Uint8Array(8);
}
