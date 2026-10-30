const { transfer } = require('@pjavascript/runtime');
let previous;
const tasks = {
  ['ec' + 'ho'](value) {
    return value;
  },
  move(values) {
    const output = Uint8Array.from(values);
    previous = output.buffer;
    return transfer(output, [output.buffer]);
  },
  detached() {
    return previous.byteLength === 0;
  },
  fail() {
    throw new Error('CommonJS task failed');
  },
};
module.exports = tasks;
