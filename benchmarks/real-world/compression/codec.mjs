// Research-only workload contracts. These are not PJS runtime APIs.
export const fedoraBuild = 'fedora44-x86_64-compat-no-new-strategies';
export const fixedParameters = Object.freeze({
  windowBits: 15,
  memLevel: 8,
  strategy: 0,
  flush: 0,
  finishFlush: 4,
  dictionary: null,
  level: 6,
});

export function identifyCodec(version) {
  const family =
    typeof version === 'string' && version.endsWith('.zlib-ng')
      ? 'zlib-ng'
      : ['1.3.1', '1.3.2.1-motley-8002e91'].includes(version)
        ? 'stock-zlib'
        : 'unknown';
  return Object.freeze({ family, version });
}

export function qualifyCodec({ version, implementationVersion, build } = {}) {
  const identity = identifyCodec(version);
  if (identity.family === 'stock-zlib')
    return Object.freeze({ ...identity, contract: 'stock-default-raw-v1' });
  if (
    version === '1.3.1.zlib-ng' &&
    implementationVersion === '2.3.3' &&
    build === fedoraBuild
  )
    return Object.freeze({
      ...identity,
      implementationVersion,
      build,
      contract: 'zlib-ng-no-quick-raw-v1',
    });
  throw new Error(`Unqualified compression codec: ${String(version)}`);
}

export function compressionBound({
  codec,
  inputBytes,
  mode = 'raw-deflate',
  parameters = fixedParameters,
}) {
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0)
    throw new RangeError('invalid length');
  if (mode !== 'raw-deflate') throw new Error('unqualified wrapper');
  const { level, ...rest } = parameters;
  const { level: defaultLevel, ...fixed } = fixedParameters;
  if (
    ![1, defaultLevel, 9].includes(level) ||
    Object.keys(rest).length !== Object.keys(fixed).length ||
    Object.entries(fixed).some(([key, value]) => rest[key] !== value)
  )
    throw new Error('unqualified compression parameters');
  const qualified = qualifyCodec(codec);
  if (
    codec.family !== qualified.family ||
    codec.contract !== qualified.contract
  )
    throw new Error('codec identity/contract mismatch');
  // BigInt keeps the overflow check exact near the JS safe-integer boundary.
  const n = BigInt(inputBytes);
  const bytes =
    qualified.family === 'stock-zlib'
      ? n + n / 4096n + n / 16384n + n / 33554432n + 7n
      : n + n / 16n + 7n;
  if (bytes > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('bound overflow');
  return Number(bytes);
}
