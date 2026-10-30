import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checked, command, manifest, sha256, source } from './evidence.mjs';
import { PROFILES as r3Profiles } from '../../scripts/qualification/memory/campaign.mjs';

const root = resolve(process.argv[2]);
const reportPath = join(root, 'reconciliation.json');
writeFileSync(reportPath, '', { flag: 'wx' });
const report = {
  source: source(process.cwd()),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  checks: [],
  status: 'failed',
};
const save = () =>
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
function run(label, args) {
  const receipt = { label, ...command(process.execPath, args, process.cwd()) };
  report.checks.push(receipt);
  save();
  return checked(receipt);
}
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
try {
  run('complete primary fixtures', [
    'node_modules/@typescript/native/bin/tsc',
    '-p',
    'packages/runtime/test/tsconfig.json',
  ]);
  run('complete compatibility fixtures', [
    'node_modules/typescript/bin/tsc6',
    '-p',
    'packages/runtime/test/tsconfig.json',
  ]);
  run('checker-derived API and benchmark coverage matrix', [
    'benchmarks/current-development/audit.mjs',
    join(root, 'coverage.json'),
  ]);
  run('inventory regression contracts', [
    '--test',
    'scripts/checks/api-contract-inventory.test.mjs',
  ]);
  run('retained result tables', [
    'benchmarks/current-development/summarize.mjs',
    join(root, 'campaign/report.json'),
    join(root, 'results.md'),
  ]);
  const ordinary = read(join(root, 'ordinary.json'));
  assert.equal(ordinary.sourceCommit, report.source.commit);
  assert.equal(ordinary.node, process.version);
  assert.equal(ordinary.platform, process.platform);
  assert.equal(ordinary.arch, process.arch);
  assert.equal(ordinary.passed, true);
  assert.ok(ordinary.checks.every((c) => c.exitCode === 0 && !c.error));
  const contracts = read(join(root, 'ordinary.json.contracts.json'));
  assert.ok(contracts.totals.pass > 0);
  assert.equal(contracts.totals.fail, 0);
  assert.equal(contracts.totals.cancelled, 0);
  assert.equal(contracts.totals.skipped, 0);
  for (const child of contracts.results) assert.equal(child.exitCode, 0);
  report.contracts = contracts.totals;
  const r2 = ordinary.r2;
  assert.equal(r2.profile, 'standard');
  assert.equal(r2.sourceCommit, report.source.commit);
  assert.equal(r2.dirtyWorkingTree, false);
  assert.equal(r2.node, process.version);
  assert.equal(r2.operatingSystem, process.platform);
  assert.equal(r2.architecture, process.arch);
  assert.equal(r2.failedHistories.length, 0);
  assert.equal(r2.passed, true);
  assert.equal(r2.histories.length, r2.historyCount);
  assert.equal(r2.cleanupChecks.length, r2.historyCount);
  let actions = 0;
  for (const h of r2.histories) {
    const prefix = join(
      root,
      'ordinary.json.r2',
      `seed-${h.seed}-case-${h.caseId}`,
    );
    const history = read(prefix + '.history.json'),
      observations = read(prefix + '.observations.json');
    assert.equal(observations.passed, true);
    assert.equal(observations.cleanup, true);
    assert.equal(history.actions.length, h.actions);
    actions += history.actions.length;
  }
  assert.equal(actions, r2.actionCount);
  report.r2 = {
    histories: r2.historyCount,
    actions,
    cleanup: r2.cleanupChecks.length,
    realWorkers: r2.realWorkerChecks,
    negativeDetection: r2.invariantNegativeDetection,
    replay: r2.replayValidation,
  };
  const r3 = ordinary.r3;
  assert.equal(r3.profile, 'standard');
  assert.equal(r3.sourceCommit, report.source.commit);
  assert.equal(r3.dirtyWorkingTree, false);
  assert.equal(r3.node, process.version);
  assert.equal(r3.operatingSystem, process.platform);
  assert.equal(r3.architecture, process.arch);
  assert.deepEqual(r3.config, r3Profiles.standard);
  assert.deepEqual(r3.seeds, r3Profiles.standard.seeds);
  assert.equal(r3.gc, 'off');
  assert.equal(r3.scenarioCount, 11);
  assert.equal(r3.results.length, 11);
  assert.equal(r3.passed, true);
  let samples = 0,
    checkpoints = 0,
    created = 0,
    confirmedExits = 0;
  for (const entry of r3.results) {
    assert.equal(entry.exitCode, 0);
    assert.equal(entry.passed, true);
    const child = read(entry.result);
    assert.equal(child.passed, true);
    assert.equal(child.sourceCommit, report.source.commit);
    assert.equal(child.threadTotals.created, child.threadTotals.confirmedExits);
    assert.ok(
      child.checkpoints.length >=
        r3Profiles.standard.warmup + r3Profiles.standard.iterations,
    );
    samples += child.samples.length;
    checkpoints += child.checkpoints.length;
    created += child.threadTotals.created;
    confirmedExits += child.threadTotals.confirmedExits;
  }
  report.r3 = {
    children: r3.results.length,
    samples,
    checkpoints,
    created,
    confirmedExits,
  };
  const packaged = read(join(root, 'ordinary.json.package.json'));
  assert.equal(packaged.passed, true);
  assert.equal(sha256(packaged.tarball.retainedPath), packaged.tarball.sha256);
  const campaign = read(join(root, 'campaign/report.json'));
  assert.equal(campaign.packages.candidate.commit, report.source.commit);
  assert.equal(campaign.packages.candidate.tree, report.source.tree);
  assert.equal(campaign.packages.candidate.sha256, packaged.tarball.sha256);
  assert.equal(campaign.node, process.version);
  assert.equal(campaign.machine.platform, process.platform);
  assert.ok(['accepted', 'incomplete'].includes(campaign.status));
  assert.ok(campaign.health.every((h) => h.status === 'accepted'));
  for (const entry of campaign.executions) {
    const child = read(entry.result),
      config = read(entry.config);
    assert.deepEqual(child.config, config);
    assert.equal(child.node, process.version);
    assert.equal(entry.sourceCommit, campaign.packages[entry.arm].commit);
    assert.equal(entry.packageSha256, campaign.packages[entry.arm].sha256);
    assert.equal(child.cleanup, true);
    assert.notEqual(child.status, 'failed');
    if (child.status === 'accepted')
      assert.ok(child.phases.every((p) => p.validated));
  }
  for (const entry of read(join(root, 'campaign/digests.json')))
    assert.equal(sha256(join(root, 'campaign', entry.path)), entry.sha256);
  report.packageSha256 = packaged.tarball.sha256;
  report.campaign = {
    status: campaign.status,
    configurations: campaign.results.length,
    children: campaign.executions.length,
    failed: campaign.results.filter((r) => r.correctness === 'failed').length,
    skipped: campaign.results.filter((r) => r.status === 'skipped').length,
    inconclusive: campaign.results.filter((r) => r.status === 'inconclusive')
      .length,
    regressions: campaign.results.filter((r) => r.status === 'regression')
      .length,
  };
  report.status = 'accepted';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  save();
  manifest(root);
}
console.log(JSON.stringify(report));
