import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { machineReport } from '../environment.mjs';

const baselineRoot = process.argv[2];
if (!baselineRoot) {
  throw new Error('usage: node regression.mjs <v0.11-root>');
}

const candidateRoot = fileURLToPath(new URL('../../', import.meta.url));
const measure = fileURLToPath(
  new URL('../runtime-architecture/measure.mjs', import.meta.url),
);
const quick = process.env.PJS_BENCH_QUICK === '1';

function run(root, caseName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--expose-gc', measure, root], {
      env: { ...process.env, PJS_BENCH_CASE: caseName },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`measurement exited with code ${code}`));
        return;
      }
      resolve(JSON.parse(output));
    });
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const names = [
  'run-noop',
  'run-medium-cpu',
  'run-clone-input',
  'run-transfer-input',
  'run-shared-input',
  'partition-range',
  'parallel-for',
  'stream-count-only',
  'stream-strict-clone',
  'stream-strict-transfer',
  'map-generic',
  'map-typed',
];
const processOrder = [
  'baseline',
  'candidate',
  'candidate',
  'baseline',
  'candidate',
  'baseline',
  'baseline',
  'candidate',
];
const cases = [];
for (const name of names) {
  const samples = { baseline: [], candidate: [] };
  let repetitions;
  for (const label of processOrder) {
    const root = label === 'baseline' ? baselineRoot : candidateRoot;
    const measurement = await run(root, name);
    const entry = measurement.results[0];
    repetitions = entry.repetitions;
    samples[label].push(...entry.samples);
  }
  const baselineMedianMs = median(samples.baseline);
  const candidateMedianMs = median(samples.candidate);
  cases.push({
    name,
    repetitions,
    baselineMedianMs,
    candidateMedianMs,
    ratio: candidateMedianMs / baselineMedianMs,
    deltaPercent: (candidateMedianMs / baselineMedianMs - 1) * 100,
    samples,
  });
}

const report = {
  version: '0.12.0',
  baseline: '8fcd0fd9e9e3a6987198fce80a338b02c076b0d7 (0.11.0)',
  candidate: 'working tree with v0.12 upper-bound implementation',
  generatedAt: new Date().toISOString(),
  environment: machineReport({ quick }),
  methodology: {
    mode: quick ? 'quick' : 'full',
    processIsolation: 'fresh process and runtime for every case/version run',
    processOrder,
    warmupsPerProcessCase: 2,
    forcedGcBetweenSamples: true,
    retainedSamplesPerVersionCase: (quick ? 2 : 6) * (processOrder.length / 2),
    statistic: 'median of all retained samples',
  },
  cases,
};

const output = fileURLToPath(
  new URL('../results/runtime-regression-v0.12.json', import.meta.url),
);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);

console.table(
  cases.map(({ name, baselineMedianMs, candidateMedianMs, deltaPercent }) => ({
    case: name,
    baselineMs: baselineMedianMs.toFixed(3),
    candidateMs: candidateMedianMs.toFixed(3),
    delta: `${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`,
  })),
);
console.log(`wrote ${output}`);
