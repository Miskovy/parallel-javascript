// Preserve the original failed batch-64 attempts and collect corrected controls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { context } from './environment.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const environments = [];
for (const file of process.argv.slice(2)) {
  const original = JSON.parse(await readFile(file, 'utf8'));
  assert.notEqual(
    original.status,
    'running',
    'Wait for the main campaign to finish',
  );
  const node = original.metadata.nodeExecutable;
  const env = {
    ...process.env,
    PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
  };
  for (const key of Object.keys(env))
    if (
      (key !== 'PATH' && key.toLowerCase() === 'path') ||
      key.startsWith('PJS_')
    )
      delete env[key];
  const root = original.measurements
    .find((record) => record.group === 'architecture')
    .argv.at(-1);
  async function verify() {
    for (const [path, expected] of Object.entries(
      original.metadata.sourceFileSha256,
    )) {
      if (path === 'benchmarks/results/reservation-soak-v0.11.json') continue;
      const actual = createHash('sha256')
        .update(await readFile(join(root, path)))
        .digest('hex');
      assert.equal(actual, expected, `Reference source changed: ${path}`);
    }
  }
  await verify();
  const metadata = JSON.parse(
    execFileSync(node, [join(here, 'environment.mjs'), '--metadata'], {
      env,
      encoding: 'utf8',
    }),
  );
  for (const name of [
    'gitCommit',
    'machineLabel',
    'npmVersion',
    'npmCli',
    'lockfileSha256',
    'sourceArchiveSha256',
    'sourceFileSha256',
    'sourceMethod',
  ])
    metadata[name] = original.metadata[name];
  const filename = file.replace(/\.json$/, '.supplement.json');
  const metadataFile = filename.replace(/\.json$/, '.metadata.json');
  assert.ok(
    !existsSync(filename) && !existsSync(metadataFile),
    'Refusing to overwrite supplemental evidence',
  );
  await writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
  const report = {
    schemaVersion: 1,
    sourceCommit: original.sourceCommit,
    supplements: resolve(file),
    metadataFile: basename(metadataFile),
    metadata,
    startedAt: new Date().toISOString(),
    status: 'running',
    methodology: { ...original.methodology, nodeOrder: [] },
    checks: [],
    measurements: [],
    failures: [],
    explanation:
      'The initial campaign incorrectly requested unsupported batch=64. Those rejected attempts remain in the original artifacts. This supplement uses documented batch<=16 and adds a coarse/skewed load-balance control; no runtime change or discarded timing samples.',
  };
  environments.push({ node, env, root, filename, report, verify });
}
assert.ok(environments.length > 0);
const order =
  environments.length === 2
    ? [environments[0], environments[1], environments[1], environments[0]]
    : [environments[0], environments[0]];
let sequence = 0;
for (const config of [
  {
    name: 'noop-batch-16',
    kind: 'noop',
    logicalPartitions: 2048,
    batchSize: 16,
  },
  {
    name: 'stable-skew-batch-16',
    kind: 'stable-skew',
    logicalPartitions: 2048,
    batchSize: 16,
  },
  {
    name: 'coarse-skew-batch-1',
    kind: 'stable-skew',
    logicalPartitions: 16,
    batchSize: 1,
  },
  {
    name: 'coarse-skew-batch-16',
    kind: 'stable-skew',
    logicalPartitions: 16,
    batchSize: 16,
  },
]) {
  for (const [phase, environment] of order.entries()) {
    const configuration = {
      engine: 'pjs-owned',
      workers: 4,
      size: 2048,
      scale: 32,
      trials: 5,
      warmups: 2,
      ...config,
    };
    const argv = [
      join(environment.root, 'benchmarks/dispatch-efficiency/measure.mjs'),
      JSON.stringify(configuration),
    ];
    console.log(
      `${new Date().toISOString()} ${environment.report.metadata.nodeVersion}: ${config.name}`,
    );
    const before = context();
    const started = performance.now();
    const result = await new Promise((resolveResult) => {
      const child = spawn(environment.node, argv, {
        cwd: environment.root,
        env: environment.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error) =>
        resolveResult({ exitCode: null, error: String(error), stdout, stderr }),
      );
      child.on('close', (exitCode, signal) =>
        resolveResult({ exitCode, signal, stdout, stderr }),
      );
    });
    const record = {
      name: `relationships/${config.name}`,
      group: 'relationships',
      configuration: config.name,
      phase,
      sequence: ++sequence,
      argv,
      executable: environment.node,
      contextBefore: before,
      contextAfter: context(),
      durationMs: performance.now() - started,
      ...result,
    };
    if (result.exitCode === 0) {
      record.result = JSON.parse(result.stdout);
      delete record.stdout;
    } else environment.report.failures.push(record);
    environment.report.measurements.push(record);
    environment.report.methodology.nodeOrder.push({
      sequence,
      phase,
      configuration: config.name,
    });
    await writeFile(
      environment.filename,
      `${JSON.stringify(environment.report, null, 2)}\n`,
    );
  }
}
for (const environment of environments) {
  await environment.verify();
  environment.report.sourceVerification = {
    differences: [],
    explanation:
      'All original source and lockfile hashes verified before and after the supplemental run; historical soak output excluded',
  };
  environment.report.completedAt = new Date().toISOString();
  environment.report.status = environment.report.failures.length
    ? 'completed-with-failures'
    : 'complete';
  await writeFile(
    environment.filename,
    `${JSON.stringify(environment.report, null, 2)}\n`,
  );
}
if (environments.some((environment) => environment.report.failures.length))
  process.exitCode = 1;
