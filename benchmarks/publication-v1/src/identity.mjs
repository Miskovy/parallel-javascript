import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config } from '../config.mjs';

export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export function identities() {
  const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  return Object.entries(config.versions).map(([name, version]) => {
    const entry = realpathSync(fileURLToPath(import.meta.resolve(name)));
    let dir = dirname(entry);
    while (!existsSync(join(dir, 'package.json'))) {
      assert.notEqual(dir, dirname(dir));
      dir = dirname(dir);
    }
    const path = realpathSync(join(dir, 'package.json'));
    const pkg = JSON.parse(readFileSync(path));
    const expectedRoot = join(root, 'node_modules', ...name.split('/'));
    const rel = relative(expectedRoot, path);
    assert.ok(
      !rel.startsWith('..') && !isAbsolute(rel),
      `Workspace/non-consumer resolution: ${path}`,
    );
    assert.equal(lstatSync(expectedRoot).isSymbolicLink(), false);
    assert.equal(pkg.name, name);
    assert.equal(pkg.version, version);
    const artifact = lock.packages[`node_modules/${name}`];
    assert.equal(artifact.link, undefined);
    assert.equal(artifact.version, version);
    assert.match(artifact.resolved, /^https:\/\/registry\.npmjs\.org\//);
    assert.match(artifact.integrity, /^sha512-/);
    return {
      name,
      version,
      entry,
      entrySha256: digest(readFileSync(entry)),
      packagePath: path,
      resolved: artifact.resolved,
      integrity: artifact.integrity,
    };
  });
}
