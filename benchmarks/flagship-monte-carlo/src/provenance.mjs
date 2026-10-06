import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';

export function assertPackage(info, root, name, version) {
  assert.equal(info.name, name);
  assert.equal(info.version, version);
  const path = relative(
    join(root, 'node_modules', ...name.split('/')),
    info.packagePath,
  );
  assert.ok(
    !path.startsWith('..') && !isAbsolute(path),
    `Non-consumer package: ${info.packagePath}`,
  );
  assert.match(info.resolved, /^https:\/\/registry\.npmjs\.org\//);
  assert.match(info.integrity, /^sha512-/);
}

export function provenance(root) {
  root = realpathSync(root);
  // PJS exports ESM only. Resolve under import conditions from the consumer cwd,
  // not createRequire's require conditions or the repository's module location.
  const entries = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "console.log(JSON.stringify(['@pjavascript/runtime','piscina'].map(name => import.meta.resolve(name))))",
      ],
      { cwd: root, encoding: 'utf8', timeout: 5000 },
    ),
  );
  const lock = JSON.parse(
    readFileSync(join(root, 'package-lock.json'), 'utf8'),
  );
  const result = {};
  for (const [name, version] of [
    ['@pjavascript/runtime', '1.0.0-rc.2'],
    ['piscina', '5.3.2'],
  ]) {
    const entryPath = realpathSync(
      fileURLToPath(entries[name === 'piscina' ? 1 : 0]),
    );
    let directory = dirname(entryPath);
    while (!existsSync(join(directory, 'package.json'))) {
      const parent = dirname(directory);
      assert.notEqual(parent, directory);
      directory = parent;
    }
    const packagePath = realpathSync(join(directory, 'package.json'));
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const artifact = lock.packages[`node_modules/${name}`];
    assert.equal(artifact.version, version);
    assert.equal(artifact.link, undefined);
    const info = {
      name: pkg.name,
      version: pkg.version,
      packagePath,
      entryPath,
      resolved: artifact.resolved,
      integrity: artifact.integrity,
    };
    assertPackage(info, root, name, version);
    result[name] = info;
  }
  return result;
}
