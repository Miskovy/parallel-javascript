import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  assertSupportedReleaseNpmVersion,
  classifyReleaseNpmVersion,
} from '../release/toolchain.mjs';
import {
  baseline,
  assertArguments,
  assertFrozenWorkspace,
} from './baseline.mjs';

assertArguments(['output', 'npm-cli', 'release-npm-cli', 'profile']);

const root = fileURLToPath(new URL('../../', import.meta.url));
assertFrozenWorkspace(root);
const arg = (name, fallback) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const output = arg('output');
assert.ok(output, 'Specify a NEW --output=file.json');
const absoluteOutput = resolve(output);
mkdirSync(dirname(absoluteOutput), { recursive: true });
writeFileSync(absoluteOutput, '', { flag: 'wx' });
const npmCli = arg('npm-cli', process.env.npm_execpath);
assert.ok(npmCli, 'Supply --npm-cli=path or run via npm');
const releaseNpmCli = arg('release-npm-cli', process.env.PJS_RELEASE_NPM_CLI);
assert.ok(
  releaseNpmCli,
  'Select the provisioned --release-npm-cli independently of runtime npm',
);
const releaseNpm = execFileSync(
  process.execPath,
  [releaseNpmCli, '--version'],
  { encoding: 'utf8' },
).trim();
assertSupportedReleaseNpmVersion(releaseNpm);
const profile = arg('profile', 'standard');
const expectedTests = baseline.contractTests;
// Additive CD regressions; preserve RC4's immutable historical test count.
const convergenceTests = 14;
const expectedReleaseTests = baseline.releaseContractTests + convergenceTests;
assert.ok(['smoke', 'standard', 'extended'].includes(profile));
const scratch = absoluteOutput + '.parts';
mkdirSync(scratch, { recursive: true });
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hash = (path) =>
  createHash('sha256')
    .update(readFileSync(join(root, path)))
    .digest('hex');
const sourceFiles = git('ls-files', 'packages/runtime/src').split('\n');
const testFiles = git('ls-files', 'packages/runtime/test').split('\n');
const historicalFiles = git('ls-files', 'benchmarks/results', 'docs/research')
  .split('\n')
  .filter((p) => p && !/v1(?:[.-]|\/)/.test(p));
const report = {
  schema: 1,
  kind: 'Exact-Node RC qualification',
  sourceCommit: git('rev-parse', 'HEAD'),
  release: baseline.release,
  releaseContracts: {
    frozen: baseline.releaseContractTests,
    convergence: convergenceTests,
    expected: expectedReleaseTests,
  },
  baselineSha256: hash('scripts/rc/frozen-rc4.json'),
  startingStatus: git('status', '--short'),
  node: process.version,
  nodeExecutable: process.execPath,
  versions: process.versions,
  npmCli,
  npm: execFileSync(process.execPath, [npmCli, '--version'], {
    encoding: 'utf8',
  }).trim(),
  runtimeNpm: execFileSync(process.execPath, [npmCli, '--version'], {
    encoding: 'utf8',
  }).trim(),
  releaseNpmCli,
  releaseNpm,
  releaseNpmSupported: true,
  platform: process.platform,
  arch: process.arch,
  profile,
  checks: [],
  preservation: {
    sourceBefore: Object.fromEntries(sourceFiles.map((p) => [p, hash(p)])),
    testsBefore: Object.fromEntries(testFiles.map((p) => [p, hash(p)])),
    rc3BaselineBefore: hash('scripts/rc/frozen-rc3.json'),
    rc3TagBefore: git('rev-parse', 'v1.0.0-rc.3'),
    historicalBefore: Object.fromEntries(
      historicalFiles.map((p) => [p, hash(p)]),
    ),
    tagObjectBefore: git('rev-parse', 'v0.15.0'),
  },
  passed: false,
};
const save = () =>
  writeFileSync(absoluteOutput, JSON.stringify(report, null, 2) + '\n');
