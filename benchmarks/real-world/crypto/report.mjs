import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { distribution } from './support.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: node report.mjs input.json [output.md]');
const report = JSON.parse(await readFile(input, 'utf8'));
assert.equal(
  report.complete,
  true,
  'Incomplete campaigns cannot produce accepted reports',
);
assert.equal(report.runtimeUnchanged, true);
assert.deepEqual(report.runtimeBefore, report.runtimeAfter);
for (const cell of report.cells) {
  assert.equal(cell.trials.length, report.protocol.retainedTrials);
  for (const trial of cell.trials) {
    assert.equal(trial.validated, true);
    assert.equal(trial.errors, 0);
  }
}
const fmt = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';
const med = (cell, get) => distribution(cell.trials.map(get))?.p50;
const lines = [
  '# v0.13 crypto campaign measurements',
  '',
  `Source: \`${input}\`. ${report.cells.length} cells, ${report.skips.length} skips, ` +
    `${report.protocol.retainedTrials} retained trials and ${report.protocol.warmups} warmups per cell.`,
  '',
  'All table metrics are medians across retained trials. Tail columns are medians',
  'of per-trial percentiles, **not** pooled percentiles. CV describes throughput',
  'across trials. Read the methodology and limitations before interpreting ratios.',
  '',
  '## Throughput and end-to-end latency',
  '',
  '| Cell | ops/s median | min–max | CV % | n | wall ms | p50 ms | p90 ms | p95 ms | p99 ms | max ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
];
const cells = [...report.cells].sort((a, b) =>
  a.config.id.localeCompare(b.config.id),
);
for (const c of cells) {
  const d = distribution(c.trials.map((t) => t.opsPerSecond));
  lines.push(
    `| ${c.config.id} | ${fmt(d?.p50)} | ${fmt(d?.min)}–${fmt(d?.max)} | ${fmt(d?.cv * 100)} | ${c.trials.length} | ${fmt(med(c, (t) => t.wallMs))} | ` +
      ['p50', 'p90', 'p95', 'p99', 'max']
        .map((p) => fmt(med(c, (t) => t.latencyMs?.[p])))
        .join(' | ') +
      ' |',
  );
}
lines.push(
  '',
  '## Queue and task body',
  '',
  'Exact queue percentiles are unavailable. Admission-to-body includes dispatch',
  'and input transport as well as queue wait. Native async queue/execution splits',
  'are unavailable. Batched jobs have one latency for all operations in the batch.',
  '',
  '| Cell | queue mean ms | admission p95 ms | body p50 ms | body p95 ms | body p99 ms | runtime execution mean ms | body occupancy % | queue max |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
);
for (const c of cells)
  lines.push(
    `| ${c.config.id} | ` +
      [
        (t) => t.queueMs.mean,
        (t) => t.admissionToBodyMs?.p95,
        (t) => t.executionMs?.p50,
        (t) => t.executionMs?.p95,
        (t) => t.executionMs?.p99,
        (t) => t.runtimeExecutionMeanMs,
        (t) => (t.taskBodyOccupancy == null ? null : t.taskBodyOccupancy * 100),
        (t) => t.observedQueueMax,
      ]
        .map((get) => fmt(med(c, get)))
        .join(' | ') +
      ' |',
  );
lines.push(
  '',
  '## Application responsiveness and resources',
  '',
  'CPU 100% represents one CPU. RSS is sampled process-wide; heap, external and',
  'ArrayBuffer memory in JSON cover only the main isolate. A sampled peak can miss',
  'short-lived allocations. Context switches and thread counts are platform-specific.',
  '',
  '| Cell | CPU % | ELU % | loop mean ms | loop max ms | timer p95 ms | timer p99 ms | fs p95 ms | fs p99 ms | peak RSS MiB | threads peak | involuntary switches |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
);
for (const c of cells)
  lines.push(
    `| ${c.config.id} | ` +
      [
        (t) => t.cpuPercent,
        (t) => t.eventLoopUtilization.utilization * 100,
        (t) => t.eventLoopDelayMs?.mean,
        (t) => t.eventLoopDelayMs?.max,
        (t) => t.timerDelayMs?.p95,
        (t) => t.timerDelayMs?.p99,
        (t) => t.filesystemLatencyMs?.p95,
        (t) => t.filesystemLatencyMs?.p99,
        (t) => t.sampledPeakMemory.rss / 1024 ** 2,
        (t) => t.processThreads.sampledPeak,
        (t) => t.contextSwitches.involuntary,
      ]
        .map((get) => fmt(med(c, get)))
        .join(' | ') +
      ' |',
  );
lines.push('', '## Skips', '');
if (!report.skips.length) lines.push('None.');
for (const skip of report.skips)
  lines.push(`- ${skip.config.id}: ${skip.reason}`);
lines.push(
  '',
  '## Admission control',
  '',
  `Offered ${report.backpressure.offered}; accepted ${report.backpressure.accepted}; ` +
    `rejected ${report.backpressure.rejected}; workers ${report.backpressure.workers}; ` +
    `queue capacity ${report.backpressure.maxQueue}. Accepted results validated; ` +
    'rejections checked as PjsQueueFullError.',
  '',
);
const markdown = lines.join('\n');
if (process.argv[3]) await writeFile(process.argv[3], markdown);
else console.log(markdown);
