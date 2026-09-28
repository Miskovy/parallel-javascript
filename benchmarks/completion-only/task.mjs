function burn(value, iterations) {
  let state = (value + 1) | 0;
  for (let index = 0; index < iterations; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
  }
  return state | 0;
}

function execute(input) {
  const { partition } = input;
  if (input.kind === 'noop') {
    if (input.outputType === 'undefined') return undefined;
    if (input.outputType === 'scalar') return partition.index;
    if (input.outputType === 'large')
      return new Uint8Array(input.outputBytes).fill(partition.index & 255);
  }
  if (input.kind === 'cpu') {
    const value = burn(partition.index, input.iterations);
    if (input.progress)
      Atomics.add(new Int32Array(input.progress), input.progressIndex, 1);
    return value;
  }
  if (input.kind === 'vector') {
    for (let index = partition.start; index < partition.end; index++) {
      const value = input.source[index];
      input.output[index] =
        Math.sin(value) * Math.sin(value) +
        Math.cos(value) * Math.cos(value) +
        burn(index, input.iterations) * 0;
    }
    return partition.index;
  }
  if (input.kind === 'matrix-shared') {
    const { a, b, output, size } = input;
    for (let row = partition.start; row < partition.end; row++)
      for (let k = 0; k < size; k++) {
        const left = a[row * size + k];
        for (let column = 0; column < size; column++)
          output[row * size + column] += left * b[k * size + column];
      }
    return partition.index;
  }
  if (input.kind === 'matrix-private') {
    const { a, b, size } = input;
    const rows = partition.end - partition.start;
    const output = new Float64Array(rows * size);
    for (let localRow = 0; localRow < rows; localRow++)
      for (let k = 0; k < size; k++) {
        const left = a[(partition.start + localRow) * size + k];
        for (let column = 0; column < size; column++)
          output[localRow * size + column] += left * b[k * size + column];
      }
    return output;
  }
  throw new Error(`Unknown completion benchmark kind ${input.kind}`);
}

export default function task(input) {
  if (input.batchItems) {
    const values = input.batchItems.map(execute);
    return input.completionOnly ? undefined : values;
  }
  const value = execute(input);
  return input.completionOnly ? undefined : value;
}
