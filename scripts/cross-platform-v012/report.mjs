import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const COMMIT = '18f0c87e7b7920179403bbc396afabced6bb06c4';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node scripts/cross-platform-v012/report.mjs <campaign.json>... [--output <report.md>]; matching .metadata.json companions are required',
  );
  process.exit(0);
}
const outputIndex = args.indexOf('--output');
const output = resolve(
  outputIndex < 0 ? 'docs/cross-platform-v0.12.md' : args[outputIndex + 1],
);
if (outputIndex >= 0) args.splice(outputIndex, 2);
assert.ok(args.length, 'Pass original campaign JSON, not metadata JSON');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const campaigns = [];
for (const input of args) {
  assert.ok(!input.endsWith('.metadata.json'), 'Pass campaign inputs only');
  const file = resolve(input);
  const bytes = await readFile(file);
  const data = JSON.parse(bytes);
  const metadataFile = file.replace(/\.json$/, '.metadata.json');
  assert.notEqual(metadataFile, file, 'Campaign input must end in .json');
  const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
  assert.equal(data.version, '0.12.0');
  assert.equal(data.sourceCommit, COMMIT);
  assert.notEqual(data.status, 'running', `${input} is still running`);
  assert.ok(['reduced', 'full'].includes(data.mode));
  assert.equal(metadata.sourceCommit, COMMIT);
  assert.equal(metadata.mode, data.mode);
  assert.equal(metadata.label, data.label);
  assert.equal(metadata.environment.nodeVersion, data.environment.node);
  assert.equal(metadata.lockfileSha256, data.lockfileSha256);
  assert.equal(
    metadata.campaignFileSha256,
    sha256(bytes),
    'Evidence hash mismatch',
  );
  assert.ok(metadata.contextSamples.length >= 2, 'Missing power observations');
  if (campaigns.length) {
    assert.equal(data.lockfileSha256, campaigns[0].data.lockfileSha256);
    assert.deepEqual(data.sourceFileSha256, campaigns[0].data.sourceFileSha256);
  }
  const cell = `${data.environment.platform}/Node ${data.environment.node.slice(1).split('.')[0]}/${data.mode}`;
  assert.ok(!campaigns.some((c) => c.cell === cell), `Duplicate cell: ${cell}`);
  campaigns.push({ file, metadataFile, data, metadata, cell });
}
campaigns.sort((a, b) => a.cell.localeCompare(b.cell));
const label = (c) =>
  `${c.data.label} / ${c.data.environment.node} / ${c.data.mode}`;
const check = (c, name) => c.data.checks.find((record) => record.name === name);
function testSummary(c, name) {
  const stdout = check(c, name)?.stdout ?? '';
  const number = (key) =>
    Number(
      stdout.match(
        new RegExp(`^(?:#|ℹ)?[ \\t]*${key} (\\d+(?:\\.\\d+)?)`, 'm'),
      )?.[1] ?? NaN,
    );
  return {
    tests: number('tests'),
    pass: number('pass'),
    fail: number('fail'),
    cancelled: number('cancelled'),
    seconds: number('duration_ms') / 1000,
  };
}
const soak = (c) => c.data['reservation-soak-v0.12.json'];
const matrix = (c) => c.data['upper-bound-results-v0.12.json'];
const rounds = (c) =>
  (
    check(c, 'ten stress rounds')?.stdout.match(
      /Stress round \d+\/10 passed/g,
    ) ?? []
  ).length;
