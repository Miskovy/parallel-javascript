import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  packageName,
  parsePublishDryRunReport,
  validatePublishDryRunReport,
  registryPresence,
  releasePolicy,
  validateManifest,
  verifyRegistry,
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
