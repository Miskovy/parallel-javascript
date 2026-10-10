import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import {
  classifyReleaseNpmVersion,
  assertSupportedReleaseNpmVersion,
  assertPublicationToolchain,
  verifyReleaseNpmArchive,
  releaseToolchain,
} from './toolchain.mjs';
import {
  packageName,
  parseTarListing,
  validateTarListing,
  parsePublishDryRunReport,
  validatePublishDryRunReport,
  registryPresence,
  releasePolicy,
  validateManifest,
  verifyRegistry,
  convergeRegistry,
  parseRegistryResponse,
  requestRegistry,
} from './npm-release.mjs';

const dryRecord = { name: packageName, version: '1.0.0-rc.4', entryCount: 128 };
test('duplicate package candidates and duplicate/escaped record keys are ambiguous', () => {
  const record = JSON.stringify(dryRecord);
  for (const stdout of [
    `{"${packageName}":${record},"${packageName}":${record}}`,
    `{"name":"wrong","name":"${packageName}","version":"1.0.0-rc.4","entryCount":128}`,
    `{"name":"wrong","\\u006eame":"${packageName}","version":"1.0.0-rc.4","entryCount":128}`,
  ])
    assert.throws(
      () => parsePublishDryRunReport(stdout),
      /Duplicate npm dry-run JSON key/,
    );
});
const validateDry = (value) =>
  validatePublishDryRunReport(
    parsePublishDryRunReport(JSON.stringify(value)),
    dryRecord.version,
    dryRecord.entryCount,
  );

test('npm 11.19.0 singleton package-name map normalizes before identity validation', () => {
  const value = { [packageName]: dryRecord };
  assert.deepEqual(parsePublishDryRunReport(JSON.stringify(value)), dryRecord);
  validateDry(value);
});

test('npm 11.8.0 direct report remains intentionally supported', () => {
  assert.deepEqual(
    parsePublishDryRunReport(JSON.stringify(dryRecord)),
    dryRecord,
  );
  validateDry(dryRecord);
});

test('empty, invalid and non-object dry-run JSON fails with useful diagnostics', () => {
  for (const stdout of [
    undefined,
    null,
    '',
    ' ',
    '{broken',
    'null',
    'false',
    '42',
    '"text"',
  ])
    assert.throws(() => parsePublishDryRunReport(stdout), /npm dry-run/);
});

test('unobserved arrays, multi-package maps and ambiguous nesting are rejected', () => {
  for (const value of [
    [],
    [dryRecord],
    [dryRecord, dryRecord],
    {},
    { reports: dryRecord },
    { [packageName]: [dryRecord] },
    { [packageName]: null },
    { [packageName]: dryRecord, other: dryRecord },
    { name: packageName, ...dryRecord, [packageName]: dryRecord },
    { other: dryRecord },
  ])
    assert.throws(() => validateDry(value), /npm dry-run/);
});

