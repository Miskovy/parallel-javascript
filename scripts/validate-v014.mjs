import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sourceHashes } from '../benchmarks/real-world/crypto/support.mjs';
import { validateReport } from '../benchmarks/real-world/compression/report.mjs';
import { bound } from '../benchmarks/real-world/compression/core.mjs';

const output = process.argv[2] ?? 'benchmarks/results/validation-v0.14.json';
const base = 'd9e259ef2ee14a11e05b57fb7621295aa67958c9';
const runtimeCommit = '18f0c87e7b7920179403bbc396afabced6bb06c4';
const checks = [];
function run(label, file, args) {
  const started = Date.now();
  try {
    const text = execFileSync(file, args, {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8 * 1024 ** 2,
    });
    checks.push({
      command: label,
      exitCode: 0,
      durationMs: Date.now() - started,
      output: text,
    });
  } catch (error) {
    checks.push({
      command: label,
      exitCode: error.status ?? -1,
      durationMs: Date.now() - started,
      output:
        String(error.stdout ?? '') + String(error.stderr ?? error.message),
    });
    throw error;
  }
}
const report = {
  milestone: '0.14',
  clientDate: '2026-10-02',
  node: process.version,
  zlib: process.versions.zlib,
  base,
  runtimeCommit,
  checks,
  success: false,
};
try {
  report.processorObservation = JSON.parse(
    readFileSync(
      'benchmarks/results/local/v014-processor.json',
      'utf8',
    ).replace(/^\uFEFF/, ''),
  );
  // Runtime tests were executed before retained timing; never overlap gates with benchmarks.
  const testLog = readFileSync(
    'benchmarks/results/local/v014-prerequisite-tests.log',
  );
  const tests = testLog
    .toString(testLog[0] === 0xff && testLog[1] === 0xfe ? 'utf16le' : 'utf8')
    .replace(/^\uFEFF/, '');
  assert.match(tests, /tests 178/);
  assert.match(tests, /pass 178/);
  assert.match(tests, /fail 0/);
  checks.push({
    command: 'npm test (prerequisite run, includes build and test:types)',
    exitCode: 0,
    output: tests,
  });
  const npmCli = join(
    dirname(process.execPath),
    'node_modules/npm/bin/npm-cli.js',
  );
  report.npm = execFileSync(process.execPath, [npmCli, '--version'], {
    encoding: 'utf8',
  }).trim();
  for (const command of [
    'build',
    'test:types',
    'typecheck:compat',
    'lint',
    'format:check',
  ])
    run(`npm run ${command}`, process.execPath, [npmCli, 'run', command]);
  run('git diff --check', 'git', ['diff', '--check']);
  run('harness tests', process.execPath, [
    '--test',
    'benchmarks/real-world/compression/harness.test.mjs',
  ]);
  run('runtime pinned source equality', 'git', [
    'diff',
    '--exit-code',
    runtimeCommit,
    '--',
    'packages/runtime/src',
  ]);
  const tracked = execFileSync('git', ['ls-tree', '-r', base], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { path, blob: meta.split(' ')[2] };
    });
  const workingBlobs = execFileSync('git', ['hash-object', '--stdin-paths'], {
    input: tracked.map((t) => t.path).join('\n') + '\n',
    encoding: 'utf8',
    maxBuffer: 8 * 1024 ** 2,
  })
    .trim()
    .split('\n');
  report.historical = {};
  tracked.forEach((entry, index) => {
    assert.equal(
      workingBlobs[index],
      entry.blob,
      `historical file modified: ${entry.path}`,
    );
    report.historical[entry.path] = {
      gitBlob: entry.blob,
      sha256: createHash('sha256')
        .update(readFileSync(entry.path))
        .digest('hex'),
    };
  });
  report.runtimeHashes = sourceHashes();
  const main = JSON.parse(
    readFileSync(
      'benchmarks/results/compression-v0.14-windows-node24.json',
      'utf8',
    ),
  );
  validateReport(main);
  assert.equal(main.cells.length, 162);
  assert.equal(main.skips.length, 0);
  assert.deepEqual(
    sourceHashes('benchmarks/real-world/compression'),
    main.harnessBefore,
  );
  assert.equal(
    createHash('sha256')
      .update(readFileSync('docs/proposal-v0.14.md'))
      .digest('hex'),
    main.proposalHash,
  );
  for (const cell of main.cells.filter(
    (c) => c.config.model === 'pjs' && !c.config.deep,
  )) {
    const config = cell.config,
      capacity =
        (config.direction === 'inflate' ? config.grain : bound(config.grain)) *
        config.byteMaxima;
    for (const trial of [...cell.warmups, ...cell.trials]) {
      if (config.direction === 'inflate')
        assert.equal(trial.streamCounters.refundedResultBytes, 0);
      for (const snapshot of trial.snapshots) {
        assert.ok(snapshot.pending + snapshot.buffered <= config.count);
        assert.ok(snapshot.reservedBytes >= 0);
        assert.equal(
          snapshot.reservedBytes,
          snapshot.unreconciledResultBytes + snapshot.reconciledResultBytes,
        );
        if (config.credit !== 'count')
          assert.ok(snapshot.reservedBytes <= capacity);
      }
    }
  }
  assert.deepEqual(report.runtimeHashes, main.runtimeBefore);
  report.campaign = {
    cells: main.cells.length,
    trials: main.cells.reduce((n, cell) => n + cell.trials.length, 0),
    warmups: main.cells.reduce((n, cell) => n + cell.warmups.length, 0),
  };
  const bounds = JSON.parse(
    readFileSync(
      'benchmarks/results/compression-v0.14-bound-validation.json',
      'utf8',
    ),
  );
  assert.equal(bounds.complete, true);
  assert.equal(bounds.results.length, 324);
  const lifecycle = JSON.parse(
    readFileSync('benchmarks/results/compression-v0.14-lifecycle.json', 'utf8'),
  );
  assert.equal(lifecycle.complete, true);
  assert.equal(lifecycle.results.length, 6);
  assert.equal(lifecycle.prefill.length, 24);
  for (const result of [...lifecycle.results, ...lifecycle.prefill])
    for (const value of Object.values(result.terminal)) assert.equal(value, 0);
  const supplement = JSON.parse(
    readFileSync(
      'benchmarks/results/compression-v0.14-contention.json',
      'utf8',
    ),
  );
  validateReport(supplement);
  assert.equal(supplement.cells.length, 7);
  assert.equal(supplement.parallelRoundTrips.length, 3);
  for (const result of supplement.parallelRoundTrips) {
    assert.equal(result.correctness, true);
    assert.equal(result.exactInflateRefunds, 0);
    for (const value of Object.values(result.terminal)) assert.equal(value, 0);
  }
  for (const value of Object.values(supplement.nativeCompressionAbort.terminal))
    assert.equal(value, 0);
  assert.deepEqual(supplement.runtimeBefore, report.runtimeHashes);
  const memory = JSON.parse(
    readFileSync(
      'benchmarks/results/compression-v0.14-fresh-memory.json',
      'utf8',
    ),
  );
  assert.equal(memory.complete, true);
  assert.equal(memory.cases.length, 6);
  for (const result of memory.cases) {
    validateReport(result);
    assert.deepEqual(result.runtimeBefore, report.runtimeHashes);
  }
  report.supplement = {
    cells: 7,
    trials: 42,
    parallelRoundTrips: 3,
    nativeCompressionAbort: true,
  };
  report.freshMemory = { processes: 6, trials: 36 };
  report.artifactHashes = {};
  for (const path of [
    'compression-v0.14-windows-node24.json',
    'compression-v0.14-bound-validation.json',
    'compression-v0.14-lifecycle.json',
    'compression-v0.14-contention.json',
    'compression-v0.14-fresh-memory.json',
  ])
    report.artifactHashes[path] = createHash('sha256')
      .update(readFileSync(`benchmarks/results/${path}`))
      .digest('hex');
  report.success = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
assert.equal(report.success, true, report.failure);
console.log(
  `${checks.length} checks, ${Object.keys(report.historical).length} historical files preserved; ${report.campaign.trials} retained trials`,
);
