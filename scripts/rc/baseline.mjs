import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

import { fileURLToPath } from 'node:url';

export const registeredBaselines = Object.freeze({
  '1.0.0-rc.4': 'frozen-rc4.json',
  '1.0.0-rc.5': 'frozen-rc5.json',
});
const directory = dirname(fileURLToPath(import.meta.url));
export const immutableRc4Sha256 =
  'a77cbb893c1b39123d05c7c4e09aeac95643c65f3a25be6d31d3fea39e6ae55b';
export function baselineFile(version, baseDirectory = directory) {
  assert.ok(
    Object.hasOwn(registeredBaselines, version),
    `Unregistered release version: ${version}`,
  );
  return join(baseDirectory, registeredBaselines[version]);
}
export function loadBaseline(
  version,
  { tag = `v${version}`, baseDirectory = directory } = {},
) {
  assert.equal(tag, `v${version}`, 'Baseline tag/version mismatch');
  const bytes = readFileSync(baselineFile(version, baseDirectory));
  if (version === '1.0.0-rc.4')
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      immutableRc4Sha256,
      'Immutable RC4 baseline changed',
    );
  const data = JSON.parse(bytes);
  assert.equal(data.release, tag, 'Baseline release/tag mismatch');
  assert.equal(
    data.manifest.version,
    version,
    'Baseline manifest/version mismatch',
  );
  assert.equal(
    data.manifest.name,
    '@pjavascript/runtime',
    'Baseline package identity mismatch',
  );
  if (version === '1.0.0-rc.5') {
    assert.equal(data.schema, 2, 'Unsupported RC5 baseline schema');
    assert.match(
      data.archiveSha256,
      /^[a-f0-9]{64}$/,
      'Missing RC5 archive identity',
    );
    for (const path of [
      'package.json',
      'package-lock.json',
      'packages/runtime/package.json',
    ])
      assert.match(
        data.inputs?.[path],
        /^[a-f0-9]{64}$/,
        `Missing frozen metadata input: ${path}`,
      );
    assert.equal(
      data.archiveToolchain.node,
      data.releaseToolchain.node,
      'Archive Node/toolchain mismatch',
    );
    assert.equal(
      data.archiveToolchain.npm,
      data.releaseToolchain.npm,
      'Archive npm/toolchain mismatch',
    );
  }
  if (data.schema === 2) {
    assert.equal(
      data.previousBaselineSha256,
      immutableRc4Sha256,
      'RC4 preservation mismatch',
    );
    assert.equal(
      createHash('sha256')
        .update(readFileSync(baselineFile('1.0.0-rc.4', baseDirectory)))
        .digest('hex'),
      immutableRc4Sha256,
      'Immutable RC4 baseline changed',
    );
  }
  return data;
}
export function baselineForWorkspace(root, options) {
  const workspace = JSON.parse(readFileSync(join(root, 'package.json')));
  const manifest = JSON.parse(
    readFileSync(join(root, 'packages/runtime/package.json')),
  );
  assert.equal(
    workspace.version,
    manifest.version,
    'Workspace/package version mismatch',
  );
  return loadBaseline(manifest.version, options);
}

export function assertArguments(names, args = process.argv.slice(2)) {
  for (const arg of args)
    assert.ok(
      names.some((name) => arg.startsWith(`--${name}=`)),
      `Unsupported qualification argument: ${arg}`,
    );
  for (const name of names)
    assert.ok(
      args.filter((arg) => arg.startsWith(`--${name}=`)).length <= 1,
      `Duplicate qualification argument: ${name}`,
    );
}

export function assertFrozenWorkspace(
  root,
  baseline = baselineForWorkspace(root),
) {
  const read = (path) => JSON.parse(readFileSync(join(root, path)));
  assert.deepEqual(read('packages/runtime/package.json'), baseline.manifest);
  assert.equal(read('package.json').version, baseline.manifest.version);
  const lock = read('package-lock.json');
  for (const version of [
    lock.version,
    lock.packages[''].version,
    lock.packages['packages/runtime'].version,
  ])
    assert.equal(
      version,
      baseline.manifest.version,
      'Lockfile version mismatch',
    );
  if (baseline.schema === 2)
    for (const path of ['package.json', 'package-lock.json'])
      assert.equal(
        createHash('sha256')
          .update(readFileSync(join(root, path)))
          .digest('hex'),
        baseline.inputs[path],
        `Frozen workspace metadata changed: ${path}`,
      );
}

function inventory(root, directory, suffix) {
  return readdirSync(join(root, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
    .sort();
}

export function assertFrozenFiles(root, baseline = baselineForWorkspace(root)) {
  for (const [directory, suffix, expected, prefix] of [
    ['packages/runtime/src', '.ts', baseline.runtimeSource, ''],
    ['packages/runtime/test', '', baseline.runtimeTests, ''],
    [
      'packages/runtime/dist',
      '.d.ts',
      baseline.declarations,
      'packages/runtime/',
    ],
  ]) {
    assert.deepEqual(
      inventory(root, directory, suffix),
      Object.keys(expected)
        .map((path) => prefix + path)
        .sort(),
      `Frozen file inventory changed: ${directory}`,
    );
    for (const [path, digest] of Object.entries(expected))
      assert.equal(
        createHash('sha256')
          .update(readFileSync(join(root, prefix + path)))
          .digest('hex'),
        digest,
        `Frozen bytes changed: ${path}`,
      );
  }
  for (const [path, digest] of Object.entries(baseline.inputs ?? {}))
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex'),
      digest,
      `Frozen input changed: ${path}`,
    );
}

export function assertFrozenPackage(
  manifest,
  hashes,
  baseline = loadBaseline(manifest.version),
) {
  assert.deepEqual(
    manifest,
    baseline.manifest,
    'Frozen package manifest changed',
  );
  assert.deepEqual(
    hashes,
    baseline.packageFiles,
    'Frozen package contents changed',
  );
}
