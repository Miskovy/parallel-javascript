import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { configurations, policy } from './config.mjs';
import { assess, command, manifest, sha256 } from './evidence.mjs';

test('bounded configuration covers every family and preserves required controls', () => {
  const cases = configurations('performance', 128);
  assert.ok(cases.every((c) => c.workers >= 1 && c.workers <= 4));
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const family of [
    'cpu',
    'matrix',
    'transport',
    'dispatch',
    'skew',
    'completion',
    'shared-output',
    'generic-map',
    'typed-map',
    'stream',
    'pipeline',
    'fairness',
    'compression',
    'crypto',
    'monte-carlo',
  ])
    assert.ok(cases.some((c) => c.family === family));
  assert.deepEqual(
    [
      ...new Set(
        cases.filter((c) => c.family === 'dispatch').map((c) => c.batch),
      ),
    ],
    [1, 4, 16],
  );
  assert.ok(cases.some((c) => c.size === 0));
  assert.ok(cases.some((c) => c.size >= 1024 ** 2));
  assert.throws(() => configurations('unknown'));
});
const child = (arm, values) => ({
  arm,
  status: 'accepted',
  phases: values.map((wallMs) => ({ phase: 'measurement', wallMs })),
});
test('regression assessment distinguishes repeatable signals, noise, overhead and failure', () => {
  assert.equal(
    assess(
      [
        child('baseline', [20, 20, 20]),
        child('candidate', [30, 30, 30]),
        child('candidate', [30, 30, 30]),
        child('baseline', [20, 20, 20]),
      ],
      policy,
    ).status,
    'signal',
  );
  assert.equal(
    assess(
      [
        child('baseline', [20, 20, 20]),
        child('candidate', [10, 30, 60]),
        child('candidate', [10, 30, 60]),
        child('baseline', [20, 20, 20]),
      ],
      policy,
    ).status,
    'inconclusive',
  );
  assert.equal(
    assess(
      [
        child('baseline', [0.1]),
        child('candidate', [0.3]),
        child('candidate', [0.3]),
        child('baseline', [0.1]),
      ],
      policy,
    ).status,
    'accepted',
  );
  assert.equal(assess([{ status: 'failed' }], policy).status, 'failed');
  assert.equal(
    assess([{ status: 'skipped', reason: 'capability' }], policy).status,
    'skipped',
  );
});
test('existing campaign directory is rejected without altering its evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pjs-overwrite-test-'));
  const path = join(directory, 'retained.json');
  writeFileSync(path, 'retain-me');
  const before = sha256(path);
  const result = command(
    process.execPath,
    [
      'benchmarks/current-development/run.mjs',
      '--baseline=unused',
      '--output=' + directory,
    ],
    process.cwd(),
  );
  assert.notEqual(result.exitCode, 0);
  assert.equal(sha256(path), before);
});
test('digest manifest is exclusive and detects changed evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pjs-digest-test-'));
  const path = join(directory, 'sample.json');
  writeFileSync(path, '{"passed":true}');
  assert.equal(manifest(directory), 1);
  const digest = JSON.parse(readFileSync(join(directory, 'digests.json')))[0]
    .sha256;
  writeFileSync(path, '{"passed":false}');
  assert.notEqual(sha256(path), digest);
  assert.throws(() => manifest(directory), { code: 'EEXIST' });
});
