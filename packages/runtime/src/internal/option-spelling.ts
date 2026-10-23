/** Presence includes inherited/undefined properties; neither value is read here. */
export function optionSpelling<Current extends string, Legacy extends string>(
  options: object,
  current: Current,
  legacy: Legacy,
): Current | Legacy | undefined {
  const hasCurrent = current in options;
  const hasLegacy = legacy in options;
  if (hasCurrent && hasLegacy)
    throw new TypeError(`${current} and ${legacy} are mutually exclusive`);
  return hasCurrent ? current : hasLegacy ? legacy : undefined;
}
