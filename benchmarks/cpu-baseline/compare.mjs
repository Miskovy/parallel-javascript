import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import {
  availableParallelism,
  cpus,
  loadavg,
  platform,
  release,
} from 'node:os';
import { median } from '../harness.mjs';

assert.ok(process.argv[2], 'Pass a built v0.2 checkout directory');
const roots = {
  baseline: resolve(process.argv[2]),
  candidate: fileURLToPath(new URL('../../', import.meta.url)),
};
const counts = [...new Set([0, 1, Math.min(4, availableParallelism())])];
const config = {
  suite: 'cpu',
  sizes: [100_000, 1_000_000, 5_000_000],
  trials: 3,
  warmups: 1,
  memory: 'clone',
};
const results = [];
for (const workers of counts)
  for (const version of ['baseline', 'candidate', 'candidate', 'baseline']) {
    console.log(`CPU control: ${version}, ${workers || 'serial'}`);
    const hostBefore = {
      loadavg: loadavg(),
      reportedCpuMHz: cpus().map((cpu) => cpu.speed),
    };
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        [
          join(roots[version], 'benchmarks/measure.mjs'),
          JSON.stringify({ ...config, workers }),
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      );
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data) => {
        output += data;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`CPU control failed: ${code}`));
        try {
          resolveResult(JSON.parse(output));
        } catch (error) {
          reject(error);
        }
      });
    });
    results.push({ version, hostBefore, ...result });
  }
const summary = [];
for (const workers of counts)
  for (const size of config.sizes) {
    const byVersion = Object.fromEntries(
      ['baseline', 'candidate'].map((version) => [
        version,
        median(
          results
            .filter((r) => r.version === version && r.workers === workers)
            .flatMap((r) =>
              r.workloads
                .find((w) => w.size === size)
                .samples.map((s) => s.wallMs),
            ),
        ),
      ]),
    );
    summary.push({
      workers,
      size,
      ...byVersion,
      candidateOverBaseline: byVersion.candidate / byVersion.baseline,
    });
  }
await writeFile(
  new URL('../results/cpu-regression-v0.3.json', import.meta.url),
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        cpuModel: cpus()[0]?.model,
        availableParallelism: availableParallelism(),
      },
      methodology: {
        ...config,
        counts,
        order:
          'baseline/candidate/candidate/baseline per worker count; fresh process each time; six retained samples per version/size/count, no outlier removal',
        baseline:
          'Built committed v0.2 source; record commit in accompanying report',
        reason:
          'Follow up phase drift in initial sequential CPU comparison; same kernels and original measurement script in both checkouts',
      },
      results,
      summary,
    },
    null,
    2,
  ) + '\n',
);
console.table(summary);
