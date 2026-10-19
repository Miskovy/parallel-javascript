// Unsupported emitted-private-field inspection, confined to verification tooling.
// Return live owners; never copy state or retain retired workers/payloads here.
export function runtimeComponents(runtime) {
  return runtime.components;
}

export function runtimeController(runtime) {
  return runtimeComponents(runtime).controller;
}
