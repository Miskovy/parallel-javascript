function task(value) {
  return value * 2;
}
Object.defineProperty(task, 'own', { value: (value) => value * 4 });
module.exports = task;
