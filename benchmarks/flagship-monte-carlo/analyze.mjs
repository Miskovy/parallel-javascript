import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  summarize,
  speedup,
  efficiency,
  percentile,
  practicalWin,
} from './src/stats.mjs';
import { validateTrial } from './src/schema.mjs';
import { cells } from './src/campaign.mjs';

const key = (r) =>
  [
    r.stage,
    r.contender,
    r.transport,
    r.mode,
    r.problemSize,
    r.workers,
    r.chunks,
    r.simulations,
  ].join('|');
export function summary(rows) {
  const trials = rows.filter((r) => r.type === 'trial');
  trials.forEach(validateTrial);
  const groups = new Map();
  for (const trial of trials) {
    const id = key(trial);
    if (!groups.has(id)) groups.set(id, []);
    assert.ok(
      !groups.get(id).some((r) => r.trial === trial.trial),
      'Duplicate trial ID',
    );
    groups.get(id).push(trial);
  }
  const cells = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, attempts]) => {
      const runs = attempts.filter((r) => r.status === 'ok'),
        first = attempts[0];
      if (!runs.length)
        return {
          id,
          stage: first.stage,
          contender: first.contender,
          problemSize: first.problemSize,
          failures: attempts.length,
          n: 0,
        };
      const wall = summarize(runs.map((r) => r.wallMs));
      const med = (field) =>
        percentile(
          runs.map((r) => r[field]),
          0.5,
        );
      const event = (field) =>
        percentile(
          runs.map((r) => r.eventLoop[field]),
          0.5,
        );
      return {
        id,
        stage: first.stage,
        contender: first.contender,
        transport: first.transport,
        mode: first.mode,
        problemSize: first.problemSize,
        simulations: first.simulations,
        workers: first.workers,
        chunks: first.chunks,
        simulationsPerChunk: first.simulations / first.chunks,
        failures: attempts.length - runs.length,
        n: runs.length,
        wall,
        throughput: first.simulations / (wall.median / 1000),
        peakRssBytes: med('peakRssBytes'),
        highWaterRssBytes: med('processHighWaterRssBytes'),
        initialRssBytes: percentile(
          runs.map((r) => r.initialMemory.rss),
          0.5,
        ),
        finalRssBytes: percentile(
          runs.map((r) => r.finalMemory.rss),
          0.5,
        ),
        deltaRssBytes: med('deltaRssBytes'),
        heapUsedBytes: percentile(
          runs.map((r) => r.finalMemory.heapUsed),
          0.5,
        ),
        externalBytes: percentile(
          runs.map((r) => r.finalMemory.external),
          0.5,
        ),
        arrayBuffersBytes: percentile(
          runs.map((r) => r.finalMemory.arrayBuffers),
          0.5,
        ),
        cpuUserMs: med('cpuUserMs'),
        cpuSystemMs: med('cpuSystemMs'),
        cpuSecondsPerWallSecond: percentile(
          runs.map(
            (r) =>
              (r.cpuUserMs + r.cpuSystemMs) /
              (r.stage === 'cold'
                ? r.coldMs - r.sharedPreparationMs
                : r.computeEndToEndMs),
          ),
          0.5,
        ),
        timerP95Ms: event('timerP95Ms'),
        timerP99Ms: event('timerP99Ms'),
        timerMaxMs: event('timerMaxMs'),
        elu: event('elu'),
        taskP50Ms: percentile(
          runs.map((r) => r.taskLatency.p50),
          0.5,
        ),
        taskP95Ms: percentile(
          runs.map((r) => r.taskLatency.p95),
          0.5,
        ),
        taskP99Ms: percentile(
          runs.map((r) => r.taskLatency.p99),
          0.5,
        ),
        sharedPreparationMs: med('sharedPreparationMs'),
        modelGenerationMs: med('modelGenerationMs'),
        startupMs: med('startupMs'),
        firstResultMs: med('firstResultMs'),
        simulationMs: med('simulationMs'),
        reductionMs: med('reductionMs'),
        computeEndToEndMs: med('computeEndToEndMs'),
        validations: [
          ...new Set(
            runs.map(
              (r) =>
                `${r.resultValidation.count}:${r.resultValidation.checksum}`,
            ),
          ),
        ],
      };
    });
  for (const cell of cells.filter((c) => c.wall)) {
    const serial = cells.find(
      (s) =>
        s.stage === 'primary' &&
        s.contender === 'serial' &&
        s.problemSize === cell.problemSize &&
        s.mode === cell.mode &&
        s.wall,
    );
    cell.speedup = serial
      ? speedup(serial.wall.median, cell.wall.median)
      : null;
    cell.efficiency =
      serial && cell.contender !== 'serial'
        ? efficiency(serial.wall.median, cell.wall.median, cell.workers)
        : null;
  }
  const comparisons = [];
  for (const size of ['small', 'medium', 'large']) {
    const primary = cells.filter(
      (c) => c.stage === 'primary' && c.problemSize === size && c.wall,
    );
    const counts = [
      ...new Set(
        primary.filter((c) => c.contender !== 'serial').map((c) => c.workers),
      ),
    ];
    for (const p of counts) {
      const candidates = primary.filter(
        (c) => c.workers === p || c.contender === 'serial',
      );
      for (let i = 0; i < candidates.length; i++)
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i],
            b = candidates[j];
          comparisons.push({
            size,
            workers: p,
            a: a.contender,
            b: b.contender,
            winner: practicalWin(a.wall, b.wall)
              ? a.contender
              : practicalWin(b.wall, a.wall)
                ? b.contender
                : null,
            ratioAoverB: a.wall.median / b.wall.median,
          });
        }
    }
  }
  return {
    trials: trials.length,
    failures: trials.filter((r) => r.status === 'failure').length,
    cells,
    comparisons,
  };
}