assert.equal(report.startingStatus, '', 'Commit source before qualification');
save();
function run(label, args, executable = process.execPath) {
  console.log('START ' + label);
  const start = performance.now();
  const r = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 900000,
    maxBuffer: 24 * 1024 ** 2,
    env: {
      ...process.env,
      PJS_TAR_LISTING_REPORT: join(scratch, 'tar-listing.json'),
      PJS_NPM_CLI: releaseNpmCli,
      PJS_NPM_CONTRACT_REPORT: join(scratch, 'npm-dry-run.json'),
      PJS_CONTRACT_REPORT: join(scratch, 'contracts.json'),
    },
  });
  report.checks.push({
    label,
    command: [executable, ...args],
    exitCode: r.status,
    error: r.error?.message ?? null,
    durationMs: performance.now() - start,
    output: (r.stdout ?? '') + (r.stderr ?? ''),
  });
  save();
  assert.ifError(r.error);
  assert.equal(r.status, 0, `${label}: ${report.checks.at(-1).output}`);
  console.log('END ' + label + ' 0');
  return r.stdout;
}
try {
  run('build', [
    'node_modules/@typescript/native/bin/tsc',
    '-p',
    'packages/runtime/tsconfig.json',
  ]);
  const releaseOutput = run('release and immutable-baseline regressions', [
    '--test',
    'scripts/release/npm-release.test.mjs',
    'scripts/release/npm-cli.test.mjs',
    'scripts/rc/baseline.test.mjs',
  ]);
  assert.match(
    releaseOutput,
    new RegExp(`[ℹ#] tests ${expectedReleaseTests}\\b`),
  );
  assert.match(
    releaseOutput,
    new RegExp(`[ℹ#] pass ${expectedReleaseTests}\\b`),
  );
  assert.match(releaseOutput, /[ℹ#] skipped 0\b/);
  run('existing package smoke', ['scripts/package-smoke.mjs']);
  run('test:types', [
    'node_modules/@typescript/native/bin/tsc',
    '-p',
    'packages/runtime/test/tsconfig.json',
  ]);
  run('typecheck:compat', [
    'node_modules/typescript/bin/tsc6',
    '--noEmit',
    '-p',
    'packages/runtime/tsconfig.json',
  ]);
  const tests = readdirSync(join(root, 'packages/runtime/test'))
    .filter((p) => p.endsWith('.test.mjs'))
    .sort()
    .map((p) => 'packages/runtime/test/' + p);
  run('runtime node:test', ['--test', '--test-timeout=20000', ...tests]);
  run('independent individual contract counts', ['scripts/test-contracts.mjs']);
  report.contracts = JSON.parse(readFileSync(join(scratch, 'contracts.json')));
  assert.equal(report.contracts.totals.tests, expectedTests);
  assert.equal(report.contracts.totals.pass, expectedTests);
  assert.equal(report.contracts.totals.fail, 0);
  assert.equal(report.contracts.totals.cancelled, 0);
  assert.equal(report.contracts.totals.skipped, 0);
  run('lint', ['node_modules/eslint/bin/eslint.js', '.']);
  run('format:check', [
    'node_modules/prettier/bin/prettier.cjs',
    '--check',
    '.',
  ]);
  run('documentation links', ['scripts/check-docs.mjs']);
  run('diff --check', ['diff', '--check'], 'git');
  report.apiFreeze = JSON.parse(
    run('RC4 exact source/declaration/export/manifest freeze', [
      'scripts/rc/api-freeze.mjs',
    ]),
  );
  run('existing CPU example', ['examples/prime-search.mjs']);
  const packageOutput = join(scratch, 'package.json');
  run(
    'actual package, separate installed consumers, errors, examples and natural exit',
    [
      'scripts/rc/package.mjs',
      `--npm-cli=${npmCli}`,
      `--output=${packageOutput}`,
      `--pack-dir=${join(scratch, 'packed')}`,
    ],
  );
  report.package = JSON.parse(readFileSync(packageOutput));
  assert.equal(report.package.passed, true);
  report.npmDryRun = JSON.parse(
    readFileSync(join(scratch, 'npm-dry-run.json')),
  );
  const packMetadata = join(scratch, 'release-pack.json');
  writeFileSync(packMetadata, JSON.stringify([report.package.tarball]) + '\n', {
    flag: 'wx',
  });
  run(
    'exact release artifact validation and selected-npm publication dry run',
    [
      'scripts/release/npm-release.mjs',
      'tarball',
      packMetadata,
      join(scratch, 'packed'),
      baseline.manifest.version,
      'next',
    ],
  );
  report.tarListingTransport = JSON.parse(
    readFileSync(join(scratch, 'tar-listing.json')),
  );
  report.runtimeNpmPublisherPolicy = classifyReleaseNpmVersion(
    report.runtimeNpm,
  );
  report.liveReleaseCliContractExecuted =
    report.npmDryRun.liveContractExecuted === true;
  assert.equal(report.liveReleaseCliContractExecuted, true);
  const soakOutput = join(scratch, 'soak.json');
  run(`RC ${profile} soak`, [
    'scripts/rc/soak.mjs',
    `--profile=${profile}`,
    `--output=${soakOutput}`,
  ]);
  report.soak = JSON.parse(readFileSync(soakOutput));
  assert.equal(report.soak.passed, true);
  report.preservation.sourceAfter = Object.fromEntries(
    sourceFiles.map((p) => [p, hash(p)]),
  );
  report.preservation.testsAfter = Object.fromEntries(
    testFiles.map((p) => [p, hash(p)]),
  );
  assert.deepEqual(
    report.preservation.testsAfter,
    report.preservation.testsBefore,
  );
  assert.equal(
    hash('scripts/rc/frozen-rc3.json'),
    report.preservation.rc3BaselineBefore,
  );
  assert.equal(
    report.preservation.rc3BaselineBefore,
    baseline.previousBaselineSha256,
  );
  assert.equal(
    git('rev-parse', 'v1.0.0-rc.3'),
    report.preservation.rc3TagBefore,
  );
  report.preservation.historicalAfter = Object.fromEntries(
    historicalFiles.map((p) => [p, hash(p)]),
  );
  report.preservation.tagObjectAfter = git('rev-parse', 'v0.15.0');
  assert.deepEqual(
    report.preservation.sourceAfter,
    report.preservation.sourceBefore,
  );
  assert.deepEqual(
    report.preservation.historicalAfter,
    report.preservation.historicalBefore,
  );
  assert.equal(
    report.preservation.tagObjectAfter,
    report.preservation.tagObjectBefore,
  );
  assert.equal(hash('scripts/rc/frozen-rc4.json'), report.baselineSha256);
  report.endingStatus = git('status', '--short');
  assert.equal(
    report.endingStatus,
    '',
    'Qualification changed tracked candidate',
  );
  report.passed = true;
  save();
  console.log(
    JSON.stringify({
      passed: true,
      node: process.version,
      sourceCommit: report.sourceCommit,
      tests: expectedTests,
      exports: 38,
      profile,
      operations: report.soak.operationCounts,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  save();
  throw error;
}
