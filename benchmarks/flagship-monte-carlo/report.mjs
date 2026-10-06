import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { practicalWin, percentile } from './src/stats.mjs';

const fmt = (x, digits = 2) => (x == null ? '—' : Number(x).toFixed(digits));
const table = (head, rows) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');

export async function report(path, outcome, calibrationFile, outputPath) {
  if (!['A', 'B', 'C', 'D'].includes(outcome))
    throw new Error('Provide reviewed outcome A/B/C/D');
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const rows = (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  const header = rows[0];
  if (header.profile !== 'full')
    throw new Error('Report requires full campaign');
  const stem = path.replace(/\.jsonl$/, '');
  const analysis = JSON.parse(await readFile(`${stem}-summary.json`, 'utf8'));
  const tables = await readFile(`${stem}-tables.md`, 'utf8');
  const cells = analysis.cells.filter((c) => c.wall);
  const e = header.environment,
    c = header.config;
  // Caller chooses explicit immutable calibration file, never a moving glob.
  if (!calibrationFile) throw new Error('Provide calibration JSONL path');
  const calibrationRows = (await readFile(calibrationFile, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  const calibration = calibrationRows.find((r) => r.type === 'calibration');
  if (!calibration) throw new Error('No serial calibration freeze');
  for (const size of ['small', 'medium', 'large'])
    if (calibration.sizes[size] !== c.sizes[size])
      throw new Error('Calibration disagrees with campaign');
  const rawLink = '../../' + relative(repository, path);
  const analysisLink = '../../' + relative(repository, `${stem}-tables.md`);
  const summaryLink = '../../' + relative(repository, `${stem}-summary.json`);
  const calibrationLink = '../../' + relative(repository, calibrationFile);
  const primary = cells.filter((x) => x.stage === 'primary');
  const large = primary.filter((x) => x.problemSize === 'large');
  const sections = [];
  const add = (title, text) => sections.push(`## ${title}\n\n${text}`);
  const compare = (runtime, opposite = false) => {
    const comparisons = analysis.comparisons.filter((x) =>
      opposite
        ? (x.a === runtime || x.b === runtime) &&
          x.winner &&
          x.winner !== runtime
        : x.winner === runtime,
    );
    if (!comparisons.length)
      return 'No primary pairwise comparison met the preregistered practical-win rule. This does not establish equivalence or exclude smaller differences.';
    return (
      table(
        ['Size', 'Workers', 'Comparison', 'Practical winner'],
        comparisons.map((x) => [
          x.size,
          x.workers,
          `${x.a} vs ${x.b}`,
          x.winner,
        ]),
      ) +
      '\n\nSerial comparisons are repeated at each corresponding worker count. A worker victory at one count is not a victory at every count. These are descriptive comparisons without correction for multiple testing.'
    );
  };
  const secondary = [];
  const peerCells = cells.filter((x) =>
    ['grain', 'transport', 'cold', 'distribution'].includes(x.stage),
  );
  for (let i = 0; i < peerCells.length; i++)
    for (let j = i + 1; j < peerCells.length; j++) {
      const a = peerCells[i],
        b = peerCells[j];
      if (
        a.stage !== b.stage ||
        a.problemSize !== b.problemSize ||
        a.transport !== b.transport ||
        a.mode !== b.mode
      )
        continue;
      if (a.contender === b.contender) continue;
      if (
        a.contender !== 'serial' &&
        b.contender !== 'serial' &&
        (a.workers !== b.workers || a.chunks !== b.chunks)
      )
        continue;
      const winner = practicalWin(a.wall, b.wall)
        ? a.contender
        : practicalWin(b.wall, a.wall)
          ? b.contender
          : null;
      if (winner)
        secondary.push({
          stage: a.stage,
          size: a.problemSize,
          transport: a.transport,
          workers: Math.max(a.workers, b.workers),
          chunks: Math.max(a.chunks, b.chunks),
          a: a.contender,
          b: b.contender,
          winner,
        });
    }
  const secondaryText = (runtime, loss = false) => {
    const data = secondary.filter((x) =>
      loss
        ? (x.a === runtime || x.b === runtime) && x.winner !== runtime
        : x.winner === runtime,
    );
    if (!data.length)
      return '\n\nNo additional peer-runtime comparison in the secondary stages met the same practical-win rule.';
    return (
      '\n\nSecondary-stage practical comparisons (kept separate from the headline):\n\n' +
      table(
        ['Stage', 'Size', 'Transport', 'p', 'Chunks', 'Pair', 'Winner'],
        data.map((x) => [
          x.stage,
          x.size,
          x.transport,
          x.workers,
          x.chunks,
          `${x.a} / ${x.b}`,
          x.winner,
        ]),
      )
    );
  };
  const serial = (size) =>
    primary.find((x) => x.contender === 'serial' && x.problemSize === size);
  const coarsePjs = large.filter(
    (x) => x.contender === 'pjs' && x.workers >= 2,
  );
  const pjsUseful = coarsePjs.some((x) =>
    practicalWin(x.wall, serial('large').wall),
  );
  const pjsMedianLosses = primary
    .filter((x) => x.contender === 'pjs')
    .flatMap((pjs) =>
      primary
        .filter(
          (peer) =>
            peer.contender !== 'pjs' &&
            peer.problemSize === pjs.problemSize &&
            (peer.workers === pjs.workers || peer.contender === 'serial') &&
            pjs.wall.median > peer.wall.median * 1.05,
        )
        .map((peer) => [
          pjs.problemSize,
          pjs.workers,
          peer.contender,
          fmt(pjs.wall.median),
          fmt(peer.wall.median),
          fmt(100 * (pjs.wall.median / peer.wall.median - 1), 1) + '%',
          practicalWin(peer.wall, pjs.wall)
            ? 'practical loss'
            : 'median disadvantage; intervals overlap',
        ]),
    );
  const workerUseful = ['raw', 'piscina', 'pjs'].every((runtime) =>
    large.some(
      (x) =>
        x.contender === runtime &&
        x.workers >= 2 &&
        practicalWin(x.wall, serial('large').wall),
    ),
  );
  const transports = cells
    .filter((x) => x.stage === 'transport' && x.transport === 'clone')
    .map((clone) => ({
      clone,
      shared: cells.find(
        (x) =>
          x.stage === 'transport' &&
          x.transport === 'shared' &&
          x.contender === clone.contender &&
          x.problemSize === clone.problemSize,
      ),
    }));
  const sharedWins = transports.filter(
    ({ clone, shared }) => shared && practicalWin(shared.wall, clone.wall),
  );
  add(
    'Question',
    'Under what characteristics does public PJS offer useful performance, scaling, memory transport and host isolation against serial JavaScript, persistent raw worker_threads and Piscina? This is a synthetic single-host evidence campaign; it is not a universal JavaScript speed claim.',
  );
  add(
    'Hypotheses',
    'The immutable preregistration is in the [benchmark README](../../benchmarks/flagship-monte-carlo/README.md#preregistered-hypotheses), committed before parallel performance collection. Hypotheses are evaluated below without rewriting them.',
  );
  add(
    'Workload',
    `A synthetic delta-gamma portfolio with **${c.factors} factors**, **${c.positions} positions**, seed **${c.seed} (0x${c.seed.toString(16)})** and **149,504 numeric model bytes**. Off-diagonal factor correlation is 0.2; the model uses its Cholesky factor, position loadings, delta and gamma Float64 arrays. Each independently indexed path generates normal shocks, correlates them and evaluates every position: delta × shock + 0.5 × gamma × shock². Work is O(positions × factors) per path.`,
  );
  add(
    'Why this workload',
    'Reusable numeric inputs, independent paths, nontrivial arithmetic and risk-distribution outputs provide understandable CPU work without artificial busy loops. The nonlinear gamma term prevents collapse to one linear portfolio dot product. A specialized implementation could preaggregate this fixed quadratic model into factor-space coefficients; that would change the benchmark algorithm and is outside this runtime comparison. The results do not imply the chosen algorithm is the fastest possible financial model.',
  );
  add(
    'Determinism',
    'A fixed 32-bit hash-counter generator uses seed, absolute path index and random dimension, then Box-Muller normals. No Math.random or mutable per-worker stream. Chunk IDs restore logical order. Neumaier-style compensated sums reduce rounding loss; path-bit additive checksums are order-independent. The PRNG is a reproducibility device, not a cryptographic generator or independently qualified financial simulation engine.',
  );
  add(
    'Competitors and public provenance',
    table(
      [
        'Package',
        'Exact version',
        'Resolved package.json',
        'Registry artifact',
      ],
      Object.values(header.provenance.packages).map((p) => [
        p.name,
        p.version,
        `\`${p.packagePath}\``,
        p.resolved,
      ]),
    ) +
      `\n\nRequested tag: \`${header.provenance.requestedTag}\`; resolved tag: \`${header.provenance.resolvedTag}\`. Registry: \`${header.provenance.registry}\`. Integrity and tarball metadata are retained in the raw header and exact consumer lock. Real import resolution and realpath assertions reject workspace links. Raw uses persistent fixed workers with readiness, FIFO dispatch and one active task per worker; Piscina and PJS use only public APIs.`,
  );
  add(
    'Fairness rules and neutral grain',
    'All contenders import the identical numerical kernel. Headline worker comparisons use identical SAB-backed input, cloned per-chunk output, fixed persistent worker count and **8p chunks**, capped at N. The common submission limit is **2p**. Serial uses eight chunks and one host lane. Repeated-clone sends the whole model per task; reusable-shared passes one shared backing repeatedly, with a one-time preparation copy recorded separately. SAB is available to raw workers and Piscina; PJS exposes sharedReadonly with a caller-enforced immutability contract. These tracks test distinct ownership strategies. No PJS-specific high-level API or transfer shortcut is in the headline.',
  );
  add(
    'Environment',
    table(
      ['Field', 'Observed value'],
      [
        ['OS', e.osRelease?.match(/PRETTY_NAME="([^"]+)"/)?.[1] ?? e.osType],
        ['Kernel', e.release],
        ['CPU', e.cpuModel],
        ['Architecture', e.architecture],
        ['Physical cores', e.physicalCoreCount],
        [
          'Logical CPUs / availableParallelism',
          `${e.logicalCpuCount} / ${e.availableParallelism}`,
        ],
        ['RAM bytes', e.totalMemoryBytes],
        ['Node', e.node],
        ['V8', e.v8],
        ['npm', e.npm],
        ['Governor', e.governor],
        ['AC online', e.acPower],
        ['Initial load averages', e.loadavg],
        ['Starting source commit', 'ebf4ce1bc3b63a8860e667605e6456bccae1f09c'],
        ['Measured harness/evidence commit', e.pjsCommit],
        ['Branch', e.branch],
        ['Dirty at campaign capture', String(e.worktreeDirty)],
      ],
    ) +
      '\n\nBackground applications were uncontrolled. Initial available RAM and swap occupancy are retained in meminfo; this was a constrained desktop session. AC power was connected, and no governor or host settings were changed. Windows, macOS and ARM were not measured.',
  );
  add(
    'Methodology',
    `Stages cover grain, primary scaling, distribution, transport and cold start, with large primary also providing responsiveness and memory. **${analysis.trials}/${analysis.expectedTrials} trials**, **${analysis.failures} explicit failures**, complete=${analysis.complete}. Fresh child per trial; two untimed full-workload warmups for steady state; ten measured trials per cell. Cold has no warmups. Deterministic seeded within-stage order, 120s child timeout including natural exit, no forced GC, no deleted slow trials. Serial oracle validation occurs after timing for every contender and may heat the host between trials.\n\nMedian bootstrap intervals use 2,000 seeded resamples. A practical win requires >5% median advantage and non-overlapping descriptive 95% intervals. Overlap means uncertain/indistinguishable under this rule, not statistical equivalence. Full min/max/mean/sample SD/CV/IQR and all trial records are retained.`,
  );
  add(
    'Calibration',
    table(
      ['Candidate paths', 'Serial median ms'],
      calibration.measurements.map((x) => [x.simulations, fmt(x.median, 3)]),
    ) +
      '\n\n' +
      table(['Frozen size', 'Paths'], Object.entries(calibration.sizes)) +
      `\n\n[Raw serial-only calibration](${calibrationLink}). Selection was nearest log-distance to 100ms/1s/5s, using only serial results. Counts and config were committed before full parallel measurement. They were never retuned against Piscina/PJS.`,
  );
  add(
    'Correctness',
    `${header.correctness.length} fixture contender/transport checks passed exact per-path equality in distribution mode and exact ordered aggregates in both modes. Every successful measured trial checked count, path-bit checksum, extrema and tight aggregate agreement against the same serial kernel; materialized trials checked every path bit.\n\nThe harness has eleven unit tests covering PRNG/model determinism, correlation reconstruction, partition coverage, ordered reduction, bounded driver, percentiles/statistics, provenance rejection, schema/analysis, timeout and crash evidence. All child processes exited naturally after pool cleanup.`,
  );
  add(
    'Grain-size results',
    table(
      [
        'Runtime',
        'Workers',
        'Chunks',
        'Paths/chunk',
        'Median ms',
        'CV',
        'Task p50/p95/p99 ms',
      ],
      cells
        .filter((x) => x.stage === 'grain')
        .map((x) => [
          x.contender,
          x.workers,
          x.chunks,
          fmt(x.simulationsPerChunk, 1),
          fmt(x.wall.median),
          fmt(x.wall.cv, 3),
          [x.taskP50Ms, x.taskP95Ms, x.taskP99Ms].map((v) => fmt(v)).join('/'),
        ]),
    ) +
      '\n\nThis sweep describes sensitivity at the medium size. Observed optima do not replace the neutral 8p policy. The finest tested chunk still contains useful Monte Carlo work; failure to observe a collapse does not refute the existence of dispatch-dominated finer tasks.',
  );
  add(
    'Main scaling results',
    table(
      [
        'Size',
        'Runtime',
        'Workers',
        'Median ms',
        '95% interval ms',
        'Sims/s',
        'Speedup',
        'Efficiency',
        'Peak RSS MiB',
      ],
      primary.map((x) => [
        x.problemSize,
        x.contender,
        x.workers,
        fmt(x.wall.median),
        x.wall.ci95.map((v) => fmt(v)).join('–'),
        fmt(x.throughput, 0),
        fmt(x.speedup),
        fmt(x.efficiency, 3),
        fmt(x.peakRssBytes / 2 ** 20, 1),
      ]),
    ) +
      '\n\nSpeedup is matching-size primary serial median / worker median; efficiency is speedup / p. Values above p would require cache/JIT/boundary investigation. Logical CPU counts are not assumed to be physical cores; this host separately reported four cores.',
  );
  add(
    'Clone versus shared results',
    table(
      [
        'Size',
        'Runtime',
        'Clone ms',
        'Shared ms',
        'Shared/clone',
        'Shared prep ms',
        'Interpretation',
      ],
      transports.map(({ clone, shared }) => [
        clone.problemSize,
        clone.contender,
        fmt(clone.wall.median),
        fmt(shared?.wall.median),
        fmt(shared?.wall.median / clone.wall.median, 3),
        fmt(shared?.sharedPreparationMs, 3),
        shared && practicalWin(shared.wall, clone.wall)
          ? 'shared practical advantage'
          : shared && practicalWin(clone.wall, shared.wall)
            ? 'clone practical advantage'
            : 'uncertain',
      ]),
    ) +
      '\n\nWall time also includes execution on ordinary versus shared typed-array backing. This is not a pure serialization-cost probe; backing access, cache and JIT effects remain possible confounders. The model is 149,504 bytes and the neutral representative cell has 32 tasks: 4,784,128 logical numeric clone bytes per workload, versus reusable backing references. Payload byte counts do not equal RSS. A measured setup break-even is defensible only where the paired time saving survives the registered uncertainty rule; the generated transport table reports that condition. Otherwise no reliable break-even threshold is established.',
  );
  add(
    'Cold versus steady state',
    table(
      [
        'Runtime',
        'p',
        'Cold ms',
        'First result ms',
        'Steady medium ms',
        'Startup ms',
        'Shared prep ms',
      ],
      cells
        .filter((x) => x.stage === 'cold')
        .map((x) => {
          const steady = primary.find(
            (s) =>
              s.contender === x.contender &&
              s.workers === x.workers &&
              s.problemSize === 'medium',
          );
          return [
            x.contender,
            x.workers,
            fmt(x.wall.median),
            fmt(x.firstResultMs),
            fmt(steady?.wall.median),
            fmt(x.startupMs),
            fmt(x.sharedPreparationMs, 3),
          ];
        }),
    ) +
      '\n\nCold includes shared preparation, construction/readiness, the first entire workload, reduction and shutdown. Time-to-first-result starts at pool construction. Host module imports and Node process creation are outside these boundaries for all contenders; model generation is separately measured. Steady simulation excludes pool construction and model preparation and reports reduction separately. Cold CPU sampling starts before construction but after shared preparation; CPU and cold wall boundaries therefore differ by the separately retained preparation cost.',
  );
  add(
    'Distribution and risk reduction',
    table(
      [
        'Runtime',
        'p',
        'Simulation ms',
        'Assembly/reduction/sort ms',
        'Compute + reduction ms',
        'Mean P&L',
        'P&L SD',
        'Loss VaR 99%',
        'Loss ES 99%',
      ],
      cells
        .filter((x) => x.stage === 'distribution')
        .map((x) => {
          const data = rows.filter(
            (r) =>
              r.type === 'trial' &&
              r.status === 'ok' &&
              r.stage === 'distribution' &&
              r.contender === x.contender,
          );
          const risk = (k) =>
            percentile(
              data.map((r) => r.resultValidation[k]),
              0.5,
            );
          return [
            x.contender,
            x.workers,
            fmt(x.simulationMs),
            fmt(x.reductionMs),
            fmt(x.computeEndToEndMs),
            fmt(risk('mean'), 4),
            fmt(risk('standardDeviation'), 4),
            fmt(risk('var99'), 4),
            fmt(risk('expectedShortfall99'), 4),
          ];
        }),
    ) +
      '\n\nThe empirical loss quantile uses sorted index floor(0.99N); expected shortfall is the mean of that upper tail. All contenders return cloned Float64 chunk outputs. Sorting and risk reduction are separate from headline simulation timing.',
  );
  add(
    'Event-loop responsiveness',
    table(
      ['Runtime', 'p', 'Timer p95 ms', 'Timer p99 ms', 'Timer max ms', 'ELU'],
      large.map((x) => [
        x.contender,
        x.workers,
        fmt(x.timerP95Ms),
        fmt(x.timerP99Ms),
        fmt(x.timerMaxMs),
        fmt(x.elu, 3),
      ]),
    ) +
      '\n\nThe sentinel is armed before CPU execution and flushed after it so synchronous blocking is observed. Short serial runs have few samples; p95/p99 are not high-resolution tail estimates. Worker runtimes preserve host execution capacity subject to shared CPU/memory contention; they do not make the whole machine nonblocking. The monitorEventLoopDelay histogram is retained as supporting data, not the sole serial-blocking evidence.',
  );
  add(
    'Memory',
    table(
      [
        'Runtime',
        'p',
        'Initial RSS MiB',
        'Peak RSS MiB',
        'Final RSS MiB',
        'Delta RSS MiB',
        'High-water RSS MiB',
      ],
      large.map((x) => [
        x.contender,
        x.workers,
        ...[
          'initialRssBytes',
          'peakRssBytes',
          'finalRssBytes',
          'deltaRssBytes',
          'highWaterRssBytes',
        ].map((k) => fmt(x[k] / 2 ** 20, 1)),
      ]),
    ) +
      '\n\nRSS is process-wide, sampled at 10ms plus endpoints; serial blocking can hide intermediate peaks. The process high-water mark includes warmup/startup and is kept separately. Initial/final snapshots refer to the measured workload, before shutdown. Host-isolate heap/external/arrayBuffers are retained, but do not represent every worker heap. No exact physical-memory savings are inferred from payload bytes or RSS.',
  );
  add(
    'CPU',
    table(
      ['Runtime', 'p', 'User ms', 'System ms', 'CPU seconds/wall second'],
      large.map((x) => [
        x.contender,
        x.workers,
        fmt(x.cpuUserMs),
        fmt(x.cpuSystemMs),
        fmt(x.cpuSecondsPerWallSecond, 3),
      ]),
    ) +
      '\n\nThese are process.cpuUsage deltas across compute plus reduction. The ratio is CPU seconds per wall second, not a claim about machine utilization. Higher parallel CPU time may coexist with shorter wall time; scheduler, JIT and transport overhead are included.',
  );
  add(
    'Where serial wins',
    compare('serial') +
      secondaryText('serial') +
      '\n\nOnly the frozen sizes were retained as performance evidence. Smoke is excluded. This campaign bounds useful regions at those sizes; it does not pinpoint a crossover below the smallest measured size.',
  );
  add(
    'Where raw workers win',
    compare('raw') +
      secondaryText('raw') +
      '\n\nThe lower-level pool supplies only FIFO task execution and shutdown; it does not recreate the full ownership, lifecycle and diagnostic contracts of higher-level runtimes. Those architectural differences are separate from throughput evidence.',
  );
  add('Where Piscina wins', compare('piscina') + secondaryText('piscina'));
  add(
    'Where PJS wins',
    compare('pjs') +
      secondaryText('pjs') +
      `\n\nCoarse large PJS versus serial practical advantage observed: **${pjsUseful}**. Claims are limited to this host, Node version, synthetic model and frozen grain policy.`,
  );
  add(
    'Where PJS loses',
    compare('pjs', true) +
      secondaryText('pjs', true) +
      (pjsMedianLosses.length
        ? '\n\nObserved primary median disadvantages greater than 5%, retained even when uncertain:\n\n' +
          table(
            [
              'Size',
              'p',
              'Peer',
              'PJS ms',
              'Peer ms',
              'PJS slower by',
              'Evidence',
            ],
            pjsMedianLosses,
          )
        : ''),
  );
  add(
    'Where results are indistinguishable',
    table(
      ['Size', 'p', 'Pair'],
      analysis.comparisons
        .filter((x) => !x.winner)
        .map((x) => [x.size, x.workers, `${x.a} / ${x.b}`]),
    ) +
      '\n\nThis label follows the descriptive threshold and uncertainty rule. It is not an equivalence test. Variance and interval widths are available rather than hidden behind a tie label.',
  );
  add(
    'Hypothesis assessment',
    `- **H1 — not established in the retained range:** No serial primary win met the registered rule. Warmed two/four-worker execution already paid at 5,000 paths. The sufficiently tiny serial-favored crossover remains unmeasured; smoke cannot establish it. No smaller performance cells were added post hoc.\n- **H2 — supported at large size:** Practical coarse-worker advantage against serial for each of raw/Piscina/PJS: **${workerUseful}**. This is a result for this workload and host.\n- **H3 — not confirmed by throughput:** Shared has a practical paired advantage in **${sharedWins.length}/${transports.length}** cells. No robust end-to-end setup break-even is established. Logical repeated copying decreases, but computation on shared backing and host noise prevent isolating transport cost. SAB remains a common capability.\n- **H4 — competitive within the measured uncertainty:** No primary worker-peer comparison met the practical-win rule. PJS nevertheless had slower four-worker large medians than both peers; those disadvantages are reported above. Competitive does not mean equivalent or fastest.\n- **H5 — no collapse observed:** The registered sweep spans four through 256 chunks at p=4, still roughly 195 paths in the finest chunk. No robust collapse was established there, and finer tasks were not measured.\n- **H6 — partial support:** RSS increased with worker count, while throughput improved through the tested maximum of four. No plateau or oversubscription decline was established; higher counts were deliberately excluded.\n- **H7 — supported for host isolation:** The serial large-workload sentinel observes seconds of blocking; all worker approaches retain millisecond-scale host drift in the table. Host resource contention remains a qualifier.\n- **H8 — no universal winner demonstrated:** No worker runtime dominated the primary comparisons under the rule. This uncertainty is not proof of equivalence or a universal absence of a winner; operating regions below the smallest size and beyond four workers remain unmeasured.`,
  );
  add(
    'Architectural properties',
    'PJS offers explicit registered module tasks, bounded admission, ownership helpers, lifecycle and diagnostic APIs. This campaign uses the core run mechanism and sharedReadonly contract. It does not experimentally compare every runtime cancellation, restart, admission or diagnostic invariant. The common 2p driver controls admission for all pools. API properties cannot excuse a measured throughput loss and are kept separate from performance claims.',
  );
  add(
    'Limitations and threats to validity',
    'Single synthetic workload and one desktop CPU; fixed factors, positions, seed and grain; no real market calibration; simple counter PRNG; Node 24.13.1 and V8 tiering/GC; prerelease PJS rc.2 and Piscina 5.3.2; four physical/logical cores without SMT on this machine; OS scheduling, thermal/frequency variation, background activity and heavy swap occupancy; repeated serial validation heating between trials; sample precision, instrument overhead and few serial timer samples; RSS sampling blind spots and host-only heap snapshots; SAB immutability is a usage contract, not protection. Cell ordering is seeded but stages remain sequential, so cross-stage drift can affect clone/shared or cold/steady comparisons. Ten bootstrap trials and many comparisons do not provide formal multiplicity-corrected significance. Every child loads the adapter modules, including serial; this common host-library RSS baseline is included in memory snapshots and excluded from simulation timing. No multi-session, cross-platform or Windows replication was performed.',
  );
  add(
    'Negative results and anomalies',
    `No slow trials were removed. Explicit trial failures: **${analysis.failures}**. Cells with CV > 20%: **${cells.filter((x) => x.wall.cv > 0.2).length}/${cells.length}**. PJS median disadvantages and uncertain comparisons are printed above. The serial crossover, shared-input throughput benefit and fine-grain collapse were not established in this frozen range. These are negative/inconclusive findings, not reasons to tune the campaign after measurement.\n\nAfter all 620 children exited successfully, automatic full analysis encountered a circular top-level-await import and the parent exited with code 13. The raw completion record remained intact. Moving the unchanged matrix to an independent module repaired postprocessing; a regression test now covers full analysis. Standalone analysis confirms the full matrix. This harness defect affected no measured timings or runtime code.\n\nApparent changes across count, grain or transport remain observations unless they repeat materially and can be attributed to a runtime mechanism. One anomalous cell is insufficient for a scheduler change.`,
  );
  add(
    'Conclusions and campaign outcome',
    `**Outcome ${outcome}** — ${{ A: 'compelling useful domain', B: 'mixed but useful', C: 'performance problem requires investigation', D: 'benchmark invalid or inconclusive' }[outcome]}.\n\nThe retained map is bounded by the frozen workload and this Fedora session. Useful worker regions, serial wins, peer runtime losses and uncertainty must be considered together. Public claims should use this report and the raw interval/trial evidence. Root README performance claims were not changed.`,
  );
  add(
    'Runtime-change recommendation',
    `**Runtime defect found: ${analysis.failures ? 'INCONCLUSIVE' : 'NO'}. Runtime change recommended: ${outcome === 'C' ? 'INVESTIGATE' : 'NO'}.** No runtime defect is established by throughput comparisons alone. Findings are observation-only unless a repeatable material anomaly can be isolated to PJS with a fair baseline, a clear invariant and independent validation. Runtime source, public API, runtime dependencies and package versions remain unchanged. No npm publication occurred.`,
  );
  add(
    'Reproduction and artifacts',
    `See [methodology and commands](../../benchmarks/flagship-monte-carlo/README.md#reproduction), [research log](../../benchmarks/flagship-monte-carlo/RESEARCH-LOG.md), [raw full trials](${rawLink}), [generated tables](${analysisLink}), [summary JSON](${summaryLink}), and [serial calibration](${calibrationLink}).\n\n\`npm run benchmark:flagship:smoke\` checks all contenders without public performance claims. \`npm run benchmark:flagship:full\` prepares an exact public-registry consumer and runs the same frozen matrix. Analysis never overwrites historical artifacts: copy a retained JSONL file to a new temporary filename before invoking \`npm run benchmark:flagship:analyze -- /tmp/new-campaign.jsonl\`. Full is never invoked by normal tests/CI. Windows replication must reuse this exact config without recalibration.\n\nThis document is generated from explicit full and calibration paths by \`node benchmarks/flagship-monte-carlo/report.mjs FULL.jsonl ${outcome} CALIBRATION.jsonl\`. Outcome selection is a scientific review decision; numeric tables and comparison classifications are derived from retained evidence.`,
  );
  // Preserve exact detailed analysis as a separate linked immutable artifact.
  if (!tables.includes(`Trials: ${analysis.trials}.`))
    throw new Error('Analysis tables disagree');
  const destination =
    outputPath ??
    fileURLToPath(
      new URL('../../docs/research/flagship-monte-carlo.md', import.meta.url),
    );
  await writeFile(
    destination,
    '# PJS flagship Monte Carlo evidence report\n\n' +
      sections.join('\n\n') +
      '\n',
    { flag: 'wx' },
  );
  console.log(destination);
  return {
    outcome,
    pjsUseful,
    workerUseful,
    sharedWins: sharedWins.length,
    cells: cells.length,
    failures: analysis.failures,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(
    JSON.stringify(
      await report(
        process.argv[2],
        process.argv[3],
        process.argv[4],
        process.argv[5],
      ),
    ),
  );
