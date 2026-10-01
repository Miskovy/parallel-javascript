export function integer(
  name: string,
  value: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  return value;
}
