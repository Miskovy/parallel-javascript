import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const output = resolve(
  outputIndex < 0 ? 'docs/cross-platform-v0.11.md' : args[outputIndex + 1],
);
if (outputIndex >= 0) args.splice(outputIndex, 2);
assert.ok(
  args.length,
  'Pass campaign JSON files (not metadata JSON) and optionally --output <report.md>',
);
const rawCampaigns = [];
for (const file of args) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.sourceCommit, '716e86d48987ae838c421ff22ade2b7a469e8242');
  assert.ok(data.status !== 'running', `${file} is still running`);
  rawCampaigns.push({ file: resolve(file), data });
}
const campaigns = [];
for (const raw of [...rawCampaigns].sort(
  (a, b) =>
    Number(Boolean(a.data.supplements)) - Number(Boolean(b.data.supplements)),
)) {
  const existing = campaigns.find(
    (campaign) =>
      campaign.data.metadata.machineLabel === raw.data.metadata.machineLabel &&
      campaign.data.metadata.nodeVersion === raw.data.metadata.nodeVersion,
  );
  if (!existing) campaigns.push({ ...raw, data: structuredClone(raw.data) });
  else {
    assert.ok(
      raw.data.supplements,
      'Separate full sessions must be reported separately; only explicit supplements can be merged',
    );
    assert.equal(
      raw.data.metadata.lockfileSha256,
      existing.data.metadata.lockfileSha256,
    );
    existing.data.checks.push(...raw.data.checks);
    existing.data.measurements.push(...raw.data.measurements);
    existing.data.failures.push(...raw.data.failures);
  }
}
campaigns.sort(
  (a, b) =>
    a.data.metadata.machineLabel.localeCompare(b.data.metadata.machineLabel) ||
    a.data.metadata.nodeVersion.localeCompare(b.data.metadata.nodeVersion),
);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
function stats(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);
  return {
    median: median(values),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    variance,
    cv: (Math.sqrt(variance) / mean) * 100,
    n: values.length,
  };
}
const fmt = (value, digits = 3) =>
  Number.isFinite(value) ? value.toFixed(digits) : 'unavailable';
const percent = (left, right) => `${fmt((left / right - 1) * 100, 1)}%`;
const mib = (value) => fmt(value / 2 ** 20, 1);
const label = (campaign) =>
  `${campaign.data.metadata.machineLabel} / ${campaign.data.metadata.nodeVersion}`;
const records = (campaign, group, configuration) =>
  campaign.data.measurements.filter(
    (record) =>
      record.group === group &&
      (configuration === undefined || record.configuration === configuration) &&
      record.result,
  );
function samples(campaign, group, configuration) {
  return records(campaign, group, configuration).flatMap((record) => {
    if (group === 'architecture')
      return record.result.results[0].samples.map((wallMs) => ({ wallMs }));
    if (group === 'cpu-scaling') return record.result.workloads[0].samples;
    return record.result.samples ?? [];
  });
}
const time = (campaign, group, config) =>
  stats(samples(campaign, group, config).map((sample) => sample.wallMs));
const lines = [];
const add = (...text) => lines.push(...text, '');
function section(title) {
  add(`## ${title}`);
}
function table(headers, rows) {
  add(
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  );
}
const linux = campaigns.filter(
  (campaign) => campaign.data.metadata.platform === 'linux',
);
const windows = campaigns.filter(
  (campaign) => campaign.data.metadata.platform === 'win32',
);
const invalidBatchConfiguration = (failure) =>
  failure.group === 'relationships' &&
  failure.configuration?.endsWith('batch-64') &&
  /RangeError: experimentalDispatchBatchSize must be an integer between 1 and 16/.test(
    failure.stderr,
  );
const failed = campaigns.some((campaign) =>
  campaign.data.failures.some((failure) => !invalidBatchConfiguration(failure)),
);
const missingOS = !linux.length || !windows.length;
const missingCells = ['linux', 'win32'].flatMap((platform) =>
  [22, 24]
    .filter(
      (major) =>
        !campaigns.some(
          (campaign) =>
            campaign.data.metadata.platform === platform &&
            Number(
              campaign.data.metadata.nodeVersion.slice(1).split('.')[0],
            ) === major,
        ),
    )
    .map((major) => `${platform} / Node ${major}`),
);
const battery = campaigns.some((campaign) =>
  campaign.data.measurements.some(
    (record) => record.contextBefore.powerSource === 'battery',
  ),
);
const discontinuity = campaigns.some((campaign) =>
  campaign.data.measurements.some(
    (record) =>
      Math.abs(
        Date.parse(record.contextAfter.timestamp) -
          Date.parse(record.contextBefore.timestamp) -
          record.durationMs,
      ) > 30000,
  ),
);
const materialNodeDifference = campaigns.some((campaign) => {
  if (!campaign.data.metadata.nodeVersion.startsWith('v22.')) return false;
  const other = campaigns.find(
    (candidate) =>
      candidate.data.metadata.machineLabel ===
        campaign.data.metadata.machineLabel &&
      candidate.data.metadata.nodeVersion.startsWith('v24.'),
  );
  return (
    other &&
    [
      'run-noop',
      'run-medium-cpu',
      'partition-range',
      'parallel-for',
      'stream-count-only',
    ].some(
      (name) =>
        Math.abs(
          time(other, 'architecture', name).median /
            time(campaign, 'architecture', name).median -
            1,
        ) > 0.2,
    )
  );
});
const decision = failed
  ? 'NOT READY'
  : missingCells.length || battery || discontinuity || materialNodeDifference
    ? 'READY WITH CAVEATS'
    : 'READY';
