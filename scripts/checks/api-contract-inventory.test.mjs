import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
function inventory(...args) {
  const result = spawnSync(
    process.execPath,
    ['scripts/checks/api-contract-inventory.mjs', '--check', ...args],
    { cwd: root, encoding: 'utf8', timeout: 30000 },
  );
  assert.ifError(result.error);
  return result;
}
function succeeds(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).sourceDeclarationParity, true);
}

test(
  'inventory creates nested output exclusively and deterministically',
  { timeout: 90000 },
  (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'pjs inventory output '));
    assert.equal(dirname(directory), resolve(tmpdir()));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const first = join(directory, 'first', 'nested', 'inventory.json');
    assert.equal(existsSync(dirname(first)), false);
    succeeds(inventory(`--output=${first}`));
    const original = readFileSync(first);

    const repeated = inventory(`--output=${first}`);
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /EEXIST/);
    assert.deepEqual(readFileSync(first), original);

    const second = join(directory, 'second', 'nested', 'inventory.json');
    assert.equal(existsSync(dirname(second)), false);
    succeeds(inventory(`--output=${second}`));
    assert.deepEqual(readFileSync(second), original);
  },
);

test(
  'inventory checks without requesting an output file',
  { timeout: 30000 },
  () => {
    succeeds(inventory());
  },
);
