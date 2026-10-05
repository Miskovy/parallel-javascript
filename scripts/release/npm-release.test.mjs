import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  registryPresence,
  releasePolicy,
  validateManifest,
  verifyRegistry,
} from './npm-release.mjs';

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
