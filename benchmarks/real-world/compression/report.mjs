import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { distribution } from '../crypto/support.mjs';
export function validateReport(report) {
  assert.equal(report.complete, true);
  assert.equal(report.failure, null);
  assert.deepEqual(report.runtimeBefore, report.runtimeAfter);
  assert.deepEqual(report.harnessBefore, report.harnessAfter);
  assert.equal(
    new Set(report.cells.map((c) => c.config.id)).size,
    report.cells.length,
  );
  for (const cell of report.cells) {
    assert.equal(cell.trials.length, report.profile === 'smoke' ? 1 : 6);
    assert.equal(cell.warmups.length, report.profile === 'smoke' ? 1 : 2);
    for (const t of [...cell.trials, ...cell.warmups]) {
      assert.equal(t.correctness, true);
      assert.ok(t.wallMs > 0);
      if (t.terminal)
        for (const value of Object.values(t.terminal)) assert.equal(value, 0);
    }
  }
}
export function render(report) {
  validateReport(report);
  const number = (v) => (v === null || v === undefined ? '—' : v.toFixed(2));
  const median = (cell, key) => distribution(cell.trials.map(key)).p50;
  let text = `# v0.14 complete measurements\n\n${report.environment.platform}, ${report.environment.cpuModel}, Node ${report.environment.node}, zlib ${report.environment.zlib}. ${report.cells.length} cells; ${report.cells.length * 6} retained trials (${report.profile}). No discarded valid trials. Values below are medians of per-trial metrics, not pooled percentiles. See raw artifacts for every sample and warmup.\n\n`;
  for (const group of [
    ...new Set(report.cells.map((c) => c.config.group)),
  ].sort()) {
    text += `## ${group}\n\n| Cell | Input MiB/s | Output MiB/s | Min–max input | CV % | Wall ms | Ratio | First ms | 10% ms | 50% ms | p50 / p95 / p99 ms | Queue / body mean ms | CPU % | Occupancy | FS p95 ms (samples) | Timer p99 ms | Peak RSS MiB |\n| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | ---: | ---: |\n`;
    for (const cell of report.cells.filter((c) => c.config.group === group)) {
      const rates = distribution(cell.trials.map((t) => t.inputMiBs));
      const nullable = (key) => {
        const values = cell.trials
          .map(key)
          .filter((v) => v !== null && v !== undefined);
        return values.length ? distribution(values).p50 : null;
      };
      text += `| ${cell.config.id} | ${number(rates.p50)} | ${number(median(cell, (t) => t.outputMiBs))} | ${number(rates.min)}–${number(rates.max)} | ${number(rates.cv * 100)} | ${number(median(cell, (t) => t.wallMs))} | ${number(median(cell, (t) => t.ratio))} | ${number(median(cell, (t) => t.firstMs))} | ${number(median(cell, (t) => t.tenPercentMs))} | ${number(median(cell, (t) => t.fiftyPercentMs))} | ${['p50', 'p95', 'p99'].map((k) => number(median(cell, (t) => t.latencyMs[k]))).join(' / ')} | ${number(nullable((t) => t.queueMeanMs))} / ${number(nullable((t) => t.bodyMs?.mean))} | ${number(median(cell, (t) => t.cpuPercent))} | ${number(nullable((t) => t.workerBodyOccupancy))} | ${number(nullable((t) => t.fsLatencyMs?.p95))} (${number(nullable((t) => t.fsLatencyMs?.count))}) | ${number(nullable((t) => t.timerDelayMs?.p99))} | ${number(median(cell, (t) => t.memory.peak.rss / 1024 ** 2))} |\n`;
    }
  }
  text +=
    '\n## Credit evidence\n\nCount-only and public run queue cells do not reserve binary bytes. Declared/refunded values sum the complete timed trial, including corpus repetitions. Trace peaks are sampled; runtime reservation invariants are checked separately.\n\n| Cell | Declared MiB | Actual output MiB | Refund MiB | Refund count | Actual/max % | Waits | Sampled peak credit MiB | Whole-stream bytes | Block bytes (one pass) |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n';
  for (const cell of report.cells.filter(
    (c) => c.config.model === 'pjs' && !c.config.deep,
  )) {
    const m = (key) => {
      const values = cell.trials
        .map(key)
        .filter((v) => v !== null && v !== undefined);
      return values.length ? distribution(values).p50 : null;
    };
    text += `| ${cell.config.id} | ${number(m((t) => (t.declaredMaximumBytes === null ? null : t.declaredMaximumBytes / 1024 ** 2)))} | ${number(m((t) => t.outputBytes / 1024 ** 2))} | ${number(m((t) => t.streamCounters.refundedResultBytes / 1024 ** 2))} | ${number(m((t) => t.streamCounters.resultByteRefunds))} | ${number(m((t) => (t.declaredMaximumBytes ? (100 * t.outputBytes) / t.declaredMaximumBytes : null)))} | ${number(m((t) => t.streamCounters.resultByteReservationWaits))} | ${number(m((t) => t.peakReservedBytes / 1024 ** 2))} | ${cell.wholeStreamBytes} | ${number(m((t) => t.compressedBytes / t.repetitions))} |\n`;
  }
  return text;
}
if (
  process.argv[1]?.endsWith('compression/report.mjs') ||
  process.argv[1]?.endsWith('compression\\report.mjs')
) {
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  await writeFile(process.argv[3], render(report));
}
