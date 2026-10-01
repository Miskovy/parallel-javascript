import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineReport } from '../../benchmarks/environment.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log(
    'node scripts/cross-platform-v012/run.mjs --commit <committed-v0.12-hash> [--mode reduced|full] [--node <executable>] [--npm <npm-cli.js>] [--label <machine>] [--output <new-directory>] [--offline]',
  );
  process.exit(0);
}
const requestedCommit = value('commit');
assert.match(
  requestedCommit ?? '',
  /^[a-f0-9]{40}$/,
  'Pass an explicit committed v0.12 source hash',
);
const commit = execFileSync(
  'git',
  ['rev-parse', `${requestedCommit}^{commit}`],
  { cwd: repository, encoding: 'utf8' },
).trim();
const mode = value('mode', 'reduced');
assert.ok(['reduced', 'full'].includes(mode));
const label = value('label', `${process.platform}-${process.arch}`);
assert.match(label, /^[a-z0-9][a-z0-9.-]*$/);
const node = resolve(value('node', process.execPath));
const npm = [
  value('npm'),
  join(dirname(node), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(node), '../lib/node_modules/npm/bin/npm-cli.js'),
].find((path) => path && existsSync(path));
assert.ok(npm, 'Pass --npm with the matching npm-cli.js path');
const output = resolve(value('output', join(repository, 'benchmarks/results')));
const nodeMajor = execFileSync(
  node,
  ['-p', 'process.versions.node.split(".")[0]'],
  { encoding: 'utf8' },
).trim();
assert.ok(['22', '24'].includes(nodeMajor), 'Campaign targets Node 22 and 24');
const filename = `cross-platform-v0.12-${label}-node${nodeMajor}-${mode}.json`;
assert.ok(
  !existsSync(join(output, filename)),
  `Refusing to overwrite ${filename}`,
);
const temporary = await mkdtemp(join(tmpdir(), 'pjs-cross-platform-v012-'));
const root = join(temporary, 'reference');
await mkdir(root);
const archive = join(temporary, 'reference.tar');
execFileSync('git', ['archive', `--output=${archive}`, commit], {
  cwd: repository,
});
execFileSync('tar', ['-xf', archive, '-C', root]);
const packageJson = JSON.parse(
  await readFile(join(root, 'packages/runtime/package.json'), 'utf8'),
);
assert.equal(packageJson.version, '0.12.0');
const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', commit], {
  cwd: repository,
  encoding: 'utf8',
})
  .trim()
  .split('\n');
const sourcePaths = tracked.filter(
  (path) => !path.startsWith('benchmarks/results/'),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function manifest() {
  return Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (path) => [
        path,
        hash(await readFile(join(root, path))),
      ]),
    ),
  );
}
const original = await manifest();
const env = {
  ...process.env,
  PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
};
for (const key of Object.keys(env)) {
  if (
    (key !== 'PATH' && key.toLowerCase() === 'path') ||
    (key.startsWith('PJS_') && key !== 'PJS_POWER_MODE')
  )
    delete env[key];
}
const report = {
  version: '0.12.0',
  sourceCommit: commit,
  mode,
  label,
  startedAt: new Date().toISOString(),
  nodeExecutable: node,
  npmCli: npm,
  environment: JSON.parse(
    execFileSync(
      node,
      [
        '--input-type=module',
        '-e',
        `import { machineReport } from ${JSON.stringify(new URL('../../benchmarks/environment.mjs', import.meta.url).href)}; console.log(JSON.stringify(machineReport()));`,
      ],
      { cwd: repository, env, encoding: 'utf8' },
    ),
  ),
  controllerEnvironment: machineReport(),
  archiveSha256: hash(await readFile(archive)),
  lockfileSha256: hash(await readFile(join(root, 'package-lock.json'))),
  sourceFileSha256: original,
  checks: [],
  failures: [],
  status: 'running',
};
await mkdir(output, { recursive: true });
async function save() {
  await writeFile(
    join(output, filename),
    JSON.stringify(report, null, 2) + '\n',
  );
}
await save();
async function run(name, argv, extraEnv = {}) {
  console.log(`${mode}: ${name}`);
  const started = performance.now();
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(node, argv, {
      cwd: root,
      env: { ...env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolveResult({ code, stdout, stderr }));
  });
  report.checks.push({
    name,
    argv,
    elapsedMs: performance.now() - started,
    ...result,
  });
  if (result.code !== 0) report.failures.push(name);
  await save();
  assert.equal(result.code, 0, `${name} failed; see saved artifact`);
}
try {
  await run('locked dependencies', [
    npm,
    'ci',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    ...(args.includes('--offline') ? ['--offline'] : []),
  ]);
  for (const name of [
    'build',
    'test:types',
    'typecheck:compat',
    'lint',
    'format:check',
  ])
    await run(name, [npm, 'run', name]);
  await run('complete normal suite', [
    '--test',
    '--test-timeout=20000',
    'packages/runtime/test/*.test.mjs',
  ]);
  await run(
    'complete invariant suite',
    ['--test', '--test-timeout=20000', 'packages/runtime/test/*.test.mjs'],
    { PJS_DEBUG_RESERVATION_INVARIANTS: '1' },
  );
  await run('reservation soak', [
    'scripts/reservation-soak.mjs',
    `--mode=${mode === 'full' ? 'quick' : 'smoke'}`,
  ]);
  if (mode === 'full') {
    await run('ten stress rounds', ['scripts/stress.mjs'], {
      PJS_DEBUG_RESERVATION_INVARIANTS: '1',
    });
    await run('upper-bound benchmark matrix', [
      'benchmarks/upper-bound-results/run.mjs',
    ]);
  }
  for (const name of [
    'reservation-soak-v0.12.json',
    ...(mode === 'full' ? ['upper-bound-results-v0.12.json'] : []),
  ])
    report[name] = JSON.parse(
      await readFile(join(root, 'benchmarks/results', name), 'utf8'),
    );
  assert.deepEqual(
    await manifest(),
    original,
    'Source changed during campaign',
  );
  report.sourceVerifiedUnchanged = true;
  report.status = 'complete';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  report.preservedArchiveRoot = root;
  await save();
  console.log(join(output, filename));
}
