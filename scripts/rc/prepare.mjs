// Explicit preparation command. Validation never imports or calls this writer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  assertArguments,
  baselineFile,
  loadBaseline,
  immutableRc5Sha256,
} from './baseline.mjs';
import { namedExports } from './contracts.mjs';
import { readArtifact, sha256 } from './artifact.mjs';
import {
  releaseToolchain,
  assertPublicationToolchain,
} from '../release/toolchain.mjs';

assertArguments(['version', 'npm-cli', 'replace']);
const arg = (name) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const version = arg('version');
assert.equal(
  version,
  '1.0.0',
  'Preparation may only write the explicitly reviewed stable baseline; published releases are immutable',
);
loadBaseline('1.0.0-rc.4');
loadBaseline('1.0.0-rc.5');
assert.ok(arg('replace') === undefined || arg('replace') === 'true');
const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = arg('npm-cli');
assert.ok(cli, 'Supply the independently provisioned release npm CLI');
const npmVersion = execFileSync(process.execPath, [cli, '--version'], {
  encoding: 'utf8',
}).trim();
assertPublicationToolchain(process.versions.node, npmVersion);
for (const path of ['package.json', 'packages/runtime/package.json'])
  assert.equal(JSON.parse(readFileSync(join(root, path))).version, version);
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
for (const v of [
  lock.version,
  lock.packages[''].version,
  lock.packages['packages/runtime'].version,
])
  assert.equal(v, version);
const inventory = (directory, suffix = '') =>
  readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
    .sort();
const hashes = (paths) =>
  Object.fromEntries(
    paths.map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
const stage = mkdtempSync(join(tmpdir(), 'pjs-v1-prepare-'));
const [packed] = JSON.parse(
  execFileSync(
    process.execPath,
    [
      cli,
      'pack',
      '--workspace',
      '@pjavascript/runtime',
      '--ignore-scripts',
      '--pack-destination',
      stage,
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  ),
);
const artifact = readArtifact(join(stage, packed.filename));
assert.equal(artifact.manifest.name, '@pjavascript/runtime');
const inputs = [
  ...new Set([
    'package.json',
    'package-lock.json',
    'packages/runtime/package.json',
    'packages/runtime/tsconfig.json',
    'packages/runtime/tsconfig.browser.json',
    'packages/runtime/tsconfig.browser-worker.json',
    'README.md',
    'docs/development/releasing.md',
    'docs/README.md',
    'docs/releases/release-v1.0.0-rc.5.md',
    'docs/releases/release-v1.0.0.md',
    'docs/reference/stability.md',
    'docs/reference/partitioning.md',
    'docs/development/memory.md',
    'docs/guide/core-api.md',
    'docs/guide/browser.md',
    'docs/adr/0023-v1-api-stability-decisions.md',
    '.github/workflows/ci.yml',
    '.github/workflows/publish-npm.yml',
    'scripts/package/smoke.mjs',
    'scripts/qualification/runtime.mjs',
    'scripts/checks/contracts.mjs',
    'scripts/checks/api-contract-inventory.mjs',
    'scripts/checks/api-contract-inventory.test.mjs',
    'scripts/qualification/node-floor.mjs',
    'scripts/qualification/node-floor-binaries.json',
    'scripts/checks/docs.mjs',
    'eslint.config.mjs',
    '.prettierrc.json',
    '.prettierignore',
    ...[
      'scripts/rc',
      'scripts/release',
      'scripts/package/consumer',
      'scripts/browser',
      'scripts/qualification/lifecycle',
      'scripts/qualification/memory',
      'examples',
    ].flatMap((dir) => inventory(dir)),
  ]),
]
  .filter((path) => path !== 'scripts/rc/frozen-v1.json')
  .sort();
const source = 'packages/runtime/';
const baseline = {
  schema: 2,
  publishedRc5Sha256: immutableRc5Sha256,
  release: `v${version}`,
  previousBaselineFile: 'scripts/rc/frozen-rc4.json',
  previousBaselineSha256: sha256(
    readFileSync(join(root, 'scripts/rc/frozen-rc4.json')),
  ),
  contractTests: 478,
  namedExports: namedExports(root, 'packages/runtime/src/index.ts'),
  runtimeValues: Object.keys(
    await import('../../packages/runtime/dist/index.js'),
  ).sort(),
  browserNamedExports: namedExports(
    root,
    'packages/runtime/src/browser/index.ts',
  ),
  browserRuntimeValues: Object.keys(
    await import('../../packages/runtime/dist/browser/index.js'),
  ).sort(),
  runtimeSource: hashes(inventory('packages/runtime/src', '.ts')),
  runtimeTests: hashes(inventory('packages/runtime/test')),
  declarations: Object.fromEntries(
    Object.entries(hashes(inventory('packages/runtime/dist', '.d.ts'))).map(
      ([path, hash]) => [path.slice(source.length), hash],
    ),
  ),
  manifest: artifact.manifest,
  packageFiles: artifact.hashes,
  archiveSha256: artifact.sha256,
  archiveToolchain: {
    node: process.versions.node,
    npm: npmVersion,
    platform: process.platform,
    arch: process.arch,
  },
  inputs: hashes(inputs),
  releaseToolchain,
  exclusions: [
    'This baseline file (no self-hash)',
    'Git commit/tree/tag metadata: receipts bind the actual committed candidate',
    'Ignored build outputs, dependencies, caches, receipts and temporary staging outside the packed file inventory',
    'Historical research/reports and unpacked documentation not explicitly listed in inputs; existing holds remain unresolved',
  ],
};
const output = baselineFile(version);
const formatted = await format(JSON.stringify(baseline), {
  ...(await resolveConfig(output)),
  parser: 'json',
});
writeFileSync(output, formatted, {
  flag: arg('replace') === 'true' ? 'w' : 'wx',
});
console.log(
  JSON.stringify({
    version,
    baseline: baselineFile(version),
    preparationTarball: join(stage, packed.filename),
    sha256: artifact.sha256,
    note: 'Preparation artifact only; qualify a clean committed candidate and stage the reproduced archive before review.',
  }),
);
