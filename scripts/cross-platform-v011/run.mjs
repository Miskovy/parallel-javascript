import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { context } from './environment.mjs';

const COMMIT = '716e86d48987ae838c421ff22ade2b7a469e8242';
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log(
    'node scripts/cross-platform-v011/run.mjs --node22 <node executable> --node24 <node executable> [--npm22 <npm-cli.js>] [--npm24 <npm-cli.js>] [--label <machine label>] [--output <new directory>] [--cache <npm cache>] [--offline]',
  );
  process.exit(0);
}
const output = resolve(value('output', join(repository, 'benchmarks/results')));
const label = value('label', `${process.platform}-${process.arch}`);
assert.match(label, /^[a-z0-9][a-z0-9.-]*$/);
const cache = resolve(value('cache', join(tmpdir(), 'pjs-v011-npm-cache')));
const sourceState = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim(),
  status: execFileSync('git', ['status', '--short'], {
    cwd: repository,
    encoding: 'utf8',
  }),
  log: execFileSync('git', ['log', '-1', '--oneline'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim(),
};
const temporary = await mkdtemp(join(tmpdir(), 'pjs-cross-platform-v011-'));
const root = join(temporary, 'reference');
await mkdir(root);
const archive = join(temporary, 'reference.tar');
execFileSync(
  'git',
  ['archive', '--format=tar', `--output=${archive}`, COMMIT],
  { cwd: repository },
);
execFileSync('tar', ['-xf', archive, '-C', root]);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const lockfileSha256 = sha256(await readFile(join(root, 'package-lock.json')));
const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', COMMIT], {
  cwd: repository,
  encoding: 'utf8',
})
  .trim()
  .split('\n');
