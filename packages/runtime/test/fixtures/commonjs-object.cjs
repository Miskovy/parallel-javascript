const tasks = {
  default(value) {
    return value + 1;
  },
  ['com' + 'puted'](value) {
    return value * 3;
  },
  arity() {
    return arguments.length;
  },
  block({ start, end }) {
    return Array.from({ length: end - start }, (_, n) => (start + n) * 2);
  },
  noncallable: 1,
  promise: Promise.resolve(1),
};
Object.setPrototypeOf(tasks, { inherited: () => 'must not run' });
Object.defineProperty(tasks, 'brokenExport', {
  get() {
    throw new Error('CommonJS export accessor failed');
  },
});
module.exports = tasks;
