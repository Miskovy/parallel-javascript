// Intentional startup timeout; containment must not depend on this import finishing.
await new Promise(() => {});
export default function task(value) {
  return value;
}
