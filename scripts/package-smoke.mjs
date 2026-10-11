import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'pjs-consumer-'));
const consumer = join(temporary, 'consumer');
const unrelated = join(temporary, 'unrelated-cwd');
const checks = [];
const report = { node: process.version, checks, passed: false };
const reportPath = process.env.PJS_PACKAGE_SMOKE_REPORT;
const npmCli = process.env.npm_execpath;
assert.ok(
  npmCli,
  'Run through npm run test:package to select the current npm CLI',
);

function run(label, executable, args, cwd = consumer) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: join(temporary, 'cache') },
  });
  checks.push({
    label,
    command: [executable, ...args],
    exitCode: result.status,
    error: result.error?.message,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${label}: ${checks.at(-1).output}`);
  return result.stdout;
}

try {
  mkdirSync(consumer);
  mkdirSync(unrelated);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'pjs-external-consumer',
      private: true,
      type: 'module',
    }),
  );
  const dry = JSON.parse(
    run(
      'pack dry run',
      process.execPath,
      [
        npmCli,
        'pack',
        '--workspace',
        '@pjavascript/runtime',
        '--dry-run',
        '--json',
      ],
      root,
    ),
  )[0];
  const packed = JSON.parse(
    run(
      'pack',
      process.execPath,
      [
        npmCli,
        'pack',
        '--workspace',
        '@pjavascript/runtime',
        '--pack-destination',
        temporary,
        '--json',
      ],
      root,
    ),
  )[0];
  const files = packed.files.map((file) => file.path).sort();
  assert.deepEqual(files, dry.files.map((file) => file.path).sort());
  for (const required of [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/workers/bootstrap.js',
    'README.md',
    'LICENSE',
  ]) {
    assert.ok(files.includes(required), `Missing packed file: ${required}`);
  }
  assert.ok(
    files.every((file) =>
      /^(dist\/|src\/|package.json$|README.md$|LICENSE$)/.test(file),
    ),
  );
  const tarball = join(temporary, packed.filename);
  report.tarball = {
    ...packed,
    sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
  };
  run('install tarball offline', process.execPath, [
    npmCli,
    'install',
    tarball,
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
  ]);
  const installed = join(consumer, 'node_modules/@pjavascript/runtime');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json')));
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.equal(manifest.type, 'module');
  for (const file of files.filter((file) => file.endsWith('.map'))) {
    const map = JSON.parse(readFileSync(join(installed, file)));
    for (const source of map.sources) {
      assert.ok(
        existsSync(
          resolve(installed, dirname(file), map.sourceRoot ?? '', source),
        ),
        `Unresolved source map: ${file} → ${source}`,
      );
    }
  }
  report.sourceMapsResolve = true;

  cpSync(join(root, 'scripts/package-consumer'), consumer, { recursive: true });
  const smokeOutput = run(
    'ESM public contract and worker paths',
    process.execPath,
    ['--enable-source-maps', join(consumer, 'smoke.mjs')],
    unrelated,
  );
  report.consumer = JSON.parse(smokeOutput.trim());
  run(
    'installed physical containment and recovery',
    process.execPath,
    [join(consumer, 'containment.mjs')],
    unrelated,
  );

  cpSync(join(root, 'examples'), join(consumer, 'examples'), {
    recursive: true,
  });
  const examples = [
    'basic-run',
    'range-work',
    'shared-input',
    'streaming-binary',
    'cancellation',
    'transfer',
  ];
  for (const example of examples) {
    const output = run(
      `example ${example}`,
      process.execPath,
      [join(consumer, 'examples', `${example}.mjs`)],
      unrelated,
    );
    if (example === 'basic-run') assert.equal(output.trim(), '144');
  }
  report.examples = examples;

  // Supply compiler-only dependencies as copies, never links back to the repo.
  // @pjavascript/runtime itself has no production dependency on these packages.
  for (const dependency of ['@types/node', 'undici-types']) {
    cpSync(
      join(root, 'node_modules', dependency),
      join(consumer, 'node_modules', dependency),
      { recursive: true },
    );
  }
  const typeTests = readFileSync(
    join(root, 'packages/runtime/test/types.test.ts'),
    'utf8',
  ).replaceAll('../dist/index.js', '@pjavascript/runtime');
  writeFileSync(join(consumer, 'api-types.ts'), typeTests);
  const compiler = join(root, 'node_modules/@typescript/native/bin/tsc');
  run('installed declaration regression tests', process.execPath, [
    compiler,
    '-p',
    join(consumer, 'tsconfig.types.json'),
  ]);
  run('TypeScript consumer build', process.execPath, [
    compiler,
    '-p',
    join(consumer, 'tsconfig.json'),
  ]);
  run(
    'TypeScript emitted consumer run',
    process.execPath,
    [join(consumer, 'output/consumer.js')],
    unrelated,
  );
  report.types =
    'Installed declarations checked without skipLibCheck; TS consumer compiled and executed; development type packages copied, compiler supplied by harness';
  report.passed = true;
  console.log(
    JSON.stringify({
      passed: true,
      node: process.version,
      size: packed.size,
      unpackedSize: packed.unpackedSize,
      fileCount: packed.entryCount,
      examples: examples.length,
    }),
  );
} finally {
  if (reportPath)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(temporary, { recursive: true, force: true });
}
