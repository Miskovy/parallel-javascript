import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  generate,
  GENERATOR_VERSION,
  PROFILES,
} from '../../../packages/runtime/test/helpers/lifecycle-generator.mjs';
import { MODEL_VERSION } from '../../../packages/runtime/test/helpers/lifecycle-model.mjs';
import {
  runHistory,
  reduceHistory,
} from '../../../packages/runtime/test/helpers/lifecycle-runner.mjs';

export function options(allowed) {
  const result = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    assert.ok(match && allowed.includes(match[1]), 'Unknown argument: ' + arg);
    assert.ok(
      !Object.hasOwn(result, match[1]),
      'Duplicate option: ' + match[1],
    );
    result[match[1]] = match[2];
  }
  return result;
}
export async function campaign({
  profile = 'standard',
  seed,
  caseId,
  history,
  output,
  reduce = true,
} = {}) {
  assert.ok(Object.hasOwn(PROFILES, profile), 'Unknown profile');
  const start = performance.now();
  const root = resolve('.node-tools/r2');
  mkdirSync(root, { recursive: true });
  const directory = output
    ? resolve(output)
    : mkdtempSync(join(root, profile + '-'));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'report.json');
  writeFileSync(path, '', { flag: 'wx' });
  const report = {
    schema: 1,
    kind: 'R2 controlled host interleavings; not exhaustive formal verification or npm release qualification',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    dirtyWorkingTree:
      execFileSync('git', ['status', '--short'], {
        encoding: 'utf8',
      }).trim() !== '',
    node: process.version,
    versions: process.versions,
    operatingSystem: process.platform,
    architecture: process.arch,
    generatorVersion: GENERATOR_VERSION,
    modelVersion: MODEL_VERSION,
    profile,
    seedList: seed ? [seed] : PROFILES[profile].seeds,
    historyCount: 0,
    actionCount: 0,
    transitionCoverage: {},
    invariantChecks: {},
    failedHistories: [],
    replayCommands: [],
    minimizedCases: [],
    realWorkerChecks: [],
    invariantNegativeDetection: [],
    cleanupChecks: [],
    replayValidation: [],
    histories: [],
    passed: false,
    memoryBefore: process.memoryUsage(),
    memoryPolicy:
      'Logical ownership must reach zero. RSS/heap/external/arrayBuffers diagnostics are not return-to-baseline assertions.',
  };
  const save = () =>
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  save();
  const cases = history
    ? [history]
    : report.seedList.flatMap((n) =>
        Array.from(
          { length: caseId === undefined ? PROFILES[profile].cases : 1 },
          (_, i) => generate(n, caseId ?? i, profile),
        ),
      );
  for (const h of cases) {
    const name = `seed-${h.seed}-case-${h.caseId}`;
    writeFileSync(
      join(directory, name + '.history.json'),
      JSON.stringify(h, null, 2) + '\n',
      { flag: 'wx' },
    );
    let evidence;
    try {
      evidence = await runHistory(h);
    } catch (error) {
      evidence = error.evidence ?? {
        passed: false,
        failure: { message: error.message },
        actions: h.actions,
      };
      report.failedHistories.push({
        seed: h.seed,
        caseId: h.caseId,
        invariant: evidence.firstFailingInvariant,
        failure: evidence.failure,
      });
      if (reduce && evidence.firstFailingInvariant) {
        const reduced = await reduceHistory(h, evidence.firstFailingInvariant);
        const reducedPath = join(directory, name + '.minimized.json');
        writeFileSync(
          reducedPath,
          JSON.stringify(reduced.history, null, 2) + '\n',
          { flag: 'wx' },
        );
        report.minimizedCases.push({
          ...reduced,
          history: undefined,
          path: reducedPath,
          replayCommand: `npm run test:r2:replay -- --history=${reducedPath}`,
        });
      }
    }
    writeFileSync(
      join(directory, name + '.observations.json'),
      JSON.stringify(evidence, null, 2) + '\n',
      { flag: 'wx' },
    );
    report.historyCount++;
    report.actionCount += h.actions.length;
    for (const field of ['transitionCoverage', 'invariantChecks'])
      for (const [key, n] of Object.entries(evidence[field] ?? {}))
        report[field][key] = (report[field][key] ?? 0) + n;
    report.histories.push({
      seed: h.seed,
      caseId: h.caseId,
      passed: evidence.passed,
      actions: h.actions.length,
    });
    report.cleanupChecks.push({
      seed: h.seed,
      caseId: h.caseId,
      passed: evidence.cleanup,
    });
    report.replayCommands.push(evidence.replayCommand);
    save();
  }
  // A second execution checks semantic observations, excluding timing/memory/UUIDs.
  if (!report.failedHistories.length && cases.length) {
    const h = cases[0];
    try {
      if (!history)
        assert.deepEqual(
          generate(h.seed, h.caseId, h.profile).actions,
          h.actions,
        );
      const repeat = await runHistory(h);
      const first = JSON.parse(
        readFileSync(
          join(directory, `seed-${h.seed}-case-${h.caseId}.observations.json`),
          'utf8',
        ),
      );
      assert.deepEqual(repeat.observations, first.observations);
      report.replayValidation.push({
        seed: h.seed,
        caseId: h.caseId,
        passed: true,
      });
    } catch (error) {
      report.replayValidation.push({ passed: false, error: error.message });
    }
  }
  if (!history) {
    const real = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../../packages/runtime/test/model-real-worker.test.mjs',
            import.meta.url,
          ),
        ),
      ],
      {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          PJS_R2_REAL_REPORT: join(directory, 'real-workers.json'),
        },
      },
    );
    try {
      report.realWorkerChecks = JSON.parse(
        readFileSync(join(directory, 'real-workers.json'), 'utf8'),
      );
    } catch (error) {
      report.realWorkerChecks = [{ passed: false, error: error.message }];
    }
    report.realWorkerProcess = {
      exitCode: real.status,
      error: real.error?.message,
      output: (real.stdout ?? '') + (real.stderr ?? ''),
    };
    const negative = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../../packages/runtime/test/model-lifecycle.test.mjs',
            import.meta.url,
          ),
        ),
      ],
      {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          PJS_R2_NEGATIVE_REPORT: join(directory, 'negative-detection.json'),
        },
      },
    );
    try {
      report.invariantNegativeDetection = JSON.parse(
        readFileSync(join(directory, 'negative-detection.json'), 'utf8'),
      );
    } catch (error) {
      report.invariantNegativeDetection = [
        { passed: false, error: error.message },
      ];
    }
    report.negativeDetectionProcess = {
      exitCode: negative.status,
      error: negative.error?.message,
      output: (negative.stdout ?? '') + (negative.stderr ?? ''),
    };
  }
  report.elapsedMs = performance.now() - start;
  report.memoryAfter = process.memoryUsage();
  report.passed =
    !report.failedHistories.length &&
    report.cleanupChecks.every((c) => c.passed) &&
    report.replayValidation.every((c) => c.passed) &&
    (!report.realWorkerProcess || report.realWorkerProcess.exitCode === 0);
  if (report.negativeDetectionProcess)
    report.passed &&= report.negativeDetectionProcess.exitCode === 0;
  save();
  console.log(
    JSON.stringify({
      passed: report.passed,
      report: path,
      histories: report.historyCount,
      actions: report.actionCount,
      elapsedMs: report.elapsedMs,
    }),
  );
  return report;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const opt = options(['profile', 'seed', 'case', 'output']);
  const report = await campaign({
    profile: opt.profile,
    seed: opt.seed === undefined ? undefined : Number(opt.seed),
    caseId: opt.case === undefined ? undefined : Number(opt.case),
    output: opt.output,
  });
  if (!report.passed) process.exitCode = 1;
}
