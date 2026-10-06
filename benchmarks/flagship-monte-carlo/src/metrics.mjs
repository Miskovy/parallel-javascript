import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { percentile } from './stats.mjs';

export async function startMetrics() {
  const initial = process.memoryUsage();
  let peak = initial.rss;
  const rssTimer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 10);
  const drifts = [];
  let expected = performance.now() + 10;
  const sentinel = setInterval(() => {
    const now = performance.now();
    drifts.push(Math.max(0, now - expected));
    expected = now + 10;
  }, 10);
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  await delay(25);
  drifts.length = 0;
  histogram.reset();
  const elu = performance.eventLoopUtilization();
  const cpu = process.cpuUsage();
  return async () => {
    const usage = process.cpuUsage(cpu),
      endElu = performance.eventLoopUtilization(elu);
    const final = process.memoryUsage();
    peak = Math.max(peak, final.rss);
    // Let the timer observe a synchronous serial block before stopping it.
    await delay(15);
    clearInterval(rssTimer);
    clearInterval(sentinel);
    histogram.disable();
    return {
      cpuUserMs: usage.user / 1000,
      cpuSystemMs: usage.system / 1000,
      initialMemory: initial,
      finalMemory: final,
      peakRssBytes: peak,
      deltaRssBytes: final.rss - initial.rss,
      processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
      eventLoop: {
        elu: endElu.utilization,
        timerSamples: drifts.length,
        timerP95Ms: percentile(drifts, 0.95),
        timerP99Ms: percentile(drifts, 0.99),
        timerMaxMs: Math.max(0, ...drifts),
        delayP99Ms: Number.isFinite(histogram.mean)
          ? histogram.percentile(99) / 1e6
          : null,
      },
    };
  };
}