const zero = (record, keys) => keys.every((key) => record?.[key] === 0);
const terminalKeys = [
  'tasksPending',
  'operationsPending',
  'reservations',
  'executions',
  'creditOperations',
  'currentReservedResultBytes',
  'unreconciledResultBytes',
  'reconciledResultBytes',
];
function gateFailures(c) {
  const failures = [...c.data.failures];
  if (c.data.status !== 'complete' || c.metadata.processResult.code !== 0)
    failures.push('Campaign or observer did not complete successfully');
  if (c.data.sourceVerifiedUnchanged !== true)
    failures.push('Reference source preservation not verified');
  for (const name of [
    'locked dependencies',
    'build',
    'test:types',
    'typecheck:compat',
    'lint',
    'format:check',
    'complete normal suite',
    'complete invariant suite',
    'reservation soak',
    ...(c.data.mode === 'full'
      ? ['ten stress rounds', 'upper-bound benchmark matrix']
      : []),
  ])
    if (check(c, name)?.code !== 0)
      failures.push(`Missing or failed check: ${name}`);
  for (const name of ['complete normal suite', 'complete invariant suite']) {
    const s = testSummary(c, name);
    if (s.tests !== 178 || s.pass !== 178 || s.fail !== 0 || s.cancelled !== 0)
      failures.push(`Incomplete pinned 178-test suite: ${name}`);
  }
  if (!zero(soak(c)?.final, terminalKeys) || soak(c)?.final.state !== 'stopped')
    failures.push('Soak terminal ownership did not reach zero');
  const duration = c.data.mode === 'full' ? 30000 : 5000;
  if (
    !(soak(c)?.elapsedMs >= duration) ||
    soak(c)?.environment.settings.durationMs !== duration
  )
    failures.push('Missing configured soak duration');
  if (c.data.mode === 'full') {
    if (rounds(c) !== 10) failures.push('Incomplete ten-round stress');
    const m = matrix(c);
    const names = m?.results.map((r) => r.config.name) ?? [];
    if (
      m?.environment.settings.quick !== false ||
      m?.environment.settings.trials !== 6 ||
      names.length !== 33 ||
      new Set(names).size !== 33 ||
      m?.order.length !== 198 ||
      !m.results.every(
        (r) =>
          r.measurements.length === 6 &&
          r.measurements.every(
            (measurement) =>
              zero(measurement.terminal, [
                'reservations',
                'executions',
                'operations',
              ]) && Number.isFinite(measurement.resultsPerSecond),
          ),
      )
    )
      failures.push(
        'Full matrix is incomplete or has nonzero terminal ownership',
      );
    if (m)
      for (let trial = 0; trial < 6; trial++) {
        const order = m.order
          .filter((entry) => entry.trial === trial)
          .map((entry) => entry.name);
        if (
          order.length !== 33 ||
          new Set(order).size !== 33 ||
          order.some((name) => !names.includes(name))
        )
          failures.push(`Incomplete matrix ordering in trial ${trial + 1}`);
      }
  }
  return [...new Set(failures)];
}
for (const c of campaigns) c.gateFailures = gateFailures(c);
const requested = ['linux', 'win32'].flatMap((platform) => [
  `${platform}/Node 22/reduced`,
  `${platform}/Node 24/full`,
]);
const missing = requested.filter(
  (cell) => !campaigns.some((c) => c.cell === cell),
);
const failed = campaigns.some((c) => c.gateFailures.length);
const decision = failed ? 'NOT READY' : 'READY WITH CAVEATS';
const fmt = (n, digits = 2) =>
  Number.isFinite(n) ? n.toFixed(digits) : 'unavailable';
function stats(values) {
  if (!values.length) return { median: NaN, cv: NaN, min: NaN, max: NaN };
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const cv =
    Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    ) / mean;
  return { median, cv, min: sorted[0], max: sorted.at(-1) };
}
const measured = (c, name, key) =>
  stats(
    matrix(c)
      ?.results.find((r) => r.config.name === name)
      ?.measurements.map((m) => m[key]) ?? [],
  );
const lines = [];
const add = (...text) => lines.push(...text, '');
const section = (title) => add(`## ${title}`);
const table = (headers, rows) =>
  add(
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) =>
        `| ${row.map((v) => String(v).replaceAll('|', '\\|')).join(' | ')} |`,
    ),
  );
