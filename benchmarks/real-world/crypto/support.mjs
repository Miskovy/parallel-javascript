import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { freemem, loadavg, platform } from 'node:os';
import { machineReport } from '../../environment.mjs';

export function command(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
export function sourceHashes(directory = 'packages/runtime/src') {
  const entries = {};
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (entry.name === 'node_modules') continue;
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else
        entries[relative(process.cwd(), file).replaceAll('\\', '/')] =
          createHash('sha256').update(readFileSync(file)).digest('hex');
    }
  }
  visit(directory);
  return entries;
}
export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance =
    sorted.length > 1
      ? sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (sorted.length - 1)
      : 0;
  const at = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: sorted.length,
    min: sorted[0],
    p50: at(0.5),
    p90: at(0.9),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.at(-1),
    mean,
    cv: mean ? Math.sqrt(variance) / mean : 0,
  };
}
export function environment() {
  return {
    ...machineReport(),
    openssl: process.versions.openssl,
    npm: command(platform() === 'win32' ? 'npm.cmd' : 'npm', ['--version']),
    osDescription:
      platform() === 'linux' ? readFileSync('/etc/os-release', 'utf8') : null,
    powerObserved:
      platform() === 'win32'
        ? command('powercfg', ['/getactivescheme'])
        : command('powerprofilesctl', ['get']),
    governor: command('cat', [
      '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
    ]),
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'default (4)',
    freeMemoryBytes: freemem(),
    loadAverage: loadavg(),
    clientCampaignDate: '2026-10-02',
    timestampFromHost: new Date().toISOString(),
  };
}
