import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

function read(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}
function command(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function directories(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function context() {
  const result = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: os.uptime(),
    loadAverage: process.platform === 'win32' ? null : os.loadavg(),
    freeMemoryBytes: os.freemem(),
    cpuMHz: os.cpus().map((cpu) => cpu.speed),
    powerSource: 'unavailable',
    powerProfile: null,
    batteries: [],
    cpuFrequency: [],
    temperatures: [],
  };
  if (process.platform === 'linux') {
    const supplies = directories('/sys/class/power_supply').map((name) => {
      const base = join('/sys/class/power_supply', name);
      return {
        name,
        type: read(join(base, 'type')),
        online: read(join(base, 'online')),
        status: read(join(base, 'status')),
        capacityPercent: read(join(base, 'capacity')),
      };
    });
    result.batteries = supplies.filter((supply) => supply.type === 'Battery');
    const ac = supplies.filter((supply) => supply.type === 'Mains');
    result.powerSource = ac.some((supply) => supply.online === '1')
      ? 'AC'
      : result.batteries.some((supply) => supply.status === 'Discharging')
        ? 'battery'
        : 'unavailable';
    result.powerSupplies = supplies;
    result.powerProfile = command('powerprofilesctl', ['get']);
    result.memoryInfo = read('/proc/meminfo');
    result.backgroundProcesses = command('ps', [
      '-eo',
      'pid,comm,pcpu,pmem',
      '--sort=-pcpu',
    ])
      ?.split('\n')
      .slice(0, 9);
    for (const name of directories('/sys/devices/system/cpu').filter((name) =>
      /^cpu\d+$/.test(name),
    )) {
      const base = join('/sys/devices/system/cpu', name, 'cpufreq');
      if (existsSync(base))
        result.cpuFrequency.push({
          cpu: name,
          governor: read(join(base, 'scaling_governor')),
          driver: read(join(base, 'scaling_driver')),
          currentKHz: read(join(base, 'scaling_cur_freq')),
          minimumKHz: read(join(base, 'scaling_min_freq')),
          maximumKHz: read(join(base, 'scaling_max_freq')),
        });
    }
    for (const name of directories('/sys/class/thermal').filter((name) =>
      name.startsWith('thermal_zone'),
    )) {
      const base = join('/sys/class/thermal', name);
      result.temperatures.push({
        type: read(join(base, 'type')),
        milliCelsius: read(join(base, 'temp')),
      });
    }
    for (const name of directories('/sys/class/hwmon')) {
      const base = join('/sys/class/hwmon', name);
      for (const input of directories(base).filter((file) =>
        /^temp\d+_input$/.test(file),
      ))
        result.temperatures.push({
          type: read(join(base, 'name')),
          label: read(join(base, input.replace('_input', '_label'))),
          milliCelsius: read(join(base, input)),
        });
    }
  } else if (process.platform === 'win32') {
    const raw = command('powershell.exe', [
      '-NoProfile',
      '-Command',
      '$o=Get-CimInstance Win32_OperatingSystem; $p=Get-CimInstance Win32_Processor; $b=@(Get-CimInstance Win32_Battery); [pscustomobject]@{os=$o.Caption;version=$o.Version;freePhysicalMemoryKiB=$o.FreePhysicalMemory;cpuLoadPercent=@($p.LoadPercentage);processors=@($p | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);batteries=@($b | Select-Object BatteryStatus,EstimatedChargeRemaining)} | ConvertTo-Json -Depth 5 -Compress',
    ]);
    result.windows = raw ? JSON.parse(raw) : null;
    result.powerProfile = command('powercfg.exe', ['/getactivescheme']);
    result.batteries = result.windows?.batteries ?? [];
    // BatteryStatus 1 means discharging, 2 means AC. No battery is not proof of AC.
    if (result.batteries.some((battery) => battery.BatteryStatus === 1))
      result.powerSource = 'battery';
    else if (result.batteries.some((battery) => battery.BatteryStatus === 2))
      result.powerSource = 'AC';
  }
  return result;
}

export function metadata() {
  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    os: os.type(),
    osVersion: os.version(),
    osRelease: os.release(),
    kernel: os.release(),
    architecture: os.arch(),
    platform: os.platform(),
    cpuModel: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
    availableParallelism: os.availableParallelism(),
    memoryTotalBytes: os.totalmem(),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    versions: process.versions,
    nodeExecutable: process.execPath,
    osReleaseFile: read('/etc/os-release'),
    cpuTopology: process.platform === 'linux' ? command('lscpu', ['-J']) : null,
    context: context(),
  };
}

if (process.argv[2] === '--metadata')
  process.stdout.write(JSON.stringify(metadata()));
