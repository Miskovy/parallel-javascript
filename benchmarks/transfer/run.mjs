import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { median, runSuite } from '../harness.mjs';

const probes = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./measure.mjs', import.meta.url))],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code !== 0) {
      reject(new Error(`Transfer probe failed (${code})`));
      return;
    }
    try {
      resolve(JSON.parse(output));
    } catch (error) {
      reject(error);
    }
  });
});
const directory = new URL('../results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('transfer-v0.2.json', directory),
  JSON.stringify(probes, null, 2) + '\n',
);
console.table(
  probes.results.map((result) => ({
    bytes: result.bytes,
    mode: result.mode,
    rawWallMs: result.samples
      .map((sample) => sample.wallMs.toFixed(3))
      .join(', '),
    medianMs: median(result.samples.map((sample) => sample.wallMs)).toFixed(3),
  })),
);

// Sequential fresh processes prevent clone and transfer runs from competing for CPUs.
const clone = await runSuite('matrix', [128, 256, 512], {
  memory: 'clone',
  outputName: 'matrix-clone-v0.2',
});
const transfer = await runSuite('matrix', [128, 256, 512], {
  memory: 'transfer',
  outputName: 'matrix-transfer-v0.2',
});
for (const reference of clone.results) {
  const candidate = transfer.results.find(
    (result) => result.workers === reference.workers,
  );
  for (const workload of reference.workloads)
    assert.deepEqual(
      candidate.workloads.find((value) => value.size === workload.size)
        .correctness,
      workload.correctness,
    );
}
