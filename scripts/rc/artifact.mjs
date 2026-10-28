import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { assertFrozenPackage, loadBaseline } from './baseline.mjs';
import { parseTarListing } from '../release/npm-release.mjs';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

/** Inspect bytes only. Preparation and validation deliberately use separate paths. */
export function readArtifact(path) {
  const tar = (args) =>
    execFileSync('tar', args, { maxBuffer: 16 * 1024 ** 2 });
  const entries = parseTarListing(tar(['-tzf', path]).toString());
  assert.ok(
    entries.length > 0 && new Set(entries).size === entries.length,
    'Duplicate/empty archive inventory',
  );
  assert.ok(
    entries.every(
      (name) =>
        /^package\/(dist\/|src\/|package.json$|README.md$|LICENSE$)/.test(
          name,
        ) && !name.split('/').includes('..'),
    ),
    'Invalid archive path',
  );
  const hashes = {},
    files = [];
  let manifest;
  for (const entry of entries) {
    const bytes = tar(['-xOf', path, entry]);
    const name = entry.slice(8);
    hashes[name] = sha256(bytes);
    files.push({ path: name, size: bytes.length });
    if (name === 'package.json') manifest = JSON.parse(bytes);
  }
  assert.ok(manifest, 'Missing package manifest');
  return {
    manifest,
    hashes,
    packed: {
      name: manifest.name,
      version: manifest.version,
      filename: basename(path),
      size: statSync(path).size,
      unpackedSize: files.reduce((sum, file) => sum + file.size, 0),
      entryCount: files.length,
      files,
    },
    sha256: sha256(readFileSync(path)),
  };
}

export function assertArtifact(path, expected = undefined) {
  const artifact = readArtifact(path);
  const baseline = expected ?? loadBaseline(artifact.manifest.version);
  assertFrozenPackage(artifact.manifest, artifact.hashes, baseline);
  if (baseline.archiveSha256)
    assert.equal(
      artifact.sha256,
      baseline.archiveSha256,
      'Frozen archive SHA-256 mismatch',
    );
  return artifact;
}