add(
  '# PJS v0.11 cross-platform validation',
  `Generated from original machine JSON on ${new Date().toISOString()}.`,
);
section('VALIDATION SUMMARY');
add(
  `**${decision}.** ${failed ? 'Recorded failures require investigation before v0.12.' : 'The tested environments preserve correctness and runtime-owned cleanup.'} ${missingOS ? 'A fresh second-OS campaign is missing, so AMD/Intel and Linux/Windows reproduction is not established.' : 'Both Linux and Windows artifacts are present.'} ${battery ? 'Laptop performance was measured on battery; an AC repeat remains a performance-quality caveat.' : ''}`,
);
section('SOURCE COMMIT');
add(
  '`716e86d48987ae838c421ff22ade2b7a469e8242` (v0.11.0). Each run extracts this commit with `git archive`; checks and measurements use the archive, never a later working tree. Source file hashes and the lockfile SHA-256 accompany every artifact. Runtime source and public APIs are unchanged. The construction invariant is documented in ADR 0018.',
);
table(
  ['Environment', 'Lockfile SHA-256', 'Source verification'],
  campaigns.map((campaign) => [
    label(campaign),
    `\`${campaign.data.metadata.lockfileSha256}\``,
    campaign.data.sourceVerification
      ? 'All source/lockfile hashes unchanged; soak output changed only in disposable archive'
      : 'unavailable',
  ]),
);
section('MACHINE MATRIX');
table(
  [
    'Machine',
    'OS / kernel',
    'CPU',
    'Architecture',
    'Logical / available CPUs',
    'RAM GiB',
  ],
  campaigns.map((campaign) => {
    const m = campaign.data.metadata;
    return [
      label(campaign),
      `${m.os} ${m.osRelease}`,
      m.cpuModel,
      m.architecture,
      `${m.logicalCpuCount} / ${m.availableParallelism}`,
      fmt(m.memoryTotalBytes / 2 ** 30, 2),
    ];
  }),
);
section('NODE VERSION MATRIX');
table(
  ['Physical environment', 'Node 22', 'Node 24'],
  ['linux', 'win32'].map((platform) => [
    platform === 'linux'
      ? 'Fedora / AMD (actual metadata below)'
      : 'Windows / Intel (expected until captured)',
    ...[22, 24].map(
      (major) =>
        campaigns.find(
          (campaign) =>
            campaign.data.metadata.platform === platform &&
            Number(
              campaign.data.metadata.nodeVersion.slice(1).split('.')[0],
            ) === major,
        )?.data.metadata.nodeVersion ?? 'not tested',
    ),
  ]),
);
table(
  ['Environment', 'V8', 'npm', 'Node executable'],
  campaigns.map((campaign) => [
    label(campaign),
    campaign.data.metadata.v8Version,
    campaign.data.metadata.npmVersion,
    `\`${campaign.data.metadata.nodeExecutable}\``,
  ]),
);
section('FEDORA MACHINE DETAILS');
if (linux.length) {
  const m = linux[0].data.metadata;
  add(
    `Detected OS release:\n\n\`\`\`text\n${m.osReleaseFile?.trim() ?? m.osVersion}\n\`\`\``,
    `Initial power: ${m.context.powerSource}; battery: ${m.context.batteries.map((b) => `${b.capacityPercent}% ${b.status}`).join(', ') || 'unavailable'}; power profile: ${m.context.powerProfile ?? 'unavailable'}; governor: ${[...new Set(m.context.cpuFrequency.map((cpu) => cpu.governor))].join(', ') || 'unavailable'}. No power configuration was changed. Topology and frequency limits are retained in metadata.`,
  );
} else add('No fresh Fedora campaign is available.');
section('WINDOWS MACHINE DETAILS');
if (windows.length)
  add(
    ...windows.map(
      (campaign) =>
        `${label(campaign)}: ${campaign.data.metadata.osVersion}; power profile ${campaign.data.metadata.context.powerProfile ?? 'unavailable'}. CIM fields are retained in metadata.`,
    ),
  );
else
  add(
    'Unavailable in this session. The earlier `runtime-architecture-v0.11.json` reports Windows/i3-10100F results from a v0.11 working tree based on another commit. It is historical context, not a tested cell at this campaign’s exact reference. No new Windows artifact was fabricated.',
  );
