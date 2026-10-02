import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matrix } from '../benchmarks/real-world/compression/matrix.mjs';
import { validateReport } from '../benchmarks/real-world/compression/report.mjs';
const output = process.argv[2];
assert.ok(output, 'new output filename required');
await writeFile(output, '', { flag: 'wx' });
const directory = await mkdtemp(join(tmpdir(), 'pjs-v014-memory-'));
const report = {
  clientDate: '2026-10-02',
  methodology:
    'one fresh process per memory cell; two warmups and six retained trials; process RSS includes native state, worker heaps, sources and consumer-owned output; no whole-process memory bound',
  complete: false,
  cases: [],
};
try {
  for (const config of matrix('memory')) {
    const file = join(directory, 'case.json');
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          'benchmarks/real-world/compression/run.mjs',
          '--profile=memory',
          `--filter=${config.id}`,
          `--output=${file}`,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      let error = '';
      child.stdout.on('data', (chunk) => process.stdout.write(chunk));
      child.stderr.on('data', (chunk) => {
        error += chunk;
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`fresh process exit ${code}: ${error}`)),
      );
    });
    const result = JSON.parse(await readFile(file, 'utf8'));
    validateReport(result);
    assert.equal(result.cells.length, 1);
    report.cases.push(result);
    await rm(file);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
  report.complete = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  throw error;
} finally {
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await rm(directory, { recursive: true });
}
