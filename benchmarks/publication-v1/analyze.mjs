import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarize, practicalWin } from './src/historical/stats.mjs';
import { json, verifyManifest, writeJson, sha256 } from './lib.mjs';

export function analyze(input) {
  verifyManifest(input);
  const freeze = json(join(input, 'freeze.json'));
  const run = json(join(input, 'run.json'));
  const packages = json(join(input, 'packages.json'));
  const records = readFileSync(join(input, 'raw.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((s) => JSON.parse(s));
  assert.equal(
    new Set(records.map((r) => r.id)).size,
    records.length,
    'Duplicate records',
  );
  const planned = new Map(freeze.jobs.map((j) => [j.id, j]));
  for (const r of records) {
    const job = planned.get(r.id);
    assert.ok(job, 'Unplanned record');
    for (const key of ['contender', 'trial', 'spec', 'profile'])
      assert.deepEqual(r.job[key], job[key]);
  }
  const rows = [];
  for (const spec of freeze.matrix.cases)
    for (const contender of freeze.config.contenders) {
      const all = records.filter(
        (r) => r.job.spec.id === spec.id && r.job.contender === contender,
      );
      const valid = all.filter(
        (r) =>
          r.result.status === 'passed' &&
          r.process.exitCode === 0 &&
          !r.process.timedOut &&
          r.result.cleanup === 'awaited',
      );
      const measured = valid.map((r) =>
        r.result.phases.find((p) => p.phase === 'measured'),
      );
      assert.ok(
        measured.every((m) => Number.isFinite(m?.wallMs) && m.wallMs > 0),
      );
      const stat = (values) => (values.length ? summarize(values) : null);
      const row = {
        case: spec.id,
        spec,
        contender,
        status:
          valid.length === freeze.trials && all.length === freeze.trials
            ? 'complete'
            : 'failed-or-missing',
        planned: freeze.trials,
        n: valid.length,
        failures: all
          .filter((r) => !valid.includes(r))
          .map((r) => ({
            id: r.id,
            error: r.result.error,
            timedOut: r.process.timedOut,
          })),
        wallMs: stat(measured.map((m) => m.wallMs)),
        preparationMs: stat(measured.map((m) => m.preparationMs)),
        coldFirstResultMs: stat(
          valid.map((r) => r.result.cold.firstUsefulResultMs),
        ),
        coldCompletedMs: stat(
          valid.map((r) => r.result.cold.completedWorkloadMs),
        ),
        sampledRssMiB: stat(
          measured.map((m) => m.metrics.sampledPeakRssBytes / 1024 ** 2),
        ),
        timerP95Ms: stat(
          measured
            .map((m) => m.metrics.timer.p95Ms)
            .filter((v) => Number.isFinite(v)),
        ),
        timerMaxMs: stat(
          measured
            .map((m) => m.metrics.timer.maxMs)
            .filter((v) => Number.isFinite(v)),
        ),
        timerSamplesPerTrial: measured.map((m) => m.metrics.timer.n),
      };
      if (row.wallMs)
        row.throughputPerSecond = (spec.count * 1000) / row.wallMs.median;
      rows.push(row);
    }
  for (const row of rows) {
    const baseline = rows.find(
      (r) => r.case === row.case && r.contender === 'serial',
    );
    row.serialSpeedup =
      row.wallMs && baseline.wallMs
        ? baseline.wallMs.median / row.wallMs.median
        : null;
    row.versusSerial =
      freeze.profile !== 'publication'
        ? 'smoke: no performance inference'
        : row.status !== 'complete' || baseline.status !== 'complete'
          ? 'correctness failure or missing data'
          : row.contender === 'serial'
            ? 'matching chunked baseline'
            : practicalWin(row.wallMs, baseline.wallMs)
              ? 'clear practical improvement'
              : practicalWin(baseline.wallMs, row.wallMs)
                ? 'clear practical loss'
                : 'small/noisy difference';
    row.peerComparisons = rows
      .filter((r) => r.case === row.case && r.contender !== row.contender)
      .map((peer) => ({
        contender: peer.contender,
        medianRatio:
          row.wallMs && peer.wallMs
            ? row.wallMs.median / peer.wallMs.median
            : null,
        assessment:
          freeze.profile !== 'publication'
            ? 'smoke: no performance inference'
            : row.status !== 'complete' || peer.status !== 'complete'
              ? 'failed/missing'
              : practicalWin(row.wallMs, peer.wallMs)
                ? 'clear practical improvement'
                : practicalWin(peer.wallMs, row.wallMs)
                  ? 'clear practical loss'
                  : 'small/noisy difference',
      }));
  }
  const eligible =
    freeze.profile === 'publication' &&
    run.status === 'passed' &&
    !freeze.source.status &&
    records.length === freeze.jobs.length &&
    rows.every(
      (r) => r.status === 'complete' && r.n >= 10 && r.timerP95Ms?.n === r.n,
    );
  const breakEven = freeze.config.contenders
    .filter((c) => c !== 'serial')
    .map((contender) => ({
      contender,
      monte: rows
        .filter(
          (r) =>
            r.contender === contender &&
            r.spec.family === 'monte' &&
            r.spec.study === 'primary',
        )
        .map((r) => ({
          count: r.spec.count,
          assessment: r.versusSerial,
          speedup: r.serialSpeedup,
        })),
      numerical: rows
        .filter(
          (r) => r.contender === contender && r.spec.family === 'numerical',
        )
        .map((r) => ({
          chunkSize: r.spec.chunkSize,
          batch: r.spec.batch,
          assessment: r.versusSerial,
          speedup: r.serialSpeedup,
        })),
    }));
  return {
    schema: 1,
    publicationEligible: eligible,
    profile: freeze.profile,
    limitation: eligible
      ? 'Single-host synthetic JavaScript kernels; descriptive uncertainty; see SPEC.md'
      : 'Smoke evidence from a managed Windows session with unverified background/power conditions; no publication performance claims',
    rawManifestSha256: sha256(join(input, 'manifest.json')),
    freeze,
    packages,
    run,
    rows,
    breakEven,
  };
}

export function reportMarkdown(data) {
  const lines = [
    '# JavaScript worker pools: campaign results',
    '',
    `**${data.publicationEligible ? 'Publication campaign' : 'SMOKE ONLY — no competitor ranking or performance claim'}**`,
    '',
    data.limitation,
    '',
    `Node ${data.packages.node.version}; ${data.freeze.environment.cpuModel}; ${data.freeze.environment.os}/${data.freeze.environment.arch}; primary workers ${data.freeze.matrix.primary}; trials per cell ${data.freeze.trials}.`,
    '',
    'Packages: @pjavascript/runtime 1.0.0; Piscina 5.3.2; Tinypool 2.2.0; workerpool 10.0.3; raw node:worker_threads; serial.',
    '',
    `Source ${data.freeze.source.commit}; frozen plan and source digests in freeze.json; registry artifacts and host/worker entry paths in packages.json and children/*.result.json.`,
    '',
    'Warm wall time includes dispatch, input transport, required output transport, collection and reduction/assembly. Input generation/halo preparation is separate. Serial uses identical logical chunking and batched tasks, with no worker transport. Each speedup is matching-case serial median / contender median. Intervals are seeded 2,000-resample percentile 95% bootstrap intervals of the median; descriptive, not corrected significance tests.',
    '',
    'Cold means imported-host pool construction/readiness through first useful chunk or completed workload, before warmups. It excludes process launch, module imports, oracle loading and input preparation. Sampled RSS is whole-process observational memory (10 ms plus endpoints), may miss peaks, and includes all workers. Timer results summarize per-trial p95 drift of a 10 ms sentinel; arming and flushing expose synchronous serial blocking. Short cases have few samples; retain max and sample counts alongside p95.',
    '',
    '| Case | Contender | n/status | Warm ms [95% interval] | CV | Prep ms | Cold first / all ms | Units/s | Serial speedup | Timer p95 / max ms | Sampled RSS MiB | Assessment |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];
  const f = (v) => (v === null || v === undefined ? 'NA' : v.toFixed(3));
  for (const r of data.rows)
    lines.push(
      `| ${r.case} | ${r.contender} | ${r.n}/${r.status} | ${f(r.wallMs?.median)} [${r.wallMs?.ci95.map(f).join(', ') ?? 'NA'}] | ${f(r.wallMs?.cv)} | ${f(r.preparationMs?.median)} | ${f(r.coldFirstResultMs?.median)} / ${f(r.coldCompletedMs?.median)} | ${f(r.throughputPerSecond)} | ${f(r.serialSpeedup)} | ${f(r.timerP95Ms?.median)} / ${f(r.timerMaxMs?.median)} | ${f(r.sampledRssMiB?.median)} | ${r.versusSerial} |`,
    );
  lines.push(
    '',
    '## Losses, overhead and break-even',
    '',
    data.publicationEligible
      ? 'The following records include every primary size and every numerical grain, including losses and uncertain cells. A crossover is bounded by sampled sizes; no interpolation or universal break-even is inferred.'
      : 'Reduced smoke sizes validate the harness only. They cannot establish losses, winners or break-even points. The publication command runs the frozen full sizes and ten independent trials per cell.',
    '',
  );
  if (data.publicationEligible)
    for (const c of data.breakEven)
      lines.push(
        `- ${c.contender}: ` +
          [
            ...c.monte.map(
              (r) => `${r.count} Monte Carlo paths: ${r.assessment}`,
            ),
            ...c.numerical.map(
              (r) => `grain ${r.chunkSize}, batch ${r.batch}: ${r.assessment}`,
            ),
          ].join('; ') +
          '.',
      );
  lines.push(
    '',
    'No aggregate score is calculated. See summary.json for every peer comparison, timer sample count, variability, scaling cell, failure and descriptive interval. Throughput does not establish reliability or feature completeness. Image results concern this JavaScript stencil, with no claim about native codecs or GPUs.',
    '',
  );
  return lines.join('\n');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [inputArg, outputArg] = process.argv.slice(2);
  assert.ok(
    inputArg && outputArg,
    'Usage: node analyze.mjs RAW_DIRECTORY NEW_ANALYSIS_DIRECTORY',
  );
  const data = analyze(resolve(inputArg));
  const output = resolve(outputArg);
  mkdirSync(output);
  writeJson(join(output, 'summary.json'), data);
  writeFileSync(join(output, 'REPORT.md'), reportMarkdown(data), {
    flag: 'wx',
  });
  const columns = [
    'case',
    'contender',
    'status',
    'n',
    'warm_ms',
    'ci_low_ms',
    'ci_high_ms',
    'cv',
    'prep_ms',
    'cold_first_ms',
    'cold_all_ms',
    'units_per_s',
    'serial_speedup',
    'timer_p95_ms',
    'timer_max_ms',
    'sampled_rss_mib',
  ];
  const csv =
    [
      columns.join(','),
      ...data.rows.map((r) =>
        [
          r.case,
          r.contender,
          r.status,
          r.n,
          r.wallMs?.median,
          r.wallMs?.ci95[0],
          r.wallMs?.ci95[1],
          r.wallMs?.cv,
          r.preparationMs?.median,
          r.coldFirstResultMs?.median,
          r.coldCompletedMs?.median,
          r.throughputPerSecond,
          r.serialSpeedup,
          r.timerP95Ms?.median,
          r.timerMaxMs?.median,
          r.sampledRssMiB?.median,
        ].join(','),
      ),
    ].join('\n') + '\n';
  writeFileSync(join(output, 'results.csv'), csv, { flag: 'wx' });
  console.log(
    JSON.stringify({
      output,
      publicationEligible: data.publicationEligible,
      rows: data.rows.length,
    }),
  );
}
