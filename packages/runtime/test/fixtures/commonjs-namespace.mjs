const loaded = await Promise.resolve('ready');
export function named(value) {
  return `${loaded}:${value}`;
}
export default { named: () => 'must not replace the namespace export' };
