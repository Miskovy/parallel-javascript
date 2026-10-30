import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

export const PROFILES = {
  standard: {
    seeds: [20261019],
    warmup: 4,
    iterations: 48,
    sampleIntervalMs: 20,
    large: 256 * 1024,
    recreations: 4,
    childTimeoutMs: 30_000,
    budgetMs: 120_000,
  },
  extended: {
    seeds: [7, 42, 20261019],
    warmup: 8,
    iterations: 256,
    sampleIntervalMs: 20,
    large: 2 * 1024 * 1024,
    recreations: 12,
    childTimeoutMs: 60_000,
    budgetMs: 900_000,
  },
};
export function scenarios(profile) {
  const p = PROFILES[profile];
  return [
    {
      id: 'clone-scalar-1',
      mode: 'clone',
      shape: 'scalar',
      workers: 1,
      bytes: 64,
      outcome: 'complete',
    },
    {
      id: 'clone-view-2',
      mode: 'clone',
      shape: 'view',
      workers: 2,
      bytes: 64 * 1024,
      outcome: 'complete',
    },
    {
      id: 'clone-buffer-4',
      mode: 'clone',
      shape: 'buffer',
      workers: 4,
      bytes: p.large,
      outcome: 'complete',
    },
    {
      id: 'transfer-recycle-1',
      mode: 'transfer',
      shape: 'view',
      workers: 1,
      bytes: 1024,
      outcome: 'complete',
    },
    {
      id: 'transfer-view-2',
      mode: 'transfer',
      shape: 'view',
      workers: 2,
      bytes: 64 * 1024,
      outcome: 'complete',
    },
    {
      id: 'shared-retention-4',
      mode: 'shared',
      shape: 'view',
      workers: 4,
      bytes: p.large,
      outcome: 'complete',
    },
    {
      id: 'clone-cancel-2',
      mode: 'clone',
      shape: 'buffer',
      workers: 2,
      bytes: 64 * 1024,
      outcome: 'cancel',
    },
    {
      id: 'transfer-containment-1',
      mode: 'transfer',
      shape: 'buffer',
      workers: 1,
      bytes: 64 * 1024,
      outcome: 'containment',
    },
    {
      id: 'shared-restart-2',
      mode: 'shared',
      shape: 'view',
      workers: 2,
      bytes: p.large,
      outcome: 'restart',
    },
    {
      id: 'binary-streams-4',
      mode: 'binary',
      workers: 4,
      bytes: 8 * 1024,
      backing: 64 * 1024,
      outcome: 'streams',
    },
    {
      id: 'shutdown-recreate-2',
      mode: 'clone',
      shape: 'view',
      workers: 2,
      bytes: 64 * 1024,
      outcome: 'recreate',
    },
  ];
}
export function options() {
  const opt = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--(profile|seed|output|gc)=(.+)$/.exec(arg);
    assert.ok(match, 'Unknown argument: ' + arg);
    assert.ok(!Object.hasOwn(opt, match[1]), 'Duplicate argument: ' + match[1]);
    opt[match[1]] = match[2];
  }
  return opt;
}
export async function campaign({
  profile = 'standard',
  output,
  seed,
  gc = 'off',
} = {}) {
  assert.ok(Object.hasOwn(PROFILES, profile), 'Unknown R3 profile');
  assert.ok(['off', 'diagnostic'].includes(gc), 'gc must be off or diagnostic');
  const seeds = seed === undefined ? PROFILES[profile].seeds : [Number(seed)];
  assert.ok(
    seeds.every((s) => Number.isSafeInteger(s) && s > 0 && s <= 0xffffffff),
    'Invalid seed',
  );
  const root = resolve('.node-tools/r3');
  mkdirSync(root, { recursive: true });
  const directory = output
    ? resolve(output)
    : mkdtempSync(join(root, profile + '-'));
  if (output) {
    mkdirSync(dirname(directory), { recursive: true });
    mkdirSync(directory); // Any existing directory is evidence; refuse reuse.
  }
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  const report = {
    schema: 1,
    kind: 'R3 bounded ownership and memory observations; not an OOM guarantee or RC4 freeze',
    sourceCommit: git('rev-parse', 'HEAD'),
    dirtyWorkingTree: git('status', '--short') !== '',
    node: process.version,
    versions: process.versions,
    operatingSystem: process.platform,
    architecture: process.arch,
    profile,
    config: PROFILES[profile],
    seeds,
    gc,
    scenarioCount: scenarios(profile).length * seeds.length,
    freshProcessExecutions: 0,
    results: [],
    passed: false,
    memoryPolicy:
      'Exact logical ownership assertions; descriptive memory only. No memory size threshold decides success. Main and worker isolate metrics are separate; RSS is process-wide; arrayBuffers overlaps external.',
  };
  const reportPath = join(directory, 'report.json');
  const save = () =>
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(reportPath, '', { flag: 'wx' });
  save();
  const start = performance.now();
  campaignLoop: for (const n of seeds)
    for (const scenario of scenarios(profile)) {
      const id = `${scenario.id}-seed-${n}`;
      const configPath = join(directory, id + '.config.json');
      const resultPath = join(directory, id + '.result.json');
      const config = {
        ...scenario,
        ...PROFILES[profile],
        seed: n,
        profile,
        gc,
        sourceCommit: report.sourceCommit,
        output: resultPath,
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', {
        flag: 'wx',
      });
      const remainingMs = report.config.budgetMs - (performance.now() - start);
      if (remainingMs <= 0) {
        report.failure =
          'Campaign watchdog exhausted; remaining scenarios unqualified';
        save();
        break campaignLoop;
      }
      const child = spawnSync(
        process.execPath,
        [
          ...(gc === 'diagnostic' ? ['--expose-gc'] : []),
          fileURLToPath(new URL('./child.mjs', import.meta.url)),
          configPath,
        ],
        {
          encoding: 'utf8',
          timeout: Math.min(report.config.childTimeoutMs, remainingMs),
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PJS_DEBUG_RESERVATION_INVARIANTS: '1' },
        },
      );
      report.freshProcessExecutions++;
      writeFileSync(join(directory, id + '.stdout.txt'), child.stdout ?? '', {
        flag: 'wx',
      });
      writeFileSync(join(directory, id + '.stderr.txt'), child.stderr ?? '', {
        flag: 'wx',
      });
      let result;
      try {
        result = JSON.parse(readFileSync(resultPath, 'utf8'));
      } catch (error) {
        result = { passed: false, failure: error.message };
      }
      let validationFailure;
      if (result.passed) {
        try {
          assert.equal(result.sourceCommit, report.sourceCommit);
          assert.equal(result.dirtyWorkingTree, report.dirtyWorkingTree);
          assert.equal(result.node, report.node);
          assert.equal(result.platform, report.operatingSystem);
          assert.equal(result.arch, report.architecture);
          assert.deepEqual(result.config, config);
          assert.ok(result.samples.some((s) => s.phase === 'measurement'));
          assert.ok(
            result.checkpoints.length >= config.warmup + config.iterations,
          );
          assert.ok(result.threadTotals.created >= config.workers);
          assert.equal(
            result.threadTotals.created,
            result.threadTotals.confirmedExits,
          );
        } catch (error) {
          validationFailure = error.message;
        }
      }
      const entry = {
        id,
        config: configPath,
        result: resultPath,
        exitCode: child.status,
        signal: child.signal,
        error: child.error?.message,
        elapsedMs: result.elapsedMs,
        samples: result.samples?.length ?? 0,
        passed:
          child.status === 0 &&
          !child.error &&
          result.passed === true &&
          !validationFailure,
        failure: result.failure ?? validationFailure,
        replay: `node ${gc === 'diagnostic' ? '--expose-gc ' : ''}scripts/qualification/memory/child.mjs ${configPath} NEW-result.json`,
      };
      report.results.push(entry);
      save();
      console.log(
        JSON.stringify({
          id,
          passed: entry.passed,
          elapsedMs: entry.elapsedMs,
        }),
      );
      if (!entry.passed) break campaignLoop; // Preserve the original suspect before investigation.
    }
  report.elapsedMs = performance.now() - start;
  report.passed =
    report.results.length === report.scenarioCount &&
    report.results.every((r) => r.passed);
  save();
  console.log(
    JSON.stringify({
      passed: report.passed,
      report: reportPath,
      freshProcessExecutions: report.freshProcessExecutions,
      elapsedMs: report.elapsedMs,
    }),
  );
  return report;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await campaign(options());
  if (!report.passed) process.exitCode = 1;
}
