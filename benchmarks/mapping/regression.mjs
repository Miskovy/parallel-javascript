import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { median } from '../harness.mjs';

assert.ok(process.argv[2], 'Pass a built comparison-control directory');
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
    child.stdout.on('data', (value) => {
      stdout += value;
    });
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
const results = [];
for (const version of ['baseline', 'candidate', 'candidate', 'baseline']) {
  process.stderr.write(`Runtime regression control: ${version}\n`);
  results.push({ version, ...(await measure(version)) });
}
const summary = results[0].results.map((entry) => {
  const times = Object.fromEntries(
    ['baseline', 'candidate'].map((version) => [
      version,
      median(
        results
          .filter((result) => result.version === version)
          .flatMap((result) =>
            result.results
              .find((item) => item.name === entry.name)
              .samples.map((sample) => sample.wallMs),
          ),
      ),
    ]),
  );
  return {
    name: entry.name,
    ...times,
    candidateOverBaseline: times.candidate / times.baseline,
  };
});
const report = {
  version: '0.8.0',
  timestamp: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpuModel: cpus()[0]?.model,
  },
  methodology: {
    order: 'baseline/candidate/candidate/baseline in fresh processes',
    samplesPerVersionCase: 10,
    warmupsPerProcessCase: 1,
    baseline:
      'v0.8 source with only stream payload-byte accounting disabled; v0.7 was not committed separately',
    outliers: 'all retained',
  },
  results,
  summary,
};
await writeFile(
  new URL('../results/runtime-regression-v0.8.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.table(summary);
