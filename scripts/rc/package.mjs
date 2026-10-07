import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const output = arg('output');
const physicalBoundaryRepair = process.argv.includes(
  '--physical-boundary-repair',
);
const permittedDeclarations = new Set([
  'dist/workers/worker.d.ts',
  'dist/dispatch/dispatcher.d.ts',
  'dist/results/credit.d.ts',
]);
const permittedSources = new Set([
  'packages/runtime/src/workers/worker.ts',
  'packages/runtime/src/pool/pool.ts',
  'packages/runtime/src/dispatch/dispatcher.ts',
  'packages/runtime/src/runtime.ts',
  'packages/runtime/src/telemetry/runtime.ts',
  'packages/runtime/src/results/credit.ts',
]);
assert.ok(output, 'Specify a NEW --output=file.json');
writeFileSync(output, '', { flag: 'wx' });
const selectedNpm = arg('npm-cli') ?? process.env.npm_execpath;
assert.ok(
  selectedNpm,
  'Use npm run test:rc:package or supply --npm-cli=absolute/path',
);
const npmCli = resolve(selectedNpm);
const packDir = resolve(
  arg('pack-dir') ?? join(root, '.node-tools/rc2/packages', process.version),
);
mkdirSync(packDir, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), 'PJS RC external with spaces '));
const js = join(temporary, 'JS consumer with spaces');
const ts = join(temporary, 'TS consumer with spaces');
const unrelated = join(temporary, 'unrelated working directory');
for (const dir of [js, ts, unrelated]) mkdirSync(dir);
const frozen = JSON.parse(
  readFileSync(new URL('./frozen-v015.json', import.meta.url)),
);
const report = {
  schema: 1,
  node: process.version,
  versions: process.versions,
  platform: process.platform,
  arch: process.arch,
  temporary,
  checks: [],
  passed: false,
};
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
function run(label, args, cwd = root) {
  const start = performance.now();
  const r = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 16 * 1024 ** 2,
    env: { ...process.env, npm_config_cache: join(temporary, 'cache') },
  });
  report.checks.push({
    label,
    command: [process.execPath, ...args],
    cwd,
    exitCode: r.status,
    error: r.error?.message ?? null,
    durationMs: performance.now() - start,
    output: (r.stdout ?? '') + (r.stderr ?? ''),
  });
  save();
  assert.ifError(r.error);
  assert.equal(r.status, 0, `${label}: ${report.checks.at(-1).output}`);
  return r.stdout;
}
try {
  const dry = JSON.parse(
    run('pack dry run', [
      npmCli,
      'pack',
      '--workspace',
      '@pjavascript/runtime',
      '--dry-run',
      '--json',
    ]),
  )[0];
  const packed = JSON.parse(
    run('actual pack', [
      npmCli,
      'pack',
      '--workspace',
      '@pjavascript/runtime',
      '--pack-destination',
      packDir,
      '--json',
    ]),
  )[0];
  assert.equal(packed.name, '@pjavascript/runtime');
  assert.equal(packed.version, '1.0.0-rc.2');
  assert.deepEqual(packed.files, dry.files);
  assert.equal(packed.entryCount, 128);
  assert.ok(
    packed.files.every((f) =>
      /^(dist\/|src\/|package.json$|README.md$|LICENSE$)/.test(f.path),
    ),
  );
  const tarball = join(packDir, packed.filename);
  report.tarball = { ...packed, path: tarball, sha256: hash(tarball) };
  for (const [name, dir] of [
    ['js', js],
    ['ts', ts],
  ]) {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: `pjs-rc-${name}-consumer`,
        private: true,
        type: 'module',
      }) + '\n',
    );
    run(
      `offline real tarball install ${name}`,
      [
        npmCli,
        'install',
        tarball,
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      dir,
    );
    const installed = join(dir, 'node_modules/@pjavascript/runtime');
    assert.equal(lstatSync(installed).isSymbolicLink(), false);
    assert.ok(!realpathSync(installed).startsWith(realpathSync(root)));
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json')));
    assert.equal(manifest.version, packed.version);
    assert.deepEqual(manifest.repository, {
      type: 'git',
      url: 'git+https://github.com/Miskovy/parallel-javascript.git',
      directory: 'packages/runtime',
    });
    assert.deepEqual(manifest.bugs, {
      url: 'https://github.com/Miskovy/parallel-javascript/issues',
    });
    assert.deepEqual(
      {
        name: manifest.name,
        type: manifest.type,
        engines: manifest.engines,
        exports: manifest.exports,
        types: manifest.types,
        files: manifest.files,
        dependencies: manifest.dependencies ?? {},
      },
      { ...frozen.manifest, name: '@pjavascript/runtime' },
    );
    for (const [path, expected] of Object.entries(frozen.declarations))
      assert.equal(
        hash(join(installed, path)),
        physicalBoundaryRepair && permittedDeclarations.has(path)
          ? hash(join(root, 'packages/runtime', path))
          : expected,
        `Installed frozen declaration ${path}`,
      );
    for (const [path, expected] of Object.entries(frozen.runtimeSource))
      assert.equal(
        hash(join(installed, path.replace('packages/runtime/', ''))),
        physicalBoundaryRepair && permittedSources.has(path)
          ? hash(join(root, path))
          : expected,
        `Installed frozen source ${path}`,
      );
    for (const file of packed.files.filter((f) => f.path.endsWith('.map'))) {
      const map = JSON.parse(readFileSync(join(installed, file.path)));
      for (const source of map.sources)
        assert.ok(
          existsSync(
            resolve(
              installed,
              dirname(file.path),
              map.sourceRoot ?? '',
              source,
            ),
          ),
          `Source map ${file.path}`,
        );
    }
  }
  for (const file of ['smoke.mjs', 'tasks.mjs'])
    cpSync(join(root, 'scripts/package-consumer', file), join(js, file));
  report.basicConsumer = JSON.parse(
    run(
      'installed ESM/errors/source maps/subpaths/worker resolution',
      ['--enable-source-maps', join(js, 'smoke.mjs')],
      unrelated,
    ),
  );
  // Copy only independent synthetic fixtures. All application imports resolve the installed package.
  const rc = join(js, 'rc');
  mkdirSync(rc);
  for (const file of ['soak.mjs', 'tasks.mjs'])
    cpSync(join(root, 'scripts/rc', file), join(rc, file));
  const soakPath = join(js, 'installed-smoke.json');
  run(
    'installed all-error and lifecycle smoke; natural process exit watchdog',
    [join(rc, 'soak.mjs'), '--profile=smoke', `--output=${soakPath}`],
    unrelated,
  );
  const installedSoak = JSON.parse(readFileSync(soakPath));
  assert.equal(installedSoak.passed, true);
  report.installedSmoke = {
    node: installedSoak.node,
    scenarios: installedSoak.scenarios.length,
    operationCounts: installedSoak.operationCounts,
    publicErrors: installedSoak.publicErrors,
    terminalZero: installedSoak.terminals.every(
      (t) =>
        t.tasks === 0 &&
        t.operations === 0 &&
        t.reservations === 0 &&
        t.executions === 0 &&
        t.liveWorkers === 0 &&
        t.reservedBytes === 0,
    ),
    lastResources: installedSoak.samples.at(-1).resources,
    naturalProcessExit: true,
  };
  report.installedExports = JSON.parse(
    run(
      'installed runtime export snapshot',
      [
        '--input-type=module',
        '-e',
        "import * as api from '@pjavascript/runtime';console.log(JSON.stringify(Object.keys(api).sort()))",
      ],
      js,
    ),
  );
  assert.deepEqual(report.installedExports, frozen.runtimeValues);
  cpSync(join(root, 'examples'), join(js, 'examples'), { recursive: true });
  report.examples = [];
  for (const example of [
    'basic-run',
    'range-work',
    'shared-input',
    'streaming-binary',
    'cancellation',
    'transfer',
  ]) {
    const result = run(
      `installed example ${example}`,
      [join(js, 'examples', example + '.mjs')],
      unrelated,
    );
    if (example === 'basic-run') assert.equal(result.trim(), '144');
    report.examples.push({ example, passed: true, output: result.trim() });
  }
  for (const file of ['tsconfig.types.json', 'task.ts'])
    cpSync(join(root, 'scripts/package-consumer', file), join(ts, file));
  cpSync(join(root, 'scripts/rc/consumer.ts'), join(ts, 'consumer.ts'));
  cpSync(join(root, 'scripts/rc/tasks.mjs'), join(ts, 'tasks.mjs'));
  const config = JSON.parse(
    readFileSync(join(root, 'scripts/package-consumer/tsconfig.json')),
  );
  writeFileSync(
    join(ts, 'tsconfig.json'),
    JSON.stringify(config, null, 2) + '\n',
  );
  for (const dependency of ['@types/node', 'undici-types'])
    cpSync(
      join(root, 'node_modules', dependency),
      join(ts, 'node_modules', dependency),
      { recursive: true },
    );
  writeFileSync(
    join(ts, 'api-types.ts'),
    readFileSync(
      join(root, 'packages/runtime/test/types.test.ts'),
      'utf8',
    ).replaceAll('../dist/index.js', '@pjavascript/runtime'),
  );
  const compiler = join(root, 'node_modules/@typescript/native/bin/tsc');
  run(
    'installed declarations: full type regressions; no skipLibCheck',
    [compiler, '-p', join(ts, 'tsconfig.types.json')],
    ts,
  );
  run(
    'independent TS generic/stream/ownership/error consumer compile',
    [compiler, '-p', join(ts, 'tsconfig.json')],
    ts,
  );
  report.typescript = JSON.parse(
    run(
      'independent emitted TS consumer workers and natural exit',
      [join(ts, 'output/consumer.js')],
      unrelated,
    ),
  );
  report.fileHashes = Object.fromEntries(
    packed.files.map((f) => [
      f.path,
      hash(join(js, 'node_modules/@pjavascript/runtime', f.path)),
    ]),
  );
  report.notes = [
    'JS and TS projects are separate, outside checkout, real tarball installations without workspace links',
    'Paths include spaces; workers run from unrelated cwd',
    'Compiler provided by harness; copied compiler-only Node types; runtime has zero dependencies',
    'Successful child statuses require natural exit; watchdog only terminates failures',
    'Temporary consumer directory retained for inspection; no historical evidence overwritten',
  ];
  report.passed = true;
  save();
  console.log(
    JSON.stringify({
      passed: true,
      node: process.version,
      version: packed.version,
      files: packed.entryCount,
      sha256: report.tarball.sha256,
      installedScenarios: report.installedSmoke.scenarios,
      errors: Object.keys(report.installedSmoke.publicErrors).length,
      examples: report.examples.length,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  save();
  throw error;
}
