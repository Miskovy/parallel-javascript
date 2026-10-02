import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

// Observe the prepared harness without changing its measurements or environment.
assert.equal(process.platform, 'win32');
const output = process.argv[2];
assert.ok(
  output,
  'Usage: node scripts/crypto-windows-observe.mjs new-threads.json [new-campaign.json]',
);
const campaignOutput =
  process.argv[3] ??
  'benchmarks/results/crypto-v0.13-windows-node24-reproduce.json';
const argv = [
  'benchmarks/real-world/crypto/run.mjs',
  '--profile=reproduce',
  `--output=${campaignOutput}`,
];
const evidence = {
  method:
    'Read-only Get-Process Threads.Count in a persistent PowerShell observer',
  intervalMs: 250,
  scope:
    'Whole process; cell boundaries include startup, both warmups, retained trials and validation. Sampled peaks can miss brief threads. Observer has scheduling cost.',
  command: [process.execPath, ...argv],
  events: [],
  samples: [],
};
writeFileSync(output, '', { flag: 'wx' });
const child = spawn(process.execPath, argv, {
  stdio: ['ignore', 'pipe', 'inherit'],
});
let cell = null;
createInterface({ input: child.stdout }).on('line', (line) => {
  console.log(line);
  if (line.startsWith('RUN ')) cell = line.slice(4);
  evidence.events.push({ timestampMs: Date.now(), line });
});
const observer = spawn('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `$targetProcessId = ${child.pid}; while ($true) { try { $targetProcess = Get-Process -Id $targetProcessId -ErrorAction Stop; $targetProcess.Refresh(); [Console]::WriteLine('{0} {1}', [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), $targetProcess.Threads.Count) } catch { break }; Start-Sleep -Milliseconds 250 }`,
]);
const observerClosed = new Promise((resolve) => {
  observer.once('close', (code, signal) => resolve({ code, signal }));
  observer.once('error', (error) => resolve({ error: String(error) }));
});
let observerErrors = '';
observer.stderr.on('data', (chunk) => (observerErrors += chunk));
createInterface({ input: observer.stdout }).on('line', (line) => {
  const [timestampMs, threads] = line.trim().split(/\s+/).map(Number);
  if (Number.isFinite(timestampMs) && Number.isFinite(threads))
    evidence.samples.push({ timestampMs, threads, cell });
});
const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ code: null, error: String(error) }));
  child.once('close', (code, signal) => resolve({ code, signal }));
});
observer.kill();
evidence.observerResult = await observerClosed;
evidence.result = result;
evidence.observerErrors = observerErrors;
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
assert.equal(result.code, 0);
assert.ok(evidence.samples.length, 'Observer produced no thread samples');
