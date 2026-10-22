import { transfer } from '@pjavascript/runtime';

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
export function binaryContract({
  kind,
  bytes,
  move = false,
  detached = false,
}) {
  let value;
  if (kind === 'SharedArrayBuffer') value = new SharedArrayBuffer(bytes);
  else if (kind === 'shared-typed')
    value = new Uint8Array(new SharedArrayBuffer(bytes));
  else if (kind === 'shared-view')
    value = new DataView(new SharedArrayBuffer(bytes));
  else if (kind === 'object') value = { data: new Uint8Array(bytes) };
  else if (kind === 'ArrayBuffer') value = new ArrayBuffer(bytes);
  else {
    const buffer = new ArrayBuffer(bytes + 16);
    value =
      kind === 'DataView'
        ? new DataView(buffer, 8, bytes)
        : new globalThis[kind](
            buffer,
            8,
            bytes / globalThis[kind].BYTES_PER_ELEMENT,
          );
  }
  const buffer = ArrayBuffer.isView(value) ? value.buffer : value;
  if (buffer instanceof ArrayBuffer) {
    const visible = ArrayBuffer.isView(value)
      ? new Uint8Array(buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(buffer);
    visible.fill(37);
    if (detached) structuredClone(buffer, { transfer: [buffer] });
  }
  // An empty transfer list is valid and still creates a genuine envelope. It lets
  // the strict validator, rather than the transfer-list guard, reject shared values.
  return move
    ? transfer(value, buffer instanceof ArrayBuffer ? [buffer] : [])
    : value;
}