section('CORRECTNESS RESULTS');
table(
  [
    'Environment',
    'Normal tests',
    'Pass / fail',
    'Test duration s',
    'Build / type tests / compat / lint / format',
  ],
  campaigns.map((campaign) => {
    const c = campaign.data.checks.find((c) => c.name === 'npm run test');
    const checks = [
      'build',
      'test:types',
      'typecheck:compat',
      'lint',
      'format:check',
    ].map(
      (name) =>
        campaign.data.checks.find((c) => c.name === `npm run ${name}`)
          ?.exitCode,
    );
    return [
      label(campaign),
      c?.summary?.tests ?? 'unavailable',
      `${c?.summary?.passes ?? '?'} / ${c?.summary?.failures ?? '?'}`,
      fmt(c?.summary?.durationMs / 1000, 2),
      checks.every((code) => code === 0) ? 'all pass' : 'incomplete or failed',
    ];
  }),
);
add(
  'The full suite covers error classes, timeout/cancellation timing, abandonment, crash replacement, batch correlation, binary validation, transfer ownership, AsyncLocalStorage, and draining/non-draining shutdown. Passing suites establish the covered behavior; they do not prove all possible schedules. `git diff --check` and source hashes verify preservation. Dependency installs use `npm ci` with the lockfile.',
);
section('INVARIANT RESULTS');
table(
  ['Environment', 'Tests', 'Pass / fail', 'Duration s'],
  campaigns.map((campaign) => {
    const c = campaign.data.checks.find(
      (c) => c.name === 'reservation invariant full suite',
    );
    return [
      label(campaign),
      c?.summary?.tests ?? '?',
      `${c?.summary?.passes ?? '?'} / ${c?.summary?.failures ?? '?'}`,
      fmt(c?.summary?.durationMs / 1000, 2),
    ];
  }),
);
add('Full suites ran with `PJS_DEBUG_RESERVATION_INVARIANTS=1`.');
section('STRESS RESULTS');
table(
  [
    'Environment',
    'Fresh rounds passed / target',
    'Test executions',
    'Intermittent failures',
    'Wall duration s',
  ],
  campaigns.map((campaign) => {
    const c = campaign.data.checks.find(
      (c) => c.name === '10 fresh-process stress rounds',
    );
    return [
      label(campaign),
      `${c?.summary?.roundsPassed ?? '?'} / 10`,
      c?.summary?.testExecutions ?? '?',
      c?.summary?.intermittentFailures ?? '?',
      fmt(c?.durationMs / 1000, 2),
    ];
  }),
);
add(
  'The existing stress script stops at its first failing round. Failed output is retained; no failed round is silently retried.',
);
section('SOAK RESULTS');
table(
  [
    'Environment',
    'Duration s',
    'Completed scenario iterations',
    'Verified completed streams (minimum)',
    'Cancel / timeout / crash scenarios',
    'Failures / replacements',
    'Terminal tasks / operations / reservations / correlations / bytes',
  ],
  campaigns.map((campaign) => {
    const soak = campaign.data.checks.find(
      (c) => c.name === '30-second reservation soak',
    )?.result;
    if (!soak) return [label(campaign), 'unavailable', '-', '-', '-', '-', '-'];
    const count = (prefix) =>
      Object.entries(soak.scenarioCounts)
        .filter(([name]) => name.startsWith(prefix))
        .reduce((sum, [, n]) => sum + n, 0);
    const f = soak.final;
    return [
      label(campaign),
      fmt(soak.elapsedMs / 1000, 2),
      soak.iterations,
      count('success') + (soak.scenarioCounts['shutdown:graceful'] ?? 0),
      `${count('cancel')} / ${count('timeout')} / ${count('crash')}`,
      `${f.workerFailures} / ${f.workerRestarts}`,
      `${f.tasksPending} / ${f.operationsPending} / ${f.reservations} / ${f.executions} / ${f.currentReservedResultBytes}`,
    ];
  }),
);
add(
  'Iterations are completed scenarios, not a count of every child task or parent operation. Verified completed streams count successful stream scenarios plus asserted graceful shutdown streams; the unmodified soak does not emit cumulative operations.completed across all runtimes, so this is a lower bound. Crash counters above include main-runtime worker failures; shutdown scenarios construct additional runtimes and are separately counted in raw scenario data. The soak validates quiescence repeatedly and stopped-state ownership at termination.',
);
section('WORKER SCALING');
add(
  'Counts are filtered by detected `availableParallelism()`: 1/2/4 on this four-CPU laptop, and 1/2/4/8 where eight CPUs are available. The worker sweep runs fixed prime-search inputs; feature relationships use four workers. Architecture regressions reuse their established four-worker definition. Machines with fewer than four CPUs skip that definition rather than silently alter it.',
);
section('CPU-BOUND SCALING');
add(
  'Existing prime-search benchmark over `[0, 5,000,000)`, fixed 32 chunks, independent sieve validation, two warmups and five retained samples per process. Two fresh processes per Node/count in a two-Node campaign. Speedup uses the same Node’s **one-worker** median, not a serial or different-machine baseline. CPU 100% means one logical CPU.',
);
for (const campaign of campaigns) {
  add(`### ${label(campaign)}`);
  const baseline = time(campaign, 'cpu-scaling', 'workers-1').median;
  table(
    [
      'Workers',
      'Wall ms',
      'Speedup T1/Tp',
      'Efficiency',
      'CPU %',
      'Sample CV %',
    ],
    campaign.data.methodology.workerCounts.map((workers) => {
      const s = samples(campaign, 'cpu-scaling', `workers-${workers}`);
      const st = stats(s.map((sample) => sample.wallMs));
      return [
        workers,
        fmt(st.median),
        fmt(baseline / st.median),
        fmt(baseline / st.median / workers),
        fmt(median(s.map((sample) => sample.cpuPercent)), 1),
        fmt(st.cv, 1),
      ];
    }),
  );
}
section('CLONE RESULTS');
sectionTable('run-clone-input');
section('TRANSFER RESULTS');
sectionTable('run-transfer-input');
add(
  'The input round-trip sweep reuses the established one-worker clone/transfer test (1 KiB, 1 MiB, 8 MiB plus scalar control); allocation and full-byte validation are outside timing in both modes. Input ownership/detachment is asserted. These round trips differ from worker-generated binary streams below.',
);
for (const campaign of campaigns) {
  add(`### ${label(campaign)} — input round trips`);
  table(
    ['Payload', 'Clone ms', 'Transfer ms', 'Transfer / clone'],
    [1024, 1048576, 8388608].map((bytes) => {
      const runs = records(campaign, 'input-transfer-roundtrip');
      const result = (mode) =>
        median(
          runs.flatMap((r) =>
            r.result.results
              .filter((entry) => entry.bytes === bytes && entry.mode === mode)
              .flatMap((entry) => entry.samples.map((s) => s.wallMs)),
          ),
        );
      return [
        bytes,
        fmt(result('clone')),
        fmt(result('transfer')),
        fmt(result('transfer') / result('clone')),
      ];
    }),
  );
}
section('SHARED-MEMORY RESULTS');
sectionTable('run-shared-input');
add(
  'Shared input avoids per-task source cloning. The numeric shared-output comparison in MAP RESULTS uses `parallelFor` to write disjoint output spans. It measures the numeric path, not arbitrary object output.',
);
section('PARTITION RESULTS');
sectionTable('partition-range');
add(
  'Established tiny no-op versus fixed-width increasing-cost skew controls, identical inputs across runtimes, with supported batches 1/8/16. Large skew batches can reduce dispatch overhead while limiting load balance. Any initial unsupported batch attempts are retained in raw evidence and explained below; explicit supplements provide their corrected controls.',
);
table(
  [
    'Environment',
    'Kind',
    'Batch 1 ms',
    'Batch 8 ms',
    'Batch 16 ms',
    'B8 vs B1',
    'B16 vs B1',
  ],
  campaigns.flatMap((campaign) =>
    ['noop', 'stable-skew'].map((kind) => {
      const b1 = time(campaign, 'relationships', `${kind}-batch-1`).median;
      const b8 = time(campaign, 'relationships', `${kind}-batch-8`).median;
      const b16 = time(campaign, 'relationships', `${kind}-batch-16`).median;
      return [
        label(campaign),
        kind,
        fmt(b1),
        fmt(b8),
        fmt(b16),
        percent(b8, b1),
        percent(b16, b1),
      ];
    }),
  ),
);
table(
  ['Environment', 'Coarse skew batch 1 ms', 'Batch 16 ms', 'Batch 16 / 1'],
  campaigns.map((campaign) => {
    const one = time(campaign, 'relationships', 'coarse-skew-batch-1').median;
    const sixteen = time(
      campaign,
      'relationships',
      'coarse-skew-batch-16',
    ).median;
    return [label(campaign), fmt(one), fmt(sixteen), fmt(sixteen / one)];
  }),
);
add(
  'Coarse skew keeps the same 2,048-item kernel but uses 16 logical partitions. Batch 16 puts all partitions in one physical dispatch and limits worker utilization. This is a load-balance control, not tuning per Node or OS.',
);
section('PARALLELFOR RESULTS');
sectionTable('parallel-for');
section('STREAM RESULTS');
sectionTable('stream-count-only');
sectionTable('stream-strict-clone');
sectionTable('stream-strict-transfer');
table(
  [
    'Environment',
    'CPU stream capacity 1 ms',
    'Capacity 8 ms',
    'Capacity 1 / 8',
  ],
  campaigns.map((campaign) => {
    const one = time(campaign, 'relationships', 'stream-capacity-1').median;
    const eight = time(campaign, 'relationships', 'stream-capacity-8').median;
    return [label(campaign), fmt(one), fmt(eight), fmt(one / eight)];
  }),
);
section('STRICT RESERVATION RESULTS');
add(
  'Worker-generated binary result sweep: 1 KiB/64 KiB/1 MiB/8 MiB, clone, count-only transfer, fixed exact transfer, and callback exact transfer. Batch size 1 and count capacity 16 are identical across modes; strict capacity is exactly 16 payloads. Existing reservation-audit task, profiling disabled. Byte lengths, boundary content, delivery counts and zero terminal ownership are asserted. Reported milliseconds are per full stream; sustained samples repeat the full stream. Sample variance is in ms² and CV uses sample standard deviation / mean. The two process medians expose between-process variation; twelve samples are not twelve independent machine sessions.',
);
for (const campaign of campaigns) {
  add(`### ${label(campaign)}`);
  table(
    [
      'Bytes',
      'Mode',
      'Median ms',
      'vs count transfer',
      'Min–max ms',
      'Variance ms²',
      'CV %',
      'Process medians ms',
      'Sustained windows min–max ms',
    ],
    [1024, 65536, 1048576, 8388608].flatMap((bytes) => {
      const group = `binary-${bytes}`;
      const base = time(campaign, group, 'transfer').median;
      return ['clone', 'transfer', 'strict-fixed', 'strict-callback'].map(
        (mode) => {
          const st = time(campaign, group, mode);
          const runs = records(campaign, group, mode);
          const windows = samples(campaign, group, mode).map(
            (s) => s.totalWallMs,
          );
          return [
            bytes,
            mode,
            fmt(st.median),
            percent(st.median, base),
            `${fmt(st.minimum)}–${fmt(st.maximum)}`,
            fmt(st.variance),
            fmt(st.cv, 1),
            runs
              .map((r) => fmt(median(r.result.samples.map((s) => s.wallMs))))
              .join(', '),
            `${fmt(Math.min(...windows), 0)}–${fmt(Math.max(...windows), 0)}`,
          ];
        },
      );
    }),
  );
}
add(
  'Interpret the small strict-reservation differences against the retained variance and process medians. No universal transfer crossover or portable fixed overhead is inferred from two CPUs or one session. Longer windows reduce timer noise but do not eliminate GC, frequency and background-load effects.',
);
for (const campaign of campaigns) {
  const base = time(campaign, 'binary-65536', 'transfer').median;
  add(
    `${label(campaign)}: at 64 KiB, fixed exact median is ${percent(time(campaign, 'binary-65536', 'strict-fixed').median, base)} above count-only transfer; callback exact is ${percent(time(campaign, 'binary-65536', 'strict-callback').median, base)}. Fixed-exact deltas change magnitude or sign at larger payloads; a consistent portable overhead is not established.`,
  );
}
section('MAP RESULTS');
sectionTable('map-generic');
sectionTable('map-typed');
add(
  'The architecture map cases use only 1,024 elements and do not test the cheap-object performance claim. The larger existing mapping workload uses 262,144 elements, grain 4,096, zero extra iterations, batch 4 and equivalent numeric transformation. Object mapping additionally returns index/category fields; this is a representation/workload relationship, not a pure output-constructor comparison. Numeric array, typed clone, typed transfer and shared output controls are also retained.',
);
table(
  [
    'Environment',
    'Objects ms',
    'Numeric array ms',
    'Typed clone ms',
    'Typed transfer ms',
    'Shared parallelFor ms',
    'Objects / typed clone',
  ],
  campaigns.map((campaign) => {
    const t = (mode) => time(campaign, 'relationships', mode).median;
    return [
      label(campaign),
      ...[
        'map-objects',
        'map-array',
        'map-typed',
        'map-typed-transfer',
        'shared',
      ].map((mode) => fmt(t(mode))),
      fmt(t('map-objects') / t('map-typed')),
    ];
  }),
);
section('NODE 22 VS NODE 24');
add(
  'Same machine, source, four workers, inputs and per-case process ordering: 22 → 24 → 24 → 22. Cases are isolated in fresh Node processes. Positive delta means Node 24 was slower. These are contemporaneous runtime comparisons, not v0.10→v0.11 architectural deltas.',
);
for (const machine of [
  ...new Set(campaigns.map((campaign) => campaign.data.metadata.machineLabel)),
]) {
  const versions = campaigns.filter(
    (campaign) => campaign.data.metadata.machineLabel === machine,
  );
  const n22 = versions.find((c) =>
    c.data.metadata.nodeVersion.startsWith('v22.'),
  );
  const n24 = versions.find((c) =>
    c.data.metadata.nodeVersion.startsWith('v24.'),
  );
  if (!n22 || !n24) {
    add(`${machine}: second Node generation missing.`);
    continue;
  }
  table(
    ['Case', 'Node 22 ms', 'Node 24 ms', '24 vs 22', 'CV 22 / 24 %'],
    [
      'run-noop',
      'run-medium-cpu',
      'run-clone-input',
      'run-transfer-input',
      'run-shared-input',
      'partition-range',
      'parallel-for',
      'stream-count-only',
      'stream-strict-clone',
      'stream-strict-transfer',
      'map-generic',
      'map-typed',
    ].map((name) => {
      const a = time(n22, 'architecture', name);
      const b = time(n24, 'architecture', name);
      return [
        name,
        fmt(a.median),
        fmt(b.median),
        percent(b.median, a.median),
        `${fmt(a.cv, 1)} / ${fmt(b.cv, 1)}`,
      ];
    }),
  );
  add(
    `${machine}: Node 24 vs 22 parallelFor median ${percent(time(n24, 'architecture', 'parallel-for').median, time(n22, 'architecture', 'parallel-for').median)}; count-only stream ${percent(time(n24, 'architecture', 'stream-count-only').median, time(n22, 'architecture', 'stream-count-only').median)}. These are performance observations, not accepted architectural regression measurements. Assess them against the retained variance and operating conditions; material differences need another controlled interleaved session before causal attribution to Node/V8.`,
  );
}
section('WINDOWS VS LINUX BEHAVIOR');
add(
  missingOS
    ? 'Fresh Windows behavior has not been tested here. Linux correctness and Node-version consistency are established only for the covered tests. AMD+Intel reproduction, Windows/Linux timer sensitivity and OS-specific lifecycle differences remain open.'
    : 'Compare correctness, cleanup, relative relationships and scaling per environment. Windows/Intel versus Linux/AMD changes CPU, OS and potentially power simultaneously; it cannot attribute differences to the OS alone. Absolute wall times are retained but are not a hardware ranking.',
);
section('EVENT LOOP RESULTS');
table(
  [
    'Environment',
    'Case',
    'ELU median',
    'Mean delay ms (median)',
    'Max observed delay ms',
  ],
  campaigns.flatMap((campaign) =>
    [
      ['relationships', 'noop-batch-1'],
      ['relationships', 'stable-skew-batch-1'],
      ['binary-65536', 'transfer'],
      ['binary-65536', 'strict-fixed'],
    ].map(([group, config]) => {
      const s = samples(campaign, group, config);
      return [
        label(campaign),
        `${group}/${config}`,
        fmt(median(s.map((s) => s.eventLoopUtilization))),
        fmt(
          median(s.map((s) => s.eventLoopDelayMeanMs).filter(Number.isFinite)),
        ),
        fmt(Math.max(...s.map((s) => s.eventLoopDelayMaxMs))),
      ];
    }),
  ),
);
add(
  'Existing responsiveness instrumentation is used for dispatch controls; sustained binary windows also record ELU, mean and max delay. Resolution is 1 ms. Short samples and OS timer granularity constrain interpretation; low-millisecond Windows/Linux differences are not aggressively compared.',
);
section('RESOURCE / MEMORY OBSERVATIONS');
table(
  [
    'Environment',
    'Final quiescent RSS MiB',
    'Peak sampled RSS MiB',
    'heapUsed MiB',
    'external MiB',
    'arrayBuffers MiB',
  ],
  campaigns.map((campaign) => {
    const soak = campaign.data.checks.find(
      (c) => c.name === '30-second reservation soak',
    )?.result;
    const memory = soak?.samples.at(-1)?.memory;
    return [
      label(campaign),
      mib(memory?.rss),
      mib(Math.max(...(soak?.samples.map((s) => s.memory.rss) ?? []))),
      mib(memory?.heapUsed),
      mib(memory?.external),
      mib(memory?.arrayBuffers),
    ];
  }),
);
add(
  'RSS is process/platform memory context, not proof of a reservation leak. Linux RSS and Windows process working-set accounting are not interchangeable. Heap/external/arrayBuffers describe the reporting isolate; worker isolates and allocator retention complicate attribution. Samples may miss short peaks. Correctness is the repeated return of PJS-owned tasks, operations, reservations, execution correlations and reserved bytes to zero.',
);
section('ARCHITECTURE / PUMP OBSERVATIONS');
add(
  'Covered hostile lifecycle schedules completed under normal, invariant, stress and soak runs without observed deadlocks, missed progress or recursive pump failure. This indirectly supports subsystem ownership/order and the guarded pump. It is not stack-depth instrumentation or exhaustive scheduling proof. ADR 0018 now states: **Subsystem constructors must not synchronously invoke operational callbacks during composition.** Workers start only after all coordinators/telemetry are assigned. Runtime construction was not redesigned.',
);
section('PLATFORM-SPECIFIC FAILURES');
if (failed)
  table(
    ['Environment', 'Failure', 'Exit'],
    campaigns.flatMap((campaign) =>
      campaign.data.failures.map((failure) => [
        label(campaign),
        failure.name,
        failure.exitCode,
      ]),
    ),
  );
