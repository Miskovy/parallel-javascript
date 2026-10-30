import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from './analyze.mjs';
import { config } from './config.mjs';
import { manifest, writeJson } from './lib.mjs';

// Synthetic fixtures exercise analysis validity, never benchmark results. Temp
// fixture directories are isolated and contain no installed consumer packages.
function fixture({
  profile = 'publication',
  omit = false,
  duplicate = false,
  failed = false,
  timerMissing = false,
} = {}) {
  const path = mkdtempSync(join(tmpdir(), 'pjs-publication-analysis-test-'));
  const spec = {
    id: 'synthetic',
    family: 'monte',
    study: 'primary',
    count: 100,
    workers: 1,
  };
  const jobs = [];
  for (let trial = 0; trial < 10; trial++)
    for (const contender of config.contenders)
      jobs.push({
        id: `${contender}-${trial}`,
        spec,
        contender,
        trial,
        profile,
      });
  writeJson(join(path, 'freeze.json'), {
    profile,
    config,
    source: { status: '' },
    matrix: { cases: [spec] },
    trials: 10,
    jobs,
  });
  writeJson(join(path, 'run.json'), { status: failed ? 'failed' : 'passed' });
  writeJson(join(path, 'packages.json'), {});
  const rows = jobs.map((job) => {
    const wallMs = (job.contender === 'serial' ? 10 : 2) + job.trial / 100;
    return {
      id: job.id,
      job,
      process: { exitCode: 0, timedOut: false },
      result: {
        status: 'passed',
        cleanup: 'awaited',
        cold: { firstUsefulResultMs: 3, completedWorkloadMs: 4 },
        phases: [
          {
            phase: 'measured',
            wallMs,
            preparationMs: 1,
            metrics: {
              sampledPeakRssBytes: 100 * 1024 ** 2,
              timer: {
                p95Ms: timerMissing ? null : 0.5,
                maxMs: timerMissing ? null : 0.5,
                n: timerMissing ? 0 : 1,
              },
            },
          },
        ],
      },
    };
  });
  if (omit) rows.pop();
  if (duplicate) rows.push(rows[0]);
  writeFileSync(
    join(path, 'raw.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
  manifest(path);
  return path;
}
test('complete synthetic trials use matching serial denominators and descriptive intervals', () => {
  const summary = analyze(fixture());
  assert.equal(summary.publicationEligible, true);
  const serial = summary.rows.find((r) => r.contender === 'serial');
  const raw = summary.rows.find((r) => r.contender === 'raw');
  assert.equal(raw.serialSpeedup, serial.wallMs.median / raw.wallMs.median);
  assert.ok(
    raw.wallMs.ci95[0] <= raw.wallMs.median &&
      raw.wallMs.ci95[1] >= raw.wallMs.median,
  );
  assert.equal(raw.versusSerial, 'clear practical improvement');
});
test('missing trial, failed run and absent timer samples disable all performance inference', () => {
  for (const options of [
    { omit: true },
    { failed: true },
    { timerMissing: true },
    { profile: 'smoke' },
  ]) {
    const summary = analyze(fixture(options));
    assert.equal(summary.publicationEligible, false);
    assert.ok(
      summary.rows.every((r) =>
        r.versusSerial.includes('no performance inference'),
      ),
    );
    assert.ok(
      summary.rows.every((r) =>
        r.peerComparisons.every((p) =>
          p.assessment.includes('no performance inference'),
        ),
      ),
    );
  }
});
test('duplicate trial and retained-data tampering fail analysis', () => {
  assert.throws(
    () => analyze(fixture({ duplicate: true })),
    /Duplicate records/,
  );
  const path = fixture();
  appendFileSync(join(path, 'raw.jsonl'), '\n');
  assert.throws(() => analyze(path));
});
