import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
const report = JSON.parse(readFileSync(input, 'utf8'));
const lines = [
  '# Retained development campaign results',
  '',
  `Profile: ${report.profile}; Node ${report.node}; ${report.machine.platform} ${report.machine.architecture}.`,
  `Baseline: ${report.packages.baseline.commit}; candidate: ${report.packages.candidate.commit}.`,
  `Status: ${report.status}. ABBA children: ${report.executions.length}. Normal GC; all warmups retained.`,
  '',
  '| Case | Workload | Workers / grain / batch | Correctness | Performance | Baseline ms | Candidate ms | Ratio |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const r of report.results) {
  const c = r.config,
    p = r.initial;
  lines.push(
    `| ${r.id} | ${c.size}; ${c.kind ?? c.mode ?? c.corpus ?? c.transport}; cap=${c.capacity} | ${c.workers}/${c.grain}/${c.batch} | ${r.correctness} | ${r.status} | ${p.baseline?.median.toFixed(3) ?? '—'} | ${p.candidate?.median.toFixed(3) ?? '—'} | ${p.ratio?.toFixed(3) ?? '—'} |`,
  );
}
lines.push(
  '',
  '## Equivalent serial controls',
  '',
  '| Family / size | Parallel backend / workers | Serial ms | Parallel ms | Speedup |',
  '| --- | --- | --- | --- | --- |',
);
for (const r of report.results.filter((r) => r.config.backend !== 'serial')) {
  const c = r.config;
  const control = report.results.find(
    (s) =>
      s.config.backend === 'serial' &&
      ['family', 'size', 'workers', 'kind', 'mode', 'corpus'].every(
        (key) => s.config[key] === c[key],
      ),
  );
  if (!control?.initial.candidate || !r.initial.candidate) continue;
  lines.push(
    `| ${c.family}/${c.size}${c.kind ? '/' + c.kind : ''}${c.mode ? '/' + c.mode : ''}${c.corpus ? '/' + c.corpus : ''} | ${c.backend}/${c.workers} | ${control.initial.candidate.median.toFixed(3)} | ${r.initial.candidate.median.toFixed(3)} | ${(control.initial.candidate.median / r.initial.candidate.median).toFixed(3)} |`,
  );
}
lines.push(
  '',
  'All raw observations remain authoritative. Crossover claims apply only to measured sizes and matching workers/partitions. KDF/hash references use independent invocations of the same native primitive; Monte Carlo validates exact pathwise outputs against a differently partitioned serial kernel, not an independently implemented statistical model. Credits limit visible payload, not backing allocation or process RSS.',
);
assert.equal(report.results.length, report.configuration.length);
writeFileSync(output, lines.join('\n') + '\n', { flag: 'wx' });
