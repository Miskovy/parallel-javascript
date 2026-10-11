import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { assertSupportedReleaseNpmVersion } from './release/toolchain.mjs';

const allowed = ['output', 'release-npm-cli'];
for (const arg of process.argv.slice(2))
  assert.ok(
    allowed.some((name) => arg.startsWith('--' + name + '=')),
    'Unknown argument: ' + arg,
  );
for (const name of allowed)
  assert.ok(
    process.argv.filter((arg) => arg.startsWith('--' + name + '=')).length <= 1,
    'Duplicate ' + name,
  );
const option = (name) =>
  process.argv
    .find((arg) => arg.startsWith('--' + name + '='))
    ?.slice(name.length + 3);
const output = resolve(
  option('output') ?? '.node-tools/runtime-qualification.json',
);
const npmCli = process.env.npm_execpath;
const releaseNpmCli =
  option('release-npm-cli') ?? process.env.PJS_RELEASE_NPM_CLI;
assert.ok(
  npmCli && releaseNpmCli,
  'Run via npm and select --release-npm-cli independently',
);
assertSupportedReleaseNpmVersion(
  execFileSync(process.execPath, [releaseNpmCli, '--version'], {
    encoding: 'utf8',
  }).trim(),
);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(
  git('status', '--short'),
  '',
  'Commit changes before qualification',
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, '', { flag: 'wx' });
const report = {
  kind: 'Ordinary runtime feature qualification; not an immutable RC4 release freeze',
  sourceCommit: git('rev-parse', 'HEAD'),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  runtimeNpm: execFileSync(process.execPath, [npmCli, '--version'], {
    encoding: 'utf8',
  }).trim(),
  releaseNpm: execFileSync(process.execPath, [releaseNpmCli, '--version'], {
    encoding: 'utf8',
  }).trim(),
  checks: [],
  passed: false,
};
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
save();
for (const name of [
  'build',
  'test:contracts',
  'test:types',
  'typecheck:compat',
  'test:package',
  'test:release',
  'lint',
  'format:check',
  'test:docs',
  'diff',
]) {
  console.log('START ' + name);
  const start = performance.now();
  const env = {
    ...process.env,
    PJS_NPM_CLI: releaseNpmCli,
    PJS_CONTRACT_REPORT: output + '.contracts.json',
    PJS_PACKAGE_SMOKE_REPORT: output + '.package.json',
  };
  const result =
    name === 'diff'
      ? spawnSync('git', ['diff', '--check'], {
          encoding: 'utf8',
          timeout: 120_000,
        })
      : spawnSync(process.execPath, [npmCli, 'run', name], {
          env,
          encoding: 'utf8',
          timeout: 300_000,
          maxBuffer: 16 * 1024 * 1024,
        });
  report.checks.push({
    name,
    elapsedMs: performance.now() - start,
    exitCode: result.status,
    error: result.error?.message,
    output: (result.stdout ?? '') + (result.stderr ?? ''),
  });
  save();
  assert.ifError(result.error);
  assert.equal(result.status, 0, report.checks.at(-1).output);
  console.log('PASS ' + name);
}
report.contracts = JSON.parse(
  readFileSync(output + '.contracts.json', 'utf8'),
).totals;
report.package = JSON.parse(readFileSync(output + '.package.json', 'utf8'));
assert.equal(
  git('status', '--short'),
  '',
  'Qualification modified tracked source',
);
report.passed = true;
save();
console.log(
  JSON.stringify({ passed: true, output, contracts: report.contracts }),
);
