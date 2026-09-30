import { parentPort, threadId } from 'node:worker_threads';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { PjsRuntime, PjsTaskRegistry, transfer } from '../../dist/index.js';

export async function range({
  partition,
  gate,
  ms = 0,
  fail = false,
  crash = false,
  shared,
  data,
  move = false,
  counter,
  badProtocol = false,
  badOutput = false,
}) {
  if (counter) Atomics.add(new Int32Array(counter), partition.index, 1);
  if (badProtocol)
    parentPort.postMessage({
      type: 'batchResult',
      batchId: 'incorrect-batch',
      items: [],
      skippedTaskIds: [],
      executionMs: 0,
    });
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    Atomics.notify(control, 0);
    const deadline = Date.now() + 5000;
    while (!Atomics.load(control, 1)) {
      if (Date.now() > deadline)
        throw new Error('Test gate was never released');
      Atomics.wait(control, 1, 0, 100);
    }
  }
  if (ms) await delay(ms);
  if (crash) process.exit(23);
  if (fail) throw new RangeError('partition deliberately failed');
  const indices = [];
  for (let i = partition.start; i < partition.end; i++) indices.push(i);
  const values = data ?? new Float64Array(indices);
  const result = {
    partition,
    indices,
    threadId,
    values,
    shared: shared?.buffer instanceof SharedArrayBuffer,
    sum: shared ? shared.reduce((a, b) => a + b, 0) : undefined,
  };
  if (badOutput) result.invalid = () => {};
  return move ? transfer(result, [values.buffer]) : result;
}

export async function completion({
  partition,
  gate,
  ms = 0,
  fail = false,
  crash = false,
  counter,
  input,
  output,
  matrixA,
  matrixB,
  matrixSize,
  returnValue,
}) {
  if (counter) Atomics.add(new Int32Array(counter), partition.index, 1);
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    Atomics.notify(control, 0);
    while (!Atomics.load(control, 1)) {
      if (Atomics.wait(control, 1, 0, 5000) === 'timed-out')
        throw new Error('Completion gate was never released');
    }
  }
  if (ms) await delay(ms);
  if (crash) process.exit(23);
  if (fail) throw new RangeError('completion deliberately failed');
  if (input && output) {
    for (let index = partition.start; index < partition.end; index++) {
      const value = input[index];
      output[index] = Math.sin(value) ** 2 + Math.cos(value) ** 2;
    }
  }
  if (matrixA && matrixB && output && matrixSize) {
    for (let row = partition.start; row < partition.end; row++) {
      for (let column = 0; column < matrixSize; column++) {
        let sum = 0;
        for (let k = 0; k < matrixSize; k++)
          sum +=
            matrixA[row * matrixSize + k] * matrixB[k * matrixSize + column];
        output[row * matrixSize + column] = sum;
      }
    }
  }
  if (returnValue === 'uncloneable') return () => partition.index;
  if (returnValue === 'large') return new Uint8Array(1024 * 1024);
  return returnValue;
}

export async function mapBlock({
  partition,
  gate,
  ms = 0,
  fail = false,
  crash = false,
  kind = 'array',
  lengthDelta = 0,
  move = false,
  source,
}) {
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    Atomics.notify(control, 0);
    while (!Atomics.load(control, 1)) {
      if (Atomics.wait(control, 1, 0, 5000) === 'timed-out')
        throw new Error('Map gate was never released');
    }
  }
  if (ms) await delay(ms);
  if (crash) process.exit(24);
  if (fail) throw new RangeError('map block deliberately failed');
  const length = partition.end - partition.start + lengthDelta;
  if (kind === 'wrong') return { length };
  if (kind === 'uncloneable') return [() => partition.index];
  if (kind === 'objects')
    return Array.from({ length }, (_, offset) => {
      const index = partition.start + offset;
      return { index, score: index * index, category: Math.abs(index) % 3 };
    });
  if (kind === 'float64' || kind === 'uint32') {
    const values =
      kind === 'float64' ? new Float64Array(length) : new Uint32Array(length);
    for (let offset = 0; offset < length; offset++) {
      const index = partition.start + offset;
      values[offset] = source ? source[index - partition.start] * 2 : index * 2;
    }
    return move ? transfer(values, [values.buffer]) : values;
  }
  return Array.from({ length }, (_, offset) => (partition.start + offset) * 2);
}

export function directResult({ returnValue, move = false }) {
  return move ? transfer(returnValue, [returnValue.buffer]) : returnValue;
}

export async function binaryResult({
  partition,
  bytes,
  kind = 'uint8',
  move = false,
  gate,
  ms = 0,
  fail = false,
  crash = false,
  counter,
  detached = false,
}) {
  if (counter) Atomics.add(new Int32Array(counter), partition.index, 1);
  if (gate) {
    const control = new Int32Array(gate);
    Atomics.add(control, 0, 1);
    Atomics.notify(control, 0);
    while (!Atomics.load(control, 1)) {
      if (Atomics.wait(control, 1, 0, 5000) === 'timed-out')
        throw new Error('Binary result gate was never released');
    }
  }
  if (ms) await delay(ms);
  if (crash) process.exit(25);
  if (fail) throw new RangeError('binary result deliberately failed');
  if (kind === 'object') return { bytes };
  if (kind === 'nested') return { data: new Uint8Array(bytes) };
  if (kind === 'shared') return new Uint8Array(new SharedArrayBuffer(bytes));
  if (kind === 'shared-buffer') return new SharedArrayBuffer(bytes);
  let value;
  if (kind === 'arraybuffer') value = new ArrayBuffer(bytes);
  else if (kind === 'float64') value = new Float64Array(bytes / 8);
  else if (kind === 'buffer') value = Buffer.allocUnsafeSlow(bytes);
  else if (kind === 'dataview') value = new DataView(new ArrayBuffer(bytes));
  else if (kind === 'subview')
    value = new Uint8Array(new ArrayBuffer(bytes + 32), 16, bytes);
  else value = new Uint8Array(bytes);
  const fill = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  for (let index = 0; index < fill.length; index++)
    fill[index] = (partition.start + index * 17) & 0xff;
  const buffer = ArrayBuffer.isView(value) ? value.buffer : value;
  if (detached) {
    structuredClone(buffer, { transfer: [buffer] });
    return value;
  }
  return move ? transfer(value, [buffer]) : value;
}

export async function nested() {
  const registry = new PjsTaskRegistry();
  const task = registry.register('range', new URL(import.meta.url), 'range');
  const runtime = new PjsRuntime({ registry, workers: 1 });
  try {
    await runtime.partitionRange(
      task,
      { start: 0, end: 1, grainSize: 1 },
      (partition) => ({ input: { partition } }),
    );
  } finally {
    await runtime.shutdown({ drain: false });
  }
}