else
  add(
    'No PJS correctness, reservation or lifecycle failures in the tested cells. Windows was unavailable, not passing by assumption. Initial dependency download and host execution sandbox restrictions were resolved before the campaign; they are not PJS failures.',
  );
const harnessFailures = campaigns.flatMap((campaign) =>
  campaign.data.failures
    .filter(invalidBatchConfiguration)
    .map((failure) => [label(campaign), failure.name, failure.exitCode]),
);
if (harnessFailures.length) {
  add(
    'The first runner incorrectly requested batch 64. Minimal reproducer: call `partitionRange` with `experimentalDispatchBatchSize: 64`; v0.11 correctly throws `RangeError: experimentalDispatchBatchSize must be an integer between 1 and 16`. Causal explanation: the measurement configuration exceeded the public option’s accepted range. Both runtimes rejected it consistently before timing. All failed outputs remain in original JSON; corrected supported controls are separate supplemental evidence. Runtime code was not changed.',
  );
  table(['Environment', 'Retained harness failure', 'Exit'], harnessFailures);
}
section('VARIANCE / THERMAL NOTES');
for (const campaign of campaigns) {
  const contexts = campaign.data.measurements.flatMap((record) => [
    record.contextBefore,
    record.contextAfter,
  ]);
  const temps = contexts.flatMap((c) =>
    c.temperatures
      .filter((t) => t.type === 'k10temp' && t.milliCelsius !== null)
      .map((t) => Number(t.milliCelsius) / 1000),
  );
  const loads = contexts.map((c) => c.loadAverage?.[0]).filter(Number.isFinite);
  const capacities = contexts
    .flatMap((c) => c.batteries.map((b) => Number(b.capacityPercent)))
    .filter(Number.isFinite);
  add(
    `${label(campaign)}: observed power states ${[...new Set(contexts.map((c) => c.powerSource))].join(', ') || 'unavailable'}; CPU Tctl range ${temps.length ? `${fmt(Math.min(...temps), 1)}–${fmt(Math.max(...temps), 1)} °C` : 'unavailable'}; one-minute load range ${loads.length ? `${fmt(Math.min(...loads), 2)}–${fmt(Math.max(...loads), 2)}` : 'unavailable'}; battery range ${capacities.length ? `${Math.min(...capacities)}–${Math.max(...capacities)}%` : 'unavailable'}.`,
  );
  for (const record of campaign.data.measurements) {
    const clockMs =
      Date.parse(record.contextAfter.timestamp) -
      Date.parse(record.contextBefore.timestamp);
    if (Math.abs(clockMs - record.durationMs) > 30000)
      add(
        `${label(campaign)} / ${record.name}: context wall-clock span ${fmt(clockMs / 1000, 1)} s versus monotonic process span ${fmt(record.durationMs / 1000, 1)} s. This is evidence of an uncontrolled clock/suspension discontinuity, not proof of its cause. The affected process and all samples are retained. No cooldown sleep was inserted.`,
      );
  }
}
add(
  'Contexts include power, battery, governor/frequency, thermal readings, memory and uptime before/after every process. Linux `ps` percentages are lifetime averages, not instantaneous utilization; load averages include prior work. User applications were left running. Timings and process medians include all noise; no samples were removed. The Ryzen reports four cores with one thread/core, so SMT is not a demonstrated explanation on this machine. Frequency snapshots cannot prove or exclude transient throttling. Balanced ordering controls phase bias partially; it does not make battery/background conditions equivalent to an idle AC run.',
);
section('WHAT REPRODUCED');
if (!failed)
  add(
    'Normal correctness, reservation invariants, ten-round stress, hostile lifecycle soak and zero terminal ownership reproduce in every tested cell. Relative batching, mapping, streaming capacity and transfer results are quantified above per environment. Interpret performance reproduction using those ratios and their variance, not equal milliseconds.',
  );