test('missing or invalid required report fields fail closed', () => {
  for (const change of [
    { name: undefined },
    { name: '' },
    { name: 1 },
    { version: undefined },
    { version: '' },
    { entryCount: undefined },
    { entryCount: '128' },
    { entryCount: null },
    { entryCount: 0 },
    { entryCount: -1 },
    { entryCount: 1.5 },
    { entryCount: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const value = { ...dryRecord, ...change };
    assert.throws(() => validateDry(value), /npm dry-run/);
    assert.throws(() => validateDry({ [packageName]: value }), /npm dry-run/);
  }
});

test('canonical dry-run identity, version and file-count mismatches are rejected', () => {
  for (const [change, message] of [
    [{ name: '@pjs/runtime' }, /package name mismatch/],
    [{ version: '1.0.0-rc.3' }, /version mismatch/],
    [{ entryCount: 127 }, /entryCount mismatch/],
  ]) {
    assert.throws(() => validateDry({ ...dryRecord, ...change }), message);
    assert.throws(
      () => validateDry({ [packageName]: { ...dryRecord, ...change } }),
      message,
    );
  }
});

const release = (version, prerelease) => ({
  tag_name: `v${version}`,
  prerelease,
  draft: false,
});

test('RC, beta and stable releases select the intended dist-tag', () => {
  for (const version of ['1.0.0-rc.2', '1.0.0-rc.3', '1.1.0-beta.1', '1.1.0-0'])
    assert.deepEqual(releasePolicy(version, release(version, true)), {
      version,
      distTag: 'next',
    });
  for (const version of ['1.0.0', '1.1.0'])
    assert.deepEqual(releasePolicy(version, release(version, false)), {
      version,
      distTag: 'latest',
    });
  assert.equal(
    releasePolicy('1.0.0+rc.3', release('1.0.0+rc.3', false)).distTag,
    'latest',
  );
});

test('invalid versions, mismatched tags, draft and inconsistent releases fail closed', () => {
  for (const version of [
    'v1.0.0',
    '01.0.0',
    '1.0',
    '1.0.0-01',
    '1.0.0-rc..3',
    '1.0.0-',
    '1.0.0\n',
  ])
    assert.throws(() => releasePolicy(version, release(version, false)));
  assert.throws(() => releasePolicy('1.0.0-rc.3', release('1.0.0-rc.2', true)));
  assert.throws(() =>
    releasePolicy('1.0.0-rc.3', release('1.0.0-rc.3', false)),
  );
  assert.throws(() => releasePolicy('1.0.0', release('1.0.0', true)));
  assert.throws(() =>
    releasePolicy('1.0.0', { ...release('1.0.0', false), draft: true }),
  );
  assert.throws(() => releasePolicy('1.0.0', { tag_name: 'v1.0.0' }));
});

test('registry guard distinguishes an existing version from explicit absence and failures', () => {
  const version = '1.0.0-rc.2';
  assert.equal(
    registryPresence({ status: 0, stdout: JSON.stringify(version) }, version),
    true,
  );
  assert.equal(
    registryPresence(
      { status: 1, stdout: '{"error":{"code":"E404"}}', stderr: '' },
      version,
    ),
    false,
  );
  for (const code of ['E401', 'E403', 'E500', 'EAI_AGAIN', 'ETIMEDOUT'])
    assert.throws(() =>
      registryPresence(
        { status: 1, stdout: JSON.stringify({ error: { code } }), stderr: '' },
        version,
      ),
    );
  assert.throws(() =>
    registryPresence({ status: 0, stdout: '"1.0.0-rc.1"' }, version),
  );
  assert.throws(() => registryPresence({ status: 1, stdout: '' }, version));
  assert.throws(() =>
    registryPresence({ error: new Error('timeout') }, version),
  );
});

test('manifest rejects another identity, changed repository, dependencies and publishing overrides', () => {
  const manifest = {
    name: '@pjavascript/runtime',
    version: '1.0.0',
    repository: {
      type: 'git',
      url: 'git+https://github.com/Miskovy/parallel-javascript.git',
      directory: 'packages/runtime',
    },
    bugs: { url: 'https://github.com/Miskovy/parallel-javascript/issues' },
  };
  validateManifest(manifest, '1.0.0');
  for (const change of [
    { name: '@pjs/runtime' },
    { version: '1.0.1' },
    { repository: { ...manifest.repository, directory: 'packages/other' } },
    { dependencies: { piscina: '5.3.2' } },
    { optionalDependencies: { tooling: '1.0.0' } },
    { peerDependencies: { tooling: '1.0.0' } },
    { bundledDependencies: ['tooling'] },
    { publishConfig: { registry: 'https://npm.pkg.github.com/' } },
    { publishConfig: { provenance: false } },
  ])
    assert.throws(() => validateManifest({ ...manifest, ...change }, '1.0.0'));
});

test('registry verification requires the selected tag; first-publication latest is harmless', () => {
  verifyRegistry('1.0.0-rc.2', 'next', '1.0.0-rc.2', {
    next: '1.0.0-rc.2',
    latest: '1.0.0-rc.2',
  });
  verifyRegistry('1.0.0', 'latest', '1.0.0', {
    next: '1.0.0-rc.2',
    latest: '1.0.0',
  });
  assert.throws(() =>
    verifyRegistry('1.0.0', 'latest', '1.0.0', { latest: '1.0.0-rc.2' }),
  );
  assert.throws(() =>
    verifyRegistry('1.0.0', 'latest', '1.0.0-rc.2', { latest: '1.0.0' }),
  );
});

test('an already-published prerelease still requires next to point to its version', () => {
  const version = '1.0.0-rc.3';
  assert.equal(
    registryPresence({ status: 0, stdout: JSON.stringify(version) }, version),
    true,
  );
  verifyRegistry(version, 'next', version, { next: version });
  for (const tags of [{}, { next: '1.0.0-rc.2' }])
    assert.throws(() => verifyRegistry(version, 'next', version, tags), {
      message: /next does not point to 1\.0\.0-rc\.3/,
    });
});

test('publisher npm is an exact reviewed pin; Node 22 bundled npm 10 is unsupported', () => {
  assertSupportedReleaseNpmVersion('11.19.0');
  for (const version of [
    '10.9.2',
    '11.8.0',
    '11.5.1',
    '11.19.1',
    '12.0.0',
    '',
    undefined,
  ]) {
    assert.equal(classifyReleaseNpmVersion(version).supported, false);
    assert.throws(
      () => assertSupportedReleaseNpmVersion(version),
      /Unsupported publisher npm/,
    );
  }
});

test('publication Node pin is separate from runtime compatibility qualification', () => {
  assertPublicationToolchain('24.21.0', '11.19.0');
  assert.throws(
    () => assertPublicationToolchain('22.13.0', '11.19.0'),
    /Publication requires reviewed Node/,
  );
  assert.throws(
    () => assertPublicationToolchain('24.22.0', '11.19.0'),
    /Publication requires reviewed Node/,
  );
  assert.throws(
    () => assertPublicationToolchain('24.21.0', '10.9.2'),
    /Unsupported publisher npm/,
  );
  assert.equal(
    releaseToolchain.npmTarball,
    'https://registry.npmjs.org/npm/-/npm-11.19.0.tgz',
  );
});

test('publisher provisioning rejects changed archive bytes before installation', () => {
  assert.throws(
    () => verifyReleaseNpmArchive(Buffer.from('mutation')),
    /archive integrity mismatch/,
  );
});

const validTarFiles = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/dist/index.js',
  'package/dist/index.d.ts',
  'package/dist/workers/bootstrap.js',
  'package/src/runtime.ts',
  'package/dist/runtime.js',
  'package/dist/runtime.d.ts',
  'package/dist/runtime.js.map',
];

test('real tar transports LF and Windows CRLF preserve identical filenames', () => {
  for (const separator of ['\n', '\r\n']) {
    for (const trailing of ['', separator]) {
      assert.deepEqual(
        parseTarListing(validTarFiles.join(separator) + trailing),
        validTarFiles,
      );
    }
  }
  assert.deepEqual(parseTarListing('package/dist/ space name.js \r\n'), [
    'package/dist/ space name.js ',
  ]);
});

test('tar listing rejects malformed transport without trimming filenames', () => {
  for (const listing of [
    '',
    undefined,
    'a\n\nb\n',
    'a\r\n\r\nb\r\n',
    'a\rb\n',
    'a\r',
    'a\0b\n',
    'a\r\nb\n',
    'a\n\n',
  ]) {
    assert.throws(() => parseTarListing(listing), /Tar listing/);
  }
});

test('normalized tar records retain exact count, duplicate, path and required-file gates', () => {
  validateTarListing(validTarFiles, validTarFiles.length);
  assert.throws(() =>
    validateTarListing([...validTarFiles, validTarFiles[0]], 11),
  );
  assert.throws(() => validateTarListing(validTarFiles, 11));
  for (const path of [
    'unexpected/file',
    'package/unexpected',
    'package/dist/../bad',
    'package/package.json ',
  ]) {
    assert.throws(() => validateTarListing([...validTarFiles, path], 11));
  }
  assert.throws(
    () =>
      validateTarListing(
        validTarFiles
          .filter((path) => path !== 'package/LICENSE')
          .concat('package/src/other.ts'),
        10,
      ),
    /Missing LICENSE/,
  );
});

const rc4 = '1.0.0-rc.4';
const identity = { name: packageName, version: rc4 };
const registryOk = (value) => ({ status: 0, stdout: JSON.stringify(value) });
const registryError = (code) => ({
  status: 1,
  stdout: JSON.stringify({ error: { code } }),
});

function fakeRegistry(respond) {
  let clock = 123_456;
  const calls = [];
  const waits = [];
  const logs = [];
  return {
    calls,
    waits,
    logs,
    elapsed: () => clock - 123_456,
    options: {
      now: () => clock,
      sleep: async (ms) => {
        assert.ok(ms > 0 && ms <= 600_000 - (clock - 123_456));
        waits.push(ms);
        clock += ms;
      },
      log: (message) => logs.push(message),
      request: async (field, timeoutMs) => {
        calls.push({ field, timeoutMs, elapsedMs: clock - 123_456 });
        assert.ok(timeoutMs > 0 && timeoutMs <= 30_000);
        assert.ok(timeoutMs <= 600_000 - (clock - 123_456));
        const result = respond(field, calls.length, timeoutMs);
        clock += result.elapsedMs ?? 0;
        return parseRegistryResponse(result);
      },
    },
  };
}
const convergedResponse = (field) =>
  registryOk(field === 'identity' ? identity : { next: rc4 });
const converge = (fake) => convergeRegistry(rc4, 'next', fake.options);

test('registry convergence succeeds immediately without sleeping or another query', async () => {
  const fake = fakeRegistry(convergedResponse);
  assert.deepEqual(await converge(fake), { next: rc4 });
  assert.deepEqual(
    fake.calls.map((call) => call.field),
    ['identity', 'tags'],
  );
  assert.deepEqual(fake.waits, []);
  assert.match(
    fake.logs.at(-1),
    /attempt=1 elapsedMs=0 remainingMs=600000 classification=CONVERGED action=success/,
  );
});

test('registry convergence tolerates visibility later than the old six-attempt limit', async () => {
  const fake = fakeRegistry((field, count) =>
    count <= 6 ? registryError('E404') : convergedResponse(field),
  );
  await converge(fake);
  assert.deepEqual(fake.waits, [5000, 10000, 20000, 30000, 30000, 30000]);
  assert.equal(fake.elapsed(), 125_000);
  assert.equal(fake.calls.length, 8);
  assert.match(fake.logs[1], /classification=E404 action=retry-in-5000ms/);
});

test('missing and old selected dist-tags retry until the exact version agrees', async () => {
  let tagQueries = 0;
  const fake = fakeRegistry((field) => {
    if (field === 'identity') return registryOk(identity);
    tagQueries++;
    return registryOk(
      tagQueries === 1 ? {} : { next: tagQueries === 2 ? '1.0.0-rc.2' : rc4 },
    );
  });
  await converge(fake);
  assert.deepEqual(fake.waits, [5000, 10000]);
  assert.equal(tagQueries, 3);
  assert.match(fake.logs[1], /classification=DIST_TAG_PENDING/);
});

test('explicit temporary registry and network failures can converge', async () => {
  for (const code of [
    'E408',
    'E429',
    'E500',
    'E502',
    'E503',
    'E504',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
  ]) {
    const fake = fakeRegistry((field, count) =>
      count === 1 ? registryError(code) : convergedResponse(field),
    );
    await converge(fake);
    assert.deepEqual(fake.waits, [5000], code);
    assert.equal(fake.calls.length, 3, code);
    assert.ok(
      fake.logs.some((message) => message.includes(`classification=${code}`)),
    );
  }
});

test('child-process request timeouts retry, while process/configuration errors do not', async () => {
  const fake = fakeRegistry((field, count) =>
    count === 1
      ? {
          error: Object.assign(new Error('request timed out'), {
            code: 'ETIMEDOUT',
          }),
          elapsedMs: 30_000,
        }
      : convergedResponse(field),
  );
  await converge(fake);
  assert.equal(fake.elapsed(), 35_000);
  const permanent = fakeRegistry(() => ({
    error: Object.assign(new Error('missing npm'), { code: 'ENOENT' }),
  }));
  await assert.rejects(converge(permanent), { classification: 'ENOENT' });
  assert.deepEqual(permanent.waits, []);
  assert.equal(permanent.calls.length, 1);
});

test('deadline exhaustion clips the final sleep and makes no later request', async () => {
  const fake = fakeRegistry(() => registryError('E404'));
  await assert.rejects(converge(fake), {
    classification: 'DEADLINE_EXHAUSTED',
  });
  assert.equal(fake.elapsed(), 600_000);
  assert.deepEqual(fake.waits.slice(0, 4), [5000, 10000, 20000, 30000]);
  assert.equal(fake.waits.at(-1), 25_000);
  assert.ok(fake.waits.every((ms) => ms <= 30_000));
  assert.equal(fake.calls.length, fake.waits.length);
  assert.match(
    fake.logs.at(-1),
    /remainingMs=0 classification=E404 action=deadline-exhausted/,
  );
});

test('request time consumes the deadline and every timeout uses the remaining budget', async () => {
  const fake = fakeRegistry((_field, _count, timeoutMs) => ({
    ...registryError('ETIMEDOUT'),
    elapsedMs: Math.min(timeoutMs, 29_000),
  }));
  await assert.rejects(converge(fake), {
    classification: 'DEADLINE_EXHAUSTED',
  });
  assert.equal(fake.elapsed(), 600_000);
  assert.equal(fake.calls.at(-1).timeoutMs, 6000);
  assert.ok(fake.calls.some((call) => call.timeoutMs < 30_000));
});

test('the second query uses remaining time; late success cannot escape the deadline', async () => {
  const fake = fakeRegistry((field, count) => {
    if (count <= 20)
      return { ...registryError('E404'), elapsedMs: count <= 2 ? 20_000 : 0 };
    return {
      ...convergedResponse(field),
      elapsedMs: field === 'identity' ? 10_000 : 5000,
    };
  });
  await assert.rejects(converge(fake), {
    classification: 'DEADLINE_EXHAUSTED',
  });
  assert.equal(fake.elapsed(), 600_000);
  assert.equal(fake.calls.at(-2).field, 'identity');
  assert.equal(fake.calls.at(-2).timeoutMs, 15_000);
  assert.equal(fake.calls.at(-1).field, 'tags');
  assert.equal(fake.calls.at(-1).timeoutMs, 5000);
  assert.ok(!fake.logs.some((message) => message.includes('action=success')));
});

test('authorization, integrity, configuration and unknown registry errors fail immediately', async () => {
  for (const code of [
    'E401',
    'E403',
    'E400',
    'E422',
    'E501',
    'EINTEGRITY',
    'EBADENGINE',
    'ENOTFOUND',
    'UNKNOWN',
  ]) {
    const fake = fakeRegistry(() => registryError(code));
    await assert.rejects(converge(fake), { classification: code });
    assert.equal(fake.calls.length, 1, code);
    assert.deepEqual(fake.waits, [], code);
    assert.match(fake.logs.at(-1), /action=fail$/);
  }
});

test('malformed responses and incompatible identities are terminal', async () => {
  for (const result of [
    { status: 0, stdout: '' },
    { status: 0, stdout: '{broken' },
    registryOk(null),
    registryOk([]),
    registryOk(rc4),
    registryOk({}),
    registryOk({ ...identity, version: 4 }),
    { status: 1, stdout: '{}' },
  ]) {
    const fake = fakeRegistry(() => result);
    await assert.rejects(converge(fake), {
      classification: 'MALFORMED_RESPONSE',
    });
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(fake.waits, []);
  }
  for (const value of [
    { ...identity, name: '@pjs/runtime' },
    { ...identity, version: '1.0.0-rc.2' },
  ]) {
    const fake = fakeRegistry(() => registryOk(value));
    await assert.rejects(converge(fake), {
      classification: 'IDENTITY_MISMATCH',
    });
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(fake.waits, []);
  }
});

test('malformed dist-tags fail without retry even after a transient error', async () => {
  for (const tags of [
    null,
    [],
    'next',
    { next: null },
    { next: 4 },
    { next: 'invalid' },
    { next: rc4, latest: 'invalid' },
  ]) {
    const fake = fakeRegistry((field, count) =>
      count === 1
        ? registryError('E404')
        : registryOk(field === 'identity' ? identity : tags),
    );
    await assert.rejects(converge(fake), {
      classification: 'MALFORMED_RESPONSE',
    });
    assert.deepEqual(fake.waits, [5000]);
    assert.equal(fake.calls.length, 3);
  }
});

test('invalid version or release tag selection starts no registry work', async () => {
  const fake = fakeRegistry(convergedResponse);
  for (const [version, tag] of [
    ['bad', 'next'],
    [rc4, 'latest'],
    ['1.0.0', 'next'],
  ])
    await assert.rejects(convergeRegistry(version, tag, fake.options));
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(fake.waits, []);
});

test('stable convergence verifies latest while preserving unrelated tags', async () => {
  const tags = { latest: '1.0.0', next: rc4 };
  const fake = fakeRegistry((field) =>
    registryOk(
      field === 'identity' ? { name: packageName, version: '1.0.0' } : tags,
    ),
  );
  assert.deepEqual(
    await convergeRegistry('1.0.0', 'latest', fake.options),
    tags,
  );
});

test('npm requests disable hidden retries and cap process and fetch timeouts together', () => {
  for (const field of ['identity', 'tags']) {
    let calls = 0;
    const response = requestRegistry(
      rc4,
      field,
      1234,
      (_executable, args, options) => {
        calls++;
        assert.ok(args.includes('--fetch-retries=0'));
        assert.ok(args.includes('--fetch-timeout=1234'));
        assert.ok(args.includes('--prefer-online'));
        assert.ok(args.includes('https://registry.npmjs.org/'));
        assert.ok(
          args.includes(
            field === 'identity' ? `${packageName}@${rc4}` : packageName,
          ),
        );
        assert.equal(options.timeout, 1234);
        assert.equal(options.killSignal, 'SIGKILL');
        return convergedResponse(field);
      },
    );
    assert.deepEqual(response, field === 'identity' ? identity : { next: rc4 });
    assert.equal(calls, 1);
  }
});