async function sourceManifest() {
  const manifest = {};
  for (const path of tracked)
    manifest[path] = sha256(await readFile(join(root, path)));
  return manifest;
}
const manifest = await sourceManifest();
await mkdir(output, { recursive: true });
const environments = [];
for (const major of [22, 24]) {
  let node = value(`node${major}`);
  if (!node && Number(process.versions.node.split('.')[0]) === major)
    node = process.execPath;
  if (!node) continue;
  node = resolve(node);
  assert.ok(existsSync(node), `Node executable missing: ${node}`);
  const candidates = [
    value(`npm${major}`),
    join(dirname(node), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(node), '../lib/node_modules/npm/bin/npm-cli.js'),
    join(dirname(node), '../share/nodejs/npm/bin/npm-cli.js'),
  ].filter(Boolean);
  const npm = candidates.find((path) => existsSync(path));
  assert.ok(npm, `Pass --npm${major} with the existing npm-cli.js path`);
  const env = {
    ...process.env,
    PATH: `${dirname(node)}${delimiter}${process.env.PATH}`,
  };
  for (const key of Object.keys(env))
    if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key];
  for (const key of Object.keys(env))
    if (key.startsWith('PJS_')) delete env[key];
  const metadata = JSON.parse(
    execFileSync(node, [join(here, 'environment.mjs'), '--metadata'], {
      env,
      encoding: 'utf8',
    }),
  );
  assert.equal(Number(metadata.nodeVersion.slice(1).split('.')[0]), major);
  assert.ok(
    major !== 22 || Number(metadata.nodeVersion.split('.')[1]) >= 13,
    'Node 22.13+ required',
  );
  metadata.gitCommit = COMMIT;
  metadata.machineLabel = label;
  metadata.npmVersion = execFileSync(node, [npm, '--version'], {
    env,
    encoding: 'utf8',
  }).trim();
  metadata.npmCli = resolve(npm);
  metadata.lockfileSha256 = lockfileSha256;
  metadata.sourceState = sourceState;
  metadata.sourceArchiveSha256 = sha256(await readFile(archive));
  metadata.sourceFileSha256 = manifest;
  metadata.sourceMethod =
    'git archive of the exact reference commit into a temporary directory; working tree preserved';
  const filename = `cross-platform-v0.11-${label}-node${major}`;
  assert.ok(
    !existsSync(join(output, `${filename}.json`)),
    `Refusing to overwrite ${filename}.json; use a new --output directory`,
  );
  assert.ok(
    !existsSync(join(output, `${filename}.metadata.json`)),
    `Refusing to overwrite ${filename}.metadata.json`,
  );
  await writeFile(
    join(output, `${filename}.metadata.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  const report = {
    schemaVersion: 1,
    sourceCommit: COMMIT,
    metadataFile: `${filename}.metadata.json`,
    metadata,
    startedAt: new Date().toISOString(),
    status: 'running',
    methodology: {
      workerCounts: [1, 2, 4, 8].filter(
        (workers) => workers <= metadata.availableParallelism,
      ),
      nodeOrder: [],
      freshProcessPerCaseConfiguration: true,
      sourceImmutable: true,
      thermalControl:
        'balanced ordering, context before and after each process; no governor changes or arbitrary cooldown sleeps',
      retainedSamples:
        'all, including failed processes; no silent retries or outlier removal',
      architecture:
        'unchanged existing v0.11 definitions, four workers, two warmups, six sustained samples per process, forced GC between samples',
      binary:
        'existing reservation-audit task; all transports use batch=1, count capacity=16, equal exact byte capacity; two warmups, six sustained samples, forced GC between samples, no profiling sink',
    },
    checks: [],
    measurements: [],
    failures: [],
  };
  environments.push({ major, node, npm, env, filename, report });
}
assert.ok(environments.length, 'Provide an existing supported Node executable');
async function save(environment) {
  await writeFile(
    join(output, `${environment.filename}.json`),
    `${JSON.stringify(environment.report, null, 2)}\n`,
  );
}
for (const environment of environments) await save(environment);

async function run(
  environment,
  name,
  argv,
  extraEnv = {},
  measurement = false,
) {
  const before = context();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  console.log(`${startedAt} Node ${environment.major}: ${name}`);
  const result = await new Promise((resolveResult) => {
    const child = spawn(environment.node, argv, {
      cwd: root,
      env: { ...environment.env, ...extraEnv },
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
    name,
    startedAt,
    durationMs: performance.now() - started,
    executable: environment.node,
    argv,
    environmentOverrides: extraEnv,
    contextBefore: before,
    contextAfter: context(),
    ...result,
  };
  if (measurement && result.exitCode === 0) {
    try {
      record.result = JSON.parse(result.stdout);
      delete record.stdout;
    } catch (error) {
      record.parseError = String(error);
    }
  }
  if (result.exitCode !== 0 || record.parseError)
    environment.report.failures.push(record);
  (measurement
    ? environment.report.measurements
    : environment.report.checks
  ).push(record);
  await save(environment);
  console.log(
    `  ${result.exitCode === 0 ? 'passed' : 'FAILED'} (${(record.durationMs / 1000).toFixed(1)}s)`,
  );
  return record;
}
function testSummary(stdout) {
  const number = (name) =>
    Number(
      stdout.match(new RegExp(`(?:# )?${name} (\\d+(?:\\.\\d+)?)`, 'm'))?.[1] ??
        NaN,
    );
  return {
    tests: number('tests'),
    passes: number('pass'),
    failures: number('fail'),
    cancelled: number('cancelled'),
    durationMs: number('duration_ms'),
  };
}

for (const environment of environments) {
  const install = await run(environment, 'npm ci', [
    environment.npm,
    'ci',
    '--no-audit',
    '--no-fund',
    '--cache',
    cache,
    ...(args.includes('--offline') ? ['--offline'] : []),
  ]);
  if (install.exitCode !== 0) {
    environment.report.status = 'dependency-install-failed';
    await save(environment);
    continue;
  }
  for (const script of [
    'build',
    'test',
    'test:types',
    'typecheck:compat',
    'lint',
    'format:check',
  ]) {
    const check = await run(environment, `npm run ${script}`, [
      environment.npm,
      'run',
      script,
    ]);
    if (script === 'test') check.summary = testSummary(check.stdout);
    await save(environment);
  }
  const invariants = await run(
    environment,
    'reservation invariant full suite',
    [environment.npm, 'test'],
    { PJS_DEBUG_RESERVATION_INVARIANTS: '1' },
  );
  invariants.summary = testSummary(invariants.stdout);
  const stress = await run(
    environment,
    '10 fresh-process stress rounds',
    [join(root, 'scripts/stress.mjs')],
    { PJS_STRESS_ROUNDS: '10' },
  );
  const roundsPassed = (
    stress.stdout.match(/Stress round \d+\/10 passed/g) ?? []
  ).length;
  stress.summary = {
    targetRounds: 10,
    roundsPassed,
    testExecutions: roundsPassed * invariants.summary.tests,
    intermittentFailures: stress.exitCode === 0 ? 0 : 1,
    stopsAtFirstFailure: true,
  };
  const soak = await run(
    environment,
    '30-second reservation soak',
    [join(root, 'scripts/reservation-soak.mjs'), '--mode=quick'],
    {
      PJS_SOAK_DURATION_MS: '30000',
      PJS_SOAK_WORKERS: String(
        Math.min(4, environment.report.metadata.availableParallelism),
      ),
      PJS_DEBUG_RESERVATION_INVARIANTS: '1',
    },
  );
  if (soak.exitCode === 0) {
    soak.result = JSON.parse(
      await readFile(
        join(root, 'benchmarks/results/reservation-soak-v0.11.json'),
        'utf8',
      ),
    );
    // The old helper reads git from cwd; git walks up from the archive and may see no repository.
    // Attach authoritative archive provenance without rewriting its original metadata.
    soak.sourceCommit = COMMIT;
    assert.equal(soak.result.final.tasksPending, 0);
    assert.equal(soak.result.final.operationsPending, 0);
    assert.equal(soak.result.final.reservations, 0);
    assert.equal(soak.result.final.executions, 0);
    assert.equal(soak.result.final.currentReservedResultBytes, 0);
  }
  environment.correctnessPassed = environment.report.failures.length === 0;
  await save(environment);
}

const active = environments.filter(
  (environment) => environment.correctnessPassed,
);
const processOrder =
  active.length === 2
    ? [active[0], active[1], active[1], active[0]]
    : active.length
      ? [active[0], active[0]]
      : [];
let sequence = 0;
async function measureGroup(name, configurations) {
  for (const [phase, environment] of processOrder.entries()) {
    const ordered = phase % 2 ? [...configurations].reverse() : configurations;
    for (const configuration of ordered) {
      const record = await run(
        environment,
        `${name}/${configuration.name}`,
        configuration.argv,
        configuration.env ?? {},
        true,
      );
      record.sequence = ++sequence;
      record.group = name;
      record.configuration = configuration.name;
      record.phase = phase;
      environment.report.methodology.nodeOrder.push({
        sequence,
        major: environment.major,
        phase,
        group: name,
        configuration: configuration.name,
      });
      await save(environment);
    }
  }
}
const architectureCases = [
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
for (const name of architectureCases) {
  if (
    active.some(
      (environment) => environment.report.metadata.availableParallelism < 4,
    )
  )
    break;
  await measureGroup('architecture', [
    {
      name,
      argv: [
        '--expose-gc',
        join(root, 'benchmarks/runtime-architecture/measure.mjs'),
        root,
      ],
      env: { PJS_BENCH_CASE: name },
    },
  ]);
}
const workerCounts = [1, 2, 4, 8].filter(
  (workers) =>
    active.length &&
    active.every(
      (environment) =>
        workers <= environment.report.metadata.availableParallelism,
    ),
);
await measureGroup(
  'cpu-scaling',
  workerCounts.map((workers) => ({
    name: `workers-${workers}`,
    argv: [
      join(root, 'benchmarks/measure.mjs'),
      JSON.stringify({
        suite: 'cpu',
        workers,
        sizes: [5000000],
        trials: 5,
        warmups: 2,
        memory: 'clone',
      }),
    ],
  })),
);
const featureConfigs = [];
for (const batchSize of [1, 8, 16]) {
  for (const kind of ['noop', 'stable-skew'])
    featureConfigs.push({
      name: `${kind}-batch-${batchSize}`,
      script: 'benchmarks/dispatch-efficiency/measure.mjs',
      config: {
        engine: 'pjs-owned',
        kind,
        workers: Math.min(4, workerCounts.at(-1) ?? 1),
        logicalPartitions: 2048,
        size: 2048,
        scale: 32,
        batchSize,
        trials: 5,
        warmups: 2,
      },
    });
}
for (const batchSize of [1, 16])
  featureConfigs.push({
    name: `coarse-skew-batch-${batchSize}`,
    script: 'benchmarks/dispatch-efficiency/measure.mjs',
    config: {
      engine: 'pjs-owned',
      kind: 'stable-skew',
      workers: Math.min(4, workerCounts.at(-1) ?? 1),
      logicalPartitions: 16,
      size: 2048,
      scale: 32,
      batchSize,
      trials: 5,
      warmups: 2,
    },
  });
for (const [mode, kind] of [
  ['map-objects', 'objects'],
  ['map-array', 'array'],
  ['map-typed', 'typed'],
  ['map-typed-transfer', 'typed'],
  ['shared', 'typed'],
])
  featureConfigs.push({
    name: mode,
    script: 'benchmarks/mapping/measure.mjs',
    config: {
      engine: 'pjs',
      mode,
      kind,
      workers: Math.min(4, workerCounts.at(-1) ?? 1),
      size: 262144,
      grainSize: 4096,
      iterations: 0,
      batchSize: 4,
      trials: 5,
      warmups: 2,
    },
  });
for (const maxBufferedResults of [1, 8])
  featureConfigs.push({
    name: `stream-capacity-${maxBufferedResults}`,
    script: 'benchmarks/completion-only/measure.mjs',
    config: {
      engine: 'pjs',
      kind: 'cpu',
      mode: 'stream',
      workers: Math.min(4, workerCounts.at(-1) ?? 1),
      logicalPartitions: 128,
      iterations: 1000000,
      batchSize: 1,
      outputType: 'scalar',
      maxBufferedResults,
      trials: 5,
      warmups: 2,
    },
  });
for (const entry of featureConfigs)
  await measureGroup('relationships', [
    {
      name: entry.name,
      argv: [join(root, entry.script), JSON.stringify(entry.config)],
    },
  ]);
await measureGroup('input-transfer-roundtrip', [
  {
    name: 'established-sweep',
    argv: [join(root, 'benchmarks/transfer/measure.mjs')],
  },
]);
for (const bytes of [1024, 65536, 1048576, 8388608]) {
  const count =
    bytes === 1024 ? 2048 : bytes === 65536 ? 512 : bytes === 1048576 ? 64 : 16;
  const repetitions =
    bytes === 1024 ? 4 : bytes === 65536 ? 16 : bytes === 1048576 ? 8 : 4;
  const configurations = [];
  for (const [mode, move, name] of [
    ['count', false, 'clone'],
    ['count', true, 'transfer'],
    ['fixed', true, 'strict-fixed'],
    ['callback', true, 'strict-callback'],
  ])
    configurations.push({
      name,
      argv: [
        '--expose-gc',
        join(here, 'binary.mjs'),
        root,
        JSON.stringify({
          workers: Math.min(4, workerCounts.at(-1) ?? 1),
          bytes,
          count,
          mode,
          move,
          repetitions,
          trials: 6,
        }),
      ],
    });
  await measureGroup(`binary-${bytes}`, configurations);
}
const finalManifest = await sourceManifest();
const differences = tracked.filter(
  (path) => manifest[path] !== finalManifest[path],
);
// The historical soak writes its default filename only inside the disposable archive.
const allowed = ['benchmarks/results/reservation-soak-v0.11.json'];
assert.ok(
  differences.every((path) => allowed.includes(path)),
  `Unexpected reference changes: ${differences.join(', ')}`,
);
const diffCheck = execFileSync('git', ['diff', '--check'], {
  cwd: repository,
  encoding: 'utf8',
});
for (const environment of environments) {
  environment.report.sourceVerification = {
    originalFileSha256: manifest,
    differences,
    explanation:
      'Historical soak output changed only in disposable archive; source, lockfile and repository history untouched',
    workingTreeDiffCheck: diffCheck,
  };
  environment.report.status = environment.report.failures.length
    ? 'completed-with-failures'
    : 'complete';
  environment.report.completedAt = new Date().toISOString();
  await save(environment);
}
console.log(`Artifacts: ${output}\nIsolated reference (preserved): ${root}`);
if (environments.some((environment) => environment.report.failures.length))
  process.exitCode = 1;
