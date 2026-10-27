import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { release, version } from 'node:os';
import {
  releaseToolchain,
  verifyReleaseNpmArchive,
} from './release/toolchain.mjs';

// Official Linux/Windows x64 archives were verified against each release's
// nodejs.org/dist/v<VERSION>/SHASUMS256.txt. Match executable bytes even when
// setup-node supplies the runtime from the Actions cache.
const official = JSON.parse(
  readFileSync(new URL('./node-floor-binaries.json', import.meta.url)),
);
const output = resolve('.node-tools/node-floor', process.version);
mkdirSync(output, { recursive: true });
const reportPath = join(output, 'report.json');
writeFileSync(reportPath, '', { flag: 'wx' });
const sha256 = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const report = {
  node: process.version,
  versions: process.versions,
  platform: process.platform,
  arch: process.arch,
  osRelease: release(),
  osVersion: version(),
  executable: process.execPath,
  executableSha256: sha256(process.execPath),
  official: official[process.version]?.[process.platform],
  checks: [],
  passed: false,
};
const save = () =>
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
function run(name, command, args) {
  const child = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const result = {
    name,
    command: [command, ...args],
    exitCode: child.status,
    error: child.error?.message,
    output: (child.stdout ?? '') + (child.stderr ?? ''),
  };
  report.checks.push(result);
  save();
  assert.ifError(child.error);
  assert.equal(child.status, 0, result.output);
  console.log('PASS ' + name);
  return result.output.trim();
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
try {
  assert.ok(process.env.PJS_EXPECTED_NODE, 'Select the exact CI minimum');
  assert.equal(process.version, 'v' + process.env.PJS_EXPECTED_NODE);
  assert.equal(process.arch, 'x64');
  assert.ok(report.official, 'Only Linux/Windows x64 floor cells are defined');
  assert.equal(report.executableSha256, report.official.executableSha256);
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  report.sourceCommit = git('rev-parse', 'HEAD');
  report.sourceTree = git('rev-parse', 'HEAD^{tree}');
  report.dirtyWorkingTree = git('status', '--short') !== '';
  assert.equal(report.dirtyWorkingTree, false);
  const runtimeNpm = resolve(
    dirname(process.execPath),
    process.platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : '../lib/node_modules/npm/bin/npm-cli.js',
  );
  report.runtimeNpm = run('runtime npm', process.execPath, [
    runtimeNpm,
    '--version',
  ]);
  const releaseCli = process.env.PJS_RELEASE_NPM_CLI;
  assert.ok(releaseCli, 'Select the independent release npm CLI');
  const releaseArchive = resolve(dirname(releaseCli), '../../../npm.tgz');
  verifyReleaseNpmArchive(readFileSync(releaseArchive));
  report.releaseNpmIntegrity = releaseToolchain.npmIntegrity;
  report.releaseNpm = run('release npm', process.execPath, [
    releaseCli,
    '--version',
  ]);
  assert.equal(report.releaseNpm, releaseToolchain.npm);
  report.primaryCompiler = run('primary compiler', process.execPath, [
    'node_modules/@typescript/native/bin/tsc',
    '--version',
  ]);
  report.compatibilityCompiler = run(
    'compatibility compiler',
    process.execPath,
    ['node_modules/typescript/bin/tsc6', '--version'],
  );
  run('complete compatibility public fixtures', process.execPath, [
    'node_modules/typescript/bin/tsc6',
    '-p',
    'packages/runtime/test/tsconfig.json',
  ]);
  run('source/declaration inventory parity', process.execPath, [
    'scripts/api-contract-inventory.mjs',
    '--check',
    '--output=' + join(output, 'inventory.json'),
  ]);
  run('browser source/declaration inventory parity', process.execPath, [
    'scripts/api-contract-inventory.mjs',
    '--entry=browser',
    '--check',
    '--output=' + join(output, 'browser-inventory.json'),
  ]);
  run('inventory tool regressions', process.execPath, [
    '--test',
    'scripts/api-contract-inventory.test.mjs',
  ]);
  report.runtimeFiles = [
    ...files('packages/runtime/src'),
    ...files('packages/runtime/dist'),
  ]
    .filter((path) => /\.(?:ts|js)$/.test(path))
    .sort()
    .map((path) => ({
      path: path.replaceAll('\\', '/'),
      sha256: sha256(path),
    }));
  assert.equal(git('status', '--short'), '');
  report.passed = true;
} finally {
  save();
}
console.log(JSON.stringify({ passed: true, reportPath }));