const f = (x, digits = 2) =>
  x === null || x === undefined ? '—' : x.toFixed(digits);
function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function markdown(report, header) {
  const rows = report.cells.filter((c) => c.wall);
  const parts = [
    `# Generated flagship Monte Carlo analysis`,
    `Source campaign: \`${header.id}\`. Profile: **${header.profile}**.`,
    `Trials: ${report.trials}. Explicit failures: ${report.failures}. All trials retained.`,
    'Intervals: deterministic 2,000-resample median bootstrap 95% intervals; practical winner requires >5% advantage and non-overlap. These descriptive comparisons do not establish equivalence or corrected significance.',
  ];
  if (header.profile === 'smoke')
    parts.push('**Smoke data are validation only, not performance evidence.**');
  for (const stage of [
    'primary',
    'grain',
    'transport',
    'distribution',
    'cold',
    'calibration',
    'smoke',
  ]) {
    const data = rows.filter((c) => c.stage === stage);
    if (!data.length) continue;
    parts.push(
      `## ${stage}`,
      table(
        [
          'Size',
          'Runtime',
          'Transport',
          'Mode',
          'p',
          'Chunks',
          'Paths/chunk',
          'Median ms',
          '95% interval ms',
          'Min ms',
          'Max ms',
          'Mean ms',
          'SD ms',
          'CV',
          'IQR ms',
          'Sims/s',
          'Speedup',
          'Efficiency',
          'Peak RSS MiB',
          'Task p50/p95/p99 ms',
          'Failures',
        ],
        data.map((c) => [
          c.problemSize,
          c.contender,
          c.transport,
          c.mode,
          c.workers,
          c.chunks,
          f(c.simulationsPerChunk, 1),
          f(c.wall.median),
          c.wall.ci95.map((x) => f(x)).join('–'),
          f(c.wall.minimum),
          f(c.wall.maximum),
          f(c.wall.mean),
          f(c.wall.sd),
          f(c.wall.cv, 3),
          f(c.wall.iqr),
          f(c.throughput, 0),
          f(c.speedup),
          f(c.efficiency, 3),
          f(c.peakRssBytes / 2 ** 20, 1),
          [c.taskP50Ms, c.taskP95Ms, c.taskP99Ms].map((x) => f(x)).join('/'),
          c.failures,
        ]),
      ),
    );
  }
  const large = rows.filter(
    (c) => c.stage === 'primary' && c.problemSize === 'large',
  );
  if (large.length) {
    parts.push(
      '## Event loop and CPU — large primary',
      table(
        [
          'Runtime',
          'p',
          'Median ms',
          'Timer p95 ms',
          'Timer p99 ms',
          'Timer max ms',
          'ELU',
          'User CPU ms',
          'System CPU ms',
          'CPU seconds/wall second',
        ],
        large.map((c) => [
          c.contender,
          c.workers,
          f(c.wall.median),
          f(c.timerP95Ms),
          f(c.timerP99Ms),
          f(c.timerMaxMs),
          f(c.elu, 3),
          f(c.cpuUserMs),
          f(c.cpuSystemMs),
          f(c.cpuSecondsPerWallSecond, 3),
        ]),
      ),
    );
    parts.push(
      '## Memory — large primary',
      table(
        [
          'Runtime',
          'p',
          'Initial RSS MiB',
          'Peak RSS MiB',
          'Final RSS MiB',
          'Delta RSS MiB',
          'Process high-water MiB',
          'Host heap MiB',
          'Host external MiB',
          'Host arrayBuffers MiB',
        ],
        large.map((c) => [
          c.contender,
          c.workers,
          ...[
            'initialRssBytes',
            'peakRssBytes',
            'finalRssBytes',
            'deltaRssBytes',
            'highWaterRssBytes',
            'heapUsedBytes',
            'externalBytes',
            'arrayBuffersBytes',
          ].map((k) => f(c[k] / 2 ** 20, 1)),
        ]),
      ),
    );
  }
  const transport = rows.filter(
    (c) => c.stage === 'transport' && c.transport === 'clone',
  );
  if (transport.length)
    parts.push(
      '## Transport pairing and setup amortization',
      table(
        [
          'Size',
          'Runtime',
          'p',
          'Clone ms',
          'Shared ms',
          'Shared/clone',
          'Clone RSS MiB',
          'Shared RSS MiB',
          'Shared setup ms',
          'Break-even whole runs',
          'Interpretation',
        ],
        transport.map((clone) => {
          const shared = rows.find(
            (c) =>
              c.stage === 'transport' &&
              c.problemSize === clone.problemSize &&
              c.contender === clone.contender &&
              c.transport === 'shared',
          );
          if (!shared)
            return [
              clone.problemSize,
              clone.contender,
              clone.workers,
              f(clone.wall.median),
              'missing',
              '—',
              '—',
              '—',
              '—',
              '—',
              'incomplete',
            ];
          const saving = clone.wall.median - shared.wall.median;
          return [
            clone.problemSize,
            clone.contender,
            clone.workers,
            f(clone.wall.median),
            f(shared.wall.median),
            f(shared.wall.median / clone.wall.median, 3),
            f(clone.peakRssBytes / 2 ** 20, 1),
            f(shared.peakRssBytes / 2 ** 20, 1),
            f(shared.sharedPreparationMs, 3),
            practicalWin(shared.wall, clone.wall) && saving > 0
              ? Math.max(1, Math.ceil(shared.sharedPreparationMs / saving))
              : 'uncertain',
            practicalWin(shared.wall, clone.wall)
              ? 'shared advantage'
              : practicalWin(clone.wall, shared.wall)
                ? 'clone advantage'
                : 'uncertain',
          ];
        }),
      ),
    );
  const boundaries = rows.filter((c) =>
    ['cold', 'distribution'].includes(c.stage),
  );
  if (boundaries.length)
    parts.push(
      '## Timing boundaries',
      table(
        [
          'Stage',
          'Runtime',
          'p',
          'Model ms',
          'Shared prep ms',
          'Startup ms',
          'First result ms',
          'Simulation ms',
          'Reduction/sort ms',
          'Compute + reduction ms',
          'Wall metric ms',
        ],
        boundaries.map((c) => [
          c.stage,
          c.contender,
          c.workers,
          ...[
            'modelGenerationMs',
            'sharedPreparationMs',
            'startupMs',
            'firstResultMs',
            'simulationMs',
            'reductionMs',
            'computeEndToEndMs',
          ].map((k) => f(c[k])),
          f(c.wall.median),
        ]),
      ),
    );
  if (report.comparisons.length)
    parts.push(
      '## Preregistered primary pairwise classifications',
      table(
        ['Size', 'p', 'A', 'B', 'A/B time', 'Practical winner'],
        report.comparisons.map((c) => [
          c.size,
          c.workers,
          c.a,
          c.b,
          f(c.ratioAoverB, 3),
          c.winner ?? 'indistinguishable/uncertain',
        ]),
      ),
    );
  return parts.join('\n\n') + '\n';
}

export async function analyze(path) {
  const rows = (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const header = rows.find((r) => r.type === 'campaign');
  assert.ok(header);
  const report = summary(rows);
  report.complete = rows.some(
    (r) => r.type === 'completion' || r.type === 'calibration',
  );
  if (header.profile === 'full') {
    const expected = cells(
      'full',
      header.config,
      header.environment.availableParallelism,
    );
    report.expectedTrials = expected.length * header.config.trials;
    report.complete &&=
      report.trials === report.expectedTrials &&
      expected.every((c) =>
        report.cells.some(
          (r) => r.id === key(c) && r.n + r.failures === header.config.trials,
        ),
      );
  }
  const stem = path.replace(/\.jsonl$/, '');
  await writeFile(
    `${stem}-summary.json`,
    JSON.stringify(
      { campaign: header.id, complete: report.complete, ...report },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  await writeFile(
    `${stem}-tables.md`,
    markdown(report, header) + `\nCampaign complete: **${report.complete}**.\n`,
    { flag: 'wx' },
  );
  console.log(`Analysis: ${stem}-summary.json and ${stem}-tables.md`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Provide retained JSONL path');
  await analyze(process.argv[2]);
}
