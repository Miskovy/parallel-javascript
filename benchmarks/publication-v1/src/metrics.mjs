import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { percentile } from './historical/stats.mjs';

// Timer delays are observations of a 10 ms host sentinel, not response latencies
// of an HTTP server. A separately retained max catches short serial blocks that
// a p95 with a small number of samples could otherwise obscure.
export async function startMetrics() {
  let peak = process.memoryUsage().rss;
  const initialRssBytes = peak;
  const drifts = [];
  let expected = performance.now() + 10,
    armed = false;
  const rss = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 10);
  const sentinel = setInterval(() => {
    const now = performance.now();
    if (armed) drifts.push(Math.max(0, now - expected));
    expected = now + 10;
  }, 10);
  await delay(30);
  // Reset target immediately before workload. Warmup/arming samples excluded.
  expected = performance.now() + 10;
  armed = true;
  const cpu = process.cpuUsage();
  return async () => {
    const usage = process.cpuUsage(cpu);
    const finalRssBytes = process.memoryUsage().rss;
    peak = Math.max(peak, finalRssBytes);
    // Allow the armed sentinel to observe synchronous serial blocking before
    // clearing it; absent observations remain null, never zero.
    await delay(15);
    clearInterval(rss);
    clearInterval(sentinel);
    return {
      cpuMs: (usage.user + usage.system) / 1000,
      initialRssBytes,
      finalRssBytes,
      sampledPeakRssBytes: peak,
      processLifetimeHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
      timer: {
        intervalMs: 10,
        samples: drifts,
        n: drifts.length,
        p95Ms: percentile(drifts, 0.95),
        maxMs: drifts.length ? Math.max(...drifts) : null,
      },
    };
  };
}
