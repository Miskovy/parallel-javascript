import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { config } from './config.mjs';
import { command, checked, json, sha256, writeJson, files } from './lib.mjs';

export const here = fileURLToPath(new URL('./', import.meta.url));
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function npmCli(selected) {
  return realpathSync(
    selected ??
      process.env.npm_execpath ??
      join(
        dirname(process.execPath),
        process.platform === 'win32'
          ? 'node_modules/npm/bin/npm-cli.js'
          : '../lib/node_modules/npm/bin/npm-cli.js',
      ),
  );
}

export async function prepare(output, npm) {
  assert.equal(
    process.versions.node,
    config.node,
    `Use exactly Node ${config.node}`,
  );
  const semver = createRequire(npm)('semver');
  const registry = [];
  const lock = json(join(here, 'sandbox/package-lock.json'));
  // Verify existence, exact version, engines and locked registry integrity BEFORE
  // installing. No tags, workspace links or local tarballs are accepted.
  for (const [name, version] of Object.entries(config.versions)) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
    const response = await globalThis.fetch(url, {
      signal: globalThis.AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `Unavailable ${name}@${version}`);
    const metadata = await response.json();
    registry.push({ url, retrieved: new Date().toISOString(), metadata });
    writeJson(
      join(
        output,
        `registry-${name.replaceAll('/', '_').replace('@', '')}.json`,
      ),
      registry.at(-1),
    );
    assert.equal(metadata.version, version);
    assert.equal(metadata.name, name);
    if (metadata.engines?.node)
      assert.ok(
        semver.satisfies(process.versions.node, metadata.engines.node),
        `Unsupported engine ${name}`,
      );
    const artifact = lock.packages[`node_modules/${name}`];
    assert.equal(artifact.integrity, metadata.dist.integrity);
    assert.equal(artifact.resolved, metadata.dist.tarball);
  }
  const consumer = realpathSync(
    mkdtempSync(join(tmpdir(), 'pjs-publication-v1-')),
  );
  const rel = relative(root, consumer);
  assert.ok(
    rel.startsWith('..') || isAbsolute(rel),
    'Consumer must be outside PJS workspace',
  );
  for (const file of ['package.json', 'package-lock.json'])
    cpSync(join(here, 'sandbox', file), join(consumer, file));
  for (const file of ['src', 'config.mjs'])
    cpSync(join(here, file), join(consumer, file), { recursive: true });
  const install = await command(
    process.execPath,
    [
      npm,
      'ci',
      '--ignore-scripts',
      '--engine-strict',
      '--workspaces=false',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org/',
      '--fetch-retries=0',
      '--fetch-timeout=30000',
      '--cache',
      join(consumer, 'npm-cache'),
    ],
    consumer,
  );
  writeJson(join(output, 'install.json'), install);
  checked(install);
  assert.equal(
    sha256(join(consumer, 'package-lock.json')),
    sha256(join(here, 'sandbox/package-lock.json')),
  );
  const probe = await command(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { identities } from './src/identity.mjs'; console.log(JSON.stringify(identities()))",
    ],
    consumer,
  );
  writeJson(join(output, 'host-resolution.json'), probe);
  const identities = JSON.parse(checked(probe));
  const installed = files(join(consumer, 'node_modules')).map((path) => ({
    path: relative(consumer, path).replaceAll('\\', '/'),
    sha256: sha256(path),
  }));
  writeJson(join(output, 'installed-files.json'), installed);
  writeFileSync(join(output, 'consumer-path.txt'), consumer + '\n', {
    flag: 'wx',
  });
  // Record local install capability (including optional native Piscina helper).
  const npmVersion = checked(
    await command(process.execPath, [npm, '--version'], consumer),
  );
  return {
    consumer,
    identities,
    registry: registry.map((r) => ({
      url: r.url,
      version: r.metadata.version,
      dist: r.metadata.dist,
    })),
    lockSha256: sha256(join(here, 'sandbox/package-lock.json')),
    npm: { version: npmVersion, cli: npm, sha256: sha256(npm) },
    node: {
      version: process.version,
      executable: realpathSync(process.execPath),
      sha256: sha256(process.execPath),
      versions: process.versions,
    },
    installedFileCount: installed.length,
  };
}
