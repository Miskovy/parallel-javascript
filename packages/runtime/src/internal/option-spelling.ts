/** Presence includes inherited/undefined properties; neither value is read here. */
export function optionSpelling<Current extends string, Legacy extends string>(
  options: object,
  current: Current,
  legacy: Legacy,
): Current | undefined {
  const hasCurrent = current in options;
  const hasLegacy = legacy in options;
  if (hasLegacy) throw new TypeError(`${legacy} was removed; use ${current}`);
  return hasCurrent ? current : undefined;
}
