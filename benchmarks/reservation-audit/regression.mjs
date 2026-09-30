import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineReport } from '../environment.mjs';

assert.ok(process.argv[2], 'Pass a built v0.9 directory');
const roots = {
  baseline: resolve(process.argv[2]),
  candidate: fileURLToPath(new URL('../../', import.meta.url)),
};

function measure(version) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./regression-measure.mjs', import.meta.url)),
        roots[version],
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0)
        return reject(new Error(`regression child exited ${code}`));
      try {
        resolveResult(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const order = ['baseline', 'candidate', 'candidate', 'baseline'];
const results = [];
for (const version of order) {
  process.stderr.write(`Reservation regression: ${version}\n`);
  results.push({ version, ...(await measure(version)) });
}
const names = results[0].results.map((entry) => entry.name);
const summary = names.map((name) => {
  const timing = Object.fromEntries(
    ['baseline', 'candidate'].map((version) => [
      version,
      median(
        results
          .filter((result) => result.version === version)
          .flatMap((result) =>
            result.results
              .find((entry) => entry.name === name)
              .samples.map((sample) => sample.wallMs),
          ),
      ),
    ]),
  );
  return {
    name,
    ...timing,
    candidateOverBaseline: timing.candidate / timing.baseline,
  };
});
const report = {
  version: '0.10.0',
  timestamp: new Date().toISOString(),
  environment: machineReport({ baseline: roots.baseline }),
  methodology: {
    order: 'v0.9/v0.10/v0.10/v0.9, fresh processes',
    samplesPerVersionCase: process.env.PJS_BENCH_QUICK === '1' ? 2 : 10,
    outliers: 'all retained',
  },
  results,
  summary,
};
await writeFile(
  new URL('../results/runtime-regression-v0.10.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
