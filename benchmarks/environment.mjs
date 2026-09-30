import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  arch,
  availableParallelism,
  cpus,
  hostname,
  platform,
  release,
  totalmem,
  type,
} from 'node:os';

function command(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return undefined;
  }
}

function physicalCores() {
  if (platform() === 'linux') {
    try {
      const text = readFileSync('/proc/cpuinfo', 'utf8');
      const pairs = new Set();
      let physical;
      let core;
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('physical id'))
          physical = line.split(':')[1]?.trim();
        if (line.startsWith('core id')) core = line.split(':')[1]?.trim();
        if (line === '' && physical !== undefined && core !== undefined) {
          pairs.add(`${physical}:${core}`);
          physical = undefined;
          core = undefined;
        }
      }
      return pairs.size || undefined;
    } catch {
      return undefined;
    }
  }
  if (platform() === 'win32') {
    const output = command('powershell.exe', [
      '-NoProfile',
      '-Command',
      '(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum',
    ]);
    const value = Number(output);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (platform() === 'darwin') {
    const value = Number(command('sysctl', ['-n', 'hw.physicalcpu']));
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  return undefined;
}

export function machineReport(settings = {}) {
  const gitCommit = command('git', ['rev-parse', 'HEAD']);
  const gitStatus = command('git', ['status', '--porcelain']);
  return {
    machineLabel: process.env.PJS_MACHINE_LABEL ?? hostname(),
    cpuModel: cpus()[0]?.model,
    logicalCpuCount: cpus().length,
    availableParallelism: availableParallelism(),
    physicalCoreCount: physicalCores() ?? null,
    totalMemoryBytes: totalmem(),
    platform: platform(),
    osType: type(),
    release: release(),
    architecture: arch(),
    node: process.version,
    v8: process.versions.v8,
    pjsCommit: gitCommit ?? null,
    worktreeDirty: gitStatus === undefined ? null : gitStatus.length > 0,
    power: process.env.PJS_POWER_MODE ?? 'unknown',
    settings,
  };
}
