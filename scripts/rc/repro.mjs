import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const output = arg('output');
assert.ok(output, 'Specify a NEW --output=file.json');
writeFileSync(output, '', { flag: 'wx' });
const npmCli = arg('npm-cli') ?? process.env.npm_execpath;
assert.ok(npmCli, 'Supply --npm-cli=path');
const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const status = execFileSync('git', ['status', '--short'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
assert.equal(status, '', 'Commit source before clean qualification');
const temporary = mkdtempSync(join(tmpdir(), 'PJS RC clean states '));
const report = {
  schema: 1,
  sourceCommit: candidate,
  node: process.version,
  versions: process.versions,
  temporary,
  checks: [],
  states: [],
  passed: false,
};
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
save();
function run(label, executable, args, cwd = root) {
  console.log('START ' + label);
  const start = performance.now();
  const r = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 900000,
    maxBuffer: 24 * 1024 ** 2,
  });
  report.checks.push({
    label,
    command: [executable, ...args],
    cwd,
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
  for (const name of ['A', 'B']) {
    const checkout = join(temporary, `clean ${name}`);
    run(`clone ${name}`, 'git', [
      'clone',
      '--local',
      '--no-hardlinks',
      '--no-checkout',
      root,
      checkout,
    ]);
    run(
      `checkout exact candidate ${name}`,
      'git',
      ['-c', 'core.autocrlf=false', 'checkout', '--detach', candidate],
      checkout,
    );
    assert.equal(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: checkout,
        encoding: 'utf8',
      }).trim(),
      candidate,
    );
    assert.equal(
      execFileSync('git', ['status', '--short'], {
        cwd: checkout,
        encoding: 'utf8',
      }).trim(),
      '',
    );
    run(
      `clean npm ci ${name}`,
      process.execPath,
      [npmCli, 'ci', '--no-audit', '--no-fund'],
      checkout,
    );
    const evidence = join(temporary, `state-${name}.json`);
    if (name === 'A')
      run(
        'clean full current-Node gates and extended profile',
        process.execPath,
        [
          'scripts/rc/qualify.mjs',
          `--npm-cli=${npmCli}`,
          `--output=${evidence}`,
          '--profile=extended',
        ],
        checkout,
      );
    else {
      run(
        'second clean build',
        process.execPath,
        [
          'node_modules/@typescript/native/bin/tsc',
          '-p',
          'packages/runtime/tsconfig.json',
        ],
        checkout,
      );
      run(
        'second clean public freeze',
        process.execPath,
        ['scripts/rc/api-freeze.mjs'],
        checkout,
      );
      run(
        'second clean independent package consumers',
        process.execPath,
        [
          'scripts/rc/package.mjs',
          `--npm-cli=${npmCli}`,
          `--output=${evidence}`,
          `--pack-dir=${join(temporary, 'second packed')}`,
        ],
        checkout,
      );
    }
    const record = JSON.parse(readFileSync(evidence));
    assert.equal(record.passed, true);
    const packaged = name === 'A' ? record.package : record;
    report.states.push({
      name,
      checkout,
      evidence,
      sourceCommit: candidate,
      package: packaged,
      qualification: name === 'A' ? record : undefined,
    });
    save();
    assert.equal(
      execFileSync('git', ['status', '--short'], {
        cwd: checkout,
        encoding: 'utf8',
      }).trim(),
      '',
      'Clean qualification changed tracked source',
    );
  }
  assert.deepEqual(
    report.states[0].package.fileHashes,
    report.states[1].package.fileHashes,
    'Logical package content differs',
  );
  assert.deepEqual(
    report.states[0].package.tarball.files,
    report.states[1].package.tarball.files,
    'Logical package manifest differs',
  );
  report.logicalFilesIdentical = true;
  report.archiveBytesIdentical =
    report.states[0].package.tarball.sha256 ===
    report.states[1].package.tarball.sha256;
  report.canonical = { ...report.states[0].package.tarball };
  const destination = resolve(
    arg('canonical-dir') ?? join(root, '.node-tools/rc1/canonical'),
  );
  mkdirSync(destination, { recursive: true });
  const target = join(destination, report.canonical.filename);
  const bytes = readFileSync(report.canonical.path);
  writeFileSync(target, bytes, { flag: 'wx' });
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    report.canonical.sha256,
  );
  writeFileSync(
    target + '.sha256',
    `${report.canonical.sha256}  ${report.canonical.filename}\n`,
    { flag: 'wx' },
  );
  report.canonical.retainedPath = target;
  report.passed = true;
  save();
  console.log(
    JSON.stringify({
      passed: true,
      sourceCommit: candidate,
      logicalFilesIdentical: true,
      archiveBytesIdentical: report.archiveBytesIdentical,
      sha256: report.canonical.sha256,
      canonical: target,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  save();
  throw error;
}
