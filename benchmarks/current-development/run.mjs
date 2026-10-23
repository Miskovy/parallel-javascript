import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, freemem, loadavg } from 'node:os';
import { dirname, join, resolve, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineReport } from '../environment.mjs';
import { configurations, policy } from './config.mjs';
import {
  assess,
  checked,
  command,
  files,
  manifest,
  sha256,
  source,
} from './evidence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--(baseline|output|profile|npm-cli)=(.+)$/.exec(arg);
  assert.ok(
    match && !Object.hasOwn(options, match[1]),
    'Unknown or duplicate argument: ' + arg,
  );
  options[match[1]] = match[2];
}
assert.ok(
  options.baseline && options.output,
  '--baseline and --output are required',
);
const output = resolve(options.output),
  profile = options.profile ?? 'performance';
assert.ok(isAbsolute(output));
mkdirSync(dirname(output), { recursive: true });
mkdirSync(output); // Refuse all reuse, even empty directories.
// npm pack also uses its cache; keep every npm write within this campaign.
process.env.npm_config_cache = join(output, 'npm-cache');
const npm =
  options['npm-cli'] ??
  process.env.npm_execpath ??
  resolve(
    dirname(process.execPath),
    process.platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : '../lib/node_modules/npm/bin/npm-cli.js',
  );
