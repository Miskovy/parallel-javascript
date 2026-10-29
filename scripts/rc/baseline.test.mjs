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
  baselineForWorkspace,
  loadBaseline,
  baselineFile,
  assertArguments,
  assertFrozenFiles,
  assertFrozenPackage,
  assertFrozenWorkspace,
} from './baseline.mjs';
import { assertArtifact, readArtifact } from './artifact.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = baselineForWorkspace(root);

test('published RC4 and RC5 baseline/tag/tree/archive identities are immutable', () => {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const identities = [
    [
      '1.0.0-rc.4',
      'a77cbb893c1b39123d05c7c4e09aeac95643c65f3a25be6d31d3fea39e6ae55b',
      '15a3060ea375584df8358316429ba108cd802403',
      'def47e895ffb6c62865ebec5d1604e32dbc64a51',
      'fba5bdb4f0a1cda9e399b81389f678ba3aa1c366',
    ],
    [
      '1.0.0-rc.5',
      'a6e247f48c23530cbd22f89ddc3c30453b0cd2c10c1618ead1634afddd1c04c2',
      '131d28112924fc55228d4722ec111aa513f94aee',
      '131d28112924fc55228d4722ec111aa513f94aee',
      '5e8ec2653b0b86aa93dbaf5c912e76e203f1c906',
    ],
  ];
  for (const [version, digest, tag, commit, tree] of identities) {
    const path = baselineFile(version);
    assert.equal(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
      digest,
    );
    assert.equal(git('rev-parse', `v${version}`), tag);
    assert.equal(git('rev-parse', `v${version}^{commit}`), commit);
    assert.equal(git('rev-parse', `v${version}^{tree}`), tree);
    const historical = loadBaseline(version);
    assert.deepEqual(
      historical,
      JSON.parse(
        execFileSync(
          'git',
          [
            'show',
            `v${version}:scripts/rc/${version.endsWith('5') ? 'frozen-rc5' : 'frozen-rc4'}.json`,
          ],
          { cwd: root, encoding: 'utf8' },
        ),
      ),
    );
  }
  assert.equal(
    loadBaseline('1.0.0-rc.5').archiveSha256,
    'f9bd1a3e09002b60ed136f76ac4f3ae197b2869cc910f324434ad124bc98e568',
  );
  assert.equal(
    Object.keys(loadBaseline('1.0.0-rc.5').packageFiles).length,
    303,
  );
});
function copyCandidate() {
  const temporary = mkdtempSync(join(tmpdir(), 'pjs-freeze-'));
  for (const path of [
    ...Object.keys(baseline.runtimeSource),
    ...Object.keys(baseline.runtimeTests),
    ...Object.keys(baseline.inputs ?? {}),
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
  const baseline = loadBaseline('1.0.0-rc.4');
  assert.equal(baseline.release, 'v1.0.0-rc.4');
  assert.equal(baseline.contractTests, 206);
  assert.deepEqual(
    baseline.releaseToolchain,
    JSON.parse(
      execFileSync(
        'git',
        ['show', 'v1.0.0-rc.4:scripts/release/toolchain.json'],
        { cwd: root, encoding: 'utf8' },
      ),
    ),
  );
  assert.deepEqual(
    baseline.manifest,
    JSON.parse(
      execFileSync(
        'git',
        ['show', 'v1.0.0-rc.4:packages/runtime/package.json'],
        { cwd: root, encoding: 'utf8' },
      ),
    ),
  );
  for (const path of ['package.json', 'package-lock.json'])
    assert.equal(
      JSON.parse(
        execFileSync('git', ['show', `v1.0.0-rc.4:${path}`], {
          cwd: root,
          encoding: 'utf8',
        }),
      ).version,
      '1.0.0-rc.4',
    );
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

test('current registered candidate source, declarations and metadata match its reviewed baseline', () => {
  assertFrozenWorkspace(root);
  assertFrozenFiles(root);
  assert.equal(baseline.manifest.version, '1.0.0');
  assert.equal(baseline.contractTests, 477);
  assert.deepEqual(baseline.releaseToolchain, releaseToolchain);
});
test('selection is explicit, version-aware and tag-bound, with no fallback', () => {
  for (const version of ['1.0.0-rc.4', '1.0.0-rc.5', '1.0.0']) {
    assert.equal(loadBaseline(version).manifest.version, version);
    assert.throws(
      () => loadBaseline(version, { tag: 'v9.0.0' }),
      /tag\/version/,
    );
  }
  for (const version of ['1.0.1', '1.0.0-rc.6', '__proto__', '../frozen-rc4'])
    assert.throws(() => loadBaseline(version), /Unregistered release/);
});
test('missing baseline and mismatched frozen identities fail closed', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pjs-selected-baseline-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const version of ['1.0.0-rc.4', '1.0.0-rc.5'])
    assert.throws(
      () => loadBaseline(version, { baseDirectory: directory }),
      /ENOENT/,
    );
  for (const change of [
    { release: 'v1.0.0-rc.4' },
    { manifest: { ...baseline.manifest, version: '1.0.1' } },
  ]) {
    writeFileSync(
      baselineFile('1.0.0', directory),
      JSON.stringify({ ...baseline, ...change }),
    );
    assert.throws(
      () => loadBaseline('1.0.0', { baseDirectory: directory }),
      /mismatch/,
    );
  }
});
test('qualification inputs cannot drift independently of package source', () => {
  const temporary = copyCandidate();
  try {
    writeFileSync(
      join(temporary, 'scripts/release/npm-release.mjs'),
      '// changed release path',
    );
    assert.throws(() => assertFrozenFiles(temporary), /Frozen input changed/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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

test('exact staged archives reject changed compressed bytes even with identical files', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pjs-artifact-freeze-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'package'));
  writeFileSync(
    join(directory, 'package/package.json'),
    JSON.stringify(baseline.manifest),
  );
  writeFileSync(
    join(directory, 'package/README.md'),
    'synthetic archive identity fixture',
  );
  const tarball = join(directory, 'candidate.tgz');
  execFileSync('tar', [
    '-czf',
    tarball,
    '-C',
    directory,
    'package/package.json',
    'package/README.md',
  ]);
  const original = readArtifact(tarball);
  const expected = {
    manifest: original.manifest,
    packageFiles: original.hashes,
    archiveSha256: original.sha256,
  };
  assertArtifact(tarball, expected);
  const bytes = readFileSync(tarball);
  assert.equal(bytes[0], 0x1f);
  assert.equal(bytes[1], 0x8b);
  bytes[4] ^= 1; // gzip timestamp header; decompressed files and CRC stay unchanged.
  writeFileSync(tarball, bytes);
  assert.deepEqual(readArtifact(tarball).hashes, original.hashes);
  assert.throws(
    () => assertArtifact(tarball, expected),
    /archive SHA-256 mismatch/,
  );
  assert.throws(
    () =>
      assertArtifact(tarball, {
        ...expected,
        manifest: { ...expected.manifest, version: '1.0.0-rc.4' },
      }),
    /manifest changed/,
  );
});
