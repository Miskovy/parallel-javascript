import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { releaseToolchain } from '../release/toolchain.mjs';
import { fileURLToPath } from 'node:url';
import {
  baseline,
  assertArguments,
  assertFrozenFiles,
  assertFrozenPackage,
  assertFrozenWorkspace,
} from './baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function copyCandidate() {
  const temporary = mkdtempSync(join(tmpdir(), 'pjs-freeze-'));
  for (const path of [
    ...Object.keys(baseline.runtimeSource),
    ...Object.keys(baseline.runtimeTests),
    ...Object.keys(baseline.declarations).map(
      (path) => 'packages/runtime/' + path,
    ),
    'package.json',
    'package-lock.json',
    'packages/runtime/package.json',
  ]) {
    mkdirSync(dirname(join(temporary, path)), { recursive: true });
    cpSync(join(root, path), join(temporary, path));
  }
  return temporary;
}

test('RC4 source/tests/API match immutable RC3 and merged R1A', () => {
  assertFrozenWorkspace(root);
  assertFrozenFiles(root);
  assert.equal(baseline.release, 'v1.0.0-rc.4');
  assert.equal(baseline.contractTests, 206);
  assert.deepEqual(baseline.releaseToolchain, releaseToolchain);
  const historical = JSON.parse(
    readFileSync(new URL('./frozen-v015.json', import.meta.url)),
  );
  assert.deepEqual(baseline.namedExports, historical.namedExports);
  assert.deepEqual(baseline.runtimeValues, historical.runtimeValues);
  const rc3 = JSON.parse(
    readFileSync(new URL('./frozen-rc3.json', import.meta.url)),
  );
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('./frozen-rc3.json', import.meta.url)))
      .digest('hex'),
    baseline.previousBaselineSha256,
  );
  for (const field of [
    'runtimeSource',
    'declarations',
    'namedExports',
    'runtimeValues',
  ])
    assert.deepEqual(baseline[field], rc3[field]);
  for (const [path, digest] of Object.entries(baseline.runtimeTests))
    assert.equal(
      createHash('sha256')
        .update(
          execFileSync(
            'git',
            ['show', `${baseline.runtimeReferenceCommit}:${path}`],
            { cwd: root },
          ),
        )
        .digest('hex'),
      digest,
    );
  for (const [path, digest] of Object.entries(baseline.runtimeSource))
    assert.equal(
      createHash('sha256')
        .update(
          execFileSync(
            'git',
            ['show', `${baseline.runtimeSourceCommit}:${path}`],
            { cwd: root },
          ),
        )
        .digest('hex'),
      digest,
    );
});

for (const path of [
  'packages/runtime/test/physical-boundary.test.mjs',
  'packages/runtime/src/workers/worker.ts',
  'packages/runtime/dist/results/credit.d.ts',
])
  test(`formerly exempt repair file is strictly frozen: ${path}`, () => {
    const temporary = copyCandidate();
    try {
      writeFileSync(
        join(temporary, path),
        readFileSync(join(temporary, path), 'utf8') + '\n// mutation\n',
      );
      assert.throws(() => assertFrozenFiles(temporary), /Frozen bytes changed/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

test('source and declaration additions/removals cannot bypass the inventory freeze', () => {
  const temporary = copyCandidate();
  try {
    for (const directory of ['packages/runtime/src', 'packages/runtime/dist']) {
      const path = join(
        temporary,
        directory,
        directory.endsWith('src') ? 'extra.ts' : 'extra.d.ts',
      );
      writeFileSync(path, 'export {};\n');
      assert.throws(
        () => assertFrozenFiles(temporary),
        /Frozen file inventory changed/,
      );
      rmSync(path);
    }
    rmSync(join(temporary, Object.keys(baseline.runtimeSource)[0]));
    assert.throws(
      () => assertFrozenFiles(temporary),
      /Frozen file inventory changed/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('version, metadata and lockfile drift fail the workspace freeze', () => {
  const temporary = copyCandidate();
  try {
    for (const path of [
      'package.json',
      'package-lock.json',
      'packages/runtime/package.json',
    ]) {
      const original = readFileSync(join(temporary, path));
      const changed = JSON.parse(original);
      changed.version = '1.0.0-rc.2';
      writeFileSync(join(temporary, path), JSON.stringify(changed));
      assert.throws(() => assertFrozenWorkspace(temporary));
      writeFileSync(join(temporary, path), original);
    }
    const manifest = {
      ...baseline.manifest,
      dependencies: { unwanted: '1.0.0' },
    };
    writeFileSync(
      join(temporary, 'packages/runtime/package.json'),
      JSON.stringify(manifest),
    );
    assert.throws(() => assertFrozenWorkspace(temporary));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('packed JS, maps, README and metadata are frozen with the complete inventory', () => {
  assertFrozenPackage(baseline.manifest, baseline.packageFiles);
  for (const path of [
    'dist/index.js',
    'dist/index.js.map',
    'README.md',
    'package.json',
  ])
    assert.throws(() =>
      assertFrozenPackage(baseline.manifest, {
        ...baseline.packageFiles,
        [path]: 'changed',
      }),
    );
  const missing = { ...baseline.packageFiles };
  delete missing['LICENSE'];
  assert.throws(() => assertFrozenPackage(baseline.manifest, missing));
  assert.throws(() =>
    assertFrozenPackage(baseline.manifest, {
      ...baseline.packageFiles,
      extra: 'hash',
    }),
  );
});

test('all qualification entry points reject the retired repair bypass', () => {
  for (const script of ['api-freeze', 'package', 'qualify', 'repro']) {
    const child = spawnSync(
      process.execPath,
      [`scripts/rc/${script}.mjs`, '--physical-boundary-repair'],
      { cwd: root, encoding: 'utf8', timeout: 10000 },
    );
    assert.ifError(child.error);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /Unsupported qualification argument/);
  }
});

test('unknown and duplicate options fail closed', () => {
  assertArguments(['output'], ['--output=new.json']);
  assert.throws(() => assertArguments(['output'], ['--repair=true']));
  assert.throws(() =>
    assertArguments(['output'], ['--output=a', '--output=b']),
  );
});
