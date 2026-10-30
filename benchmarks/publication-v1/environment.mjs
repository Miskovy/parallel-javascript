import {
  availableParallelism,
  cpus,
  totalmem,
  freemem,
  release,
  arch,
  platform,
  loadavg,
} from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { observation } from './lib.mjs';

const read = (path) => {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
};
export function machine() {
  let capacity = availableParallelism();
  const data = {
    cpuModel: cpus()[0]?.model ?? 'unknown',
    logicalCpusObserved: cpus().length,
    availableParallelism: capacity,
    physicalCores: 'unknown',
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    os: platform(),
    release: release(),
    arch: arch(),
    virtualization: 'unknown',
    cpuQuota: 'unknown',
    affinity: 'unknown',
    power: 'unknown',
    backgroundLoad: 'unknown',
    loadAverage: loadavg(),
  };
  if (platform() === 'linux') {
    const status = read('/proc/self/status');
    data.affinity =
      status?.match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1] ?? 'unknown';
    const cgroup = read('/proc/self/cgroup');
    const group = cgroup?.match(/^0::(.*)$/m)?.[1];
    const paths = ['/sys/fs/cgroup/cpu.max'];
    if (group) paths.push(resolve('/sys/fs/cgroup', '.' + group, 'cpu.max'));
    const quotas = paths
      .map((path) => ({ path, value: read(path) }))
      .filter((x) => x.value);
    const v1Quota = read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
    const v1Period = read('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
    if (v1Quota && v1Period)
      quotas.push({ path: 'cgroup-v1', value: `${v1Quota} ${v1Period}` });
    for (const { value } of quotas) {
      const [quota, period] = value.split(/\s+/).map(Number);
      if (quota > 0 && period > 0)
        capacity = Math.min(capacity, Math.max(1, Math.floor(quota / period)));
    }
    data.cpuQuota = {
      cgroup,
      observations: quotas,
      limitation: 'Unobservable ancestor/container host quotas remain unknown',
    };
    const info = read('/proc/cpuinfo');
    if (info) {
      const pairs = new Set(
        info
          .split('\n\n')
          .map((s) => [
            s.match(/^physical id\s*:\s*(\d+)/m)?.[1],
            s.match(/^core id\s*:\s*(\d+)/m)?.[1],
          ])
          .filter((p) => p.every((x) => x !== undefined))
          .map((p) => p.join(':')),
      );
      if (pairs.size) data.physicalCores = pairs.size;
      data.virtualization = {
        hypervisorFlag: /\bhypervisor\b/.test(info),
        containerMarkers: read('/proc/1/cgroup'),
      };
    }
    data.power =
      read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor') ??
      'unknown';
  } else if (platform() === 'win32') {
    data.affinity = observation('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${process.pid}).ProcessorAffinity.ToInt64()`,
    ]);
    data.topologyObservation = observation('powershell.exe', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors | ConvertTo-Json -Compress',
    ]);
    data.virtualization = observation('powershell.exe', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,HypervisorPresent | ConvertTo-Json -Compress',
    ]);
    try {
      const processors = JSON.parse(data.topologyObservation.stdout);
      data.physicalCores = [processors]
        .flat()
        .reduce((s, p) => s + p.NumberOfCores, 0);
    } catch {
      /* Keep the explicitly unknown topology. */
    }
    data.power = observation('powercfg.exe', ['/getactivescheme']);
    data.cpuQuota =
      'Windows job-object CPU quota is not portably observable; availableParallelism includes observable affinity';
  }
  data.usableCapacity = capacity;
  return data;
}