add(
  '# PJS v0.12 cross-platform validation',
  `Generated from original campaign JSON and companion metadata on ${new Date().toISOString()}.`,
);
section('VALIDATION SUMMARY');
add(
  `**${decision}.** ${failed ? 'Recorded correctness, resource, or completeness failures require investigation.' : 'All included cells pass the pinned correctness and terminal-ownership gates.'} ${missing.length ? `Requested cells still missing: ${missing.join(', ')}.` : 'All four requested Fedora/AMD and Windows/Intel cells are complete.'}`,
);
add(
  'Node 22 reduced is correctness coverage with a five-second soak; Node 24 full adds ten stress rounds, a 30-second soak, and the benchmark matrix. These unequal protocols do not support a Node 22-versus-24 performance comparison. The API remains experimental as described in [the implementation report](benchmarks-v0.12.md). This campaign does not begin v0.13.',
);
section('PINNED SOURCE AND PROVENANCE');
add(
  `Validated implementation: \`${COMMIT}\`. Each prepared runner extracts this exact commit with \`git archive\`; measurements use disposable reference directories rather than the current working tree. All input source manifests and lockfile hashes agree. Companion hashes bind metadata to the original campaign bytes. Raw JSON is neither edited nor reformatted.`,
);
table(
  ['Environment', 'Controller commit', 'Lockfile SHA-256', 'Source unchanged'],
  campaigns.map((c) => [
    label(c),
    `\`${c.metadata.controllerCommit}\``,
    `\`${c.data.lockfileSha256}\``,
    c.data.sourceVerifiedUnchanged === true ? 'verified' : 'not verified',
  ]),
);
add(
  'Nested machine helpers may report the controller commit or null inside an archive. The authoritative implementation identity is sourceCommit plus the archive/source hashes. Runtime/API semantics, prepared runner, and original Fedora artifacts remain unchanged.',
);
section('MACHINE AND NODE MATRIX');
table(
  [
    'Environment',
    'OS / kernel',
    'CPU',
    'Architecture',
    'Physical / logical / available CPUs',
    'RAM GiB',
    'npm',
  ],
  campaigns.map((c) => {
    const e = c.data.environment;
    return [
      label(c),
      `${c.metadata.environment.osVersion}; ${e.release}`,
      e.cpuModel,
      e.architecture,
      `${e.physicalCoreCount ?? '?'} / ${e.logicalCpuCount} / ${e.availableParallelism}`,
      fmt(e.totalMemoryBytes / 2 ** 30),
      c.metadata.npmVersion,
    ];
  }),
);
section('POWER AND OPERATING CONDITIONS');
table(
  [
    'Environment',
    'Initial power value',
    'Observed sources',
    'Observed plans / governors',
    'Samples',
  ],
  campaigns.map((c) => [
    label(c),
    c.metadata.powerEnvironmentValue,
    [...new Set(c.metadata.contextSamples.map((s) => s.powerSource))].join(
      ', ',
    ),
    [
      ...new Set(
        c.metadata.contextSamples
          .flatMap((s) => [
            s.powerProfile,
            ...(s.cpuFrequency ?? []).map((f) => f.governor),
          ])
          .filter(Boolean),
      ),
    ].join(', ') || 'unavailable',
    c.metadata.contextSamples.length,
  ]),
);
add(
  'The companion observer samples before/after each invocation and every 30 seconds, using the existing machine/context helper. Windows plan GUID/name is captured from powercfg and passed as PJS_POWER_MODE only within the campaign process. No default Node, persistent PATH, shell profile, governor, or power plan is changed. No applications are terminated. A desktop without a battery is not assumed to be on AC; its source may remain unavailable while the plan is known. Periodic samples do not prove continuous power/frequency/load conditions between samples.',
);
section('CORRECTNESS, INVARIANTS, STRESS AND SOAK');
table(
  [
    'Environment',
    'Normal pass / fail',
    'Invariant pass / fail',
    'Build / types / compatibility / lint / format',
    'Stress',
    'Soak seconds / iterations',
  ],
  campaigns.map((c) => {
    const normal = testSummary(c, 'complete normal suite');
    const invariant = testSummary(c, 'complete invariant suite');
    return [
      label(c),
      `${normal.pass} / ${normal.fail}`,
      `${invariant.pass} / ${invariant.fail}`,
      ['build', 'test:types', 'typecheck:compat', 'lint', 'format:check'].every(
        (n) => check(c, n)?.code === 0,
      )
        ? 'all pass'
        : 'failed/incomplete',
      c.data.mode === 'full'
        ? `${rounds(c)} / 10; ${rounds(c) * invariant.tests} test executions`
        : 'not included in reduced mode',
      `${fmt(soak(c)?.elapsedMs / 1000)} / ${soak(c)?.iterations ?? 'unavailable'}`,
    ];
  }),
);
add(
  'Both complete suites cover the pinned 178 tests, including preserved exact equality, upper-bound violations, zero-length binary values, transfer ownership, per-item batch reconciliation, cancellation/timeout, failure/crash, fairness, and shutdown. The invariant suite and full stress use PJS_DEBUG_RESERVATION_INVARIANTS=1. The original mixed soak includes exact and upper-bound lifecycle scenarios; failed commands are retained and never silently retried.',
);
section('TERMINAL OWNERSHIP');
table(
  [
    'Environment',
    'Tasks / operations / reservations / executions / credit operations',
    'Reserved / unreconciled / reconciled bytes',
    'Worker failures / replacements',
  ],
  campaigns.map((c) => {
    const f = soak(c)?.final;
    return [
      label(c),
      terminalKeys
        .slice(0, 5)
        .map((key) => f?.[key] ?? '?')
        .join(' / '),
      terminalKeys
        .slice(5)
        .map((key) => f?.[key] ?? '?')
        .join(' / '),
      `${f?.workerFailures ?? '?'} / ${f?.workerRestarts ?? '?'}`,
    ];
  }),
);
add(
  'Every complete full-matrix measurement also asserts zero reservations, execution correlations, and credit operations. Crash/replacement counts above are intentional hostile scenarios. RSS and allocator retention are platform memory context, not evidence of a credit leak; original memory/scenario samples remain in campaign JSON.',
);
section('NODE 24 FULL BENCHMARK MATRIX');
add(
  'Each full cell retains 33 configurations × six trials = 198 measurements. Cases rotate and reverse between trials, with two warmups and a fresh runtime per case inside one benchmark process. Trials are not independent machine sessions or fresh processes. Throughput CV below uses population standard deviation divided by mean, matching the prepared benchmark. All samples, including outliers, remain retained.',
);
add(
  'The matrix covers utilization 1/0.75/0.5/0.25/0.1/0.01; byte capacities 1/4/16 blocks; variable RLE count/exact/upper/held-maximum with fast/slow consumers; constrained refund controls; and equal exact/upper clone/transfer. Held-maximum suppresses reconciliation only on a benchmark runtime instance; it is not a shipping runtime option.',
);
for (const c of campaigns.filter((c) => c.data.mode === 'full')) {
  add(`### ${label(c)}`);
  table(
    [
      'Case',
      'Results/s median',
      'Min–max',
      'CV %',
      'Host sizing ms median',
      'Refund MiB median',
      'First result ms median',
      'Worker occupancy median',
    ],
    (matrix(c)?.results ?? []).map((r) => {
      const t = stats(r.measurements.map((m) => m.resultsPerSecond));
      const m = (key) =>
        stats(r.measurements.map((sample) => sample[key])).median;
      return [
        r.config.name,
        fmt(t.median, 1),
        `${fmt(t.min, 1)}–${fmt(t.max, 1)}`,
        fmt(t.cv * 100, 1),
        fmt(m('hostSizingMs')),
        fmt(m('refundBytes') / 2 ** 20),
        fmt(m('firstResultMs')),
        fmt(m('workerOccupancy')),
      ];
    }),
  );
}
section('WITHIN-MACHINE RELATIONSHIPS');
table(
  [
    'Environment',
    'Fast RLE upper / exact throughput',
    'Slow RLE upper / exact throughput',
    'Constrained slow refund upper / held throughput',
    'Equal upper / exact clone throughput',
    'Equal upper / exact transfer throughput',
  ],
  campaigns
    .filter((c) => c.data.mode === 'full')
    .map((c) => {
      const throughput = (name) => measured(c, name, 'resultsPerSecond').median;
      return [
        label(c),
        fmt(
          throughput('variable-upper-consumer-0') /
            throughput('variable-exact-consumer-0'),
        ),
        fmt(
          throughput('variable-upper-consumer-1') /
            throughput('variable-exact-consumer-1'),
        ),
        fmt(
          throughput('refund-upper-slow') /
            throughput('refund-held-maximum-slow'),
        ),
        fmt(throughput('equal-upper-clone') / throughput('equal-exact-clone')),
        fmt(
          throughput('equal-upper-transfer') /
            throughput('equal-exact-transfer'),
        ),
      ];
    }),
);
add(
  'Ratios greater than one favor upper-bound throughput for the named workload. Exact variable RLE performs host sizing; equal-bound controls isolate contract-mode overhead more closely. Refund counters measure successful slack reconciliation, not consumer release. Conservative bounds constrain admission before actual size is known; refund does not make worker allocation or consumer memory bounded. Interpret small differences against retained variance, sample windows, and operating conditions.',
);
for (const c of campaigns.filter((c) => c.data.mode === 'full')) {
  const throughput = (name) => measured(c, name, 'resultsPerSecond').median;
  add(
    `${label(c)}: fast variable RLE upper / host-sized exact throughput is ${fmt(throughput('variable-upper-consumer-0') / throughput('variable-exact-consumer-0'))}×, with median host sizing ${fmt(measured(c, 'variable-exact-consumer-0', 'hostSizingMs').median)} ms for exact and ${fmt(measured(c, 'variable-upper-consumer-0', 'hostSizingMs').median)} ms for upper. Slow-consumer RLE upper / exact throughput is ${fmt(throughput('variable-upper-consumer-1') / throughput('variable-exact-consumer-1'))}×. The constrained slow refund upper / held-maximum control is ${fmt(throughput('refund-upper-slow') / throughput('refund-held-maximum-slow'))}×. These are within-session workload ratios, not portable guarantees.`,
  );
}
add(
  'Avoiding duplicate host sizing benefits the retained fast-RLE controls in both full cells. The slow-consumer controls show that this advantage can diminish. Refund correctness and terminal cleanup reproduce, but these sessions do not establish a portable throughput gain from refunds under the constrained slow-consumer control. The separate local refund trace remains separate evidence, rather than a result silently substituted into this matrix.',
);
section('CROSS-PLATFORM REPRODUCTION AND LIMITS');
add(
  failed
    ? 'See failed gates below; a blanket reproduction claim is unsupported.'
    : 'The included cells reproduce complete normal/invariant correctness and zero terminal ownership. Full cells additionally reproduce stress and the complete upper-bound matrix. Relative benefits and costs are quantified per machine above; their magnitudes need independent replication.',
);
add(
  'Fedora/AMD and Windows/Intel differ in CPU, OS, logical parallelism, and power context. Their absolute throughput cannot isolate OS speed. Node 22 reduced supplies no performance matrix or ten-round stress; Node 22 full remains additional coverage rather than a completed cell. macOS/ARM64 and repeated independent sessions remain untested. The separate v0.11 and local v0.12 regression experiments are historical controls, not rerun or merged into this campaign.',
);
section('FAILURES AND READINESS');
if (failed)
  table(
    ['Environment', 'Failed gate'],
    campaigns.flatMap((c) =>
      c.gateFailures.map((failure) => [label(c), failure]),
    ),
  );
