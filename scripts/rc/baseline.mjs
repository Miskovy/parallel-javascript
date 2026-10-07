import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const baseline = JSON.parse(
  readFileSync(new URL('./frozen-rc4.json', import.meta.url)),
);

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

export function assertFrozenWorkspace(root) {
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

export function assertFrozenFiles(root) {
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
}

export function assertFrozenPackage(manifest, hashes) {
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
