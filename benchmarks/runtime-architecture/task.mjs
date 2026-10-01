const { transfer } = await import(
  process.env.PJS_BENCH_RUNTIME ?? '@pjs/runtime'
);

function burn(value, iterations) {
  let state = (value + 1) | 0;
  for (let index = 0; index < iterations; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
  }
  return state | 0;
}

export function execute(input) {
  if (input.kind === 'noop') return input.value;
  if (input.kind === 'cpu') return burn(input.value, input.iterations);
  if (input.kind === 'transfer-input') return input.value.byteLength;
  if (input.kind === 'shared-input')
    return input.value[0] + input.value[input.value.length - 1];
  if (input.kind === 'range') return input.partition.index;
  if (input.kind === 'binary') {
    const output = new Uint8Array(input.bytes);
    output[0] = input.partition.index & 255;
    return input.move ? transfer(output, [output.buffer]) : output;
  }
  if (input.kind === 'map-array')
    return Array.from(
      { length: input.partition.end - input.partition.start },
      (_, offset) => input.partition.start + offset,
    );
  if (input.kind === 'map-typed') {
    const output = new Uint32Array(input.partition.end - input.partition.start);
    for (let offset = 0; offset < output.length; offset++)
      output[offset] = input.partition.start + offset;
    return output;
  }
  throw new Error(`Unknown runtime architecture benchmark kind ${input.kind}`);
}