else
  add(
    'See individual passing checks and retained failures; a blanket reproduction claim is not supported.',
  );
for (const campaign of campaigns) {
  const t = (name) => time(campaign, 'relationships', name).median;
  add(
    `${label(campaign)}: cheap-object mapping takes ${fmt(t('map-objects') / t('map-typed'), 1)}× typed numeric mapping; shared-output parallelFor takes ${fmt(t('shared') / t('map-typed'))}× typed-map time; batching tiny no-ops at 8 takes ${fmt(t('noop-batch-8') / t('noop-batch-1'))}× batch-1 time; CPU stream capacity 1 takes ${fmt(t('stream-capacity-1') / t('stream-capacity-8'), 2)}× capacity-8 time; coarse-skew batch 16 takes ${fmt(t('coarse-skew-batch-16') / t('coarse-skew-batch-1'), 2)}× batch-1 time. Ratios quantify which relationships reproduce in each cell; broad advantages are more robust than small percentage differences under this session's variance.`,
  );
}
for (const campaign of campaigns)
  add(
    `${label(campaign)}: worker-generated binary transfer / clone is ${fmt(time(campaign, 'binary-1024', 'transfer').median / time(campaign, 'binary-1024', 'clone').median)} at 1 KiB and ${fmt(time(campaign, 'binary-65536', 'transfer').median / time(campaign, 'binary-65536', 'clone').median)} at 64 KiB. These sampled ratios bracket a crossover where they change from above to below one; exact crossover sizes and OS sensitivity remain unmeasured.`,
  );