const report = {
  schema: 1,
  kind: 'Development public API campaign; no promotion/publication applied',
  profile,
  policy,
  started: new Date().toISOString(),
  clientDate: '2026-10-23',
  status: 'failed',
  node: process.version,
  executable: process.execPath,
  executableSha256: sha256(process.execPath),
  versions: process.versions,
  npm: checked(command(process.execPath, [npm, '--version'], root)),
  machine: machineReport(),
  freeMemoryBytes: freemem(),
  loadAverage: loadavg(),
  setup: [],
  packages: {},
  health: [],
  executions: [],
  results: [],
};
const save = () =>
  writeFileSync(
    join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
save();
function runSetup(label, executable, args, cwd) {
  const receipt = { label, ...command(executable, args, cwd) };
  report.setup.push(receipt);
  save();
  return checked(receipt);
}
function optionalObservation(executable, args) {
  const r = command(executable, args, root, { timeout: 5000 });
  return r.exitCode === 0
    ? r.stdout.trim()
    : { unavailable: r.error ?? r.stderr.trim() };
}
function prepare(arm, directory) {
  const provenance = source(directory);
  runSetup(
    arm + ' build',
    process.execPath,
    [
      join(directory, 'node_modules/@typescript/native/bin/tsc'),
      '-p',
      'packages/runtime/tsconfig.json',
    ],
    directory,
  );
  provenance.primaryCompiler = runSetup(
    arm + ' primary compiler',
    process.execPath,
    [join(directory, 'node_modules/@typescript/native/bin/tsc'), '--version'],
    directory,
  );
  provenance.compatibilityCompiler = runSetup(
    arm + ' compatibility compiler',
    process.execPath,
    [join(directory, 'node_modules/typescript/bin/tsc6'), '--version'],
    directory,
  );
  provenance.inputs = Object.fromEntries(
    files(join(directory, 'packages/runtime'))
      .filter(
        (p) =>
          !p.includes('node_modules') &&
          !p.includes(`${join('runtime', 'test')}`),
      )
      .map((p) => [
        p.slice(directory.length + 1).replaceAll('\\', '/'),
        sha256(p),
      ]),
  );
  const destination = join(output, arm);
  mkdirSync(destination);
  const packed = JSON.parse(
    runSetup(
      arm + ' pack',
      process.execPath,
      [
        npm,
        'pack',
        '--workspace',
        '@pjavascript/runtime',
        '--ignore-scripts',
        '--pack-destination',
        destination,
        '--json',
      ],
      directory,
    ),
  )[0];
  const tarball = join(destination, packed.filename),
    consumer = mkdtempSync(join(tmpdir(), 'pjs-development-'));
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'pjs-development-consumer',
      private: true,
      type: 'module',
    }),
    { flag: 'wx' },
  );
  runSetup(
    arm + ' install exact tarball',
    process.execPath,
    [
      npm,
      'install',
      tarball,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      join(output, 'npm-cache'),
    ],
    consumer,
  );
  const installed = join(consumer, 'node_modules/@pjavascript/runtime');
  assert.equal(lstatSync(installed).isSymbolicLink(), false);
  assert.equal(realpathSync(installed), installed);
  // Verify every installed package byte against the clean built package.
  const installedFiles = files(installed).map((p) => ({
    path: p.slice(installed.length + 1).replaceAll('\\', '/'),
    sha256: sha256(p),
  }));
  for (const file of installedFiles)
    assert.equal(
      file.sha256,
      sha256(join(directory, 'packages/runtime', file.path)),
    );
  // Benchmarks come from one harness source for BOTH arms, including historical kernels.
  cpSync(join(root, 'benchmarks'), join(consumer, 'benchmarks'), {
    recursive: true,
    filter: (p) =>
      !['results', 'node_modules', 'sandbox'].includes(basename(p)),
  });
  for (const dependency of ['piscina', '@napi-rs']) {
    const from = join(root, 'node_modules', dependency);
    if (existsSync(from))
      cpSync(from, join(consumer, 'node_modules', dependency), {
        recursive: true,
      });
  }
  // Optional bcrypt is copied only from its existing independently locked experiment.
  const nativeModules = join(root, 'benchmarks/real-world/crypto/node_modules');
  if (existsSync(nativeModules))
    for (const dependency of readdirSync(nativeModules).filter(
      (p) => !p.startsWith('.'),
    ))
      cpSync(
        join(nativeModules, dependency),
        join(consumer, 'node_modules', dependency),
        { recursive: true },
      );
  assert.equal(
    JSON.parse(
      readFileSync(join(consumer, 'node_modules/piscina/package.json')),
    ).version,
    '5.3.2',
  );
  assert.equal(source(directory).tree, provenance.tree);
  return {
    ...provenance,
    consumer,
    tarball,
    sha256: sha256(tarball),
    packed,
    installedFiles,
  };
}
function executeChild(arm, config, block, position) {
  const id = `${config.id}-b${block}-${position}-${arm}`,
    configPath = join(output, id + '.config.json'),
    receiptPath = join(output, id + '.result.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', {
    flag: 'wx',
  });
  const consumer = report.packages[arm].consumer;
  const receipt = command(
    process.execPath,
    [
      join(consumer, 'benchmarks/current-development/child.mjs'),
      configPath,
      receiptPath,
    ],
    consumer,
    { timeout: policy.childTimeoutMs },
  );
  writeFileSync(
    join(output, id + '.process.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx' },
  );
  let child;
  try {
    child = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    child = { status: 'failed', failure: 'Missing/incomplete child receipt' };
  }
  if (receipt.exitCode !== 0 || receipt.error || !child.cleanup)
    child.status = 'failed';
  child.arm = arm;
  report.executions.push({
    id,
    arm,
    config: configPath,
    result: receiptPath,
    status: child.status,
    exitCode: receipt.exitCode,
    error: receipt.error,
    sourceCommit: report.packages[arm].commit,
    packageSha256: report.packages[arm].sha256,
  });
  save();
  return child;
}
try {
  report.power =
    process.platform === 'win32'
      ? optionalObservation('powercfg', ['/getactivescheme'])
      : optionalObservation('cat', [
          '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
        ]);
  report.resourceLimits =
    process.platform === 'linux'
      ? optionalObservation('cat', ['/proc/self/limits'])
      : {
          unavailable:
            'No portable Windows job-object/affinity quota query; availableParallelism and freemem recorded',
        };
  report.packages.baseline = prepare('baseline', resolve(options.baseline));
  save();
  report.packages.candidate = prepare('candidate', root);
  save();
  for (const arm of ['baseline', 'candidate']) {
    const consumer = report.packages[arm].consumer,
      path = join(output, arm + '-health.json');
    const receipt = command(
      process.execPath,
      [join(consumer, 'benchmarks/current-development/health.mjs'), path],
      consumer,
      { timeout: policy.childTimeoutMs },
    );
    let health;
    try {
      health = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      health = { status: 'failed', reason: 'Missing health receipt' };
    }
    report.health.push({
      arm,
      path,
      receipt,
      status:
        receipt.exitCode === 0 && health.cleanup ? health.status : 'failed',
    });
    save();
  }
  const configs = configurations(profile);
  report.configuration = configs;
  save();
  for (const config of configs) {
    console.log('START ' + config.id);
    const children = policy.order.map((arm, position) =>
      executeChild(arm, config, 0, position),
    );
    const initial = assess(children, policy);
    let result = {
      id: config.id,
      config,
      correctness: children.every((c) => c.status === 'accepted')
        ? 'accepted'
        : initial.status,
      initial,
      status: initial.status,
    };
    if (initial.status === 'signal') {
      const additional = policy.order.map((arm, position) =>
        executeChild(arm, config, 1, position),
      );
      result.additional = assess(additional, policy);
      result.status =
        result.additional.status === 'signal'
          ? 'regression'
          : result.additional.status === 'failed'
            ? 'failed'
            : 'inconclusive';
      if (result.additional.status === 'failed') result.correctness = 'failed';
    }
    report.results.push(result);
    save();
    console.log(result.status + ' ' + config.id);
  }
  report.status =
    report.health.some((x) => x.status !== 'accepted') ||
    report.results.some((x) => x.status === 'failed')
      ? 'failed'
      : report.results.some((x) =>
            ['inconclusive', 'regression', 'skipped'].includes(x.status),
          )
        ? 'incomplete'
        : 'accepted';
  for (const [arm, directory] of [
    ['baseline', resolve(options.baseline)],
    ['candidate', root],
  ])
    assert.equal(source(directory).commit, report.packages[arm].commit);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  report.loadAfter = loadavg();
  report.freeMemoryAfter = freemem();
  save();
  manifest(output);
}
if (report.status === 'failed') process.exitCode = 1;
console.log(
  JSON.stringify({
    output,
    status: report.status,
    results: report.results.length,
  }),
);
