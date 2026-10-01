import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { machineReport } from '../benchmarks/environment.mjs';

const node = process.execPath;
const npm = [
  join(dirname(node), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(node), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
assert.ok(npm, 'Matching npm-cli.js is available');
const report = {
  version: '0.12.0',
  timestamp: new Date().toISOString(),
  environment: machineReport(),
  checks: [],
};
const output = new URL(
  '../benchmarks/results/validation-v0.12.json',
  import.meta.url,
);
async function run(name, args, extraEnv = {}) {
  console.log(`v0.12 validation: ${name}`);
  const started = performance.now();
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(node, args, {
      env: { ...process.env, ...extraEnv },
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
    args,
    elapsedMs: performance.now() - started,
    ...result,
  });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  assert.equal(
    result.code,
    0,
    `${name} failed: ${result.stderr || result.stdout}`,
  );
}
try {
  for (const name of [
    'build',
    'test:types',
    'typecheck:compat',
    'lint',
    'format:check',
  ])
    await run(name, [npm, 'run', name]);
  await run('normal suite', [
    '--test',
    '--test-timeout=20000',
    'packages/runtime/test/*.test.mjs',
  ]);
  await run(
    'invariant suite',
    ['--test', '--test-timeout=20000', 'packages/runtime/test/*.test.mjs'],
    { PJS_DEBUG_RESERVATION_INVARIANTS: '1' },
  );
  await run('ten fresh-process stress rounds', ['scripts/stress.mjs'], {
    PJS_DEBUG_RESERVATION_INVARIANTS: '1',
    PJS_STRESS_ROUNDS: '10',
  });
  await run(
    'final 30-second soak',
    ['scripts/reservation-soak.mjs', '--mode=quick'],
    { PJS_SOAK_DURATION_MS: '30000' },
  );
  report.diffCheck = execFileSync('git', ['diff', '--check'], {
    encoding: 'utf8',
  });
  const historicalPaths = execFileSync(
    'git',
    [
      'ls-tree',
      '-r',
      '--name-only',
      '8fcd0fd9e9e3a6987198fce80a338b02c076b0d7',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(
      (path) =>
        path.startsWith('benchmarks/results/') ||
        /^docs\/(benchmarks-v|proposal-v|cross-platform-v)/.test(path) ||
        /^docs\/adr\/001[78]-/.test(path) ||
        path.startsWith('scripts/cross-platform-v011/'),
    );
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  report.historicalEvidence = [];
  for (const path of historicalPaths) {
    const original = hash(
      execFileSync('git', ['show', `8fcd0fd:${path}`], {
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    const current = hash(await readFile(path));
    assert.equal(current, original, `Historical evidence changed: ${path}`);
    report.historicalEvidence.push({ path, sha256: current });
  }
  report.runtimeSourceSha256 = {};
  for (const path of execFileSync('git', ['ls-files', 'packages/runtime/src'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n'))
    report.runtimeSourceSha256[path] = hash(await readFile(path));
  report.soak = JSON.parse(
    await readFile(
      new URL(
        '../benchmarks/results/reservation-soak-v0.12.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`v0.12 validation ${report.status}`);
}