section('WHAT DID NOT REPRODUCE');
add(
  'A portable exact percentage for strict binary reservation overhead is not established by this design. Small differences can change sign within retained process/sample variation. Historical architectural regression percentages are not re-measured against v0.10 here. Missing Windows cells cannot be treated as reproduction failures or passes.',
);
section('OPEN GAPS');
add(
  ...(missingOS
    ? [
        '- Fresh exact-reference Windows/i3-10100F runs under the existing Node generations.',
      ]
    : []),
  ...(!missingOS && missingCells.length
    ? [`- Untested Node/OS cells: ${missingCells.join(', ')}.`]
    : []),
  ...(battery
    ? [
        '- Idle AC-powered laptop repeat for primary retained performance conclusions.',
      ]
    : []),
  '- A second independent session for small strict-reservation differences and any large/noisy Node deltas.',
  '- Architectures beyond the actually captured x64 machines remain untested; AMD/Intel is a microarchitecture distinction, not x64-versus-ARM validation.',
);
section('V0.12 READINESS DECISION');
add(
  `**${decision}**. ${failed ? 'Produce a minimal reproducer and causal explanation for recorded correctness/resource failures before changing runtime code or starting v0.12.' : 'The tested correctness and ownership evidence supports proceeding with caveats; complete the missing reproduction cells and control performance conditions before making platform-wide claims. Recommend v0.12 upper-bound binary reservation + refund research after accepting these gaps.'} This campaign stops at validation and does not implement v0.12.`,
);
section('USER-FACING RUN WORKFLOW');
add(
  'Inspect versions and executable paths before running; select existing installations only. The runner never installs Node, changes profiles, changes governors, terminates applications or changes the default runtime. Git and tar must be available; npm dependencies require cache or registry access. Source snapshots are preserved in the printed temporary directory. Existing evidence filenames are refused; use a new `--output` directory for repeats.',
);
add(
  'Fedora (run in the repository; capture inspection output if desired):\n\n```bash\nnode --version\nnpm --version\nwhich node\nwhich npm\nfor manager in nvm fnm volta asdf mise; do command -v "$manager"; done\ngit status\ngit rev-parse HEAD\ngit log -1 --oneline\nnode22_path="$(nvm which 22)"\nnode24_path="$(nvm which 24)"\nnode scripts/cross-platform-v011/run.mjs --node22 "$node22_path" --node24 "$node24_path" --label fedora-ryzen3300u\n```',
);
add(
  'Windows (PowerShell):\n\n```powershell\nnode --version\nnpm --version\nwhere.exe node\nwhere.exe npm\nGet-Command nvm,fnm,volta,asdf,mise -ErrorAction SilentlyContinue\ngit status\ngit rev-parse HEAD\ngit log -1 --oneline\n# Discover installed paths through the existing manager, e.g. nvm list / nvm root.\n# Use the actual version-directory node.exe paths, not a mutable shared symlink.\n$node22 = "<existing absolute Node 22 node.exe path>"\n$node24 = "<existing absolute Node 24 node.exe path>"\nnode scripts/cross-platform-v011/run.mjs --node22 $node22 --node24 $node24 --label windows-i3-10100f\n```',
);
add(
  'If only one generation exists, omit the unavailable flag; the runner uses the current supported generation unless an explicit executable is supplied. For a nonstandard npm layout, supply `--npm22`/`--npm24` with the matching existing `npm-cli.js`. Machine labels are descriptive filenames; hardware claims come from captured metadata, not labels.',
);
add(
  'Transfer original campaign JSON and matching metadata JSON without editing them. To aggregate after independent runs:\n\n```bash\nnode scripts/cross-platform-v011/report.mjs benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node22.json benchmarks/results/cross-platform-v0.11-fedora-ryzen3300u-node24.json benchmarks/results/cross-platform-v0.11-windows-i3-10100f-node22.json benchmarks/results/cross-platform-v0.11-windows-i3-10100f-node24.json\n```\n\nPass only files that actually exist. Repository convention tracks reviewed JSON benchmark evidence, so new raw artifacts are retained in `benchmarks/results/`. No commit is created automatically.',
);
if (rawCampaigns.some((campaign) => campaign.data.supplements))
  add(
    'For this Fedora session, also pass the two `node22.supplement.json` / `node24.supplement.json` files listed below; the aggregator combines only explicitly identified supplements and keeps original metadata/artifacts unchanged. To reproduce the initial harness error correction from its preserved temporary reference, use `scripts/cross-platform-v011/supplement.mjs` with the two completed main campaign files. New campaigns use valid batches and include coarse-skew controls directly.',
  );
section('RAW ARTIFACTS');
for (const campaign of rawCampaigns)
  add(
    `- [${campaign.data.metadata.machineLabel} ${campaign.data.metadata.nodeVersion} campaign](${relative(dirname(output), campaign.file).replaceAll('\\', '/')})\n- [Original metadata](${relative(dirname(output), resolve(dirname(campaign.file), campaign.data.metadataFile)).replaceAll('\\', '/')})`,
  );
await writeFile(output, `${lines.join('\n')}\n`);
console.log(`Wrote ${output}: ${decision}`);

function sectionTable(name) {
  table(
    ['Environment', 'Case', 'Median ms', 'Min–max ms', 'Samples', 'CV %'],
    campaigns.map((campaign) => {
      const st = time(campaign, 'architecture', name);
      return [
        label(campaign),
        name,
        fmt(st.median),
        `${fmt(st.minimum)}–${fmt(st.maximum)}`,
        st.n,
        fmt(st.cv, 1),
      ];
    }),
  );
}