else
  add(
    'No recorded correctness, lifecycle, source-preservation, matrix-completeness, or terminal-credit failures in the included cells.',
  );
add(
  `**${decision}.** ${missing.length ? `Finish missing requested cells: ${missing.join(', ')}. ` : ''}Review performance variance and operating conditions before portable performance claims. Keep the adopted v0.12 API experimental. This execution stops at validation and does not implement or begin v0.13.`,
);
section('ORIGINAL ARTIFACTS AND REPRODUCTION');
const link = (file) => relative(dirname(output), file).replaceAll('\\', '/');
for (const c of campaigns)
  add(
    `- [${label(c)} campaign](${link(c.file)})\n- [Original companion metadata](${link(c.metadataFile)})`,
  );
add(
  'Use existing Node and matching npm-cli.js paths. The read-only observer invokes the prepared runner, records actual power settings, and refuses existing campaign or companion filenames. For repeats, choose a new output directory.',
);
add(
  '```powershell\nnode scripts/cross-platform-v012/observe.mjs --commit ' +
    COMMIT +
    ' --mode reduced --label windows-i3-10100f --node "<existing Node 22 node.exe>" --npm "<matching npm-cli.js>"\nnode scripts/cross-platform-v012/observe.mjs --commit ' +
    COMMIT +
    ' --mode full --label windows-i3-10100f --node "<existing Node 24 node.exe>" --npm "<matching npm-cli.js>"\n```',
);
add(
  'Regenerate from campaign inputs only; matching companions are discovered beside each input:\n\n```powershell\nnode scripts/cross-platform-v012/report.mjs ' +
    campaigns
      .map((c) => relative(process.cwd(), c.file).replaceAll('\\', '/'))
      .join(' ') +
    '\n```',
);
await writeFile(output, lines.join('\n') + '\n');
console.log(`Wrote ${output}: ${decision}`);
if (failed) process.exitCode = 1;
